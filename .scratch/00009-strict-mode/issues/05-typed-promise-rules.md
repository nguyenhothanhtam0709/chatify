# 05: Typed promise rules

**What to build:** A floating or misused promise fails lint, and `pnpm lint` works from a fresh checkout (spec 00009, "Implementation Decisions"). Touches the root `lint` script and the web package. Behaviour doesn't change.

**Config:**

- Turn on `@typescript-eslint/no-floating-promises` and `@typescript-eslint/no-misused-promises` with type information, for `packages/*/src/**` and `packages/api/test/**` only. Root config files and `scripts/` aren't in any tsconfig, so they stay untyped.
- The root `lint` script runs `pnpm build:contracts` first, because these rules read contracts types from `dist`.

**Fixes:** at commit 71e66a6, `no-floating-promises` reports nothing and `no-misused-promises` reports 7, all in web: the refresh timer in `AuthProvider`, the submit handlers of the login, sign up, New Group and profile forms, and the Leave and Remove actions in the group details sheet. Wrap each with `void`, as in `onSubmit={(e) => void onSubmit(e)}`, which matches the repo's existing style. Ticket 04 already handles the rejections behind the form and group flows, and the refresh client catches everything.

**Docs:** add the two rules to what lint enforces in the general conventions.

**Allowed packages:** None

**Blocked by:** 02, 04

**Status:** ready-for-agent

- [ ] `pnpm lint` passes with both rules on, with no `eslint-disable` added for them
- [ ] A floating promise and an async function passed as a void callback each fail lint in package source
- [ ] `pnpm lint` passes with no contracts `dist` present
- [ ] The only `package.json` change is the root `lint` script, and the lockfile is unchanged
- [ ] The general conventions are updated

**Verification:** No new tests: this is a refactor, so existing tests stay green. Check the `dist` criterion by deleting it and running `pnpm lint`. Typed lint took about 4s against 1s at commit 71e66a6; note the new time in this Ticket's `## Comments`.

**Out of scope:** `strictTypeChecked` and `no-confusing-void-expression`. Typed rules on root config files or `scripts/`. Changing what the handlers do.

## Comments
