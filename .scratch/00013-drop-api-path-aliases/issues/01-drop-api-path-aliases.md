# 01: Drop api path aliases; `tsc` compiles, `ttsc` only loads

**What to build:** `api` and `contracts` compile and typecheck through plain `tsc` (TypeScript 7.0.2), and no command runs a Go build, even on a cold cache. Spec: [00013](../spec.md), "Implementation Decisions".

- **`api` tsconfig:** remove the `@ttsc/paths` transform plugin and the whole `paths` block (`@auth/*`, `@db/*`, …). Everything else stays.
- **`api` Vitest:** remove tsconfig path resolution. Global setup, setup files, timeouts and serial file execution stay.
- **`api` scripts:**
  - `build`, `build:dev` and `typecheck` call `tsc` with the same project files and flags as today, including `--checkers 2`.
  - `build:clean` removes `dist` and `*.tsbuildinfo` without `ttsc clean`.
  - `start:dev`, `start:debug`, `db:migrate` and `db:seed` keep `--import=ttsc/register` and `GOMAXPROCS=2`.
  - Other scripts are unchanged.
- **`contracts` scripts:** the same change for `build`, `build:dev`, `typecheck` and `build:clean`. Its tsconfigs are unchanged.
- **No source changes.** All imports are already relative. No lint rule bans aliases: without `paths`, an alias import fails with TS2307.
- **New ADR**, the next number in `docs/adr/`, in the existing format:
  - `api` uses relative imports with no tsconfig path aliases; `tsc` compiles and `ttsc` is only the runtime loader.
  - It reverses spec 00012 story 15 and links to it.
  - It records the cold-build cost: ~41 s, a 1.6 GB `go-build` cache, network access to `proxy.golang.org`, and CA certs. It notes that TypeScript 7 `paths` never rewrites emitted specifiers.
  - It lists the rejected options with their reasons (see the spec): Node `#` subpath imports; keeping the plugin for dev with an empty `paths` guard for prod; `tsc-alias`, `tsconfig-paths` and `module-alias`; and the token cost of relative paths (negligible).
  - Revisit trigger: TypeScript or Node rewriting `paths` natively.
- **Docs:**
  - `api` `AGENTS.md`: imports are relative only (replaces the alias line); the `--checkers 2` rule names `tsc` scripts; `ttsc` is named only as the loader.
  - `contracts` `AGENTS.md`: builds through `tsc`.
  - The setup guide: `typecheck` runs `tsc` in all three packages; migrate and seed still run through `ttsc/register`.

**Allowed packages:** remove `@ttsc/paths` from `api`; remove `ttsc` from `contracts`. No other package is added, removed or moved.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] No `@ttsc/paths` anywhere in the repo, and `contracts` has no `ttsc` dependency; the lockfile changes only for those two
- [ ] `api` and `contracts` `build`, `build:dev` and `typecheck` run `tsc` with `--checkers 2`; `build:clean` works without `ttsc`
- [ ] `api` `start:dev`, `start:debug`, `db:migrate` and `db:seed` still run the source through `ttsc/register`
- [ ] With the ttsc cache cleared, `api` `typecheck`, `build:dev` and `db:migrate` finish without creating a `go-build` or plugin cache
- [ ] `api` `build`, then `start:prod` against the local database after `db:migrate`: the health endpoint reports the database up, and one authenticated request succeeds
- [ ] A throwaway `@db/...` import in `api` makes `typecheck` fail with TS2307 (reverted afterwards)
- [ ] `contracts` `build` still emits the `.d.ts` files that `api` and `web` consume
- [ ] The new ADR exists and links to spec 00012; both package `AGENTS.md` files and the setup guide describe `tsc` and `ttsc` by role and relative imports only

**Verification:** The checks in the definition of done (`pnpm typecheck`, `pnpm lint`, `pnpm test` with Docker, `pnpm docs:check`). Record in the PR's verification section the one-off results: cold-cache times and cache sizes for `typecheck`, `build:dev` and `db:migrate`, the `start:prod` health and auth responses, and the TS2307 output. No new committed tests and no browser check (`web` is not touched).

**Out of scope:** `web`'s `@/*` alias; a Dockerfile or CI; Rush Stack; a lint rule or committed check banning aliases; replacing `ttsc/register`; editing spec 00012 or its Tickets; changing the `--checkers 2` or `GOMAXPROCS=2` caps; any app, API or UI behaviour change. If `tsc` rejects a flag or option a script passes, escalate rather than keep `ttsc` for that script.

## Comments
