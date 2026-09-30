/**
 * Browser WASM host: load gzip module, timers, JS jobs.
 * Engine methods return `{ $error }` instead of panicking so Go stays alive.
 * Artifacts come from `@sparrow-community/wasm` (resolved by Vite).
 */
import wasmExecUrl from "@sparrow-community/wasm/wasm_exec.js?url";
import wasmGzUrl from "@sparrow-community/wasm/sparrow.wasm.gz?url";
import {
  hostEffectsAllowed,
  isPaused,
  shouldPauseBeforeHostEffect,
} from "./debug.js";

export {
  getDebugState,
  getInterventionState,
  getInterventionMode,
  setInterventionMode,
  setRunMode,
  syncSession,
  isPaused,
  toggleBreakpoint,
  setBreakpoint,
  hasBreakpoint,
  clearBreakpoints,
  evaluateAutoPause,
  onDebugChange,
  pauseReasonLabel,
  pendingSummary,
  resumeIntervention,
  setPausedVariables,
  formatReject,
  noteReject,
  hostEffectsAllowed,
} from "./debug.js";

let ready = null;
let timerHandle = null;
let wasmBytesCache = null;

/** Host scheduling policy (MVP A). Defaults preserve Example auto-advance. */
const hostPolicy = {
  autoTimers: true,
  autoJobs: true,
};

export function getHostPolicy() {
  return { ...hostPolicy };
}

export function setHostPolicy(partial = {}) {
  if (typeof partial.autoTimers === "boolean") hostPolicy.autoTimers = partial.autoTimers;
  if (typeof partial.autoJobs === "boolean") hostPolicy.autoJobs = partial.autoJobs;
  if (!hostPolicy.autoTimers) {
    clearTimeout(timerHandle);
    timerHandle = null;
  }
  return getHostPolicy();
}

/** Cancel armed timer without changing autoTimers preference (MVP C pause). */
export function disarmTimers() {
  clearTimeout(timerHandle);
  timerHandle = null;
}

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
  timerHandle = null;
  if (!hostPolicy.autoTimers) return;
  if (!hostEffectsAllowed()) return;
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
    if (!hostEffectsAllowed()) return;
    const targets = timerWaitElementIds(eng);
    const gate = shouldPauseBeforeHostEffect("timer", targets);
    // Kernel barrier-pause: skip FireDue until Continue / Step*.
    if (gate.pause) return;
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

function timerWaitElementIds(eng) {
  const ids = [];
  let instanceIds;
  try {
    instanceIds = eng.listInstanceIds();
  } catch {
    return ids;
  }
  for (const id of instanceIds) {
    let inst;
    try {
      inst = eng.getInstance(id);
    } catch {
      continue;
    }
    for (const tok of Object.values(inst.tokens || {})) {
      if (!tok || tok.status !== "waiting") continue;
      if (tok.dueUnixMs > 0 && tok.elementId) ids.push(tok.elementId);
      for (const bw of tok.boundaryWaits || []) {
        if (bw?.dueUnixMs > 0 && bw.boundaryId) ids.push(bw.boundaryId);
      }
    }
  }
  return ids;
}

/** Advance engine clock to due (or now) and FireDue once, then restore wall clock. */
export function fireTimerNow(dueUnixMs) {
  const eng = globalThis.sparrow;
  if (!eng) throw new Error("engine not ready");
  const target = dueUnixMs > 0 ? dueUnixMs : Date.now();
  eng.setNowUnixMs(target);
  try {
    eng.fireDue();
  } finally {
    eng.setNowUnixMs(null);
  }
}

export function drainJobs(onChange) {
  if (!hostPolicy.autoJobs) return;
  if (!hostEffectsAllowed()) return;
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
    if (!hostEffectsAllowed()) return;
    const gate = shouldPauseBeforeHostEffect(
      "job",
      jobWaitElementIds(eng, jobType),
    );
    if (gate.pause) return;
    runJobsOfType(eng, jobType, null, onChange);
  }
}

function jobWaitElementIds(eng, jobType) {
  const ids = [];
  let instanceIds;
  try {
    instanceIds = eng.listInstanceIds();
  } catch {
    return ids;
  }
  for (const id of instanceIds) {
    let inst;
    try {
      inst = eng.getInstance(id);
    } catch {
      continue;
    }
    for (const tok of Object.values(inst.tokens || {})) {
      if (!tok || tok.status !== "waiting") continue;
      if (tok.jobType === jobType && tok.elementId) ids.push(tok.elementId);
    }
  }
  return ids;
}

/**
 * Activate + Complete/Fail one job wait (or all of a type when tokenId is null).
 * @param {"complete"|"fail"} action
 */
export function runJobForWait(wait, action = "complete", variables) {
  const eng = globalThis.sparrow;
  if (!eng) throw new Error("engine not ready");
  const jobType = wait.jobType;
  if (!jobType) throw new Error("wait has no jobType");
  const jobs = eng.activate({
    jobType,
    maxJobs: 16,
    workerId: "playground",
  }).jobs || [];
  const match = jobs.filter(
    (j) =>
      j.tokenId === wait.tokenId &&
      j.instanceId === wait.instanceId &&
      j.elementId === wait.elementId,
  );
  const targets = match.length ? match : jobs.filter((j) => j.tokenId === wait.tokenId);
  if (!targets.length) {
    throw new Error(`no activated job for ${jobType} / ${wait.tokenId}`);
  }
  for (const job of targets) {
    if (action === "fail") {
      eng.fail({
        instanceId: job.instanceId,
        elementId: job.elementId,
        tokenId: job.tokenId,
        message: "failed from playground wait panel",
        noRetry: true,
      });
      continue;
    }
    completeActivatedJob(eng, job, variables);
  }
}

function runJobsOfType(eng, jobType, tokenId, onChange) {
  let jobs;
  try {
    jobs = eng.activate({ jobType, maxJobs: 16, workerId: "playground" }).jobs || [];
  } catch {
    return;
  }
  for (const job of jobs) {
    if (tokenId && job.tokenId !== tokenId) continue;
    try {
      completeActivatedJob(eng, job);
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

function completeActivatedJob(eng, job, overrideVars) {
  if (job.script && /javascript/i.test(job.scriptFormat || "javascript")) {
    const fn = new Function("variables", job.script + "\n;return variables;");
    const variables = overrideVars ?? fn({ ...(job.variables || {}) });
    eng.complete({
      instanceId: job.instanceId,
      elementId: job.elementId,
      tokenId: job.tokenId,
      variables,
    });
    return;
  }
  if (!job.script) {
    eng.complete({
      instanceId: job.instanceId,
      elementId: job.elementId,
      tokenId: job.tokenId,
      variables: overrideVars,
    });
    return;
  }
  eng.fail({
    instanceId: job.instanceId,
    elementId: job.elementId,
    tokenId: job.tokenId,
    message: "unsupported scriptFormat in playground",
    noRetry: true,
  });
}

/**
 * Classify a waiting/blocked token into a wait-panel kind.
 * Conditional: timerText (expression) with no due/message/signal/job.
 */
export function classifyTokenWait(tok) {
  if (!tok) return "user";
  if (tok.status === "blocked" || tok.incidentErrorMessage) return "incident";
  if (tok.jobType) return "job";
  if (tok.dueUnixMs > 0) return "timer";
  if (tok.messageName) return "message";
  if (tok.signalName) return "signal";
  if (tok.timerText) return "conditional";
  return "user";
}

function classifyBoundaryKind(bw) {
  const k = String(bw?.kind || "").toLowerCase();
  if (k === "timer" || k === "message" || k === "signal" || k === "conditional") return k;
  if (bw?.dueUnixMs > 0) return "timer";
  if (bw?.messageName) return "message";
  if (bw?.signalName) return "signal";
  return "conditional";
}

function pushBoundaryRows(out, instanceId, tok) {
  for (const bw of tok.boundaryWaits || []) {
    if (!bw) continue;
    const kind = classifyBoundaryKind(bw);
    out.push({
      id: `${tok.id}:boundary:${bw.boundaryId || kind}`,
      tokenId: tok.id,
      elementId: bw.boundaryId || tok.elementId,
      hostElementId: tok.elementId,
      boundaryId: bw.boundaryId,
      kind,
      status: tok.status,
      messageName: bw.messageName || "",
      signalName: bw.signalName || "",
      dueUnixMs: bw.dueUnixMs || 0,
      timerText: bw.timerText || "",
      instanceId,
      source: "boundary",
    });
  }
}

function pushTokenRow(out, instanceId, tok) {
  const kind = classifyTokenWait(tok);
  out.push({
    id: tok.id,
    tokenId: tok.id,
    elementId: tok.elementId,
    kind,
    status: tok.status,
    jobType: tok.jobType || "",
    messageName: tok.messageName || "",
    signalName: tok.signalName || "",
    dueUnixMs: tok.dueUnixMs || 0,
    timerText: tok.timerText || "",
    incidentErrorMessage: tok.incidentErrorMessage || "",
    calledProcessInstanceId: tok.calledProcessInstanceId || "",
    instanceId,
    source: "token",
  });
}

/**
 * Enumerate waits for an instance (and optionally child Call Activity instances).
 * Expands boundaryWaits into separate actionable rows.
 */
export function listWaits(instanceId, { includeChildren = true } = {}) {
  const eng = globalThis.sparrow;
  if (!eng || !instanceId) return [];
  const out = [];
  const seenInst = new Set();

  function visit(id) {
    if (!id || seenInst.has(id)) return;
    seenInst.add(id);
    let inst;
    try {
      inst = eng.getInstance(id);
    } catch {
      return;
    }
    const childIds = [];
    for (const tok of Object.values(inst.tokens || {})) {
      if (!tok) continue;
      if (tok.calledProcessInstanceId) childIds.push(tok.calledProcessInstanceId);
      if (tok.status !== "waiting" && tok.status !== "blocked") continue;

      pushBoundaryRows(out, id, tok);

      // Scope / MI hosts are not themselves completable; boundaries already listed.
      if (tok.scopeHost || tok.multiInstanceHost) continue;
      pushTokenRow(out, id, tok);
    }
    if (includeChildren) {
      for (const child of childIds) visit(child);
    }
  }

  visit(instanceId);
  return out;
}

/** True when diagram XML looks runnable enough to Deploy. */
export function looksLikeBpmn(xml) {
  const s = String(xml || "").trim();
  if (!s) return false;
  return /<definitions[\s>]/i.test(s) && /<process[\s>]/i.test(s);
}

/** Parse a vars textarea: empty → undefined; JSON object; else error. */
export function parseVarsJson(text) {
  const raw = String(text ?? "").trim();
  if (!raw) return undefined;
  const parsed = JSON.parse(raw);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("variables must be a JSON object");
  }
  return parsed;
}
