# 01: `scripts/` is typechecked by `pnpm typecheck`

**What to build:** `pnpm typecheck` also typechecks every TypeScript file under `scripts/`, so the hooks that enforce the Factory are checked like package code before any new hook is written. Today `scripts/` is outside every package's `tsc` run; an ad hoc run under the strict flags found 25 errors, 24 of them from one helper in the read guard's test. Rules:

- `scripts/` gets its own TypeScript config that extends the root base config, so it uses the same strict flags as the packages. It type-checks only (no emit).
- A root script `typecheck:scripts` runs it, and the root `typecheck` script runs it after the packages, the same way `lint:scripts` and `test:scripts` sit inside `lint` and `test`.
- The docs generator imports the API's built docs entry, and the API's `dist` has no declarations. Fix this by making the API's build emit declarations (its production build config sets `declaration: false` today). Do not add `@ts-` comments (banned), hand-written types for the import, or a new package. The generator's import of the built contracts must type-check the same way.
- Fix every existing error under the new config, without weakening a flag.
- Remove the whole "Type-checking `scripts/`" entry from `docs/laters.md`.

See the Spec's "Typechecking `scripts/`".

**Packages:** api, scripts

**Also writes:** package.json, docs/laters.md

**Allowed packages:** `@types/node ^26.6.5`

**Blocked by:** None

**Status:** resolved

- [x] `pnpm typecheck` type-checks every `.ts` file under `scripts/`, and passes
- [x] A deliberate type error in any script makes `pnpm typecheck` fail
- [x] The docs generator's API import is typed from the API's emitted declarations; no `@ts-` comment and no hand-written declaration for it
- [x] `pnpm docs:generate` produces the same Generated Docs as before
- [x] `docs/laters.md` no longer has the "Type-checking `scripts/`" entry

**Verification:** Run `pnpm typecheck`, add a type error to one script and see it fail, then remove it. Run `pnpm docs:check` to show the Generated Docs are unchanged. No new script test: the type check is the test.

**Out of scope:** Any new hook or script; changing the oxlint config for `scripts/`; making `scripts/` a workspace package.

## Comments

Resolved. Verified with `pnpm typecheck`, `pnpm test` and `pnpm docs:check` (Generated Docs unchanged); a deliberate type error in a script made `pnpm typecheck` fail (TS2322), then was removed. `pnpm lint` passes except prettier on the untracked `overview.md` at the repo root, which is not in the repo; the human is handling it in a separate PR into main.

Decision (human): root `@types/node` `^26.6.5` (the version api and web use) is an allowed package for this Ticket, so `scripts/tsconfig.json` needs no `typeRoots`.

Assumptions: `scripts/tsconfig.json` sets `allowImportingTsExtensions` (scripts import `.ts` files) and `target: esnext`, like the api's `tsconfig.json`. The API emits declarations by setting `declaration: true` in `tsconfig.build.prod.json`; `declarationMap` stays false.

The lockfile was regenerated from main in the review-fix PR, so @pnpm/exe is gone; the ajv-formats rewrite comes from pnpm 12.23, not a package change.
