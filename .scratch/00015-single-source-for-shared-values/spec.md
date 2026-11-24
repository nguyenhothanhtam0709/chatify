# Spec: One source for values api and web share

Status: resolved

## Problem Statement

The Conversation list shows a different Preview for the same Message depending on how it got there. When a Message arrives over realtime, the web app builds the Preview itself. When the list is reloaded, the API builds it in SQL. The two disagree: Postgres `trim()` strips only spaces, while JS `String.trim()` strips every kind of whitespace. A Message whose body is `"\nhello\n"` is valid (it is not blank after trimming), so the push shows `hello` and a reload shows ` hello `. The `\s` classes also differ: JS includes NBSP and U+FEFF, while Postgres follows the database locale. The web code has a comment that claims "the same preview the server builds", but no test checks it.

The cause is a general one: a value that api and web share was defined a second time outside `@chat/contracts`. The same pattern appears in other places that have not broken yet:

- Limits are typed as numbers in user-facing strings and queries (256 Members, 1-100 for a Group name, 1-50 for a Nickname, 3-32 for a Username, 8-128 for a Password, 20 User search results). Some of these limits have no constant in contracts, even though the contracts conventions require one.
- The web app types out its own union of realtime event names, although contracts already define `RealtimeEvent` and `RealtimeEventSchemas`. When contracts add an event, this union does not change and no compile error points to it.

The conventions forbid some of this, but nothing enforces them, and agents copy the code around them.

## Solution

1. **Preview.** A single `previewOf` helper in `@chat/contracts` defines the Preview. The API computes the Preview in TS with it, both for `GET /conversations` and anywhere else it builds one. The web app imports the same helper. Whitespace follows the JS definition, the same one `MessageBodySchema` uses for its "not blank" check. A Message that passes validation therefore always has a non-empty Preview, and the push and a reload always agree.
2. **Types and constants.** Every limit lives in contracts as an exported constant, and every user-facing string and query reads it from there. The web realtime event union is derived from `RealtimeEventSchemas`. The conventions say where these values must come from.
3. **Automated checks.** Lint and two small scripts catch the next re-declaration before review does.

## User Stories

1. As a User, I want a Conversation's Preview to look the same after a reload as it did when the Message arrived, so that the list doesn't change on its own.
2. As a User, I want a Message that starts or ends with a newline to show a Preview without leading or trailing whitespace, so that the list stays aligned.
3. As a User, I want a Message that starts with a non-breaking space to show a Preview without a leading blank, so that every Preview starts with text.
4. As a User, I want runs of tabs, newlines and other whitespace inside a Message to show as one space in the Preview, so that a multi-line Message fits one line.
5. As a User, I want a long Message's Preview cut at 100 characters without splitting an emoji, so that the Preview never shows a broken character.
6. As a User, I want a System Message never to become a Conversation's Preview, so that the list shows what people wrote (this rule does not change).
7. As a developer, I want one `previewOf` in contracts, so that api and web cannot drift apart.
8. As a developer, I want the API to compute the Preview in TS instead of SQL, so that the Preview never depends on the database locale.
9. As a developer, I want a contracts test that lists the Preview's edge cases in one table, so that the definition is easy to read and hard to break.
10. As a developer, I want an API behaviour test that sends a body with a leading and trailing newline, so that the bug this Spec fixes stays fixed at the layer clients see.
11. As a developer, I want "Preview" in the glossary, so that specs, code and tests use one word with one meaning.
12. As a developer, I want the contracts conventions to allow pure helpers that api and web must compute identically, so that `previewOf` has a sanctioned home.
13. As a developer, I want a general convention that a value api and web both compute comes from one contracts helper, so that no one re-implements it on the other side.
14. As a developer, I want an API convention that user text is not transformed in SQL, so that JS and Postgres never disagree about whitespace or case.
15. As a developer, I want the contracts test conventions to name leading and trailing whitespace, non-ASCII whitespace and characters outside the BMP as boundaries, so that tests stop relying on ASCII inputs alone.
16. As a developer, I want `NICKNAME_MAX`, `USERNAME_MIN`, `USERNAME_MAX`, `PASSWORD_MIN`, `PASSWORD_MAX` and `USER_SEARCH_LIMIT` exported from contracts, so that every limit has one definition.
17. As a developer, I want the Nickname, Username and Password schemas to use those constants, so that contracts itself shows the pattern it requires.
18. As a User, I want the limits shown in the sign-up, profile and new-Group forms and in their error messages to match what the server enforces, so that I am never told the wrong limit.
19. As a developer, I want every user-facing string that names a limit to interpolate the contracts constant, so that changing a limit changes the text too.
20. As a developer, I want the User search to read its result limit from `USER_SEARCH_LIMIT`, so that the number is not a bare literal in a query.
21. As a developer, I want the web realtime event union derived from `RealtimeEventSchemas`, so that a new event in contracts shows up in the web types.
22. As a developer, I want the contracts conventions to say that a subset of a shared set is derived with `Extract<…>` and a map over a whole set uses `satisfies Record<…>`, so that a new value fails to compile until it is handled.
23. As a developer, I want a web convention that a limit shown to the user comes from its contracts constant, so that reviewers have a rule to point to.
24. As a reviewer, I want the definition of done to state that no limit, code or wire shape is re-declared outside contracts, so that I check it on every PR.
25. As a developer, I want `no-magic-numbers` turned on for api and web source, so that a bare limit in code fails lint.
26. As a developer, I want a script that reads the enum-like sets from contracts (`ErrorCode`, `RealtimeEvent`, the Message and Conversation kinds) and fails when one of their values appears as a string literal in api or web source, so that re-typed codes and event names are caught however they are spelled.
27. As a developer, I want that script to read the values from contracts rather than keep its own list, so that it never needs updating when a value is added.
28. As a developer, I want a script that fails when a user-facing string in web source spells out a limit as a number, so that the numbers lint cannot see are caught too.
29. As a developer, I want both scripts covered by script tests, so that a broken checker can't pass silently.
30. As a developer, I want both scripts run with the other repo checks, so that they gate every PR.

## Implementation Decisions

### Part 1: Preview

- **Source of truth.** `@chat/contracts` exports `previewOf(body: string): string`: trim, collapse each run of whitespace to one space, then take the first `LAST_MESSAGE_PREVIEW_MAX` code points. Use JS `String.prototype.trim` and `/\s+/g`, the same definition of whitespace as `MessageBodySchema`'s "not blank" check. NBSP, U+FEFF and U+2028/2029 count as whitespace.
- **API.** The Conversation summary query stops building the Preview in SQL. It selects the last visible Message's full `body`, and the row mapping applies `previewOf`. Which Message is the last visible one (including the rule that a System Message never becomes the Preview) does not change. The query now returns up to 4000 code points per Conversation instead of 100. That cost is accepted.
- **Web.** The Conversation list drops its local helper and imports `previewOf`. Its behaviour does not change.
- **Contract.** `ConversationSummarySchema`'s shape does not change. Its doc comment on `preview` points to `previewOf` instead of restating the rule. Adding a helper export is not a breaking change.
- **Existing data.** No migration or backfill. The Preview is computed at query time and is not stored.
- **No new ADR.** The decision is small and reversible, and the convention updates below record it.

### Part 2: Types and constants

- Contracts export `NICKNAME_MAX`, `USERNAME_MIN`, `USERNAME_MAX`, `PASSWORD_MIN`, `PASSWORD_MAX` and `USER_SEARCH_LIMIT`. The existing schemas use them. The accepted input does not change.
- The web sign-up, profile and new-Group forms and the web API client error messages interpolate `GROUP_MEMBERS_MAX`, `GROUP_NAME_MAX`, `NICKNAME_MAX`, `USERNAME_MIN`/`USERNAME_MAX` and `PASSWORD_MIN`/`PASSWORD_MAX`. The rendered text stays the same.
- The User search uses `USER_SEARCH_LIMIT` (20) for its result limit.
- The web `RealtimeEvent` union is a mapped type over `RealtimeEventSchemas`: for each event name, `{ type: name }` plus the inferred payload. Every event, `session.revoked` included, is already in contracts, so nothing stays hand-written.
- `ErrorCode` was checked and is not re-declared anywhere. The web branches on `ErrorCode.X` imported from contracts.

### Part 3: Automated checks

- **Lint.** Turn on `no-magic-numbers` for api and web source. Allow `0`, `1` and `-1`. Exempt test files, shared contract suites (`*.contract.ts`, as in Spec 00014), the shadcn `components/ui` folder and the API config schema. The rule may flag many existing sites, as Spec 00014 did. Each flagged site is fixed in code with a named constant, not with a new override in production code.
- **Not turned on:** `switch-exhaustiveness-check` for web. It is already on for api and contracts. In web it flags the two `ErrorCode` switches, whose `default` branch is intended. The places that must cover a whole set already use `Record<SystemMessageKind, …>`, which Part 2's convention covers.
- **Literal check script.** A script under the repo's `scripts/` reads the values of `ErrorCode`, `RealtimeEvent`, `MESSAGE_KINDS` and `CONVERSATION_KINDS` from the built contracts. It fails when any value appears as a quoted string literal in api or web source outside test files, and prints the location.
- **UI number check script.** A script fails when web source outside test files contains a string that spells out a limit as a number, such as `<n>-<m> characters` or `at most <n>`.
- Both scripts run as part of the existing repo checks that run before a PR. Together they take care of part of the "Enforce the doc and convention rules" entry in Laters.

### Docs

- **Glossary**, under Conversations:
  > **Preview**:
  > The text the Conversation list shows for a Conversation's last Message: the body with leading and trailing whitespace removed and each run of whitespace collapsed to one space, cut to the first 100 characters. Whitespace means what the "not blank" check on a Message body counts as whitespace. A System Message never becomes the Preview.
  > _Avoid_: Snippet, excerpt, summary
- **Contracts conventions, Package shape:** "Contracts are Zod schemas, plus pure helpers that api and web must compute identically (such as `previewOf`); no Nest, React or database code."
- **Contracts conventions, Enums and codes:** "A subset of a shared set is derived, never re-typed: `Extract<ErrorCode, …>`. A map over a whole set uses `satisfies Record<…, …>`, so a new value fails to compile until it is handled."
- **Contracts conventions, Tests:** add leading and trailing whitespace (including newline and NBSP), and characters outside the BMP at a length limit, to the boundaries to test.
- **General conventions:** "A value that api and web both compute comes from one helper in contracts. Never re-implement it on the other side, and never write a comment claiming two implementations match: make them share the code instead."
- **API conventions:** "Don't transform user text in SQL (`trim`, `regexp_replace`, `lower`, `left`). Postgres and JS disagree on whitespace and case; do it in TS."
- **Web conventions:** "A limit shown to the user is interpolated from its contracts constant, never typed as a number." Point to the composer's use of `MessageBodySchema` as the pattern for checking user input against contracts.
- **Definition of done:** "No limit, code or wire shape is re-declared outside contracts."

## Testing Decisions

- A good test drives the outermost seam a client can see and checks what that client gets back, not how the value was computed. Behaviour tests never mock our own code (testing policy).
- **Preview, API behaviour test (written first, must fail first).** Send a Message whose body is `"\nhello\n"`, then `GET /conversations`. The Preview must be `hello`. Prior art: the existing Preview tests in the API messages suite (whitespace collapse and the 100-character cut), which use the app harness against real Postgres.
- **Preview, contracts test.** A table-driven `it.each` for `previewOf`:
  - a leading and trailing newline, tab or NBSP
  - mixed whitespace inside the body
  - exactly 100 and 101 code points
  - an emoji outside the BMP straddling the 100-code-point boundary, which must be cut by code point, not by UTF-16 unit

  Prior art: the table-driven schema tests next to each contracts area.
- **Preview, web.** No new test. The existing realtime push test, which checks that a Conversation moves to the top with the new Preview, must stay green.
- **Constants.** The existing contracts schema tests use the new constants for their min and max boundaries. The UI strings and the search limit are a refactor: the existing web and API behaviour tests must stay green, with no test weakened.
- **Realtime event union.** The typecheck is the test. The existing web realtime tests must stay green.
- **Scripts.** Each checker gets a `node --test` script test that feeds it a passing and a failing fixture. Prior art: the docs checker and hook tests under `scripts/`.
- **Lint.** Verified by running lint for api and web. No automated test of the config.

## Out of Scope

- Which Message becomes the Preview, and how System Messages are filtered. That is the Laters entry about `owner_changed` in the Conversation preview and list ordering.
- Unicode Usernames or Emails. Today both are ASCII-only. That is what keeps JS `toLowerCase()` and Postgres `lower()` in agreement for login, search and the unique indexes.
- Rejecting zero-width-only Message bodies (for example `"\u200B"`). It is a validation question, not a Preview question.
- Turning on `switch-exhaustiveness-check` for web.
- Any package change. oxlint is already installed, and the scripts use the existing toolchain.

## Further Notes

- This Spec came out of a grilling session on the Preview mismatch. The bug was found by reading the code, and the Part 1 API test is the first to reproduce it.
- Two findings from the grilling are recorded in Laters: "Case-insensitive comparison depends on ASCII-only Usernames and Emails" and "Zero-width-only Message bodies pass validation".
- Tickets: 01 (Part 1), 02 and 03 (Part 2) can start at once. 04 (scripts) is blocked by 02 and 03, because the literal check would flag the hand-written realtime union. 05 and 06 (`no-magic-numbers` for web and api) are blocked by 02. A trial run of the rule flagged about 17 web and 43 api sites, so lint is split by package.
