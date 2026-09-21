import BpmnModeler from "bpmn-js/lib/Modeler";
import { layoutProcess } from "bpmn-auto-layout";

import "bpmn-js/dist/assets/diagram-js.css";
import "bpmn-js/dist/assets/bpmn-js.css";
import "bpmn-js/dist/assets/bpmn-font/css/bpmn-embedded.css";

const EMPTY_XML = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
             xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
             xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
             id="Definitions_empty"
             targetNamespace="http://sparrow.example/playground">
  <process id="Process_1" isExecutable="true">
    <startEvent id="StartEvent_1"/>
  </process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="180" y="100" width="36" height="36"/>
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</definitions>`;

export function hasDiagramDI(xml) {
  return /<bpmndi:BPMNDiagram[\s>]/i.test(xml) || /<BPMNDiagram[\s>]/i.test(xml);
}

export function createModeler(container) {
  return new BpmnModeler({
    container,
    keyboard: { bindTo: document },
  });
}

export async function importDiagram(modeler, xml, { autoLayoutIfMissing = true } = {}) {
  let next = xml;
  if (autoLayoutIfMissing && !hasDiagramDI(xml)) {
    next = await layoutProcess(xml);
  }
  const result = await modeler.importXML(next);
  const canvas = modeler.get("canvas");
  canvas.zoom("fit-viewport", "auto");
  return result;
}

export async function openEmpty(modeler) {
  return importDiagram(modeler, EMPTY_XML, { autoLayoutIfMissing: false });
}

export async function exportXML(modeler) {
  const { xml } = await modeler.saveXML({ format: true });
  return xml;
}

export function clearMarkers(modeler, className) {
  const canvas = modeler.get("canvas");
  const registry = modeler.get("elementRegistry");
  for (const el of registry.getAll()) {
    canvas.removeMarker(el.id, className);
  }
}

export function setWaitingMarkers(modeler, elementIds) {
  clearMarkers(modeler, "highlight-waiting");
  const canvas = modeler.get("canvas");
  const registry = modeler.get("elementRegistry");
  for (const id of elementIds) {
    const el = registry.get(id);
    if (el) canvas.addMarker(el.id, "highlight-waiting");
  }
}

function isDiagramRoot(el, canvas) {
  if (!el) return false;
  if (el === canvas.getRootElement()) return true;
  const t = el.type || "";
  return t === "bpmn:Process" || t === "bpmn:Collaboration";
}

export function seekElement(modeler, elementId) {
  const canvas = modeler.get("canvas");
  const registry = modeler.get("elementRegistry");
  const selection = modeler.get("selection");
  clearMarkers(modeler, "highlight-flash");
  clearMarkers(modeler, "highlight-playback");
  if (!elementId) {
    selection.select();
    return;
  }
  const el = registry.get(elementId);
  if (!el) return;
  // PROCESS / collaboration events name the diagram root — no own visual to highlight.
  if (isDiagramRoot(el, canvas)) {
    selection.select();
    return;
  }
  selection.select(el);
  canvas.addMarker(el.id, "highlight-playback");
  try {
    canvas.scrollToElement(el);
  } catch {
    /* connections may not scroll */
  }
}

export function flashElement(modeler, elementId) {
  seekElement(modeler, elementId);
}
