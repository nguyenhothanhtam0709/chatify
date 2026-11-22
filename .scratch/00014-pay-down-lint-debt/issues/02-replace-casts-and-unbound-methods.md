# 02: Replace the remaining casts and unbound methods with code fixes

**What to build:** Try a real code fix for each of the 7 remaining fixable bypasses in `fix-lint.md`, and keep a disable only where the fix fails. Touches `api`, `contracts` and `web` source and test helpers, and `fix-lint.md`. Rules:

- **5 `typescript/consistent-type-assertions` bypasses** (the `api` seed user lookup, the `api` docs routes module listing, the `api` realtime adapter options, the `contracts` realtime events JSON Schema, and the `web` socket realtime event dispatch): remove the cast with a type guard, an annotation, `satisfies` or a better-typed helper. Timebox each attempt. If TypeScript can't express the type, keep the disable and make its reason say why (for example, the error you get without the cast). The 00012-01 reasons already flag two likely survivors: the `web` correlated-union case and the `api` `exactOptionalPropertyTypes` adapter case.
- **2 `typescript/unbound-method` bypasses in the `web` test helpers** (the layout stub and the `scrollIntoView` polyfill): satisfy the rule in code by delegating through a wrapper with a typed `this`, or by binding the saved method. No override. If the fix is clearly harder to read than the disable, keep the disable and its line.
- No override is added: these are production source or rules the maintainer chose to fix in code.
- Leave alone: the 2 NestJS constructor `max-params` disables and the conversation-summary Drizzle query's `max-lines-per-function` disable. They are permanent exceptions.
- When a disable goes, delete its `fix-lint.md` line in the same change. Keep the file's location and table format.

See the Spec's Implementation Decisions and Testing Decisions.

**Allowed packages:** None

**Blocked by:** 01

**Status:** resolved

- [x] Each of the 5 type assertions is either removed or kept with a reason that says why TypeScript can't express the type
- [x] Each of the 2 `unbound-method` bypasses is either fixed in code or kept with a reason, and no rule is turned off for them in `.oxlintrc.json`
- [x] The 2 `max-params` disables and the Drizzle query disable are unchanged
- [x] `fix-lint.md` lists between 3 and 10 bypasses, and every `oxlint-disable` comment under `packages/` has exactly one line there, and the reverse, with matching line numbers
- [x] `pnpm lint` passes with no new warnings or errors
- [x] `pnpm typecheck` passes in every package
- [x] The closing comment lists which bypasses were removed and which were kept, and why

**Verification:** No new tests. The existing suites around each change must pass unchanged: the `api` seed, docs routes and realtime suites, the `contracts` realtime events doc suite, the `web` socket realtime suite, and every `web` test that uses the layout stub or the `scrollIntoView` polyfill. Run `pnpm test`, `pnpm typecheck` and `pnpm lint`. Then search `packages/` for `oxlint-disable` and compare it with `fix-lint.md`.

**Out of scope:** Restructuring NestJS constructors for `max-params`; breaking up the Drizzle query; changing rule limits; any lint finding not listed in `fix-lint.md`.

## Comments

Resolved. Verified with `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm docs:check`; existing suites unchanged. `fix-lint.md` now has 4 rows, matching the 4 `oxlint-disable` comments under `packages/`.

Removed (6):

- `api` seed user lookup: a `Map` plus an `idOf` helper that throws if a row is missing, building `Ids` key by key.
- `api` docs routes: an `isModuleRef` type guard filters `imports` (promises and forward references are dropped, as the generator never used them).
- `api` realtime adapter: `Object.assign({}, options, fixed)` type-checks under `exactOptionalPropertyTypes` where the spread did not.
- `contracts` realtime events doc: `JsonSchema` is now zod's own `z.core.JSONSchema.JSONSchema`; an `asSchema` helper turns boolean schemas into `{}` (rendered `unknown`).
- `web` layout stub: `original` comes from a typed `Reflect.get`, so no unbound method is read.
- `web` `scrollIntoView` polyfill: `Reflect.has` check, then a plain assignment.

Kept (1 of the 7 fixable): `web` socket realtime dispatch. `{ type: name, ...parsed.data }` fails with TS2322 without the cast (`type: RealtimeEventName` fits no single member of `RealtimeEvent`); the reason in source and `fix-lint.md` now says so. The 2 `max-params` and the Drizzle `max-lines-per-function` disables are unchanged. No override added.

Assumptions: dropping promise and forward-reference imports in `docs/routes.ts` is safe because the generator's modules use neither (the old comment said so).
