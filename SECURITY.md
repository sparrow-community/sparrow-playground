# Security

Sparrow Playground is an early public preview (alpha). There is no bug bounty and no separate security support window.

## Reporting a vulnerability

Report suspected vulnerabilities in private. Do not open a public issue or pull request with exploit details or steps that attack a running kernel or browser host.

Prefer [private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability) on this repository or on [sparrow-community/sparrow](https://github.com/sparrow-community/sparrow) when the issue is in the engine. If that channel is not enabled yet, contact the maintainers directly and keep the details off public trackers.

## Browser demo surface

This project loads `@sparrow-community/wasm` and exposes the same command surface inside the page. There is no network listener of its own; whoever can run scripts in the page can call that surface.

- Treat diagrams you open or paste as untrusted input until you trust the author.
- Deployed BPMN can include expressions the engine evaluates; see the kernel [`SECURITY.md`](https://github.com/sparrow-community/sparrow/blob/main/SECURITY.md).
- Hosting `dist/` on the public internet publishes a demo, not a multi-tenant production control plane.

## Engine package lag

`package.json` pins a specific `@sparrow-community/wasm` version. Security fixes that land in the engine need a new npm publish and a dependency bump here before this demo (and Pages) pick them up.
