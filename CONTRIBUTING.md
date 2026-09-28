# Contributing to Sparrow Playground

This repository is a **consumer** of the Sparrow kernel: browser modeler, overlay, and JS scheduling only. It must not invent ledger subjects, empty intents, or non-OMG element types.

## Public repositories and sync

| Role | Location |
|------|----------|
| Public source of truth for readers | [github.com/sparrow-community/sparrow-playground](https://github.com/sparrow-community/sparrow-playground) |
| Primary maintainer workspace | Cursor Origin remotes under the `slowrookie` account (this checkout’s `origin`) |
| Engine | [github.com/sparrow-community/sparrow](https://github.com/sparrow-community/sparrow) |

Maintainers develop in Cursor with `origin` as the working remote, then mirror accepted `main` to the `github` remote (`sparrow-community/sparrow-playground`).

## Local development

Node.js **18**, **20**, or **22+** (see `package.json` `engines`).

```bash
npm install
npm run dev
```

```bash
npm run build
npm run preview
```

CI runs `npm ci` and `npm run build`.

## Refreshing the vendored WASM (optional)

Skip unless you are changing the engine. Day-to-day demos use `public/vendor/sparrow/`.

```bash
# build the engine first: (cd /path/to/sparrow/wasm && ./build.sh)
SPARROW_KERNEL=/path/to/sparrow npm run sync-wasm
```

`SPARROW_KERNEL` defaults to `../sparrow`.

## Pull requests

1. Keep PRs focused (UI/demo, sync scripts, or docs—not engine semantics).
2. Engine behavior changes belong in [sparrow](https://github.com/sparrow-community/sparrow).
3. After rebuilding the engine, run `sync-wasm` and commit the updated vendor files with a clear note of the engine revision.

## License

By contributing, you agree that your contributions are licensed under the [Apache License 2.0](./LICENSE). See [`NOTICE`](./NOTICE) for `wasm_exec.js` (BSD).

## Conduct

Please follow the [Code of Conduct](./CODE_OF_CONDUCT.md).
