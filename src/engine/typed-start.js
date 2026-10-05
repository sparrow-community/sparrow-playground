/**
 * Typed process-level starts for Run when CreateInstance rejects
 * ("process has no none start"). Mirrors kernel MIWG mint order:
 * message → signal → timer (FireDue) → conditional.
 *
 * WASM getDeployment does not expose MessageStartNames; we read the
 * same fallback names from BPMN XML (message/signal name → start name → id).
 */

function localName(node) {
  if (!node) return "";
  return String(node.localName || node.nodeName || "")
    .replace(/^.*:/, "")
    .toLowerCase();
}

function attr(el, name) {
  if (!el?.getAttribute) return "";
  const direct = el.getAttribute(name);
  if (direct != null && String(direct).trim() !== "") return String(direct).trim();
  // Some exporters use namespaced attrs; scan attributes by local name.
  for (const a of el.attributes || []) {
    const ln = String(a.localName || a.name || "")
      .replace(/^.*:/, "")
      .toLowerCase();
    if (ln === name.toLowerCase()) return String(a.value || "").trim();
  }
  return "";
}

function childrenLocal(parent, name) {
  if (!parent?.children) return [];
  const want = name.toLowerCase();
  return [...parent.children].filter((c) => localName(c) === want);
}

function descendantsLocal(root, name) {
  if (!root) return [];
  const want = name.toLowerCase();
  const out = [];
  const walk = (node) => {
    for (const c of node.children || []) {
      if (localName(c) === want) out.push(c);
      walk(c);
    }
  };
  walk(root);
  return out;
}

function buildNameMap(defs, tag) {
  /** @type {Map<string, string>} */
  const map = new Map();
  for (const el of childrenLocal(defs, tag)) {
    const id = attr(el, "id");
    if (!id) continue;
    const name = attr(el, "name");
    map.set(id, name || id);
  }
  return map;
}

function findProcess(defs, processId) {
  const processes = childrenLocal(defs, "process");
  if (!processes.length) return null;
  if (processId) {
    const hit = processes.find((p) => attr(p, "id") === processId);
    if (hit) return hit;
  }
  return processes[0];
}

function startHasDef(startEl, defLocal) {
  return (
    childrenLocal(startEl, defLocal).length > 0 ||
    descendantsLocal(startEl, defLocal).length > 0
  );
}

function resolveRefName(ref, nameMap, fallbackName, fallbackId) {
  if (ref) {
    const fromMap = nameMap.get(ref);
    if (fromMap) return fromMap;
    return ref;
  }
  if (fallbackName) return fallbackName;
  return fallbackId;
}

/**
 * Process-level typed starts for the deployed process (direct startEvent children).
 * @returns {{ messages: string[], signals: string[], timers: string[], conditionals: string[] }}
 */
export function listTypedStarts(xml, processId) {
  const empty = { messages: [], signals: [], timers: [], conditionals: [] };
  const s = String(xml || "").trim();
  if (!s) return empty;
  const doc = new DOMParser().parseFromString(s, "application/xml");
  if (doc.querySelector("parsererror")) return empty;
  const defs =
    [...doc.documentElement ? [doc.documentElement] : []].find(
      (n) => localName(n) === "definitions",
    ) || doc.documentElement;
  if (!defs || localName(defs) !== "definitions") return empty;

  const messages = buildNameMap(defs, "message");
  const signals = buildNameMap(defs, "signal");
  const proc = findProcess(defs, processId);
  if (!proc) return empty;

  /** @type {string[]} */
  const msgNames = [];
  /** @type {string[]} */
  const sigNames = [];
  /** @type {string[]} */
  const timers = [];
  /** @type {string[]} */
  const conditionals = [];
  const seenMsg = new Set();
  const seenSig = new Set();

  for (const start of childrenLocal(proc, "startevent")) {
    const id = attr(start, "id");
    const name = attr(start, "name");
    if (startHasDef(start, "messageeventdefinition")) {
      const def =
        childrenLocal(start, "messageeventdefinition")[0] ||
        descendantsLocal(start, "messageeventdefinition")[0];
      const resolved = resolveRefName(attr(def, "messageref"), messages, name, id);
      if (resolved && !seenMsg.has(resolved)) {
        seenMsg.add(resolved);
        msgNames.push(resolved);
      }
      continue;
    }
    if (startHasDef(start, "signaleventdefinition")) {
      const def =
        childrenLocal(start, "signaleventdefinition")[0] ||
        descendantsLocal(start, "signaleventdefinition")[0];
      const resolved = resolveRefName(attr(def, "signalref"), signals, name, id);
      if (resolved && !seenSig.has(resolved)) {
        seenSig.add(resolved);
        sigNames.push(resolved);
      }
      continue;
    }
    if (startHasDef(start, "timereventdefinition")) {
      if (id) timers.push(id);
      continue;
    }
    if (startHasDef(start, "conditionaleventdefinition")) {
      if (id) conditionals.push(id);
    }
  }

  msgNames.sort();
  sigNames.sort();
  return { messages: msgNames, signals: sigNames, timers, conditionals };
}

function isNoNoneStartError(err) {
  return /no none start|use typed start triggers/i.test(String(err?.message || err || ""));
}

function newestInstanceId(before, after) {
  const prior = new Set(before || []);
  const added = (after || []).filter((id) => !prior.has(id));
  if (added.length) {
    added.sort();
    return added[added.length - 1];
  }
  if (after?.length) {
    const sorted = [...after].sort();
    return sorted[sorted.length - 1];
  }
  return "";
}

/**
 * Mint an instance like processing/miwg_kernel_test.go mintMIWGInstance:
 * CreateInstance when possible; else first mintable typed start.
 *
 * @returns {{ instanceId: string, via: string }}
 */
export function mintInstance(eng, { deploymentId, processId, xml, variables } = {}) {
  if (!eng) throw new Error("engine not ready");
  if (!deploymentId) throw new Error("deploymentId is required");

  try {
    const { instanceId } = eng.createInstance({
      deploymentId,
      variables,
    });
    return { instanceId, via: "createInstance" };
  } catch (err) {
    if (!isNoNoneStartError(err)) throw err;
  }

  const starts = listTypedStarts(xml, processId);
  const before = eng.listInstanceIds?.() || [];

  for (const name of starts.messages) {
    const res = eng.publishMessage({ name, variables });
    const delivered = Number(res?.delivered || 0);
    if (delivered > 0) {
      const instanceId = newestInstanceId(before, eng.listInstanceIds());
      if (!instanceId) {
        throw new Error(`typed start: message ${JSON.stringify(name)} delivered but no instance`);
      }
      return { instanceId, via: `message ${JSON.stringify(name)}` };
    }
  }

  for (const name of starts.signals) {
    const res = eng.publishSignal({ name, variables });
    const delivered = Number(res?.delivered || 0);
    if (delivered > 0) {
      const instanceId = newestInstanceId(before, eng.listInstanceIds());
      if (!instanceId) {
        throw new Error(`typed start: signal ${JSON.stringify(name)} delivered but no instance`);
      }
      return { instanceId, via: `signal ${JSON.stringify(name)}` };
    }
  }

  if (starts.timers.length > 0) {
    const due = Number(eng.nextDueUnixMs?.() || 0);
    if (due > 0 && typeof eng.setNowUnixMs === "function") {
      eng.setNowUnixMs(due);
      try {
        eng.fireDue();
      } finally {
        eng.setNowUnixMs(null);
      }
    } else {
      eng.fireDue();
    }
    const instanceId = newestInstanceId(before, eng.listInstanceIds());
    if (instanceId) return { instanceId, via: "timer FireDue" };
  }

  if (starts.conditionals.length > 0) {
    const res = eng.evaluateConditionalStarts({
      deploymentId,
      variables,
    });
    const started = Number(res?.started || 0);
    if (started > 0) {
      const instanceId = newestInstanceId(before, eng.listInstanceIds());
      if (instanceId) return { instanceId, via: "conditional" };
    }
    throw new Error(
      "INVALID_ARGUMENT: typed start (conditional) — set variables that satisfy the start condition, then Run again",
    );
  }

  throw new Error(
    "INVALID_ARGUMENT: process has no none start and no mintable typed start (message / signal / timer / conditional)",
  );
}
