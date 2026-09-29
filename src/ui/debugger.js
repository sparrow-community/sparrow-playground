/**
 * MVP C — debugger chrome: run mode, pause / continue / step, breakpoint list.
 */
import {
  btnOutline,
  btnPrimary,
  muted,
  badgeOutline,
} from "./classes.js";
import {
  getDebugState,
  setRunMode,
  pause,
  resumeSuppressing,
  pauseReasonLabel,
  peekHostEffect,
  stepHostEffect,
  toggleBreakpoint,
  clearBreakpoints,
  disarmTimers,
  listWaits,
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
 *   selectedElementId?: string,
 *   onChange: () => void,
 *   onStatus?: (text: string, kind?: string) => void,
 * }} opts
 */
export function renderDebugger(container, opts) {
  const { selectedElementId, onChange, onStatus } = opts;
  const dbg = getDebugState();

  container.innerHTML = "";
  container.className = "flex flex-col gap-2";

  const modeRow = el("div", "flex flex-wrap items-center gap-2");
  modeRow.appendChild(el("span", muted + " text-[0.7rem] shrink-0", "Mode"));
  const select = document.createElement("select");
  select.className =
    "h-7 min-w-0 flex-1 rounded-md border border-input bg-background px-1.5 text-xs text-foreground shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring";
  select.title = "Debug run mode";
  for (const [value, label] of [
    ["continuous", "Continuous"],
    ["step", "Step (pause on waits)"],
    ["breakpoints", "Breakpoints"],
  ]) {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = label;
    if (value === dbg.runMode) opt.selected = true;
    select.appendChild(opt);
  }
  select.addEventListener("change", () => {
    setRunMode(select.value);
    if (select.value === "continuous") {
      // Re-arm host if we cleared an auto-pause.
      onChange();
    } else {
      onChange();
    }
    onStatus?.(pauseReasonLabel(), "ok");
  });
  modeRow.appendChild(select);
  container.appendChild(modeRow);

  const controls = el("div", "flex flex-wrap items-center gap-1.5");
  const pauseBtn = document.createElement("button");
  pauseBtn.type = "button";
  pauseBtn.className = btnOutline + " h-7 px-2 text-xs";
  pauseBtn.textContent = "Pause";
  pauseBtn.disabled = dbg.paused;
  pauseBtn.title = "Stop JS host FireDue / Activate";
  pauseBtn.addEventListener("click", () => {
    pause("manual");
    disarmTimers();
    onChange();
    onStatus?.(pauseReasonLabel(), "ok");
  });
  controls.appendChild(pauseBtn);

  const contBtn = document.createElement("button");
  contBtn.type = "button";
  contBtn.className = btnPrimary + " h-7 px-2 text-xs";
  contBtn.textContent = "Continue";
  contBtn.disabled = !dbg.paused;
  contBtn.title = "Resume host scheduling until next pause";
  contBtn.addEventListener("click", () => {
    // Avoid instantly re-pausing on the same wait set in step / breakpoints modes.
    const eng = globalThis.sparrow;
    const ids = eng?.listInstanceIds?.() || [];
    const waits = [];
    for (const id of ids) waits.push(...listWaits(id));
    resumeSuppressing(waits);
    onChange();
    onStatus?.(pauseReasonLabel(), "ok");
  });
  controls.appendChild(contBtn);

  const stepBtn = document.createElement("button");
  stepBtn.type = "button";
  stepBtn.className = btnOutline + " h-7 px-2 text-xs";
  stepBtn.textContent = "Step";
  stepBtn.title = "Run one pending FireDue or Activate+Complete, then pause";
  stepBtn.addEventListener("click", () => {
    // Ensure we are paused for step semantics.
    if (!dbg.paused) pause("manual");
    const pending = peekHostEffect();
    if (!pending) {
      onStatus?.(
        "No pending host effect — use Waiting / Inspect COMMANDs",
        "ok",
      );
      onChange();
      return;
    }
    const result = stepHostEffect(() => onChange());
    if (!result.did) {
      onStatus?.("No pending host effect — use Waiting / Inspect COMMANDs", "ok");
    } else {
      const kind = result.effect?.type === "timer" ? "FireDue" : "Activate";
      onStatus?.(`Stepped ${kind} · ${pauseReasonLabel()}`, "ok");
    }
    onChange();
  });
  controls.appendChild(stepBtn);
  container.appendChild(controls);

  const status = el(
    "div",
    "font-mono text-[0.65rem] text-muted-foreground",
    pauseReasonLabel(dbg),
  );
  container.appendChild(status);

  const bpRow = el("div", "flex flex-wrap items-center gap-1.5");
  const bpToggle = document.createElement("button");
  bpToggle.type = "button";
  bpToggle.className = btnOutline + " h-7 px-2 text-xs";
  const selectedOn = selectedElementId && dbg.breakpoints.includes(selectedElementId);
  bpToggle.textContent = selectedOn ? "Clear BP" : "Break";
  bpToggle.disabled = !selectedElementId;
  bpToggle.title = selectedElementId
    ? `Toggle breakpoint on ${selectedElementId}`
    : "Select a diagram node to set a breakpoint";
  bpToggle.addEventListener("click", () => {
    if (!selectedElementId) return;
    toggleBreakpoint(selectedElementId);
    onChange();
    onStatus?.(
      `Breakpoint ${selectedOn ? "cleared" : "set"} · ${selectedElementId}`,
      "ok",
    );
  });
  bpRow.appendChild(bpToggle);

  if (dbg.breakpoints.length) {
    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = btnOutline + " h-7 px-2 text-xs";
    clear.textContent = "Clear all";
    clear.addEventListener("click", () => {
      clearBreakpoints();
      onChange();
      onStatus?.("Breakpoints cleared", "ok");
    });
    bpRow.appendChild(clear);
  }
  container.appendChild(bpRow);

  if (dbg.breakpoints.length) {
    const list = el("div", "flex flex-wrap gap-1");
    for (const id of dbg.breakpoints) {
      const chip = el("button", badgeOutline + " cursor-pointer font-mono text-[0.65rem]", id);
      chip.type = "button";
      chip.title = `Remove breakpoint ${id}`;
      chip.addEventListener("click", () => {
        toggleBreakpoint(id);
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
        "Breakpoints: none — Break on selection, or toggle in Inspect.",
      ),
    );
  }
}
