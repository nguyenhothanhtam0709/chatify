# 02: Move to Node 26 and TypeScript 7

**What to build:** the whole workspace runs on Node 26 and TypeScript 7, with the existing commands (`typecheck`, `build`, `test`, `lint`) unchanged and green. Touches the root and the `api`, `web` and `contracts` packages. Spec: [spec.md](../spec.md), sections "Implementation Decisions" (tsconfig, Node 26).

Rules this Ticket needs:

- One TypeScript major across the workspace: `~7.0.2` in the root, `api`, `web` and `contracts`. Plain `tsc` is still the compiler here; `ttsc` comes in Ticket 03.
- The shared tsconfig keeps its `ES2023` target and adds `moduleDetection: force`. `web` and `contracts` keep their current target. Do not set `esnext` yet.
- `web` drops `baseUrl` (removed in TypeScript 7) and keeps its `paths` for `@/*`. Make sure Vite and Vitest still resolve the `@` alias (keep the existing alias in the Vite config for now if needed).
- `engines.node` becomes `>=26`, the README's "Needs Node 24" line is updated, and an `.nvmrc` with `26` is added. Older specs and Tickets that mention Node 24 are not edited. `@types/node` is already on the 26 line.
- Decorator metadata under TypeScript 7 is known to work (the maintainer tested it); the `api` tests confirm it.
- Run `nvm use v26` to switch to Node 26 before working (the machine defaults to 24.18.1). Each shell session needs it again, and the same applies to Tickets 03 and 04.
- Anything TypeScript 7 forces in the code or config is fixed here; a fix that needs a package change stops and asks.

**Allowed packages:** change `typescript` from `~5.9.3` to `~7.0.2` in the root, `api`, `web` and `contracts`. Nothing else.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] `typescript` is `~7.0.2` in the root, `api`, `web` and `contracts`
- [ ] `pnpm typecheck`, `pnpm build:contracts`, the `api` and `web` builds, `pnpm test`, `pnpm lint` and `pnpm docs:check` all pass on Node 26
- [ ] `moduleDetection: force` is in the shared tsconfig; targets are unchanged
- [ ] `web` has no `baseUrl` and its `@` alias still resolves in the dev server, the build and the tests
- [ ] `engines.node` is `>=26`, the README says Node 26, and `.nvmrc` is `26`

**Verification:** run `pnpm test` once, including the `api` behaviour tests with real Postgres. One browser check per [browser check](../../../docs/workflow/browser-check.md): `dev:web` loads and a login works. Record both in the PR.

**Out of scope:** `ttsc`, `esnext`, path aliases in `api`, new scripts, Vitest config changes, rewriting old specs.

## Comments
