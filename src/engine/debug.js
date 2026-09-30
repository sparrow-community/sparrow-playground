/**
 * Intervention session adapter — kernel WASM is source of truth.
 * Local prefs (mode + breakpoints) apply on Run / Enable; host only gates
 * FireDue/Activate while the kernel reports paused.
 */

/** @typedef {'off' | 'breakpoints' | 'step'} InterventionMode */

/** @type {{
 *   mode: InterventionMode,
 *   breakpoints: Set<string>,
 *   lastReject: string,
 * }} */
const prefs = {
  mode: "off",
  breakpoints: new Set(),
  lastReject: "",
};

/** @type {Set<() => void>} */
const listeners = new Set();

function notify() {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      /* listener errors must not break intervention UI */
    }
  }
}

export function onDebugChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function eng() {
  return globalThis.sparrow;
}

function emptyKernelState(instanceId = "") {
  return {
    enabled: false,
    focusInstanceId: instanceId || "",
    policy: "",
    breakpoints: [...prefs.breakpoints],
    paused: false,
    pauseReason: "",
    pauseElementId: "",
    pauseTokenId: "",
    pending: undefined,
  };
}

/**
 * Read kernel intervention state (or local prefs when engine/session unavailable).
 * @param {string} [instanceId]
 */
export function getInterventionState(instanceId = "") {
  const api = eng();
  if (!api?.getInterventionState) {
    return emptyKernelState(instanceId);
  }
  try {
    const st = api.getInterventionState(
      instanceId ? { instanceId } : undefined,
    );
    if (!st || typeof st !== "object") return emptyKernelState(instanceId);
    return {
      enabled: !!st.enabled,
      focusInstanceId: st.focusInstanceId || "",
      policy: st.policy || "",
      breakpoints: Array.isArray(st.breakpoints)
        ? st.breakpoints.slice()
        : [...prefs.breakpoints],
      paused: !!st.paused,
      pauseReason: st.pauseReason || "",
      pauseElementId: st.pauseElementId || "",
      pauseTokenId: st.pauseTokenId || "",
      pending: st.pending || undefined,
    };
  } catch {
    return emptyKernelState(instanceId);
  }
}

/** @deprecated Prefer getInterventionState; kept for main/inspector call sites. */
export function getDebugState(instanceId = "") {
  const st = getInterventionState(instanceId);
  return {
    mode: prefs.mode,
    runMode: prefs.mode === "off" ? "continuous" : prefs.mode,
    enabled: st.enabled,
    paused: st.paused,
    pauseReason: st.pauseReason,
    pauseElementId: st.pauseElementId,
    pauseTokenId: st.pauseTokenId,
    pending: st.pending,
    breakpoints: prefs.mode === "off" ? [...prefs.breakpoints] : st.breakpoints.length
      ? st.breakpoints
      : [...prefs.breakpoints],
    policy: st.policy,
    focusInstanceId: st.focusInstanceId,
    lastReject: prefs.lastReject,
  };
}

export function getInterventionMode() {
  return prefs.mode;
}

/**
 * @param {InterventionMode} mode
 * @param {{ instanceId?: string }} [opts]
 */
export function setInterventionMode(mode, opts = {}) {
  if (mode !== "off" && mode !== "breakpoints" && mode !== "step") {
    return getDebugState(opts.instanceId);
  }
  prefs.mode = mode;
  const instanceId = opts.instanceId || "";
  if (!instanceId || !eng()) {
    notify();
    return getDebugState(instanceId);
  }
  try {
    if (mode === "off") {
      const st = getInterventionState(instanceId);
      if (st.paused) {
        prefs.lastReject =
          "Cannot disable while paused — Continue or Step first";
        notify();
        return getDebugState(instanceId);
      }
      eng().disableIntervention();
    } else {
      syncSession(instanceId, mode);
    }
    prefs.lastReject = "";
  } catch (err) {
    prefs.lastReject = formatReject(err);
  }
  notify();
  return getDebugState(instanceId);
}

/** Back-compat alias used by older call sites. */
export function setRunMode(mode, opts = {}) {
  if (mode === "continuous") return setInterventionMode("off", opts);
  return setInterventionMode(mode, opts);
}

/**
 * Enable kernel session for a new or existing instance from local prefs.
 * @param {string} instanceId
 */
export function syncSession(instanceId, mode = prefs.mode) {
  const api = eng();
  if (!api || !instanceId) return getDebugState(instanceId);
  if (mode === "off") {
    try {
      const st = getInterventionState(instanceId);
      if (!st.paused && st.enabled) api.disableIntervention();
    } catch {
      /* ignore */
    }
    notify();
    return getDebugState(instanceId);
  }
  const policy = mode === "step" ? "step" : "breakpoints";
  api.enableIntervention({ instanceId, policy });
  api.setBreakpoints({
    instanceId,
    elementIds: [...prefs.breakpoints],
  });
  prefs.lastReject = "";
  notify();
  return getDebugState(instanceId);
}

export function isPaused(instanceId = "") {
  return getInterventionState(instanceId).paused;
}

export function hostEffectsAllowed(instanceId = "") {
  return !isPaused(instanceId);
}

export function toggleBreakpoint(elementId, opts = {}) {
  if (!elementId) return getDebugState(opts.instanceId);
  if (prefs.breakpoints.has(elementId)) prefs.breakpoints.delete(elementId);
  else prefs.breakpoints.add(elementId);
  pushBreakpoints(opts.instanceId);
  notify();
  return getDebugState(opts.instanceId);
}

export function setBreakpoint(elementId, on, opts = {}) {
  if (!elementId) return getDebugState(opts.instanceId);
  if (on) prefs.breakpoints.add(elementId);
  else prefs.breakpoints.delete(elementId);
  pushBreakpoints(opts.instanceId);
  notify();
  return getDebugState(opts.instanceId);
}

export function hasBreakpoint(elementId) {
  return !!elementId && prefs.breakpoints.has(elementId);
}

export function clearBreakpoints(opts = {}) {
  prefs.breakpoints.clear();
  pushBreakpoints(opts.instanceId);
  notify();
  return getDebugState(opts.instanceId);
}

function pushBreakpoints(instanceId = "") {
  const api = eng();
  if (!api?.setBreakpoints || !instanceId) return;
  const st = getInterventionState(instanceId);
  if (!st.enabled && prefs.mode === "off") return;
  try {
    api.setBreakpoints({
      instanceId,
      elementIds: [...prefs.breakpoints],
    });
    prefs.lastReject = "";
  } catch (err) {
    prefs.lastReject = formatReject(err);
  }
}

/**
 * @param {string} instanceId
 * @param {'continue' | 'stepInto' | 'stepOver'} action
 */
export function resumeIntervention(instanceId, action = "continue") {
  const api = eng();
  if (!api || !instanceId) {
    throw new Error("engine or instance not ready");
  }
  let out;
  if (action === "stepInto") {
    out = api.stepInto({ instanceId });
  } else if (action === "stepOver") {
    out = api.stepOver({ instanceId });
  } else {
    out = api.continueIntervention({ instanceId });
  }
  prefs.lastReject = "";
  notify();
  return out;
}

/**
 * @param {string} instanceId
 * @param {Record<string, unknown>} variables
 */
export function setPausedVariables(instanceId, variables) {
  const api = eng();
  if (!api?.setVariables) throw new Error("setVariables unavailable");
  const out = api.setVariables({ instanceId, variables });
  prefs.lastReject = "";
  notify();
  return out;
}

export function formatReject(err) {
  const msg = String(err?.message || err || "");
  if (/instance paused/i.test(msg)) {
    return "Instance paused — Continue or Step first";
  }
  if (/intervene continue or discard/i.test(msg)) {
    return "Session paused — Continue or Step before disabling";
  }
  if (/not paused/i.test(msg)) {
    return "Not paused";
  }
  return msg;
}

export function noteReject(err) {
  prefs.lastReject = formatReject(err);
  notify();
  return prefs.lastReject;
}

export function clearReject() {
  prefs.lastReject = "";
  notify();
}

/**
 * Host FireDue/Activate gate: block only while kernel barrier-paused.
 * @returns {{ pause: boolean, elementId: string, reason: string }}
 */
export function shouldPauseBeforeHostEffect(_kind, _elementIds = []) {
  const st = getInterventionState();
  if (st.paused) {
    return {
      pause: true,
      elementId: st.pauseElementId,
      reason: st.pauseReason || "paused",
    };
  }
  return { pause: false, elementId: "", reason: "" };
}

/** No-op: waits are projection waits; kernel owns barrier auto-pause. */
export function evaluateAutoPause() {
  return isPaused();
}

export function pauseReasonLabel(dbg = getDebugState()) {
  if (!dbg.paused) {
    if (dbg.mode === "off") return "Intervention off";
    if (dbg.mode === "step") return "Step · running";
    return "Breakpoints · running";
  }
  const at = dbg.pauseElementId ? ` @ ${dbg.pauseElementId}` : "";
  switch (dbg.pauseReason) {
    case "breakpoint":
      return `Paused · breakpoint${at}`;
    case "step":
      return `Paused · step${at}`;
    case "manual":
      return `Paused${at}`;
    default:
      return `Paused (${dbg.pauseReason || "?"})${at}`;
  }
}

export function pendingSummary(pending) {
  if (!pending) return "";
  const parts = [pending.kind || "pending"];
  if (pending.fromElementId) parts.push(`from ${pending.fromElementId}`);
  if (pending.takenFlowIds?.length) {
    parts.push(`taken ${pending.takenFlowIds.join(",")}`);
  }
  if (pending.nextElementIds?.length) {
    parts.push(`next ${pending.nextElementIds.join(",")}`);
  }
  if (pending.enterChildId) parts.push(`child ${pending.enterChildId}`);
  return parts.join(" · ");
}

// Legacy no-ops kept so accidental imports do not crash during transition.
export function pause() {
  return getDebugState();
}
export function resume() {
  return getDebugState();
}
export function resumeSuppressing() {
  return getDebugState();
}
