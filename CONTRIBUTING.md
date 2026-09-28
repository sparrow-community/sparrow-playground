# Contributing to Sparrow Playground

This repository is a **consumer** of the Sparrow kernel: browser modeler, overlay, and JS scheduling only. It must not invent ledger subjects, empty intents, or non-OMG element types.

## Public repositories and sync

| Role | Location |
|------|----------|
| Public source of truth for readers | [github.com/sparrow-community/sparrow-playground](https://github.com/sparrow-community/sparrow-playground) |
| Primary maintainer workspace | Cursor Origin remotes under the `slowrookie` account (this checkout’s `origin`) |
| Engine | [github.com/sparrow-community/sparrow](https://github.com/sparrow-community/sparrow) |
| Engine WASM on npm | [`@sparrow-community/wasm`](https://www.npmjs.com/package/@sparrow-community/wasm) |

Maintainers develop in Cursor with `origin` as the working remote, then mirror accepted `main` to the `github` remote (`sparrow-community/sparrow-playground`).

## Local development

Node.js **20** or **22+** for CI-parity builds (see `package.json` `engines`).

```bash
npm install
npm run dev
```

```bash
npm run build
npm run preview
```

CI runs `npm ci` and `npm run build` on Node 20 and 22. Pages deploy builds with `BASE_PATH=/sparrow-playground/`.

## Upgrading the engine WASM

Bump `@sparrow-community/wasm` in `package.json` (prefer the current `latest` / `alpha` calver), then:

```bash
npm install
npm run build
```

Commit `package.json` and `package-lock.json`. Do not vendor kernel artifacts under `public/`.

## Pull requests

1. Keep PRs focused (UI/demo, dependency bumps, or docs—not engine semantics).
2. Engine behavior changes belong in [sparrow](https://github.com/sparrow-community/sparrow).
3. After a new `@sparrow-community/wasm` publish, bump the dependency here so the demo and Pages site pick it up.

## License

By contributing, you agree that your contributions are licensed under the [Apache License 2.0](./LICENSE). See [`NOTICE`](./NOTICE) for third-party attribution (`wasm_exec.js` via the npm package).

## Conduct

Please follow the [Code of Conduct](./CODE_OF_CONDUCT.md).
