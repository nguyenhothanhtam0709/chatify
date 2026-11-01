# Spec: Strict Mode

Status: resolved

## Problem Statement

TypeScript `strict` and React `<StrictMode>` are already on, yet several kinds of mistake still get through in `api`, `web` and `contracts`:

- A promise can be dropped, or passed where a void callback is expected, with no warning. In the web app this hides a real bug: when a 2xx response fails its schema, the client throws. The New Group, Leave Group and Add or Remove Member actions then keep their button disabled and show no message. Log in, sign up and profile update recover the button but still show no message.
- A cast (`as`) asserts a shape without checking it, and nothing stops a new one from skipping the check. Most casts on outside data are followed by a runtime check today, so this is mainly future risk. One gap exists: a parsed access token with a non-numeric `exp` gives `NaN` as its time until expiry. Tokens the API issues always have `exp`, so this can't happen today.
- A non-null assertion (`!`) in non-test code turns a broken assumption into an unclear crash.
- A misspelled optional key in a request is ignored with no error. `GET /conversations/:id/messages?befor=5` returns the newest page as a 200.
- The Zod convention says to use `z.strictObject` "where an unknown key must be rejected", but gives no way to decide when that is. It also says a strict search result stops a leak, when it only catches one in tests and on the client.
- Class member visibility is implicit, and some compiler checks are off, so a developer has to spot these things in review.

## Solution

Raise the bar in three places, as one piece of work:

- **Compiler:** 10 more flags in the shared TypeScript config.
- **Lint:** ESLint `strict`, typed promise rules, explicit access modifiers, and bans on `!` and `as` in non-test code.
- **Contracts:** a mechanical Zod rule, documented and enforced by a test, with the 2 schemas that break it converted.

Two user-visible changes come with it. When a 2xx response fails its schema in those flows, the User gets a message and can try again. A request with an unknown key on the 2 converted routes gets a 400.

## User Stories

1. As a User, I want a failed New Group action to leave the button usable, so that I can try again without reloading.
2. As a User, I want a failed Leave Group action to leave the button usable, so that I am not stuck in the dialog.
3. As a group Owner, I want a failed Add or Remove Member action to leave the controls usable, so that I can try again.
4. As a User, I want to see a message when log in, sign up or a profile update gets a bad response, so that I know it did not work.
5. As a client developer, I want a misspelled `before` or `after` to get a 400, so that I don't silently get the wrong page of Messages.
6. As a client developer, I want a misspelled `nickname` at registration to get a 400, so that an account isn't created without the Nickname I sent.
7. As a developer, I want a method that overrides a base class to say so, so that a renamed base method can't silently disconnect it.
8. As a developer, I want every code path in a value-returning function to return, so that a forgotten branch can't return `undefined`.
9. As a developer, I want a case that falls through a `switch` to be an error, so that a missing `break` doesn't run the wrong case.
10. As a developer, I want optional properties to distinguish absent from `undefined`, so that an explicit `undefined` can't overwrite a value unnoticed.
11. As a developer, I want keys that come from an index signature to be written with brackets, so that I can see they aren't declared properties.
12. As a developer, I want unused locals and parameters to fail the compiler as well as lint, so that there is one uniform bar.
13. As a developer, I want unreachable code and unused labels to fail the compiler, so that the compiler and lint agree.
14. As a developer, I want a mistyped side-effect import to fail typecheck, so that a missing stylesheet or module doesn't go unnoticed.
15. As a developer, I want a floating promise to fail lint, so that a rejection can't be lost.
16. As a developer, I want an async function passed where a void callback is expected to fail lint, so that I decide what happens to its rejection.
17. As a developer, I want `pnpm lint` to work from a fresh checkout, so that typed rules read real contracts types.
18. As a developer, I want `!` to fail lint in non-test code, so that a broken assumption fails with a clear error.
19. As a test author, I want `!` allowed in tests, so that a wrong assumption simply fails the test, without extra guards.
20. As a developer, I want every class member except constructors to state its visibility, so that being public is a decision.
21. As a developer, I want `as` to fail lint in non-test code, so that a cast can't stand in for a check.
22. As a developer, I want `as const` to stay allowed, so that the contracts' enum pattern keeps working.
23. As a developer, I want code that reads outside data to use a guard or schema rather than a cast, so that the check can't be left out.
24. As a developer, I want each remaining cast to carry a stated reason, so that a reviewer can tell it is deliberate.
25. As an Implementer, I want a mechanical test for when a schema is strict, so that I don't need a judgement call.
26. As an Implementer, I want a contracts test to fail when a schema breaks the rule, so that the rule can't drift from the code.
27. As a client developer, I want response schemas to stay plain, so that a new API field doesn't break web clients not yet updated.
28. As a developer, I want the docs to say what the strict search result really guards, so that nobody relies on it to stop the server sending data.
29. As a developer, I want the one strict output named as an exception, so that the Breaking changes rule stays true.
30. As a Reviewer, I want each kind of change in its own Ticket, so that behaviour changes aren't buried in config and syntax changes.
31. As a developer, I want follow-ups logged, so that what was left out here isn't lost.

## Implementation Decisions

- **The test for a setting.** A setting earns its place by catching a real kind of bug without churn fixes. The human chose to keep some flags that don't pass this test, for a uniform bar; see Further Notes.
- **`strict: true` stays where it is,** in the shared config. Its family (`noImplicitAny`, `strictNullChecks`, `alwaysStrict` and others) is not restated, because a restated flag could suggest it is separate from `strict`.
- **10 compiler flags go in the shared config:** `noImplicitOverride`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `noUnusedLocals`, `noUnusedParameters`, `exactOptionalPropertyTypes`, `noPropertyAccessFromIndexSignature`, `allowUnreachableCode: false`, `allowUnusedLabels: false`, `noUncheckedSideEffectImports`.
- **`erasableSyntaxOnly` is left out.** It restricts syntax rather than catching bugs, and gives 36 errors in `api`.
- **"All packages" means `api`, `web` and `contracts`.** The generated shadcn components keep their lint ignore. The compiler still checks them, and they are never hand-edited, so a future generated file that breaks a flag is escalated.
- **ESLint moves from `recommended` to `strict`,** not `strictTypeChecked`, which adds 457 errors, 229 of them from one rule. `no-extraneous-class` allows decorated classes, which clears every Nest `@Module` error with no code change.
- **`no-floating-promises` and `no-misused-promises` use type information.** They run on package source and API tests only, because root config files and `scripts/` are not in any tsconfig. Lint builds contracts first, because these rules read contracts types from `dist`.
- **`!` is banned outside tests.** It stays allowed in test files and the two test helper folders, the same paths everywhere in this Spec. Replacements throw on a path that can't happen today, or use a shared helper or narrower type.
- **The `exactlyOne` helper moves** from the Messages area to the database area, so that the auth service can use it without importing from Messages.
- **Every class member except constructors states its access modifier** (`explicit-member-accessibility`). This applies in tests too. `public` is erased at compile time, so there is no runtime or decorator effect.
- **`as` is banned in non-test code in the 3 packages** (`consistent-type-assertions: never`), with `as const` still allowed. Each cast is handled by what it is:
  - a cast that only lets the code read a property it then checks gets a small type guard, with the same behaviour
  - verified access token claims get a Zod schema, with the same `undefined` result on failure
  - the parsed `exp` on the web client gets a type guard, and a non-numeric value counts as expired, the same as an unparsable token
  - a library or framework gap gets better types where possible, or an `eslint-disable` with a stated reason
  - a harmless cast becomes a type annotation
- **The `as` ban is prevention.** A trace of the 12 casts on outside or request data found no reachable bug. The human kept the ban to stop new unchecked casts, so its Ticket is a refactor, apart from the `exp` gap.
- **The web package has no direct `zod` dependency and doesn't gain one,** so web guards are plain TypeScript.
- **A reason on `eslint-disable` is a convention checked in review,** because a lint rule for it would need a new package.
- **A malformed 2xx is a failure result, fixed in the API clients.** The clients behind the flagged handlers return their existing `ok: false` shape with a generic message, instead of throwing. That is the one root cause of every flagged flow, so handlers don't each need their own handling. The handlers still get `void` wrappers to satisfy lint.
- **The Zod rule:**
  - A request or query schema with an optional key (including a key with a default) uses `z.strictObject`, because a misspelled optional key is otherwise ignored with no error.
  - A request or query schema with only required keys uses plain `z.object`, because a misspelled key already fails as a missing one.
  - Responses and realtime events use plain `z.object`, because strict output would make a new API field throw on web clients not yet updated.
- **Two schemas are converted:** `GetMessagesQuerySchema` and `RegisterRequestSchema`. No current web request sends them an unknown key. This narrows accepted input, so it is breaking, and api and web change in the same PR.
- **`UserSearchResultSchema` stays strict as the one output exception,** along with its alias `ConversationMemberSchema`. The API never parses responses, so it doesn't stop the server sending a field. It makes API tests fail on a leak, and it throws on the client. The docs and comment are corrected to say so, and the Breaking changes rule names the exception.
- **No ADR.** The Zod rule is a convention that is easy to reverse per schema, and it stays in the contracts conventions. No glossary change: nothing here is a domain term.
- **No dependency changes.** The only `package.json` change is the root `lint` script. No migration, and no API route is added or removed.

### Tickets

| #   | Ticket                      | Blocked by     |
| --- | --------------------------- | -------------- |
| 01  | TypeScript flags            | None           |
| 02  | ESLint `strict` and no `!`  | 01             |
| 03  | Explicit access modifiers   | 02             |
| 04  | Recover from a malformed 2xx | 01             |
| 05  | Typed promise rules         | 02, 04         |
| 06  | Restrict `as`               | 01, 02         |
| 07  | Zod rule and browser check  | 01, 02, 04, 06 |

Ticket 01 goes first because the rest write code that must pass the flags, and it edits the web clients that Ticket 04 changes. Ticket 05 waits for Ticket 04, so that its `void` wrappers don't silence the lint warning while the stuck-button bug is still there. Ticket 07 waits for every Ticket that changes runtime behaviour, because it holds the one browser check. Tickets 03 and 05 don't change runtime behaviour, so they don't block it.

## Testing Decisions

- A good test checks external behaviour at the outermost layer where a User or client can see it, not how the code is written. The compiler and lint are the checks for syntax rules, so no test asserts a config flag.
- **Refactors get no new test.** The flags, bracket access, access modifiers, `!` replacements, the `exactlyOne` move and the same-behaviour `as` replacements rely on existing tests staying green, with test edits limited to syntax.
- **Web behaviour tests** cover the malformed 2xx: render `<App />`, have MSW return a malformed 2xx, and check that the control recovers and a message appears. They are written first and must fail before the fix. Prior art: the group member, leave group, login, signup and profile tests.
- **API behaviour tests** cover unknown keys on the 2 converted routes. Prior art: the Messages and register tests, using the app harness.
- **A unit test, written first,** covers a non-numeric `exp`, because a behaviour test can't get the real API to issue that token.
- **Contracts tests** cover the boundaries of the 2 converted schemas. A new table-driven test walks every exported schema and enforces the Zod rule. Prior art: the user and search tests.
- **One browser check** runs in Ticket 07, because tests fake the network and two changes affect real requests.
- No other unit tests are planned. An Implementer may add one under the testing policy for a branch a behaviour test can't reach.

## Out of Scope

- Type-checking `scripts/`, which is logged as a follow-up.
- Server-side checks on API responses, which are logged as a follow-up.
- Other API clients with the malformed 2xx pattern, which are logged if they share it.
- The dev `<StrictMode>` refresh problem already in the laters list.
- `strictTypeChecked` and `erasableSyntaxOnly`.
- Removing `!` or `as` from tests, or `as` from `scripts/`.
- Strict schemas for all-required requests, and for outputs beyond the named exception.
- A plugin to require reasons on `eslint-disable`.
- Hand-editing generated shadcn components.

## Further Notes

- **Figures** were measured at commit 71e66a6 and will drift. Treat them as sizes, not acceptance criteria. ESLint `strict` gives 102 errors, 88 with `allowWithDecorator`, and 8 in 5 files with `!` also allowed in tests.
- **Choices against the defect test.** `exactOptionalPropertyTypes` and `noPropertyAccessFromIndexSignature` found no bug today (8 harmless mismatches and 29 syntax-only sites). The human kept both, and all the unused and unreachable flags too, for a uniform bar.
- **A known dev cost.** `dev:api`, `db:migrate` and `db:seed` run `tsc` before `node`, and the web build runs `tsc` before Vite. An unused variable, unreachable code or an unused label now stops those commands, including code left mid-edit. The human accepted this.
- **Typed lint cost** was about 4s against 1s over 179 files, timed in whole seconds.
- **Not yet proven:**
  - `signal ?? null` behaved the same as an undefined `signal` in Node's `fetch`, including aborting with a real signal, but hasn't been run in a browser. The browser check covers that.
  - The 12 casts on outside or request data were traced. The grouping of the other 22 non-test sites (about 19 framework gaps and 3 harmless) is one reading of each line.
  - The `NaN` outcome for a non-numeric `exp` was traced by reading the code, not run.
  - None of the design has been run together; the Tickets' checks cover that.
