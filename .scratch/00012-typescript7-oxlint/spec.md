# Spec: TypeScript 7 and oxlint

Status: resolved

## Problem Statement

The toolchain is on TypeScript 5.9 and ESLint with typescript-eslint:

- `tsc` is slow on 3 packages, and typed ESLint (`projectService`) is slower still. Both run in `pnpm typecheck` and `pnpm lint`, so every check pays that cost.
- The maintainer's personal NestJS 12 test repo (`nguyenhothanhtam0709/nestjs-test`) already runs TypeScript 7 with `ttsc` and type-aware oxlint, and the new `npm create vite` React template ships oxlint instead of ESLint. This repo is behind both.
- The api and contracts tsconfigs, scripts and Vitest config differ from that reference in ways that no longer have a reason to exist.
- Node 24 is the declared minimum, but the maintainer is moving to Node 26.

## Solution

Move the workspace onto TypeScript 7 and oxlint, copying the reference repo's setup where it fits this monorepo:

- **TypeScript 7** in the root, `api`, `web` and `contracts`. `api` and `contracts` build, typecheck and run through `ttsc`; `web` typechecks with plain `tsc` and builds with Vite.
- **oxlint** (type-aware) replaces ESLint entirely, with one root config and per-package overrides. Prettier stays.
- **Vitest** configs follow the reference: tsconfig-driven path resolution, and no SWC plugin in `api` if tests stay green without it.
- **Scripts** follow the reference's set per package. Existing script names stay (`typecheck`, `build`, `lint`, `test`).
- **Node 26** becomes the minimum everywhere.

Behaviour of the app does not change. What changes is how developers build, check, lint and run it.

## User Stories

1. As a developer, I want `pnpm typecheck` to run TypeScript 7 in every package, so that checks are faster and match the reference repo.
2. As a developer, I want one TypeScript major version across the workspace, so that no package sees different compiler behaviour from the others.
3. As a developer, I want `api` and `contracts` to compile through `ttsc`, so that they use the same toolchain as the reference repo.
4. As a developer, I want `web` to keep typechecking with plain `tsc` and building with Vite, so that the front end uses the standard Vite flow.
5. As a developer, I want `pnpm build` in `api` to produce the same output as the reference's production build, so that production builds are lean (source maps, no declarations, no comments).
6. As a developer, I want `contracts` to keep emitting type declarations in its production build, so that `api` and `web` still resolve `@chat/contracts` types.
7. As a developer, I want `build:dev`, `build:prod` and `build:clean` scripts in `api` and `contracts`, so that I can build the way the reference repo does.
8. As a developer, I want `pnpm dev:api` to run the TypeScript source directly with watch mode, so that I don't wait for a full compile on each change.
9. As a developer, I want the database migrate and seed scripts to run TypeScript directly, so that they don't need a build step first.
10. As a developer, I want `start:dev`, `start:debug` and `start:prod` scripts in `api`, so that the run modes match the reference repo.
11. As a developer, I want `format:check`, `lint:fix`, `test:watch`, `test:cov` and `test:debug` scripts, so that I have the full set of commands the reference repo offers.
12. As a developer, I want `api` to target `esnext`, so that it uses the newest syntax on Node 26.
13. As a developer, I want `web` and `contracts` to keep their current target, so that anything consuming them is not broken.
14. As a developer, I want `moduleDetection: force` in the shared tsconfig, so that every file is a module, as in the reference repo.
15. As a developer, I want path aliases for each `api` source subfolder (such as `@auth/*`, `@common/*`), so that new code can import across features without long relative paths.
16. As a developer, I want existing relative imports left alone, so that this change stays a tooling change and not a refactor.
17. As a developer, I want `contracts` to have no alias and no `@ttsc/paths`, so that nothing is configured that has no use.
18. As a developer, I want `web` to resolve its `@` alias through the tsconfig in Vite and Vitest, so that the alias is declared once.
19. As a developer, I want `pnpm lint` to run oxlint with type-aware rules, so that floating and misused promises are still caught.
20. As a developer, I want ESLint and its plugins removed from the workspace, so that there is one linter.
21. As a developer, I want `api` and `contracts` linted with the full reference rule set plus today's rules, so that the standard is at least as strict as before and as strict as the reference.
22. As a developer, I want `web` linted with today's rules plus the Vite template's `react` rules, so that React code follows the template's guidance.
23. As a developer, I want `explicit-function-return-type`, `max-lines-per-function` and `explicit-module-boundary-types` kept off `web`, so that React components and tests are not forced into patterns that don't suit them.
24. As a developer, I want each existing custom lint rule kept as a native oxlint rule (the `dangerouslySetInnerHTML` ban, named exports only, the `forwardRef` ban, the `node:` built-in import rule, the `class-validator` and `class-transformer` ban, `no-console`, the `process.env` restriction, no type assertions), so that no convention silently stops being enforced.
25. As a developer, I want to be told when a current rule has no oxlint equivalent, so that nothing is dropped without a decision.
26. As a developer, I want every lint error and warning fixed where possible, so that the new rule set starts clean.
27. As a developer, I want an unfixable error bypassed with a disable comment that gives a reason, so that the bypass is visible in code review.
28. As a developer, I want each bypass listed in a root `fix-lint.md`, so that the debt is tracked in one place and can be paid down later.
29. As a developer, I want `api` tests to keep passing against real Postgres after dropping SWC, so that I know decorator metadata and dependency injection still work.
30. As a developer, I want SWC kept in `api` if the tests break without it, so that a tooling change can't break the build.
31. As a developer, I want `@vitest/coverage-v8` available, so that `test:cov` works.
32. As a developer, I want `engines.node` set to `>=26`, the README updated and an `.nvmrc` with `26`, so that everyone runs the same Node version.
33. As a developer, I want the docs that name ESLint or the old scripts updated, so that nothing documented is wrong.
34. As an agent implementer, I want each package change listed with its version, so that I can follow the "no package changes without a Ticket" rule.
35. As a reviewer, I want the work split into 4 PRs (oxlint, then Node 26 and TypeScript 7, then `ttsc` and scripts, then end-to-end verification), so that each is small enough to review.
36. As a maintainer, I want a final end-to-end verification Ticket after both migrations, so that I know the whole system works together before I rely on it.
37. As a maintainer, I want the verification to start from a clean install and a clean build, so that nothing passes only because of stale `dist` output or caches.
38. As a maintainer, I want the real api and web apps started and used (sign up, log in, create a group, send and receive a Message live), so that the TypeScript 7, `ttsc`, Vite and Node 26 combination is proven in the running product.
40. As a maintainer, I want every api endpoint group and the socket events exercised against the running api, so that I know the `ttsc` build and its decorators serve real requests.
41. As a maintainer, I want every main web flow clicked through in a real browser with two users, so that I know the Vite and TypeScript 7 build behaves the same as before.
39. As a maintainer, I want the production build of api started with `start:prod` and checked against the database, so that the `build:prod` output is proven to run, not just compile.

## Implementation Decisions

- **Four Tickets, in order.** Ticket 01: ESLint to oxlint, rules, lint fixes, `fix-lint.md`. It goes first because the latest typescript-eslint supports only TypeScript below 6.1, so typed ESLint would break once TypeScript 7 lands. Ticket 02: Node 26 and TypeScript 7 in every package, web's `baseUrl` and alias change; blocked by 01. Ticket 03: `ttsc`, the api aliases and `@ttsc/paths`, the build configs, the script set and the Vitest changes (with the conditional SWC removal); blocked by 02. Ticket 04: end-to-end verification (see Testing Decisions); it changes no packages and only fixes what the verification finds; blocked by 03. The Tickets are in `issues/`.
- **Reference.** The maintainer's `nguyenhothanhtam0709/nestjs-test` (private; read from a local clone) is the model for tsconfig options, the oxlint rule set, Vitest config and scripts. Where this repo already matches it, nothing changes.
- **Allowed package changes, Tickets 02 and 03** (`typescript` in 02, everything else in 03).
  - Change `typescript` to `~7.0.2` in the root, `api`, `web` and `contracts`.
  - Add `ttsc@^0.37.2` to `api` and `contracts`.
  - Add `@ttsc/paths@^0.37.2` to `api` only.
  - Add `@vitest/coverage-v8` at the installed Vitest 5 line to `api`, `web` and `contracts` (the Vitest 5 line the packages already use; do not move to the reference's Vitest 4).
  - Remove `unplugin-swc` and `@swc/core` from `api` only if its tests pass without them; if so, also remove the `@swc/core` entry from the pnpm build-script allow list. If not, keep them and note why in the Ticket's Comments.
- **Allowed package changes, Ticket 01.**
  - Add `oxlint@^1.94.0` and `oxlint-tsgolint@^7.0.2007` at the root.
  - Remove `eslint`, `@eslint/js`, `globals` and `typescript-eslint` from the root.
  - If an oxlint equivalent is missing for a current rule, stop and ask; don't add a package to cover it.
- **Compiler wrapper.** `api` and `contracts` use `ttsc` for typecheck, build and clean. `web` uses plain `tsc --noEmit` and Vite, and keeps `tsc --noEmit && vite build`.
- **tsconfig.**
  - Shared base keeps `ES2023` and adds `moduleDetection: force`.
  - `api` overrides the target to `esnext` and sets `paths` with one explicit `@<folder>/*` entry per subfolder of its source, plus the `@ttsc/paths` transform. `baseUrl` is not used.
  - `contracts` keeps its target and has no `paths` or transform.
  - `web` drops `baseUrl` (removed in TypeScript 7), keeps `paths` for `@/*`, and keeps its current target.
  - `api` and `contracts` each get a dev build config and a production build config extending it. Production turns on source maps and comment removal, and turns off declaration output and incremental builds. `contracts`' production config keeps `declaration: true` because the package exports its types.
  - Existing decorator options in `api` (`experimentalDecorators`, `emitDecoratorMetadata`) stay. The maintainer has tested that TypeScript 7 supports decorator metadata, so it is not an open risk; the `api` tests and app run still confirm it.
- **Scripts.**
  - Names stay: `typecheck`, `build`, `lint`, `test`. No `tc` alias.
  - `build` equals the reference's `build:prod`; `build:dev` and `build:clean` are added.
  - `api` `dev`, `db:migrate` and `db:seed` run the TypeScript source through `ttsc/register` instead of building to `dist` first; `start:dev`, `start:debug` and `start:prod` are added (`start:prod` runs the built output).
  - `format:check`, `lint:fix`, `test:watch`, `test:cov`, `test:debug` are added per package where they apply.
  - `test:e2e` is not added: there are no end-to-end spec files.
  - Root aggregate scripts (`lint`, `typecheck`, `test`, `docs:generate`, `docs:check`) keep working and call the new per-package commands.
- **Vitest.**
  - `web` and `api` resolve path aliases from the tsconfig with `resolve.tsconfigPaths: true`, replacing the manual alias in `web`.
  - `api` keeps its existing global setup, setup files, timeouts and serial file execution.
- **Linting.**
  - One root oxlint config with per-package overrides, type-aware through `oxlint-tsgolint`.
  - `api` and `contracts`: every rule in the reference config (including `explicit-function-return-type`, `explicit-module-boundary-types`, `max-params`, `complexity`, `max-lines-per-function`, `prefer-readonly` and the rest) plus every rule this repo enforces today.
  - `web`: today's rules plus the Vite template's `react` plugin rules (`rules-of-hooks`, `only-export-components`) with plugins `react`, `typescript`, `oxc` and `import`; without `explicit-function-return-type`, `max-lines-per-function` and `explicit-module-boundary-types`.
  - Test files keep today's relaxations (non-null assertions and type assertions allowed).
  - The generated shadcn UI folder and build output stay ignored.
  - ESLint's `no-restricted-syntax` selectors have no oxlint equivalent, so each becomes a native rule: `react/no-danger`, `import/no-default-export`, and `no-restricted-imports` with import names for `forwardRef`.
  - `complexity` and `max-lines-per-function` are warnings in the reference. Warnings are fixed alongside errors; `--deny-warnings` is not used.
  - Prettier stays for formatting and `pnpm lint` still runs `prettier --check`.
- **Fixing the first run.**
  - Fix every error and warning where possible.
  - A bypass uses `oxlint-disable-next-line <rule> -- <why>` and gets a line in a root `fix-lint.md` (location, rule, reason).
  - The existing documented `eslint-disable-next-line` convention is rewritten for oxlint, after checking which comment forms oxlint honours.
- **Node 26.** `engines.node` becomes `>=26`, the README requirement line is updated, and an `.nvmrc` with `26` is added. Older specs that mention Node 24 describe what was true then and are not edited. `@types/node` is already on the 26 line.
- **Thread limits.** `ttsc` and type-aware oxlint are native, multi-threaded programs, and the repo already caps its Node tooling (Vitest `maxWorkers`, `--max-old-space-size=1024`, `--workspace-concurrency=1`). Verified on a synthetic 600-file project with the reference repo's binaries:
  - `ttsc --checkers <n>` and `--singleThreaded` work. Default 0.25 s (about 340 MB peak), `--checkers 4` 0.20 s, `--checkers 2` 0.26 s, `--checkers 1` 0.38 s, `--singleThreaded` 0.44 s. Memory barely moves; the flags limit CPU threads.
  - `oxlint --threads=N` does **not** limit the type-aware helper (`tsgolint`): CPU stayed at about 4 cores for N = 1, 2 and 4.
  - `GOMAXPROCS` **does** limit it (the maintainer found this; confirmed): type-aware oxlint took 0.69 s, 0.40 s and 0.25 s wall time with `GOMAXPROCS` 1, 2 and 4, against 0.22 s unset, while CPU time stayed about the same, so the helper ran on that many cores. Peak memory stayed 320 to 370 MB.
  - **Decision (maintainer): 2 threads.** `ttsc` runs with `--checkers 2`; type-aware oxlint runs with `GOMAXPROCS=2` and `--threads=2`. These are set in the package scripts, so every caller gets them. `GOMEMLIMIT` is not used: nothing measured needs it.
  - The `GOMAXPROCS=2` prefix in a package script works in macOS and Linux shells; no package (such as `cross-env`) is added for Windows. This repo's setup already assumes a POSIX shell.
  - The implementer measures peak memory and time on this repo (`/usr/bin/time -l`) and records the numbers in the PR. Root aggregate scripts run packages one at a time (`--workspace-concurrency=1`).
- **Docs to update.** Setup (lint command description), the general conventions (the lint-disable comment guidance), the package `AGENTS.md` files if they name ESLint or the old scripts, and anything the docs generator checks. Files generated by the mattpocock skills are not edited without asking.

## Testing Decisions

- **Seam.** The highest seam is the repo's own command surface: `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test`, `pnpm docs:check` run from the root. A good test here is a command exit code and its observable output, not the contents of a config file. No new test files are expected. This should be confirmed with the maintainer before Tickets are written.
- **Existing tests are the safety net.** The `api` behaviour tests (real app, real Postgres via testcontainers) prove decorator metadata, dependency injection and the build still work after the compiler and Vitest changes. The `web` behaviour tests prove the alias and Vite setup. The `contracts` and script tests stay green unchanged.
- **Dropping SWC is decided by those tests.** If the full `api` suite passes without it, remove it; if not, keep it.
- **Lint is tested by running it.** `pnpm lint` exits 0 on a clean tree. For each ported custom rule, confirm by hand once that a deliberate violation fails (a default export, `dangerouslySetInnerHTML`, `forwardRef`, a bare `fs` import, a `class-validator` import, `console.log`, `process.env`, a type assertion), then revert it. These are one-off checks recorded in the PR, not committed tests.
- **Build output is checked.** `contracts` still emits declarations that `api` and `web` consume; `api`'s production build runs with `start:prod`; the dev flow starts the server.
- **A browser check** is needed for `web` only to confirm the dev server and a production preview still load; no UI changes.
- **Ticket 04, end-to-end verification.** After Tickets 01 to 03 are merged, on Node 26 from a clean checkout:
  1. Delete `node_modules` and every `dist`, then `pnpm install --frozen-lockfile`.
  2. Run `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm docs:check`; all exit 0.
  3. Run each package's `build:dev`, `build`, `build:clean` and `test:cov`; all succeed, and `contracts` output still has `.d.ts` files.
  4. `pnpm db:up`, `pnpm db:migrate` and `pnpm db:seed` succeed through `ttsc/register`.
  5. Start `pnpm dev:api` and `pnpm dev:web`; edit a source file and confirm the api restarts on change.
  6. API test against the real running api (`pnpm dev:api`, real Postgres, seeded Users), driven over HTTP and the socket with `curl` and a short script in the scratchpad (nothing committed):
     - health check; sign up, log in, current user, profile update, log out and session revocation;
     - user search; open a direct Conversation; create a group; add and remove a member; leave a group;
     - send a Message; list history with `before` and `after` pagination; mark as read and the unread counts;
     - invalid input gets a 400 and a missing or revoked session gets a 401, in the existing error shape;
     - rate limiting still answers 429 where it is configured;
     - socket: connect with the session, receive a pushed Message, typing and read-receipt events, and a missed Message filled in after a reconnect.
  7. Browser test (Chrome DevTools MCP, `docs/workflow/browser-check.md`) against the real dev stack, with two sessions (for example `alice` and `bob`):
     - sign up, log in, return to the page you wanted after login, log out;
     - conversation list, unread badges, search for a User, open a direct Conversation by URL and by click;
     - create a group, add and remove a member, leave a group, member count and the closed-group state;
     - send a Message in one session and see it live in the other, with typing indicator, read receipts and the unread badge clearing;
     - scroll back through history and open at the newest Message;
     - profile update; session revoked in one tab is handled in the other;
     - mobile width: the conversation sheet and pane height;
     - console has no errors and warnings, no failed network requests, and the Tailwind and shadcn styling is intact (the Vite build is on the new TypeScript and oxlint chain).
  8. Build api with `build` and run `start:prod`; check `/health` and one authenticated request.
  9. `pnpm serve:web` loads the production preview.
  10. Introduce one deliberate violation per ported lint rule and confirm each fails `pnpm lint`, then revert.
  11. Record every command and result in the PR's verification section. Any failure is fixed in this Ticket, or raised through escalation if it needs a package change.
  A step that fails is compared with the same step on `main` before it is blamed on this change.
  Whether to also commit a repeatable `test:e2e` script is a separate decision; this Ticket does not add one.
- **Prior art:** the Strict Mode spec (`.scratch/00009-strict-mode`) is the closest earlier tooling-bar change.

## Out of Scope

- Replacing Prettier with `oxfmt`.
- Changing app behaviour, API contracts or the UI.
- Rewriting existing relative imports to the new `api` aliases, or adding a rule that enforces aliases.
- Adding `ttsc` to `web`, or any alias or `@ttsc/paths` to `contracts`.
- A committed `test:e2e` script and end-to-end spec files (Ticket 04 verifies end to end but adds no new test suite).
- A `tc` script alias or the reference's script names.
- Moving Vitest to the reference's version 4.
- Raising `web` or `contracts` to an `esnext` target.
- CI configuration (there is none in the repo).
- Editing older specs or Tickets that mention Node 24 or ESLint.
- Paying down the debt recorded in `fix-lint.md`.

## Further Notes

- The local machine runs Node 24.18.1; whoever implements this needs Node 26 installed before verifying.
- `ttsc` 0.37 and `oxlint-tsgolint` 7 are young; if one blocks a check that the old tools passed, record it in the Ticket's Comments and ask rather than working around it.
- The `npm create vite` template (create-vite 9.3.4) uses `typescript ~7.0.2` and plain, non-type-aware `oxlint` with plugins `react`, `typescript` and `oxc`. Web goes further and is type-aware to keep today's promise rules.
- AGENTS.md rule: never add, remove or change a package without the Ticket saying so. The package lists above are the source for each Ticket's "Allowed packages" field.
