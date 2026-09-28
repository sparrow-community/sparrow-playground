# Sparrow Playground

Static web demo for the Sparrow BPMN engine: a [bpmn-js](https://github.com/bpmn-io/bpmn-js) modeler plus the engine compiled to WebAssembly. Open a diagram, deploy it, and run an instance in the browser.

The engine lives at [github.com/sparrow-community/sparrow](https://github.com/sparrow-community/sparrow). You do not need a local engine checkout to run this demo. The WebAssembly module is already vendored in `public/vendor/sparrow/`.

This repository is the playground: [github.com/sparrow-community/sparrow-playground](https://github.com/sparrow-community/sparrow-playground). How to contribute: [`CONTRIBUTING.md`](./CONTRIBUTING.md).

## Requirements

Node.js **20** or **22 or newer** for a reliable build. [Vite 6](https://vite.dev/) also accepts Node 18, but Tailwind’s native binding often fails under `npm ci` on Node 18, so CI covers 20 and 22 only. Odd releases such as Node 19 and 21 are outside Vite’s range.

Use a current browser. The page inflates `sparrow.wasm.gz` with `DecompressionStream`.

## Run

```bash
npm install
npm run dev
```

Vite prints a local URL (default [http://127.0.0.1:5173/](http://127.0.0.1:5173/)).

- **Open**, **Download**, or drag a `.bpmn` file onto the page. Diagrams without DI are laid out with `bpmn-auto-layout` before import.
- **Example** loads `public/examples/user-task.bpmn`.
- **Run** deploys the current XML and starts a new instance.
- The side panel lists waiting user tasks (complete them there) and the event trail. Timers and script jobs are scheduled in the page, not inside the WASM module.

## Build

```bash
npm run build      # static files in dist/
npm run preview    # serve dist/ locally
```

`dist/` is what you host. Open it over HTTP. `file://` will not load the module. GitHub Pages is optional and not required to develop locally. `public/.nojekyll` is copied into `dist/` so a Pages publish of `dist/` will not be processed by Jekyll.

## Vendored engine

`public/vendor/sparrow/VERSION` records the engine build baked into `sparrow.wasm.gz`.

| | |
|---|---|
| Module | `github.com/sparrow-community/sparrow/wasm` |
| Revision | `c271f5ba155e69542a78a9c7a721121807ce8c8a` |
| Revision time | 2026-09-21T02:02:30Z |
| Dirty worktree | yes (`vcs.modified=true`) |
| Go | go1.26.5 |

The revision comes from Go build info inside the binary. `vcs.modified=true` means the engine checkout had uncommitted changes when this WASM was built. That diff is not stored in the binary, so the artifact is that commit plus an unknown local delta. There is no sibling engine checkout in this repository to recover the delta.

`wasm_exec.js` is an unmodified copy of Go 1.26.5 `lib/wasm/wasm_exec.js`.

## Optional: refresh WASM from an engine checkout

Skip this unless you are changing the engine. `npm install`, `npm run dev`, `npm run build`, and `npm run preview` all use the committed files under `public/vendor/sparrow/`.

```bash
# build the engine first, then point at its checkout
#   (cd /path/to/sparrow/wasm && ./build.sh)
SPARROW_KERNEL=/path/to/sparrow npm run sync-wasm
```

`SPARROW_KERNEL` defaults to `../sparrow`. `scripts/sync-wasm.sh` copies `sparrow.wasm.gz`, `wasm_exec.js`, and `sparrow.d.ts`, then rewrites `VERSION` from the binary's Go build info. When the kernel directory is a git checkout, it also records that checkout's `HEAD` and whether the worktree was dirty.

To restamp `VERSION` from the WASM already in this repo, without copying:

```bash
npm run sync-wasm -- --stamp-only
```

## License

Apache License 2.0. Copyright 2026 The Sparrow community and contributors. See [LICENSE](LICENSE) and [NOTICE](NOTICE).

`public/vendor/sparrow/wasm_exec.js` is Go's WASM support script and is BSD-licensed. The license text is [public/vendor/sparrow/wasm_exec.LICENSE](public/vendor/sparrow/wasm_exec.LICENSE). The Apache license does not replace that BSD license.
