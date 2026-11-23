# 01: Exempt test, contract and CLI/config files from rules that don't fit them

**What to build:** Remove the 52 `fix-lint.md` bypasses that exist only because a rule doesn't fit that kind of file. Touches the root `.oxlintrc.json`, `api` and `contracts` test files, the `api` drizzle-kit config, the `api` Vitest global setup, and `fix-lint.md`. Rules:

- Overrides are allowed **only** for test, contract and CLI/config files. Production source gets no new override.
- Turn `max-lines-per-function` off in the existing test-files override (the one that already turns off `no-non-null-assertion` and `consistent-type-assertions`) and cover the shared contract suites (`*.contract.ts`) too, either in that override or in a sibling override that turns off only this rule.
- Add the drizzle-kit config and the `api` Vitest global setup to the existing override that turns `no-restricted-properties` off for `main.ts` and `*-cli.ts`.
- Delete each `oxlint-disable-next-line` comment these overrides make unnecessary (48 in test suites, 2 in the token deny-list contract suite, 2 `process.env` reads), and delete its `fix-lint.md` line in the same change.
- Leave every other bypass alone: the 5 type assertions, 2 `unbound-method`, 2 `max-params` and the conversation-summary Drizzle query. Ticket 02 handles or keeps them.

See the Spec's Implementation Decisions for the reasoning.

**Allowed packages:** None

**Blocked by:** None

**Status:** resolved

- [x] `max-lines-per-function` is off for test files and for shared contract suites, and still on (warn, 50) for production source
- [x] The drizzle-kit config and the `api` Vitest global setup may read `process.env` without a disable, and other `api` and `contracts` files still may not
- [x] None of the 52 bypasses above has a disable comment or a `fix-lint.md` line any more
- [x] `fix-lint.md` keeps its root location and table format, and lists exactly the 10 remaining bypasses, with line numbers that match their comments
- [x] Every `oxlint-disable` comment under `packages/` has exactly one `fix-lint.md` line, and the reverse
- [x] `pnpm lint` passes with no new warnings or errors

**Verification:** Run `pnpm lint`. Search `packages/` for `oxlint-disable` and compare it with `fix-lint.md` one to one. Run `pnpm test` to confirm removing the comments changed nothing. To show the override is scoped, temporarily make a production function longer than 50 lines and check the warning still fires, then revert.

**Out of scope:** Splitting test suites; any override for production source; changing rule limits; the 10 remaining bypasses (Ticket 02); editing `docs/conventions/general.md`.

## Comments

Resolved. Verified with `pnpm lint`, `pnpm typecheck`, `pnpm test`, and a one-to-one check of `oxlint-disable` comments against `fix-lint.md`. The 50-line warning still fires in production source (temporarily removed the `conversation-queries.ts` disable, then restored it). No assumptions, no follow-ups.
