/**
 * Format ListEvents records for the playground trail panel.
 */
import {
  badgeDestructive,
  badgeOutline,
  badgeSecondary,
  card,
  tabsTriggerActive,
  tabsTriggerIdle,
} from "./classes.js";

function shortEnum(value, prefixes) {
  let s = String(value || "");
  for (const p of prefixes) {
    if (s.startsWith(p)) s = s.slice(p.length);
  }
  return s || "—";
}

export function recordKind(ev) {
  const t = String(ev?.recordType || ev?.record_type || "");
  if (t.includes("COMMAND")) return "command";
  if (t.includes("REJECTION")) return "rejection";
  if (t.includes("EVENT")) return "event";
  return "unknown";
}

export function parseRecord(ev) {
  const el = ev?.element || {};
  const kind = recordKind(ev);
  const type = shortEnum(el.type || el.Type, ["TYPE_", "Element_Type_"]);
  const intent = shortEnum(el.intent || el.Intent, ["INTENT_", "Element_Intent_"]);
  const elementId = el.id || el.Id || "";
  const tokenId = el.tokenId || el.token_id || "";
  const payload = extractPayload(el);
  return {
    kind,
    id: ev?.id || "",
    timestamp: Number(ev?.timestamp || ev?.Timestamp || 0),
    sourceRecordId: ev?.sourceRecordId || ev?.source_record_id || "",
    deploymentId: ev?.deploymentId || ev?.deployment_id || "",
    processVersion: ev?.processVersion ?? ev?.process_version,
    elementId,
    type,
    intent,
    tokenId,
    payload,
    rejection: ev?.rejection || null,
    raw: ev,
  };
}

function extractPayload(el) {
  if (!el || typeof el !== "object") return null;
  const keys = [
    "processPayload",
    "eventPayload",
    "activityPayload",
    "sequenceFlowPayload",
    "gatewayPayload",
    "incidentPayload",
  ];
  for (const k of keys) {
    if (el[k]) return { kind: k.replace(/Payload$/, ""), data: el[k] };
  }
  if (el.payload && typeof el.payload === "object") {
    const inner = Object.entries(el.payload).find(([, v]) => v && typeof v === "object");
    if (inner) return { kind: inner[0], data: inner[1] };
  }
  return null;
}

export function formatTime(ms) {
  if (!ms) return "—";
  try {
    const d = new Date(ms);
    const pad = (n, w = 2) => String(n).padStart(w, "0");
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
  } catch {
    return String(ms);
  }
}

function payloadSummary(payload) {
  if (!payload?.data) return [];
  const d = payload.data;
  const lines = [];
  const vars = d.variables;
  if (Array.isArray(vars) && vars.length) {
    lines.push(
      "vars: " +
        vars
          .map((v) => `${v.name}=${v.jsonValue ?? v.json_value ?? "?"}`)
          .join(", ")
    );
  }
  const map = {
    jobType: d.jobType ?? d.job_type,
    messageName: d.messageName ?? d.message_name,
    signalName: d.signalName ?? d.signal_name,
    errorCode: d.errorCode ?? d.error_code,
    escalationCode: d.escalationCode ?? d.escalation_code,
    duration: d.duration,
    dueUnixMs: d.dueUnixMs ?? d.due_unix_ms,
    boundaryId: d.boundaryId ?? d.boundary_id,
    calledProcessInstanceId: d.calledProcessInstanceId ?? d.called_process_instance_id,
    parentProcessInstanceId: d.parentProcessInstanceId ?? d.parent_process_instance_id,
    errorMessage: d.errorMessage ?? d.error_message,
  };
  for (const [k, v] of Object.entries(map)) {
    if (v !== undefined && v !== null && v !== "" && v !== 0) {
      lines.push(`${k}=${v}`);
    }
  }
  return lines;
}

const KIND_CLASS = {
  command: badgeSecondary,
  event: badgeOutline,
  rejection: badgeDestructive,
  unknown: badgeOutline,
};

export { tabsTriggerActive, tabsTriggerIdle };

/**
 * @param {HTMLElement} container
 * @param {object[]} records parsed
 * @param {{ onSelect?: (rec) => void, filter?: 'all'|'event'|'command', activeId?: string }} opts
 */
export function renderTrail(container, records, opts = {}) {
  const filter = opts.filter || "all";
  const activeId = opts.activeId || "";
  const filtered = records.filter((r) => {
    if (filter === "all") return true;
    return r.kind === filter;
  });

  container.className = "flex flex-col gap-2";
  container.innerHTML = "";

  if (!filtered.length) {
    container.className = "flex flex-col gap-2 text-sm text-muted-foreground";
    container.textContent =
      filter === "all" ? "No records yet." : `No ${filter} records.`;
    return;
  }

  for (const rec of filtered) {
    const isActive = activeId && rec.id === activeId;
    const cardEl = document.createElement("article");
    cardEl.dataset.recordId = rec.id;
    cardEl.className =
      card +
      " cursor-pointer p-3 text-left transition-colors hover:bg-accent/40" +
      (isActive ? " ring-2 ring-ring bg-accent/50" : "");
    cardEl.tabIndex = 0;
    cardEl.setAttribute("role", "button");
    if (isActive) cardEl.setAttribute("aria-current", "true");

    const head = document.createElement("div");
    head.className = "mb-1.5 flex flex-wrap items-center gap-1.5";

    const badge = document.createElement("span");
    badge.className = KIND_CLASS[rec.kind] || KIND_CLASS.unknown;
    badge.textContent = rec.kind;
    head.appendChild(badge);

    const time = document.createElement("span");
    time.className = "font-mono text-[0.65rem] text-muted-foreground";
    time.textContent = formatTime(rec.timestamp);
    head.appendChild(time);

    if (rec.type) {
      const typ = document.createElement("span");
      typ.className =
        "rounded-md bg-muted px-1.5 py-0.5 font-mono text-[0.65rem] text-muted-foreground";
      typ.textContent = rec.type;
      head.appendChild(typ);
    }
    cardEl.appendChild(head);

    const title = document.createElement("div");
    title.className = "font-mono text-xs font-medium text-foreground";
    title.textContent = rec.elementId || "(no element)";
    cardEl.appendChild(title);

    const intent = document.createElement("div");
    intent.className = "mt-0.5 text-xs text-muted-foreground";
    intent.textContent = rec.intent;
    cardEl.appendChild(intent);

    const meta = document.createElement("div");
    meta.className = "mt-1.5 space-y-0.5 font-mono text-[0.65rem] text-muted-foreground";
    if (rec.tokenId) {
      const line = document.createElement("div");
      line.textContent = `token ${rec.tokenId}`;
      meta.appendChild(line);
    }
    if (rec.sourceRecordId) {
      const line = document.createElement("div");
      line.textContent = `← ${rec.sourceRecordId.slice(0, 8)}…`;
      line.title = `sourceRecordId ${rec.sourceRecordId}`;
      meta.appendChild(line);
    }
    if (rec.rejection) {
      const line = document.createElement("div");
      line.className = "text-destructive";
      line.textContent = `${rec.rejection.code || ""} ${rec.rejection.message || ""}`.trim();
      meta.appendChild(line);
    }
    for (const s of payloadSummary(rec.payload)) {
      const line = document.createElement("div");
      line.className = "truncate";
      line.title = s;
      line.textContent = s;
      meta.appendChild(line);
    }
    if (meta.childNodes.length) cardEl.appendChild(meta);

    const details = document.createElement("details");
    details.className = "mt-2";
    details.addEventListener("click", (e) => e.stopPropagation());
    const summary = document.createElement("summary");
    summary.className =
      "cursor-pointer text-[0.65rem] text-muted-foreground hover:text-foreground";
    summary.textContent = "JSON";
    const pre = document.createElement("pre");
    pre.className =
      "mt-1.5 max-h-40 overflow-auto rounded-md border border-border bg-muted/50 p-2 font-mono text-[0.6rem] leading-snug text-muted-foreground";
    pre.textContent = JSON.stringify(rec.raw, null, 2);
    details.appendChild(summary);
    details.appendChild(pre);
    cardEl.appendChild(details);

    const activate = () => opts.onSelect?.(rec);
    cardEl.addEventListener("click", activate);
    cardEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        activate();
      }
    });

    container.appendChild(cardEl);
  }

  if (activeId) {
    const active = container.querySelector(`[data-record-id="${CSS.escape(activeId)}"]`);
    active?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
}
