/**
 * MVP B — per-node inspector: tokens, intent, vars snippet, scoped wait COMMANDs.
 * Layer C (debugger) can reuse this panel for breakpoint / inspect chrome.
 */
import {
  btnOutline,
  badgeOutline,
  badgeSecondary,
  muted,
  sectionLabel,
} from "./classes.js";
import { renderWaitCard } from "./waits.js";

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function outlineBtn(label, onClick) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = btnOutline + " w-full";
  btn.textContent = label;
  btn.addEventListener("click", onClick);
  return btn;
}

function jsonSnippet(obj, maxLen = 480) {
  try {
    const s = JSON.stringify(obj ?? {}, null, 0);
    return s.length > maxLen ? s.slice(0, maxLen) + "…" : s;
  } catch {
    return String(obj);
  }
}

function bpmnTypeLabel(type) {
  if (!type) return "";
  return String(type).replace(/^bpmn:/, "");
}

/**
 * Collect tokens / waits / intent for one diagram element on an instance.
 * Includes boundary waits hosted on the element and waits whose elementId matches.
 */
export function elementContext(instanceId, elementId, waits) {
  const eng = globalThis.sparrow;
  const empty = {
    instanceId,
    elementId,
    instance: null,
    tokens: [],
    waits: [],
    intent: "",
    childInstanceIds: [],
    parentInstanceId: "",
  };
  if (!eng || !instanceId || !elementId) return empty;

  let instance = null;
  try {
    instance = eng.getInstance(instanceId);
  } catch {
    return empty;
  }

  const tokens = [];
  const childInstanceIds = [];
  for (const tok of Object.values(instance.tokens || {})) {
    if (!tok) continue;
    const onElement =
      tok.elementId === elementId ||
      (tok.boundaryWaits || []).some((bw) => bw?.boundaryId === elementId);
    if (!onElement) continue;
    tokens.push(tok);
    if (tok.calledProcessInstanceId) {
      childInstanceIds.push(tok.calledProcessInstanceId);
    }
  }

  const scopedWaits = (waits || []).filter(
    (w) =>
      w.elementId === elementId ||
      w.hostElementId === elementId ||
      w.boundaryId === elementId,
  );

  return {
    instanceId,
    elementId,
    instance,
    tokens,
    waits: scopedWaits,
    intent: (instance.elementIntent || {})[elementId] || "",
    childInstanceIds: [...new Set(childInstanceIds)],
    parentInstanceId: instance.parentProcessInstanceId || "",
    parentElementId: instance.parentElementId || "",
  };
}

/**
 * @param {HTMLElement} container
 * @param {{
 *   elementId: string,
 *   elementType?: string,
 *   instanceId: string,
 *   waits: object[],
 *   eng: object,
 *   onAction: () => void,
 *   onError: (err: unknown) => void,
 *   onSelectInstance?: (id: string) => void,
 *   onClear?: () => void,
 * }} opts
 */
export function renderInspector(container, opts) {
  const {
    elementId,
    elementType,
    instanceId,
    waits,
    eng,
    onAction,
    onError,
    onSelectInstance,
    onClear,
  } = opts;

  container.innerHTML = "";
  container.className = "flex flex-col gap-2";

  if (!elementId) {
    container.appendChild(
      el(
        "div",
        muted + " text-sm",
        "Click a diagram node to inspect tokens, intent, and scoped actions.",
      ),
    );
    return;
  }

  const ctx = elementContext(instanceId, elementId, waits);
  const head = el("div", "flex flex-wrap items-start justify-between gap-2");
  const title = el("div", "min-w-0 flex flex-col gap-0.5");
  title.appendChild(
    el("div", "font-mono text-xs text-foreground break-all", elementId),
  );
  const sub = el("div", "flex flex-wrap items-center gap-1.5");
  if (elementType) {
    sub.appendChild(el("span", badgeSecondary, bpmnTypeLabel(elementType)));
  }
  if (ctx.intent) {
    sub.appendChild(el("span", badgeOutline, `intent: ${ctx.intent}`));
  }
  if (!instanceId) {
    sub.appendChild(el("span", badgeOutline, "no instance"));
  } else if (!ctx.instance) {
    sub.appendChild(el("span", badgeOutline, "instance missing"));
  } else {
    sub.appendChild(el("span", badgeOutline, ctx.instance.status || "—"));
  }
  title.appendChild(sub);
  head.appendChild(title);

  if (onClear) {
    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = btnOutline + " h-7 shrink-0 px-2 text-xs";
    clear.textContent = "Clear";
    clear.addEventListener("click", onClear);
    head.appendChild(clear);
  }
  container.appendChild(head);

  if (!instanceId) {
    container.appendChild(
      el("div", muted + " text-xs", "Run a process to see live token state."),
    );
    return;
  }

  // Parent / child navigation (Call Activity polish)
  const nav = el("div", "flex flex-col gap-1.5");
  if (ctx.parentInstanceId) {
    nav.appendChild(
      outlineBtn(
        `Open parent · ${shortId(ctx.parentInstanceId)}${
          ctx.parentElementId ? ` @ ${ctx.parentElementId}` : ""
        }`,
        () => onSelectInstance?.(ctx.parentInstanceId),
      ),
    );
  }
  for (const childId of ctx.childInstanceIds) {
    nav.appendChild(
      outlineBtn(`Open child instance · ${shortId(childId)}`, () =>
        onSelectInstance?.(childId),
      ),
    );
  }
  if (nav.childNodes.length) container.appendChild(nav);

  // Tokens on this element
  const tokSection = el("div", "flex flex-col gap-1");
  tokSection.appendChild(el("div", sectionLabel, "Tokens"));
  if (!ctx.tokens.length) {
    tokSection.appendChild(
      el("div", muted + " text-xs", "No tokens on this element"),
    );
  } else {
    for (const tok of ctx.tokens) {
      tokSection.appendChild(tokenSummary(tok));
    }
  }
  container.appendChild(tokSection);

  // Relevant variables (instance-level; COMMAND payloads can override)
  if (ctx.instance?.variables && Object.keys(ctx.instance.variables).length) {
    const varSection = el("div", "flex flex-col gap-1");
    varSection.appendChild(el("div", sectionLabel, "Variables"));
    const pre = el(
      "pre",
      "overflow-x-auto rounded-md border border-border bg-background p-2 font-mono text-[0.65rem] text-muted-foreground whitespace-pre-wrap break-all",
      jsonSnippet(ctx.instance.variables),
    );
    varSection.appendChild(pre);
    container.appendChild(varSection);
  }

  // Scoped wait actions (reuse MVP A cards)
  const actSection = el("div", "flex flex-col gap-1.5");
  actSection.appendChild(el("div", sectionLabel, "Actions"));
  if (!ctx.waits.length) {
    actSection.appendChild(
      el(
        "div",
        muted + " text-xs",
        "No open waits on this element — select a waiting node or use the Waiting list.",
      ),
    );
  } else {
    const cardCtx = { eng, onAction, onError, onSelectInstance };
    for (const w of ctx.waits) {
      actSection.appendChild(renderWaitCard(w, cardCtx));
    }
  }
  container.appendChild(actSection);
}

function shortId(id) {
  if (!id || id.length < 12) return id || "";
  return id.slice(0, 8) + "…" + id.slice(-4);
}

function tokenSummary(tok) {
  const wrap = el(
    "div",
    "rounded-md border border-border bg-background px-2 py-1.5 font-mono text-[0.65rem] text-muted-foreground",
  );
  const lines = [
    `${tok.id?.slice?.(0, 8) || "?"}… · ${tok.status || "?"}`,
  ];
  if (tok.jobType) lines.push(`job ${tok.jobType}`);
  if (tok.messageName) lines.push(`msg ${tok.messageName}`);
  if (tok.signalName) lines.push(`sig ${tok.signalName}`);
  if (tok.dueUnixMs > 0) lines.push(`due ${new Date(tok.dueUnixMs).toLocaleTimeString()}`);
  if (tok.timerText) lines.push(tok.timerText);
  if (tok.incidentErrorMessage) lines.push(tok.incidentErrorMessage);
  if (tok.calledProcessInstanceId) {
    lines.push(`child ${shortId(tok.calledProcessInstanceId)}`);
  }
  if (tok.boundaryWaits?.length) {
    lines.push(`${tok.boundaryWaits.length} boundary wait(s)`);
  }
  wrap.textContent = lines.join(" · ");
  return wrap;
}
