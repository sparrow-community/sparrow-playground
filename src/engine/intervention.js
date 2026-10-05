/**
 * Intervention session adapter — kernel WASM is source of truth.
 * Local prefs (mode + breakpoints) apply on Run / Enable; host gates
 * FireDue/Activate via kernel hostEffectAllowed (fallback: !paused).
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

export function onInterventionChange(fn) {
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
    blockHostEffects: false,
  };
}

function normalizePending(pending) {
  if (!pending || typeof pending !== "object") return undefined;
  return {
    kind: pending.kind || "",
    fromElementId: pending.fromElementId || "",
    tokenId: pending.tokenId || "",
    takenFlowIds: Array.isArray(pending.takenFlowIds)
      ? pending.takenFlowIds.slice()
      : undefined,
    nextElementIds: Array.isArray(pending.nextElementIds)
      ? pending.nextElementIds.slice()
      : undefined,
    outgoingFlowId: pending.outgoingFlowId || undefined,
    enterChildId: pending.enterChildId || undefined,
    spawnChildToken: pending.spawnChildToken || undefined,
    linkCatchIds: Array.isArray(pending.linkCatchIds)
      ? pending.linkCatchIds.slice()
      : undefined,
    decideMode: pending.decideMode || undefined,
    terminateJoinPeers: pending.terminateJoinPeers || undefined,
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
      pending: normalizePending(st.pending),
      blockHostEffects: !!st.blockHostEffects,
    };
  } catch {
    return emptyKernelState(instanceId);
  }
}

/**
 * UI-facing session snapshot: local mode prefs + kernel pause/pending/BP.
 * @param {string} [instanceId]
 */
export function getInterventionUiState(instanceId = "") {
  const st = getInterventionState(instanceId);
  return {
    mode: prefs.mode,
    enabled: st.enabled,
    paused: st.paused,
    pauseReason: st.pauseReason,
    pauseElementId: st.pauseElementId,
    pauseTokenId: st.pauseTokenId,
    pending: st.pending,
    blockHostEffects: st.blockHostEffects,
    breakpoints:
      prefs.mode === "off"
        ? [...prefs.breakpoints]
        : st.breakpoints.length
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
    return getInterventionUiState(opts.instanceId);
  }
  prefs.mode = mode;
  const instanceId = opts.instanceId || "";
  if (!instanceId || !eng()) {
    notify();
    return getInterventionUiState(instanceId);
  }
  try {
    if (mode === "off") {
      const st = getInterventionState(instanceId);
      if (st.paused) {
        prefs.lastReject =
          "Cannot disable while paused — Continue or Step first";
        notify();
        return getInterventionUiState(instanceId);
      }
      eng().disableIntervention({ instanceId });
    } else {
      syncSession(instanceId, mode);
    }
    prefs.lastReject = "";
  } catch (err) {
    prefs.lastReject = formatReject(err);
  }
  notify();
  return getInterventionUiState(instanceId);
}

/**
 * Enable kernel session for a new or existing instance from local prefs.
 * @param {string} instanceId
 */
export function syncSession(instanceId, mode = prefs.mode) {
  const api = eng();
  if (!api || !instanceId) return getInterventionUiState(instanceId);
  if (mode === "off") {
    try {
      const st = getInterventionState(instanceId);
      if (!st.paused && st.enabled) {
        api.disableIntervention({ instanceId });
      }
    } catch {
      /* ignore */
    }
    notify();
    return getInterventionUiState(instanceId);
  }
  const policy = mode === "step" ? "step" : "breakpoints";
  api.enableIntervention({ instanceId, policy });
  api.setBreakpoints({
    instanceId,
    elementIds: [...prefs.breakpoints],
  });
  prefs.lastReject = "";
  notify();
  return getInterventionUiState(instanceId);
}

export function isPaused(instanceId = "") {
  return getInterventionState(instanceId).paused;
}

/**
 * Prefer kernel hostEffectAllowed (Intervention 1–7). Fallback: !paused /
 * !blockHostEffects when the WASM surface is missing (older pins).
 * @param {string} [instanceId]
 */
export function hostEffectsAllowed(instanceId = "") {
  const api = eng();
  const st = getInterventionState(instanceId);
  const id = instanceId || st.focusInstanceId || "";
  if (api?.hostEffectAllowed && id) {
    try {
      const out = api.hostEffectAllowed({ instanceId: id });
      if (out && typeof out.allowed === "boolean") return out.allowed;
    } catch {
      /* fall through to state-based gate */
    }
  }
  if (st.blockHostEffects) return false;
  return !st.paused;
}

export function toggleBreakpoint(elementId, opts = {}) {
  if (!elementId) return getInterventionUiState(opts.instanceId);
  if (prefs.breakpoints.has(elementId)) prefs.breakpoints.delete(elementId);
  else prefs.breakpoints.add(elementId);
  pushBreakpoints(opts.instanceId);
  notify();
  return getInterventionUiState(opts.instanceId);
}

export function setBreakpoint(elementId, on, opts = {}) {
  if (!elementId) return getInterventionUiState(opts.instanceId);
  if (on) prefs.breakpoints.add(elementId);
  else prefs.breakpoints.delete(elementId);
  pushBreakpoints(opts.instanceId);
  notify();
  return getInterventionUiState(opts.instanceId);
}

export function hasBreakpoint(elementId) {
  return !!elementId && prefs.breakpoints.has(elementId);
}

export function clearBreakpoints(opts = {}) {
  prefs.breakpoints.clear();
  pushBreakpoints(opts.instanceId);
  notify();
  return getInterventionUiState(opts.instanceId);
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
 * Kernel PauseReasonManual — arms immediate pause on wait, else next barrier.
 * Not exposed as panel chrome (product: no host Pause control); available for
 * callers / future affordances without inventing a fourth mode.
 * @param {string} instanceId
 */
export function pauseIntervention(instanceId) {
  const api = eng();
  if (!api?.pause || !instanceId) {
    throw new Error("pause unavailable or instance not ready");
  }
  const out = api.pause({ instanceId });
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
 * Host FireDue/Activate gate: prefer kernel hostEffectAllowed / blockHostEffects.
 * @returns {{ pause: boolean, elementId: string, reason: string }}
 */
export function shouldPauseBeforeHostEffect(_kind, _elementIds = [], instanceId = "") {
  const st = getInterventionState(instanceId);
  if (!hostEffectsAllowed(instanceId || st.focusInstanceId)) {
    return {
      pause: true,
      elementId: st.pauseElementId,
      reason: st.pauseReason || (st.blockHostEffects ? "blockHostEffects" : "paused"),
    };
  }
  return { pause: false, elementId: "", reason: "" };
}

export function pauseReasonLabel(ui = getInterventionUiState()) {
  if (!ui.paused) {
    if (ui.mode === "off") return "Intervention off";
    if (ui.mode === "step") return "Step · running";
    return "Breakpoints · running";
  }
  const at = ui.pauseElementId ? ` @ ${ui.pauseElementId}` : "";
  switch (ui.pauseReason) {
    case "breakpoint":
      return `Paused · breakpoint${at}`;
    case "step":
      return `Paused · step${at}`;
    case "manual":
      return `Paused${at}`;
    default:
      return `Paused (${ui.pauseReason || "?"})${at}`;
  }
}

export function pendingSummary(pending) {
  if (!pending) return "";
  const kind = pending.kind || "pending";
  const parts = [kind];
  if (pending.fromElementId) parts.push(`from ${pending.fromElementId}`);
  if (pending.decideMode) parts.push(`mode ${pending.decideMode}`);
  if (pending.takenFlowIds?.length) {
    parts.push(`taken ${pending.takenFlowIds.join(",")}`);
  }
  if (pending.nextElementIds?.length) {
    parts.push(`next ${pending.nextElementIds.join(",")}`);
  }
  if (pending.outgoingFlowId) parts.push(`flow ${pending.outgoingFlowId}`);
  if (pending.enterChildId) parts.push(`child ${pending.enterChildId}`);
  if (pending.spawnChildToken) parts.push("spawn child token");
  if (pending.linkCatchIds?.length) {
    parts.push(`link ${pending.linkCatchIds.join(",")}`);
  }
  if (pending.terminateJoinPeers) {
    parts.push(`terminate ${pending.terminateJoinPeers}`);
  }
  return parts.join(" · ");
}
