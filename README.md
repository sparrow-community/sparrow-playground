# Sparrow Playground

Single-page **bpmn-js modeler** + in-browser Sparrow WASM engine. Consumer only:
diagram editing and Event overlay; semantics stay in sibling [`sparrow`](../sparrow/).

## Local debug

```bash
# once / after kernel wasm changes
npm run sync-wasm          # needs ../sparrow/wasm/dist (./build.sh there first)
npm install
npm run dev                # http://127.0.0.1:5173/
```

Open/Download/drag-drop BPMN. Diagrams without DI are auto-layouted via
`bpmn-auto-layout`. **Run** = Deploy current XML → CreateInstance (new
instance each time). Side panel lists waits (Complete for user tasks) and the
Event trail (click to flash on canvas). Timers/jobs are scheduled in JS.

## Static publish

```bash
npm run build              # → dist/ (includes public/vendor wasm)
```

Serve `dist/` on GitHub Pages or any static host (needs HTTP, not `file://`).

## Cursor

Open [`sparrow-dev.code-workspace`](../sparrow-dev.code-workspace) for multi-root
kernel + playground.
