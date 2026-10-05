# Sparrow Playground (consumer)

Browser **modeler + run** surface for the Sparrow BPMN execution and fact kernel.

## Axioms (do not violate)

- Effective definition and instance state change only through engine **COMMAND**s
  exposed by `globalThis.sparrow` (WASM host). Every accepted behavior is an
  append-only **EVENT**.
- This project is a **consumer**: overlay, wiki, and JS scheduling only. Do not
  invent ledger subjects, empty intents, or non-OMG element types.
- Timer and job/script execution are **hosted in JS** (`FireDue`, `Activate` →
  Complete/Fail). The engine does not embed a browser timer loop or script runtime.

## Product shape

- Full-bleed **bpmn-js** modeler on load (Open / Download / drag-drop).
- Missing DI → `bpmn-auto-layout` before import.
- **Run** deploys current XML and starts a new instance (typed-only starts mint
  via PublishMessage / PublishSignal / FireDue / EvaluateConditionalStarts);
  Events + waits in a collapsible side panel. Every wait kind has a manual affordance (MVP A);
  canvas click opens a per-node inspector with scoped COMMANDs (MVP B);
  **Intervention** section drives the kernel session (Off / Breakpoints / Step)
  with Continue · Step into · Step over, pending transition, and Set variables
  while paused (host-only interception retired); Auto timers / Auto jobs toggles
  control JS host scheduling.

## Coordinate with the kernel

| Concern | Where |
|---------|--------|
| Semantics / handlers | `../sparrow/processing` |
| JS API / WASM artifacts | npm `@sparrow-community/wasm` (types: `sparrow.d.ts`) |
| Kernel WASM build (publish) | `../sparrow/wasm/build.sh` → npm Trusted Publishing |

## Stack

Vite + Tailwind (shadcn-like tokens/primitives, no React) + bpmn-js + `bpmn-auto-layout`. Light chrome. Static `dist/` for hosting. No backend. GitHub Pages base path: `/sparrow-playground/`.
