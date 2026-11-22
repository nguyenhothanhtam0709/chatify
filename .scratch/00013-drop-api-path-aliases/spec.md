# Spec: Drop api path aliases; `tsc` compiles, `ttsc` only loads

Status: resolved

## Problem Statement

Spec 00012 (user story 15) gave `api` one `@<folder>/*` path alias per source subfolder, made to work at runtime by the `@ttsc/paths` transform plugin. Nobody uses them: every import in `api` source and tests is relative. The plugin has a real cost:

- With `@ttsc/paths` configured, `ttsc` compiles a Go plugin host before doing any work. On a cold cache (a fresh worktree, an agent sandbox, a container, a future CI run) this takes about 41 s and 2.5 min of CPU for `typecheck`, `build:dev`, `build` and every `ttsc/register` start alike. It leaves a 1.6 GB `go-build` cache and a 27 MB plugin cache.
- The cold build downloads Go modules from `proxy.golang.org`, so it needs network access and CA certificates. It fails on `node:26-slim` without `ca-certificates`.
- `ttsc` has no flag to skip this. `--no-cache` applies only to `ttsx`.
- TypeScript 7 `paths` only affects type resolution and never rewrites import specifiers in emitted JS, so an alias cannot work at runtime without a plugin. With an alias import and no plugin, `tsc` builds cleanly but `node dist/...` fails with `ERR_MODULE_NOT_FOUND`.

Once the plugin is gone, `ttsc` adds nothing over plain `tsc` for compiling and typechecking. Keeping both tools for the same job leaves two compilers that could drift.

## Solution

Remove the aliases and the plugin from `api` for good, and split the tools by role in `api` and `contracts`:

- **`tsc` compiles and typechecks.** `build`, `build:dev` and `typecheck` run plain `tsc` (TypeScript 7.0.2) with `--checkers 2`.
- **`ttsc` only loads source at runtime.** It stays in `api` only as `--import=ttsc/register` for running TypeScript source: `start:dev`, `start:debug`, `db:migrate` and `db:seed`. Node's built-in type stripping can't handle `experimentalDecorators` or `emitDecoratorMetadata`, so the loader is still needed.
- **`api` uses relative imports only.** This is recorded in a new ADR that reverses 00012 story 15.

An experiment on a throwaway copy measured the result on a cold cache in `node:26-slim`:

| Command | Before | After |
|---|---|---|
| typecheck | ~41 s | 0.59 s |
| build:dev | ~41 s | 0.54 s |
| `ttsc/register` loading the app | ~41 s | ~1.1 s |
| prod build | 42 s (`ttsc`) | 0.48 s (`tsc`) |
| ttsc cache size | 1.6 GB | ~36 KB |

The prod output from `tsc` and `ttsc` was byte-identical (122 files), and the full repo checks passed.

## User Stories

1. As a developer, I want `api` typecheck and builds to finish in under a second on a cold cache, so that a fresh worktree or sandbox doesn't spend 40 s compiling Go first.
2. As a developer, I want `pnpm dev:api`, `db:migrate` and `db:seed` to start in about a second on a cold cache, so that the first run in a new checkout isn't a long wait.
3. As an agent working in a worktree, I want no Go build in any `api` or `contracts` command, so that my sandbox doesn't need network access to `proxy.golang.org` or CA certificates.
4. As a developer, I want no 1.6 GB `go-build` cache on my machine from this repo, so that disk use stays small.
5. As a maintainer, I want a future container image to build the api without Go, network module downloads or extra system packages, so that the Dockerfile stays simple when it's written.
6. As a maintainer, I want `api`'s production build to come from plain `tsc`, so that prod depends on no compiler plugin.
7. As a maintainer, I want one rule ("`tsc` compiles, `ttsc` only loads source at runtime") across `api` and `contracts`, so that two compilers can't drift on the same job.
8. As a maintainer, I want `contracts` to stop depending on `ttsc`, since it never runs source through the loader, so that no unused devDependency stays behind.
9. As a maintainer, I want only `@ttsc/paths` (api) and `ttsc` (contracts) removed and no other package version to move, so that the lockfile change stays small and easy to review.
10. As a developer, I want every `tsc` script to keep `--checkers 2`, so that the thread cap decided in 00012 still applies.
11. As a developer, I want `build:clean` to remove the build output without calling `ttsc`, so that cleaning doesn't depend on the loader tool.
12. As a developer, I want an `@db/...`-style import to fail at typecheck with a clear unresolved-module error, so that an alias can't slip in and then fail only at runtime.
13. As a developer, I want Vitest to resolve `api` imports with no tsconfig path resolution, so that tests resolve modules the same way Node does in prod.
14. As an agent reading `api`'s `AGENTS.md`, I want it to say imports are relative only and to name `tsc` and `ttsc` by role, so that I don't write an alias or call the wrong tool.
15. As an agent reading `contracts`' `AGENTS.md`, I want it to say the package builds through `tsc`, so that the docs match the scripts.
16. As a new developer following setup, I want the setup guide to describe `tsc` in all three packages and `ttsc/register` only for running `api` source, so that the guide matches what runs.
17. As a future maintainer tempted to bring aliases back, I want an ADR explaining why they were removed, what they cost and which alternatives were rejected, so that I don't redo the experiment.
18. As a future maintainer, I want the ADR to name a revisit trigger (TypeScript or Node rewriting `paths` natively), so that I know when the decision can be reopened.
19. As a maintainer, I want spec 00012 left as written, with the ADR linking back to it, so that resolved specs keep describing what was true then.
20. As a maintainer, I want the production api to keep working end to end (migrations, health, auth), so that the tool change doesn't change behaviour.

## Implementation Decisions

- **No source changes.** All imports in `api` source and tests are already relative. Nothing is rewritten.
- **`api` tsconfig:** remove the transform plugin entry and the whole `paths` block. The rest of the config stays, including the `esnext` target and the decorator options.
- **`api` Vitest config:** remove tsconfig path resolution. Global setup, setup files, timeouts and serial file execution stay. `web` keeps its own `@/*` resolution.
- **`api` scripts:**
  - `build`, `build:dev` and `typecheck` call `tsc` with the same project files and flags as today, including `--checkers 2`.
  - `build:clean` removes `dist` and `*.tsbuildinfo` with no `ttsc clean`.
  - `start:dev`, `start:debug`, `db:migrate` and `db:seed` keep `--import=ttsc/register` and their `GOMAXPROCS=2` prefix. `ttsc` is a native Go program, so the thread cap still applies.
  - `start:prod`, `lint`, `test` and the rest are unchanged.
- **`contracts` scripts:** the same change for `build`, `build:dev`, `typecheck` and `build:clean`. Its tsconfigs are unchanged; it never had `paths` or a plugin.
- **Packages:**
  - Remove `@ttsc/paths` from `api`.
  - Remove `ttsc` from `contracts`.
  - `api` keeps `ttsc` for the loader.
  - Both keep `typescript ~7.0.2`.
  - No other package is added, removed or moved.
- **No lint rule bans aliases.** Without `paths`, an alias import fails typecheck and build with TS2307, which is enough of a guard. The ADR covers re-adding `paths`.
- **New ADR**, the next number in `docs/adr/`, in the existing ADR format:
  - Decision: `api` uses relative imports; no tsconfig path aliases; `tsc` compiles, `ttsc` is only the runtime loader.
  - Context: the cold Go plugin-host build and its cost (time, cache size, network, CA certs); TypeScript 7 `paths` doesn't rewrite emitted specifiers.
  - Considered options, each rejected with its reason:
    - Node subpath imports (`#` prefix, needs a `development` condition on every source-running script, needs `package.json` in the prod image, untested with type-aware oxlint and drizzle-kit, and nothing uses aliases).
    - Keeping the plugin for dev and `tsc` for prod with an empty `paths` guard (keeps a plugin prod forbids, and devs still pay the cold build).
    - `tsc-alias`, `tsconfig-paths` and `module-alias` (each adds a package; the runtime ones target CommonJS).
    - The token cost of relative paths for agents (about 0.1% of `api` code, negligible).
  - Revisit trigger: TypeScript or Node rewriting `paths` natively.
  - Links back to spec 00012 story 15, which it reverses.
- **Docs to update:**
  - `api` `AGENTS.md`: drop the alias line and say imports are relative only; the `--checkers 2` rule names `tsc` scripts; `ttsc` appears only as the loader.
  - `contracts` `AGENTS.md`: builds through `tsc`.
  - The setup guide: the `typecheck` line says `tsc` in all three packages; the migrate/seed line keeps `ttsc/register`.
  - Anything `pnpm docs:check` flags.
  - Files generated by the mattpocock skills are not edited.
- **Spec 00012 is not edited.**
- **One Ticket, one PR.**

## Testing Decisions

- **Seam (confirmed with the maintainer).** The repo's command surface: `pnpm typecheck`, `pnpm lint`, `pnpm test` and `pnpm docs:check` from the root all exit 0. A good test here is a command's exit code and observable output, not the contents of a config file. No new committed test files.
- **Existing tests are the safety net.** The `api` behaviour tests (the real app on real Postgres through testcontainers) prove decorator metadata, dependency injection and module resolution still work without tsconfig path resolution in Vitest. The `contracts`, `web` and script tests stay green unchanged.
- **One-off checks, recorded in the PR:**
  - **No Go build on a cold cache.** With the ttsc cache cleared, `api` `typecheck`, `build:dev` and `db:migrate` (through `ttsc/register`) finish without creating a `go-build` or plugin cache. Record the time each one takes.
  - **Prod smoke test.** `pnpm --filter @chat/api build`, then `start:prod` against `pnpm db:up` after `pnpm db:migrate`: the health endpoint reports the database up, and one authenticated request succeeds.
  - **An alias fails loudly.** A throwaway `@db/...` import in `api` makes `typecheck` fail with TS2307. Revert it afterwards.
  - `contracts` `build` still emits the `.d.ts` files that `api` and `web` consume.
- **No browser check.** `web` is not touched.
- **Prior art:** spec 00012 (`.scratch/00012-typescript7-oxlint`) used the same command-surface seam and one-off checks recorded in the PR.

## Out of Scope

- `web`'s `@/*` alias, which Vite handles and which doesn't involve `ttsc`.
- A Dockerfile or CI pipeline (the repo has neither).
- Rush Stack (evaluated separately, not recommended for now).
- A lint rule or committed check banning alias imports.
- Replacing `ttsc/register` with another loader.
- Editing spec 00012 or its Tickets.
- Changing the `--checkers 2` or `GOMAXPROCS=2` thread caps.
- Any app behaviour, API contract or UI change.

## Further Notes

- These numbers come from an experiment on a throwaway copy that was not committed. The Implementer re-measures cold-cache times on this repo and records them in the PR.
- If the TypeScript 7.0.2 `tsc` turns out to reject a flag or option one of the scripts passes, raise it through escalation rather than keeping `ttsc` for that script.
