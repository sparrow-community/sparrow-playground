/**
 * MVP A wait panel: one card per wait with kind-specific COMMANDs.
 * MVP B inspector reuses renderWaitCard for element-scoped actions.
 */
import {
  btnPrimary,
  btnOutline,
  input,
  muted,
  badgeOutline,
  badgeDestructive,
} from "./classes.js";
import {
  fireTimerNow,
  runJobForWait,
  parseVarsJson,
  getHostPolicy,
} from "../engine/host.js";

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function varsField(placeholder = '{"key":"value"}') {
  const ta = document.createElement("textarea");
  ta.className = input + " min-h-[2.5rem] h-auto py-1.5 resize-y";
  ta.rows = 2;
  ta.placeholder = placeholder;
  ta.spellcheck = false;
  return ta;
}

function primaryBtn(label, onClick) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = btnPrimary + " w-full";
  btn.textContent = label;
  btn.addEventListener("click", onClick);
  return btn;
}

function outlineBtn(label, onClick) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = btnOutline + " w-full";
  btn.textContent = label;
  btn.addEventListener("click", onClick);
  return btn;
}

function row(...children) {
  const wrap = el("div", "flex flex-col gap-1.5");
  for (const c of children) wrap.appendChild(c);
  return wrap;
}

/**
 * @param {object} wait
 * @param {{
 *   eng: object,
 *   onAction: () => void,
 *   onError: (err: unknown) => void,
 *   onSelectInstance?: (id: string) => void,
 * }} ctx
 */
export function renderWaitCard(wait, ctx) {
  const { eng, onAction, onError, onSelectInstance } = ctx;
  const card = el(
    "div",
    "flex flex-col gap-2 rounded-lg border border-border bg-card p-3 text-sm shadow-xs",
  );

  const head = el("div", "flex flex-wrap items-center gap-1.5");
  const kindBadge = el(
    "span",
    wait.kind === "incident" ? badgeDestructive : badgeOutline,
    wait.kind,
  );
  head.appendChild(kindBadge);
  const meta = el(
    "div",
    "font-mono text-[0.7rem] text-muted-foreground break-all",
    wait.elementId,
  );
  head.appendChild(meta);
  card.appendChild(head);

  if (wait.source === "boundary" && wait.hostElementId) {
    card.appendChild(
      el("div", muted + " text-xs", `boundary on ${wait.hostElementId}`),
    );
  }
  if (wait.instanceId && wait.source === "token" && wait.calledProcessInstanceId) {
    const childId = wait.calledProcessInstanceId;
    const short =
      childId.length > 12
        ? childId.slice(0, 8) + "…" + childId.slice(-4)
        : childId;
    const link = outlineBtn(`Open child instance · ${short}`, () => {
      onSelectInstance?.(childId);
    });
    card.appendChild(link);
  }

  try {
    appendActions(card, wait, { eng, onAction, onError });
  } catch (e) {
    card.appendChild(el("div", "text-sm text-destructive", String(e)));
  }

  return card;
}

function appendActions(card, wait, { eng, onAction, onError }) {
  const run = (fn) => {
    try {
      fn();
      onAction?.();
    } catch (e) {
      onError?.(e);
    }
  };

  const instanceId = wait.instanceId;

  switch (wait.kind) {
    case "user":
    case "wait": {
      const vars = varsField('{"approved":true}');
      vars.value = '{"approved":true}';
      card.appendChild(
        row(
          el("div", muted + " text-xs", "variables (JSON)"),
          vars,
          primaryBtn("Complete", () =>
            run(() => {
              eng.complete({
                instanceId,
                elementId: wait.elementId,
                tokenId: wait.tokenId,
                variables: parseVarsJson(vars.value) ?? { approved: true },
              });
            }),
          ),
        ),
      );
      break;
    }
    case "message": {
      const name = document.createElement("input");
      name.type = "text";
      name.className = input;
      name.value = wait.messageName || "";
      name.placeholder = "message name";
      const corr = varsField('{"orderId":"1"}');
      corr.placeholder = '{"orderId":"1"}  correlation keys (optional)';
      const vars = varsField();
      card.appendChild(
        row(
          el("div", muted + " text-xs", "PublishMessage"),
          name,
          el("div", muted + " text-xs", "correlationKeys (JSON, optional)"),
          corr,
          el("div", muted + " text-xs", "variables (JSON, optional)"),
          vars,
          primaryBtn("Publish message", () =>
            run(() => {
              const n = name.value.trim();
              if (!n) throw new Error("message name required");
              eng.publishMessage({
                name: n,
                instanceId,
                correlationKeys: parseVarsJson(corr.value),
                variables: parseVarsJson(vars.value),
              });
            }),
          ),
        ),
      );
      break;
    }
    case "signal": {
      const name = document.createElement("input");
      name.type = "text";
      name.className = input;
      name.value = wait.signalName || "";
      name.placeholder = "signal name";
      const vars = varsField();
      card.appendChild(
        row(
          el("div", muted + " text-xs", "PublishSignal"),
          name,
          vars,
          primaryBtn("Publish signal", () =>
            run(() => {
              const n = name.value.trim();
              if (!n) throw new Error("signal name required");
              eng.publishSignal({
                name: n,
                instanceId,
                variables: parseVarsJson(vars.value),
              });
            }),
          ),
        ),
      );
      break;
    }
    case "timer": {
      const due = wait.dueUnixMs > 0 ? wait.dueUnixMs : 0;
      const note = el(
        "div",
        muted + " text-xs",
        due
          ? `due ${new Date(due).toLocaleTimeString()} · ${wait.timerText || "timer"}`
          : wait.timerText || "timer armed",
      );
      const policy = getHostPolicy();
      if (policy.autoTimers) {
        card.appendChild(
          el("div", muted + " text-xs", "Auto timers on — JS host will FireDue"),
        );
      }
      card.appendChild(note);
      card.appendChild(
        primaryBtn("Fire due now", () =>
          run(() => {
            fireTimerNow(due);
          }),
        ),
      );
      break;
    }
    case "conditional": {
      const vars = varsField("{}");
      card.appendChild(
        row(
          el(
            "div",
            muted + " text-xs",
            wait.timerText
              ? `condition: ${wait.timerText}`
              : "EvaluateConditions",
          ),
          vars,
          primaryBtn("Evaluate conditions", () =>
            run(() => {
              eng.evaluateConditions({
                instanceId,
                variables: parseVarsJson(vars.value),
              });
            }),
          ),
        ),
      );
      break;
    }
    case "job": {
      const policy = getHostPolicy();
      card.appendChild(
        el(
          "div",
          muted + " text-xs",
          policy.autoJobs
            ? `Job ${wait.jobType} · auto-draining`
            : `Job ${wait.jobType}`,
        ),
      );
      const actions = el("div", "flex flex-col gap-1.5");
      actions.appendChild(
        primaryBtn("Complete job", () =>
          run(() => {
            runJobForWait(wait, "complete");
          }),
        ),
      );
      actions.appendChild(
        outlineBtn("Fail job", () =>
          run(() => {
            runJobForWait(wait, "fail");
          }),
        ),
      );
      card.appendChild(actions);
      break;
    }
    case "incident": {
      card.appendChild(
        el(
          "div",
          "text-xs text-destructive break-words",
          wait.incidentErrorMessage || "incident open",
        ),
      );
      const actions = el("div", "flex flex-col gap-1.5");
      actions.appendChild(
        primaryBtn("Resolve incident", () =>
          run(() => {
            eng.resolveIncident({
              instanceId,
              elementId: wait.elementId,
              tokenId: wait.tokenId,
            });
          }),
        ),
      );
      const errCode = document.createElement("input");
      errCode.type = "text";
      errCode.className = input;
      errCode.placeholder = "error code (ThrowError)";
      errCode.value = "ERROR";
      actions.appendChild(errCode);
      actions.appendChild(
        outlineBtn("Throw error", () =>
          run(() => {
            eng.throwError({
              instanceId,
              elementId: wait.elementId,
              tokenId: wait.tokenId,
              errorCode: errCode.value.trim() || "ERROR",
            });
          }),
        ),
      );
      card.appendChild(actions);
      break;
    }
    default: {
      card.appendChild(
        el("div", muted, `No action mapped for kind “${wait.kind}”`),
      );
    }
  }
}

/**
 * Render the full waits list into container.
 * @returns {string[]} element ids to highlight
 */
export function renderWaits(container, waits, ctx) {
  container.innerHTML = "";
  if (!waits.length) {
    container.textContent = "No active waits";
    container.className = "flex flex-col gap-2 text-sm text-muted-foreground";
    return [];
  }
  container.className = "flex flex-col gap-2";
  const highlight = [];
  for (const w of waits) {
    container.appendChild(renderWaitCard(w, ctx));
    if (w.elementId) highlight.push(w.elementId);
    if (w.hostElementId) highlight.push(w.hostElementId);
  }
  return [...new Set(highlight)];
}
