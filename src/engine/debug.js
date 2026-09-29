/**
 * MVP C — playground-only step debugger state.
 * Pause / step / breakpoints gate JS host FireDue and Activate; kernel COMANDS unchanged.
 */

/** @typedef {'continuous' | 'step' | 'breakpoints'} RunMode */

/** @type {{
 *   runMode: RunMode,
 *   paused: boolean,
 *   pauseReason: string,
 *   pauseElementId: string,
 *   breakpoints: Set<string>,
 *   suppressPauseKey: string,
 * }} */
const state = {
  runMode: "continuous",
  paused: false,
  pauseReason: "",
  pauseElementId: "",
  breakpoints: new Set(),
  suppressPauseKey: "",
};

/** @type {Set<() => void>} */
const listeners = new Set();

function notify() {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      /* listener errors must not break debug */
    }
  }
}

export function onDebugChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getDebugState() {
  return {
    runMode: state.runMode,
    paused: state.paused,
    pauseReason: state.pauseReason,
    pauseElementId: state.pauseElementId,
    breakpoints: [...state.breakpoints],
  };
}

export function setRunMode(mode) {
  if (mode !== "continuous" && mode !== "step" && mode !== "breakpoints") {
    return getDebugState();
  }
  state.runMode = mode;
  if (mode === "continuous" && state.paused && state.pauseReason !== "manual") {
    // Leaving step/BP modes clears auto-pauses; manual pause stays until Continue.
    state.paused = false;
    state.pauseReason = "";
    state.pauseElementId = "";
  }
  notify();
  return getDebugState();
}

export function pause(reason = "manual", elementId = "") {
  state.paused = true;
  state.pauseReason = reason || "manual";
  state.pauseElementId = elementId || "";
  state.suppressPauseKey = "";
  notify();
  return getDebugState();
}

export function resume() {
  state.paused = false;
  state.pauseReason = "";
  state.pauseElementId = "";
  notify();
  return getDebugState();
}

/**
 * Resume without immediately re-pausing on the same wait set (Continue in step/BP mode).
 * @param {Array<{ id?: string, tokenId?: string, elementId?: string, kind?: string }>} waits
 */
export function resumeSuppressing(waits) {
  state.suppressPauseKey = waitFingerprint(waits);
  return resume();
}

function waitFingerprint(waits) {
  const list = waits || [];
  if (!list.length) return "";
  return list
    .map((w) => `${w.id || w.tokenId || ""}:${w.elementId || ""}:${w.kind || ""}`)
    .sort()
    .join("|");
}

export function isPaused() {
  return state.paused;
}

export function hostEffectsAllowed() {
  return !state.paused;
}

export function toggleBreakpoint(elementId) {
  if (!elementId) return getDebugState();
  if (state.breakpoints.has(elementId)) state.breakpoints.delete(elementId);
  else state.breakpoints.add(elementId);
  notify();
  return getDebugState();
}

export function setBreakpoint(elementId, on) {
  if (!elementId) return getDebugState();
  if (on) state.breakpoints.add(elementId);
  else state.breakpoints.delete(elementId);
  notify();
  return getDebugState();
}

export function hasBreakpoint(elementId) {
  return !!elementId && state.breakpoints.has(elementId);
}

export function clearBreakpoints() {
  state.breakpoints.clear();
  notify();
  return getDebugState();
}

/**
 * Auto-pause after a panel refresh when mode + waits warrant it.
 * @param {Array<{ elementId?: string, hostElementId?: string, id?: string, tokenId?: string, kind?: string }>} waits
 * @returns {boolean} true if paused (or already paused)
 */
export function evaluateAutoPause(waits) {
  if (state.paused) return true;
  const list = waits || [];
  const key = waitFingerprint(list);
  if (state.suppressPauseKey) {
    if (key && key === state.suppressPauseKey) return false;
    state.suppressPauseKey = "";
  }
  if (state.runMode === "step") {
    if (list.length) {
      pause("step-wait", list[0].elementId || "");
      return true;
    }
    return false;
  }
  if (state.runMode === "breakpoints") {
    const hit = list.find(
      (w) =>
        (w.elementId && state.breakpoints.has(w.elementId)) ||
        (w.hostElementId && state.breakpoints.has(w.hostElementId)),
    );
    if (hit) {
      pause("breakpoint", hit.elementId || hit.hostElementId || "");
      return true;
    }
  }
  return false;
}

/**
 * Whether a pending host effect should pause instead of running.
 * Step mode pauses via evaluateAutoPause on waits (before Activate/FireDue runs).
 * Breakpoints mode also gates FireDue/Activate that target a breakpointed element.
 * @param {'timer' | 'job'} kind
 * @param {string[]} elementIds
 * @returns {{ pause: boolean, elementId: string, reason: string }}
 */
export function shouldPauseBeforeHostEffect(kind, elementIds = []) {
  if (state.paused) {
    return { pause: true, elementId: state.pauseElementId, reason: state.pauseReason || "paused" };
  }
  const ids = (elementIds || []).filter(Boolean);
  if (state.runMode === "breakpoints") {
    const hit = ids.find((id) => state.breakpoints.has(id));
    if (hit) {
      return {
        pause: true,
        elementId: hit,
        reason: "breakpoint",
      };
    }
  }
  // continuous + step: do not gate here (step uses wait auto-pause + explicit Step Over)
  return { pause: false, elementId: "", reason: "" };
}

export function pauseReasonLabel(dbg = getDebugState()) {
  if (!dbg.paused) return "Running";
  const at = dbg.pauseElementId ? ` @ ${dbg.pauseElementId}` : "";
  switch (dbg.pauseReason) {
    case "manual":
      return `Paused${at}`;
    case "step-wait":
      return `Step · wait${at}`;
    case "host-timer":
      return `Paused before FireDue${at}`;
    case "host-job":
      return `Paused before Activate${at}`;
    case "breakpoint":
      return `Breakpoint${at}`;
    case "step":
      return `Stepped${at}`;
    default:
      return `Paused (${dbg.pauseReason || "?"})${at}`;
  }
}
