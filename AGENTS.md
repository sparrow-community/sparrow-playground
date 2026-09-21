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
- **Run** deploys current XML and starts a new instance; Events + waits in a
  collapsible side panel; waiting user tasks can be Completed from the panel.

## Coordinate with the kernel

| Concern | Where |
|---------|--------|
| Semantics / handlers | `../sparrow/processing` |
| JS API contract | `../sparrow/wasm/sparrow.d.ts` (+ `public/vendor/sparrow/` after sync) |
| WASM build | `../sparrow/wasm/build.sh` then `npm run sync-wasm` |

## Stack

Vite + Tailwind (shadcn-like tokens/primitives, no React) + bpmn-js + `bpmn-auto-layout`. Light chrome. Static `dist/` for hosting. No backend.
