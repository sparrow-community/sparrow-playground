# Sparrow Playground

Static web demo for the Sparrow BPMN engine: a [bpmn-js](https://github.com/bpmn-io/bpmn-js) modeler plus the engine compiled to WebAssembly. Open a diagram, deploy it, and run an instance in the browser.

The engine lives at [github.com/sparrow-community/sparrow](https://github.com/sparrow-community/sparrow). This demo depends on the published npm package [`@sparrow-community/wasm`](https://www.npmjs.com/package/@sparrow-community/wasm) (no local kernel checkout or vendored copy required).

Live site (GitHub Pages): [https://sparrow-community.github.io/sparrow-playground/](https://sparrow-community.github.io/sparrow-playground/)

This repository: [github.com/sparrow-community/sparrow-playground](https://github.com/sparrow-community/sparrow-playground). How to contribute: [`CONTRIBUTING.md`](./CONTRIBUTING.md).

## Requirements

Node.js **20** or **22 or newer** for a reliable build. [Vite 6](https://vite.dev/) also accepts Node 18, but Tailwind’s native binding often fails under `npm ci` on Node 18, so CI covers 20 and 22 only. Odd releases such as Node 19 and 21 are outside Vite’s range.

Use a current browser. The page inflates `sparrow.wasm.gz` with `DecompressionStream`.

## Run

```bash
npm install
npm run dev
```

Vite prints a local URL (default [http://127.0.0.1:5173/](http://127.0.0.1:5173/)). Dev uses `BASE_PATH=/`.

- **Open**, **Download**, or drag a `.bpmn` file onto the page. Diagrams without DI are laid out with `bpmn-auto-layout` before import.
- **Example** loads `public/examples/user-task.bpmn`.
- **Run** deploys the current XML and starts a new instance. Processes with only typed starts (message / signal / timer / conditional — e.g. MIWG `C.10.0`) auto-mint via the first available trigger instead of failing with `no none start`.
- The side panel **Intervention** section drives the kernel session (`enableIntervention` / breakpoints / Continue · Step into · Step over via `@sparrow-community/wasm`). Mode **Off** leaves execution continuous; **Breakpoints** and **Step** pause at Enter-settled barriers (e.g. exclusive gateway before decide). While paused you can inspect pending transition, edit variables (`setVariables`), then resume. **Inspect** shows tokens, intent, variables, and scoped COMMANDs for the selected diagram node (toggle **BP** there too). **Waiting** lists all active waits with kind-specific actions (Complete, Publish Message/Signal with optional correlation keys, Fire due now, Evaluate conditions, Resolve incident, job Complete/Fail). Mutating COMMANDs while barrier-paused are rejected with a clear status message. Call Activity waits and the inspector deep-link parent/child instances. Toggle **Auto timers** / **Auto jobs** for JS host scheduling. Trail playback remains a viewer (not live step control).

## Build

```bash
npm run build      # static files in dist/ (default base /sparrow-playground/)
npm run preview    # serve dist/ locally at that base path
```

`dist/` is what you host. Open it over HTTP. `file://` will not load the module. For a root-hosted preview, set `BASE_PATH=/` when building.

GitHub Pages deploys `dist/` from `main` via [`.github/workflows/pages.yml`](./.github/workflows/pages.yml). `public/.nojekyll` is copied into `dist/` so Pages does not process the site with Jekyll.

## Engine package

| | |
|---|---|
| npm | `@sparrow-community/wasm` |
| Locked version | see `package.json` / `package-lock.json` (currently `2026.9.30-alpha.4`) |
| Dist-tags | `latest` and `alpha` both track calver `YYYY.M.D-alpha.N` |
| Upgrade | bump the dependency, run `npm install`, commit lockfile |

`wasm_exec.js` ships inside that package (Go BSD license). Types: `@sparrow-community/wasm/sparrow.d.ts`.

## License

Apache License 2.0. Copyright 2026 The Sparrow community and contributors. See [LICENSE](LICENSE) and [NOTICE](NOTICE).

Go's `wasm_exec.js` (via `@sparrow-community/wasm`) remains BSD-licensed; the Apache license does not replace that BSD license.
