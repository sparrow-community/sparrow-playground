/**
 * Browser WASM host: load gzip module, timers, JS jobs.
 * Engine methods return `{ $error }` instead of panicking so Go stays alive.
 * Artifacts come from `@sparrow-community/wasm` (resolved by Vite).
 */
import wasmExecUrl from "@sparrow-community/wasm/wasm_exec.js?url";
import wasmGzUrl from "@sparrow-community/wasm/sparrow.wasm.gz?url";

let ready = null;
let timerHandle = null;
let wasmBytesCache = null;

async function inflateGzip(buffer) {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("DecompressionStream unsupported; use a modern browser");
  }
  const stream = new Response(buffer).body.pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).arrayBuffer();
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("failed to load " + src));
    document.head.appendChild(s);
  });
}

function waitFor(pred, ms) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    (function tick() {
      if (pred()) return resolve();
      if (Date.now() - start > ms) return reject(new Error("sparrow WASM init timeout"));
      requestAnimationFrame(tick);
    })();
  });
}

async function loadWasmArrayBuffer(res) {
  const buf = await res.arrayBuffer();
  const u8 = new Uint8Array(buf);
  if (u8.length >= 4 && u8[0] === 0x00 && u8[1] === 0x61 && u8[2] === 0x73 && u8[3] === 0x6d) {
    return buf;
  }
  if (u8.length >= 2 && u8[0] === 0x1f && u8[1] === 0x8b) {
    return inflateGzip(buf);
  }
  throw new Error("sparrow.wasm.gz is neither WASM nor gzip");
}

function unwrapResult(out) {
  if (out && typeof out === "object" && typeof out.$error === "string") {
    throw new Error(out.$error);
  }
  return out;
}

function isGoExitedError(err) {
  const msg = String(err?.message || err || "");
  return /already exited|Go program has already exited/i.test(msg);
}

function wrapEngine(raw) {
  if (!raw || typeof raw !== "object") {
    throw new Error("sparrow engine API missing");
  }
  const wrapped = {};
  for (const key of Object.keys(raw)) {
    const val = raw[key];
    if (typeof val !== "function") {
      wrapped[key] = val;
      continue;
    }
    wrapped[key] = (...args) => {
      try {
        return unwrapResult(val.apply(raw, args));
      } catch (err) {
        if (isGoExitedError(err)) {
          ready = null;
          globalThis.sparrow = undefined;
        }
        throw err;
      }
    };
  }
  return wrapped;
}

async function instantiateEngine() {
  if (typeof globalThis.Go !== "function") {
    await loadScript(wasmExecUrl);
  }
  if (!wasmBytesCache) {
    const gz = await fetch(wasmGzUrl);
    if (!gz.ok) {
      throw new Error(`missing ${wasmGzUrl} (${gz.status}) — check @sparrow-community/wasm install`);
    }
    wasmBytesCache = await loadWasmArrayBuffer(gz);
  }
  delete globalThis.sparrow;
  const go = new globalThis.Go();
  const result = await WebAssembly.instantiate(wasmBytesCache, go.importObject);
  go.run(result.instance);
  await waitFor(() => globalThis.sparrow, 8000);
  const api = wrapEngine(globalThis.sparrow);
  globalThis.sparrow = api;
  return api;
}

export async function loadEngine() {
  if (ready) return ready;
  ready = instantiateEngine().catch((err) => {
    ready = null;
    throw err;
  });
  return ready;
}

/** Drop a dead runtime and boot a fresh in-memory engine. */
export async function reloadEngine() {
  clearTimeout(timerHandle);
  timerHandle = null;
  ready = null;
  delete globalThis.sparrow;
  return loadEngine();
}

export async function ensureEngine() {
  try {
    const eng = await loadEngine();
    // Probe a cheap call; dead runtimes often fail here.
    eng.listInstanceIds();
    return eng;
  } catch (err) {
    if (isGoExitedError(err) || !globalThis.sparrow) {
      return reloadEngine();
    }
    throw err;
  }
}

export function armTimers(onFire) {
  clearTimeout(timerHandle);
  const eng = globalThis.sparrow;
  if (!eng) return;
  let due;
  try {
    due = eng.nextDueUnixMs();
  } catch (err) {
    if (isGoExitedError(err)) ready = null;
    return;
  }
  if (!due) return;
  const delay = Math.max(0, due - Date.now());
  timerHandle = setTimeout(() => {
    try {
      eng.fireDue();
      onFire?.();
    } catch (err) {
      if (isGoExitedError(err)) ready = null;
    } finally {
      armTimers(onFire);
    }
  }, delay);
}

export function drainJobs(onChange) {
  const eng = globalThis.sparrow;
  if (!eng) return;
  const discovered = new Set(["javascript", "text/javascript"]);
  let ids;
  try {
    ids = eng.listInstanceIds();
  } catch (err) {
    if (isGoExitedError(err)) ready = null;
    return;
  }
  for (const id of ids) {
    const inst = eng.getInstance(id);
    for (const tok of Object.values(inst.tokens || {})) {
      if (tok.jobType) discovered.add(tok.jobType);
    }
  }
  for (const jobType of discovered) {
    let jobs;
    try {
      jobs = eng.activate({ jobType, maxJobs: 16, workerId: "playground" }).jobs || [];
    } catch {
      continue;
    }
    for (const job of jobs) {
      try {
        if (job.script && /javascript/i.test(job.scriptFormat || "javascript")) {
          const fn = new Function("variables", job.script + "\n;return variables;");
          const variables = fn({ ...(job.variables || {}) });
          eng.complete({
            instanceId: job.instanceId,
            elementId: job.elementId,
            tokenId: job.tokenId,
            variables,
          });
        } else if (!job.script) {
          eng.complete({
            instanceId: job.instanceId,
            elementId: job.elementId,
            tokenId: job.tokenId,
          });
        } else {
          eng.fail({
            instanceId: job.instanceId,
            elementId: job.elementId,
            tokenId: job.tokenId,
            message: "unsupported scriptFormat in playground",
            noRetry: true,
          });
        }
      } catch (e) {
        try {
          eng.fail({
            instanceId: job.instanceId,
            elementId: job.elementId,
            tokenId: job.tokenId,
            message: String(e),
            noRetry: false,
          });
        } catch {
          /* engine may be dead */
        }
      }
      onChange?.();
    }
  }
}

export function listWaits(instanceId) {
  const eng = globalThis.sparrow;
  if (!eng || !instanceId) return [];
  let inst;
  try {
    inst = eng.getInstance(instanceId);
  } catch {
    return [];
  }
  const out = [];
  for (const tok of Object.values(inst.tokens || {})) {
    if (tok.status !== "waiting" && tok.status !== "blocked") continue;
    if (tok.scopeHost || tok.multiInstanceHost) continue;
    let kind = "wait";
    if (tok.jobType) kind = "job";
    else if (tok.dueUnixMs > 0) kind = "timer";
    else if (tok.messageName) kind = "message";
    else if (tok.signalName) kind = "signal";
    else kind = "user";
    out.push({ ...tok, kind });
  }
  return out;
}

/** True when diagram XML looks runnable enough to Deploy. */
export function looksLikeBpmn(xml) {
  const s = String(xml || "").trim();
  if (!s) return false;
  return /<definitions[\s>]/i.test(s) && /<process[\s>]/i.test(s);
}
