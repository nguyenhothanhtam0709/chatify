# Spec: Pay down the lint debt in `fix-lint.md`

Status: ready-for-agent

## Problem Statement

Spec 00012 moved the repo from ESLint to type-aware oxlint. Ticket 00012-01 bypassed every error or warning it could not fix with an `oxlint-disable-next-line <rule> -- <why>` comment and listed each bypass in the root `fix-lint.md`. Paying that debt down was out of scope for 00012.

The file now lists 62 bypasses:

| Group | Count | Where |
|---|---|---|
| `max-lines-per-function` (warn, limit 50) | 48 | `api` and `contracts` test suites |
| `max-lines-per-function` | 2 | the shared token deny-list contract suite |
| `max-lines-per-function` | 1 | the conversation-summary Drizzle query in `api` |
| `typescript/consistent-type-assertions` | 5 | `api` seed, `api` docs routes, `api` realtime adapter, `contracts` realtime events doc, `web` socket realtime |
| `max-params` (max 4) | 2 | two NestJS service constructors in `api` |
| `no-restricted-properties` (`process.env`) | 2 | the drizzle-kit config and the Vitest global setup in `api` |
| `typescript/unbound-method` | 2 | `web` test helpers |

Most of these say the rule doesn't fit that kind of file at all (a test suite, a contract suite, a file that runs outside Nest), not that the code is wrong. Each such bypass adds noise to the source and to `fix-lint.md` and hides the few bypasses that are real debt.

## Solution

Remove every bypass that can reasonably go, in one of two ways:

- **A scoped override in `.oxlintrc.json`**, allowed **only for test, contract and CLI/config files**. These are files where the rule doesn't apply by nature, next to the overrides that already exist for test files and for `main.ts`/`*-cli.ts`.
- **A code fix** everywhere else. Production code gets no new override.

Any bypass that can't go keeps its disable comment and its `fix-lint.md` line. `fix-lint.md` stays at the repo root in its current format (location, rule, reason) and holds only those leftovers. When this Spec is done, between 3 and 10 entries should remain (3 kept on purpose, plus whichever of the 7 code fixes fail).

## User Stories

1. As a developer, I want `max-lines-per-function` turned off for test files, so that a suite can keep its setup and assertions in one block without a disable comment.
2. As a developer, I want `max-lines-per-function` turned off for shared contract suites (`*.contract.ts`), so that a contract that several adapters run keeps its cases together.
3. As a developer, I want the 50 `max-lines-per-function` disables in test and contract files removed, so that test code is free of lint noise.
4. As a developer, I want the drizzle-kit config exempt from the `process.env` ban, so that a file drizzle-kit loads outside Nest can read its connection string without a disable.
5. As a developer, I want the Vitest global setup exempt from the `process.env` ban, so that the test-runner switch `TEST_DATABASE_URL` can be read without a disable.
6. As a developer, I want those two exemptions in the existing `no-restricted-properties: off` override with `main.ts` and `*-cli.ts`, so that every file allowed to read `process.env` is listed in one place.
7. As a developer, I want the two `unbound-method` bypasses in `web` test helpers fixed in code (wrap or rebind the prototype method), so that no rule is turned off for them.
8. As a developer, I want an `unbound-method` bypass kept, with its reason, if the code fix ends up harder to read than the disable, so that clarity wins over lint purity.
9. As a developer, I want each of the five `consistent-type-assertions` bypasses tried with a real fix (a type guard, `satisfies`, an annotation or a better-typed helper), so that `as` only stays where TypeScript can't express the type.
10. As a developer, I want each type-assertion attempt timeboxed, so that one stubborn cast can't stall the Ticket.
11. As a developer, I want a cast that can't be removed to keep its disable and a reason that says why TypeScript can't express it, so that a reviewer can check the claim.
12. As a developer, I want the `max-params` disables on NestJS constructors kept as permanent exceptions, so that dependency injection isn't hidden behind a facade object just to satisfy a counter.
13. As a developer, I want the conversation-summary Drizzle query kept as one function with its disable, so that the query stays readable in one place.
14. As a developer, I want no override added for production code, so that the rules keep their full strength where they matter.
15. As a developer, I want each `fix-lint.md` line removed in the same change that removes its disable comment, so that the file never drifts from the source.
16. As a developer, I want every remaining `oxlint-disable` comment to match exactly one `fix-lint.md` line, so that the debt list stays complete and accurate.
17. As a developer, I want `fix-lint.md` kept at the root in its current format, so that the convention in `docs/conventions/general.md` stays true without an edit.
18. As a developer, I want `pnpm lint` to pass with no new warnings after the change, so that the rule set still starts clean.
19. As a developer, I want `pnpm typecheck` and every test suite to pass after the code fixes, so that removing a cast or rebinding a method doesn't change behaviour.

## Implementation Decisions

- **Overrides are allowed only for test, contract and CLI/config files.** That is the boundary the maintainer set. Production source changes only through code fixes or kept disables.
- **Test and contract suites.** Add `max-lines-per-function: off` to the existing test-files override (the one that already turns off `no-non-null-assertion` and `consistent-type-assertions` for `*.test.*`, the `web` test helpers folder and the `api` test folder). Add the `*.contract.ts` pattern to that override, or to a sibling override that turns off only this rule for contract suites. Then delete the 50 disable comments and their lines.
- **`process.env` outside Nest.** Add the drizzle-kit config and the `api` Vitest global setup to the existing override that turns `no-restricted-properties` off for `main.ts` and `*-cli.ts`. Delete both disable comments and their lines.
- **`unbound-method` in `web` test helpers.** Code fix first: delegate through a wrapper with a typed `this`, or bind the saved method, so the rule is satisfied. No override. If the result is clearly harder to read than the disable, keep the disable and its line and say why in the Ticket's closing comment.
- **Type assertions (5).** Try each on its own, timeboxed. Fix it if a guard, annotation, `satisfies` or a narrower helper type makes the cast unnecessary and `pnpm typecheck` passes. Otherwise keep the disable and update its reason if the attempt taught something new (for example the TypeScript error you get without the cast). The 00012-01 reasons already flag two likely survivors: the correlated-union case in `web` socket realtime and the `exactOptionalPropertyTypes` case in the `api` realtime adapter.
- **Kept as is:** the two NestJS constructor `max-params` disables and the conversation-summary Drizzle query's `max-lines-per-function` disable.
- **`fix-lint.md`.** Same location and table format. Remove each line in the same commit that removes its disable. `docs/conventions/general.md` is unchanged.
- **Packages.** No npm dependency is added, removed or changed. The work touches `.oxlintrc.json` (root), `api`, `contracts` and `web` source and test files, and `fix-lint.md`.
- **Suggested Ticket split** (the Ticket writer decides): one Ticket for the config overrides and the 52 comment removals that follow from them; one Ticket for the code fixes (two `unbound-method`, five type assertions). The second Ticket doesn't depend on the first, but both edit `fix-lint.md`, so running them one after the other avoids merge conflicts.

## Testing Decisions

- **The lint run is the main seam.** `pnpm lint` passes with no new warnings or errors. Every `oxlint-disable` comment under `packages/` matches exactly one `fix-lint.md` line, and the reverse. This is checked by a one-off search during verification, not by a new script.
- **Behaviour is kept by the existing suites.** No new tests and no new seams. A good test here is one that already checks the external behaviour of the code around a removed cast or a rebound method. It must keep passing unchanged:
  - the `api` seed suite (seed user lookup),
  - the `api` docs routes suite (module route listing),
  - the `api` realtime suite (adapter options),
  - the `contracts` realtime events doc suite (JSON Schema output),
  - the `web` socket realtime suite (event parsing and dispatch),
  - the `web` test-helper changes, which every `web` test that uses the layout stub or the `scrollIntoView` polyfill exercises.
- **`pnpm typecheck`** passes in every package. A removed cast has to compile without help.
- Removing disable comments in test files doesn't change test behaviour, and the full `pnpm test` run confirms it.

## Out of Scope

- Splitting long test suites into smaller functions.
- Any override for production source, including raising `max-params` for services or turning off `consistent-type-assertions` anywhere new.
- Restructuring NestJS constructors (facades, provider objects) to get under `max-params`.
- Breaking up the conversation-summary Drizzle query.
- Changing the limits of `max-lines-per-function`, `max-params` or `complexity`.
- A lint rule or script that enforces a reason on every disable comment, or checks `fix-lint.md` against the source (that would need a new package; see `docs/conventions/general.md`).
- Moving, renaming or reformatting `fix-lint.md`, or editing the convention doc.
- Fixing lint findings that don't come from a `fix-lint.md` bypass.

## Further Notes

- These decisions came from a grilling session with the maintainer. Spec 00012 (out of scope, last item) deferred this debt.
- Line numbers in `fix-lint.md` will shift as disables are removed. Each line that stays must point to its comment's new line.
