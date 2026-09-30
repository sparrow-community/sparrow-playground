/**
 * Intervention chrome — kernel session mode, Continue / Step*, breakpoints, pending.
 */
import {
  btnOutline,
  btnPrimary,
  muted,
  badgeOutline,
} from "./classes.js";
import {
  getInterventionUiState,
  setInterventionMode,
  resumeIntervention,
  setPausedVariables,
  pauseReasonLabel,
  pendingSummary,
  toggleBreakpoint,
  clearBreakpoints,
  formatReject,
  parseVarsJson,
} from "../engine/host.js";

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

/**
 * @param {HTMLElement} container
 * @param {{
 *   instanceId?: string,
 *   selectedElementId?: string,
 *   variables?: Record<string, unknown>,
 *   onChange: () => void,
 *   onStatus?: (text: string, kind?: string) => void,
 * }} opts
 */
export function renderIntervention(container, opts) {
  const { instanceId, selectedElementId, variables, onChange, onStatus } = opts;
  const ui = getInterventionUiState(instanceId);

  container.innerHTML = "";
  container.className = "flex flex-col gap-2";

  const modeRow = el("div", "flex flex-wrap items-center gap-2");
  modeRow.appendChild(el("span", muted + " text-[0.7rem] shrink-0", "Mode"));
  const select = document.createElement("select");
  select.className =
    "h-7 min-w-0 flex-1 rounded-md border border-input bg-background px-1.5 text-xs text-foreground shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring";
  select.title = "Intervention session mode (kernel)";
  for (const [value, label] of [
    ["off", "Off"],
    ["breakpoints", "Breakpoints"],
    ["step", "Step"],
  ]) {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = label;
    if (value === ui.mode) opt.selected = true;
    select.appendChild(opt);
  }
  select.addEventListener("change", () => {
    const next = setInterventionMode(select.value, { instanceId });
    if (next.lastReject) {
      onStatus?.(next.lastReject, "err");
      // Re-render so select reflects actual mode if disable was rejected.
      onChange();
      return;
    }
    onChange();
    onStatus?.(pauseReasonLabel(next), "ok");
  });
  modeRow.appendChild(select);
  container.appendChild(modeRow);

  const controls = el("div", "flex flex-wrap items-center gap-1.5");
  for (const [action, label, primary] of [
    ["continue", "Continue", true],
    ["stepInto", "Step into", false],
    ["stepOver", "Step over", false],
  ]) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = (primary ? btnPrimary : btnOutline) + " h-7 px-2 text-xs";
    btn.textContent = label;
    btn.disabled = !ui.paused || !instanceId;
    btn.title =
      action === "continue"
        ? "Resume until wait, end, or breakpoint"
        : action === "stepInto"
          ? "One pending transit, then next barrier"
          : "Resume until next natural wait or end (honors breakpoints)";
    btn.addEventListener("click", () => {
      if (!instanceId) return;
      try {
        resumeIntervention(instanceId, action);
        onChange();
        onStatus?.(pauseReasonLabel(getInterventionUiState(instanceId)), "ok");
      } catch (err) {
        onStatus?.(formatReject(err), "err");
        onChange();
      }
    });
    controls.appendChild(btn);
  }
  container.appendChild(controls);

  const status = el(
    "div",
    "font-mono text-[0.65rem] text-muted-foreground",
    pauseReasonLabel(ui),
  );
  container.appendChild(status);

  if (ui.lastReject) {
    container.appendChild(
      el("div", "font-mono text-[0.65rem] text-destructive", ui.lastReject),
    );
  }

  if (ui.paused && ui.pending) {
    const pendingBox = el(
      "div",
      "rounded-md border border-border bg-background px-2 py-1.5 font-mono text-[0.65rem] text-muted-foreground whitespace-pre-wrap break-all",
      pendingSummary(ui.pending),
    );
    container.appendChild(pendingBox);
  }

  if (ui.paused && instanceId) {
    const varSection = el("div", "flex flex-col gap-1");
    varSection.appendChild(
      el("div", muted + " text-[0.65rem]", "Variables (paused)"),
    );
    const ta = document.createElement("textarea");
    ta.className =
      "min-h-[4.5rem] w-full rounded-md border border-input bg-background px-2 py-1.5 font-mono text-[0.65rem] text-foreground shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring";
    ta.spellcheck = false;
    try {
      ta.value = JSON.stringify(variables ?? {}, null, 2);
    } catch {
      ta.value = "{}";
    }
    varSection.appendChild(ta);
    const apply = document.createElement("button");
    apply.type = "button";
    apply.className = btnOutline + " h-7 px-2 text-xs self-start";
    apply.textContent = "Set variables";
    apply.title = "Merge variables while barrier-paused (ledger COMMAND)";
    apply.addEventListener("click", () => {
      try {
        const vars = parseVarsJson(ta.value) ?? {};
        setPausedVariables(instanceId, vars);
        onChange();
        onStatus?.("Variables updated", "ok");
      } catch (err) {
        onStatus?.(formatReject(err), "err");
      }
    });
    varSection.appendChild(apply);
    container.appendChild(varSection);
  }

  const bpRow = el("div", "flex flex-wrap items-center gap-1.5");
  const bpToggle = document.createElement("button");
  bpToggle.type = "button";
  bpToggle.className = btnOutline + " h-7 px-2 text-xs";
  const selectedOn =
    selectedElementId && ui.breakpoints.includes(selectedElementId);
  bpToggle.textContent = selectedOn ? "Clear BP" : "Break";
  bpToggle.disabled = !selectedElementId;
  bpToggle.title = selectedElementId
    ? `Toggle breakpoint on ${selectedElementId}`
    : "Select a diagram node to set a breakpoint";
  bpToggle.addEventListener("click", () => {
    if (!selectedElementId) return;
    toggleBreakpoint(selectedElementId, { instanceId });
    onChange();
    onStatus?.(
      `Breakpoint ${selectedOn ? "cleared" : "set"} · ${selectedElementId}`,
      "ok",
    );
  });
  bpRow.appendChild(bpToggle);

  if (ui.breakpoints.length) {
    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = btnOutline + " h-7 px-2 text-xs";
    clear.textContent = "Clear all";
    clear.addEventListener("click", () => {
      clearBreakpoints({ instanceId });
      onChange();
      onStatus?.("Breakpoints cleared", "ok");
    });
    bpRow.appendChild(clear);
  }
  container.appendChild(bpRow);

  if (ui.breakpoints.length) {
    const list = el("div", "flex flex-wrap gap-1");
    for (const id of ui.breakpoints) {
      const chip = el(
        "button",
        badgeOutline + " cursor-pointer font-mono text-[0.65rem]",
        id,
      );
      chip.type = "button";
      chip.title = `Remove breakpoint ${id}`;
      chip.addEventListener("click", () => {
        toggleBreakpoint(id, { instanceId });
        onChange();
      });
      list.appendChild(chip);
    }
    container.appendChild(list);
  } else {
    container.appendChild(
      el(
        "div",
        muted + " text-[0.65rem]",
        "Breakpoints: none — Break on selection, or toggle BP in Inspect.",
      ),
    );
  }
}
