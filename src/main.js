import "./styles.css";
import {
  createModeler,
  importDiagram,
  openEmpty,
  exportXML,
  setWaitingMarkers,
  seekElement,
} from "./modeler.js";
import {
  loadEngine,
  ensureEngine,
  armTimers,
  drainJobs,
  listWaits,
  looksLikeBpmn,
  setHostPolicy,
  getHostPolicy,
} from "./engine/host.js";
import { parseRecord, renderTrail } from "./ui/trail.js";
import { createPlayback } from "./ui/playback.js";
import { renderWaits } from "./ui/waits.js";
import { tabsTriggerActive, tabsTriggerIdle } from "./ui/classes.js";

const $ = (id) => document.getElementById(id);

const modeler = createModeler($("canvas"));
let currentInstanceId = "";
let highlighted = [];
let trailFilter = "all";
let trailRecords = [];
let activeRecordId = "";

const playback = createPlayback({
  onFrame(frame) {
    activeRecordId = frame?.id || "";
    seekElement(modeler, frame?.elementId || "");
    // re-render trail highlight without refetching engine
    paintTrail();
  },
  onState(state) {
    const pos = $("play-pos");
    const toggle = $("play-toggle");
    if (pos) {
      pos.textContent =
        state.total === 0
          ? "0 / 0"
          : `${Math.max(state.index + 1, 0)} / ${state.total}`;
    }
    if (toggle) {
      toggle.textContent = state.playing ? "⏸" : "▶";
      toggle.title = state.playing ? "Pause" : "Play EVENTs";
    }
  },
});

function setStatus(text, kind = "") {
  const el = $("engine-status");
  el.textContent = text;
  const base = "text-xs ";
  if (kind === "ok") el.className = base + "text-foreground";
  else if (kind === "err") el.className = base + "text-destructive";
  else el.className = base + "text-muted-foreground";
}

function downloadBlob(filename, text) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "application/xml" }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function openXML(xml) {
  await importDiagram(modeler, xml, { autoLayoutIfMissing: true });
}

async function openFile(file) {
  const xml = await file.text();
  await openXML(xml);
  setStatus(`Opened ${file.name}`, "ok");
}

function renderInstanceSelect() {
  const sel = $("instance-select");
  const eng = globalThis.sparrow;
  const ids = eng ? eng.listInstanceIds() : [];
  sel.innerHTML = "";
  if (!ids.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No instances";
    sel.appendChild(opt);
    return;
  }
  for (const id of ids.slice().reverse()) {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = id.slice(0, 8) + "…" + id.slice(-4);
    if (id === currentInstanceId) opt.selected = true;
    sel.appendChild(opt);
  }
  if (!currentInstanceId || !ids.includes(currentInstanceId)) {
    currentInstanceId = ids[ids.length - 1];
    sel.value = currentInstanceId;
  }
}

function setTrailFilter(next) {
  trailFilter = next;
  document.querySelectorAll(".trail-filter-btn").forEach((btn) => {
    const active = btn.getAttribute("data-filter") === next;
    btn.className = active ? tabsTriggerActive : tabsTriggerIdle;
  });
  paintTrail();
}

function paintTrail() {
  const eventsEl = $("events");
  if (!trailRecords.length) {
    eventsEl.textContent = currentInstanceId
      ? "No records yet."
      : "Run a process to see the COMMAND → EVENT trail.";
    eventsEl.className = "flex flex-col gap-2 text-sm text-muted-foreground";
    return;
  }
  // Newest first for reading; playback frames are chronological separately.
  const display = trailRecords.slice().reverse();
  renderTrail(eventsEl, display, {
    filter: trailFilter,
    activeId: activeRecordId,
    onSelect: (rec) => {
      if (rec.kind === "event") {
        playback.seekToId(rec.id);
      } else {
        activeRecordId = rec.id;
        seekElement(modeler, rec.elementId || "");
        paintTrail();
      }
    },
  });
}

function syncPlaybackFrames() {
  const frames = trailRecords.filter((r) => r.kind === "event");
  playback.setFrames(frames);
}

function syncHostPolicyFromUI() {
  const autoTimers = $("auto-timers")?.checked ?? true;
  const autoJobs = $("auto-jobs")?.checked ?? true;
  setHostPolicy({ autoTimers, autoJobs });
}

function refreshPanel() {
  const eng = globalThis.sparrow;
  renderInstanceSelect();
  const waitsEl = $("waits");

  if (!eng || !currentInstanceId) {
    waitsEl.textContent = "No active waits";
    waitsEl.className = "flex flex-col gap-2 text-sm text-muted-foreground";
    trailRecords = [];
    activeRecordId = "";
    syncPlaybackFrames();
    paintTrail();
    setWaitingMarkers(modeler, []);
    highlighted = [];
    return;
  }

  const waits = listWaits(currentInstanceId);
  highlighted = renderWaits(waitsEl, waits, {
    eng,
    onAction: () => tickRuntime(),
    onError: (e) => setStatus(String(e?.message || e), "err"),
    onSelectInstance: (id) => {
      currentInstanceId = id;
      playback.pause();
      activeRecordId = "";
      refreshPanel();
    },
  });
  setWaitingMarkers(modeler, highlighted);

  try {
    const { events } = eng.listEvents(currentInstanceId);
    // Chronological ascending for playback; reverse only for display.
    trailRecords = (events || []).map(parseRecord);
    syncPlaybackFrames();
    paintTrail();
  } catch (e) {
    const eventsEl = $("events");
    eventsEl.textContent = String(e);
    eventsEl.className = "flex flex-col gap-2 text-sm text-muted-foreground";
  }
}

function tickRuntime() {
  drainJobs(() => refreshPanel());
  armTimers(() => {
    drainJobs(() => refreshPanel());
    refreshPanel();
  });
  refreshPanel();
}

async function runProcess() {
  try {
    playback.pause();
    activeRecordId = "";
    const xml = await exportXML(modeler);
    if (!looksLikeBpmn(xml)) {
      setStatus("Diagram is empty or missing a process — add elements or load an example.", "err");
      return;
    }
    const eng = await ensureEngine();
    const deployed = eng.deploy(xml);
    if (!deployed?.deploymentId) {
      setStatus("Deploy failed: empty response", "err");
      return;
    }
    const { deploymentId, processId } = deployed;
    const { instanceId } = eng.createInstance({
      deploymentId,
      variables: { approved: true },
    });
    currentInstanceId = instanceId;
    setStatus(`Running ${processId} · ${instanceId.slice(0, 8)}…`, "ok");
    tickRuntime();
  } catch (e) {
    setStatus(String(e?.message || e), "err");
    // If the previous runtime died, bring a fresh one back for the next Run.
    try {
      await ensureEngine();
    } catch {
      /* status already set */
    }
  }
}

function wireChrome() {
  $("btn-run").addEventListener("click", () => runProcess());
  $("btn-download").addEventListener("click", async () => {
    const xml = await exportXML(modeler);
    downloadBlob("diagram.bpmn", xml);
  });
  $("btn-example").addEventListener("click", async () => {
    const res = await fetch("examples/user-task.bpmn");
    await openXML(await res.text());
    setStatus("Loaded example", "ok");
  });
  $("file-open").addEventListener("change", async (ev) => {
    const file = ev.target.files?.[0];
    if (file) await openFile(file);
    ev.target.value = "";
  });
  $("instance-select").addEventListener("change", (ev) => {
    currentInstanceId = ev.target.value;
    playback.pause();
    activeRecordId = "";
    refreshPanel();
  });
  $("btn-toggle-side").addEventListener("click", () => {
    const ws = document.querySelector(".workspace");
    const collapsed = ws.classList.toggle("side-collapsed");
    $("btn-toggle-side").setAttribute("aria-expanded", String(!collapsed));
  });
  $("trail-filter")?.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-filter]");
    if (btn) setTrailFilter(btn.getAttribute("data-filter"));
  });

  $("play-toggle")?.addEventListener("click", () => playback.toggle());
  $("play-prev")?.addEventListener("click", () => playback.prev());
  $("play-next")?.addEventListener("click", () => playback.next());
  $("play-restart")?.addEventListener("click", () => playback.restart());
  $("play-interval")?.addEventListener("change", (ev) => {
    playback.setIntervalMs(ev.target.value);
  });

  const onPolicyChange = () => {
    syncHostPolicyFromUI();
    const policy = getHostPolicy();
    setStatus(
      `Host: timers ${policy.autoTimers ? "auto" : "manual"} · jobs ${policy.autoJobs ? "auto" : "manual"}`,
      "ok",
    );
    tickRuntime();
  };
  $("auto-timers")?.addEventListener("change", onPolicyChange);
  $("auto-jobs")?.addEventListener("change", onPolicyChange);
  syncHostPolicyFromUI();

  const overlay = $("drop-overlay");
  let dragDepth = 0;
  window.addEventListener("dragenter", (e) => {
    e.preventDefault();
    dragDepth++;
    overlay.hidden = false;
  });
  window.addEventListener("dragleave", (e) => {
    e.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) overlay.hidden = true;
  });
  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("drop", async (e) => {
    e.preventDefault();
    dragDepth = 0;
    overlay.hidden = true;
    const file = e.dataTransfer?.files?.[0];
    if (file) await openFile(file);
  });
}

async function boot() {
  wireChrome();
  await openEmpty(modeler);
  try {
    await loadEngine();
    $("btn-run").disabled = false;
    setStatus("Engine ready", "ok");
  } catch (e) {
    setStatus(String(e), "err");
  }
}

boot();
