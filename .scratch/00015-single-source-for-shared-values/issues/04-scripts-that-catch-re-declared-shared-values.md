# 04: Scripts catch re-declared shared values

**What to build:** Two checks that fail when a value contracts owns is written again in api or web source, so the next re-declaration is caught before review. Touches scripts and the root `lint` script. Rules:

- **Literal check.** Import the built contracts, read every value of `ErrorCode`, `RealtimeEvent`, `MESSAGE_KINDS` and `CONVERSATION_KINDS`, and fail when any value appears as a quoted string literal in api or web source. The script reads the values from contracts every run and keeps no list of its own. Skip test files (`*.test.*`, `*.contract.ts`, and the api and web test helper folders). Print each hit as `file:line` with the value and the contracts export it belongs to.
- **UI number check.** Fail when a string in web source spells out a limit as a number. At least the patterns `<n>-<m> characters` and `at most <n>`. Skip test files. Print each hit as `file:line`.
- Both run in the root `pnpm lint`, after `build:contracts`.
- Both scripts follow the existing `scripts/` conventions (TypeScript run by Node, linted by `lint:scripts`).

See the Spec's Part 3.

**Allowed packages:** None

**Blocked by:** 02, 03

**Status:** ready-for-agent

- [ ] `pnpm lint` runs both checks and passes on the current code
- [ ] A quoted `ErrorCode`, `RealtimeEvent`, Message kind or Conversation kind value in api or web source fails `pnpm lint` with its location
- [ ] A web string such as `"1-50 characters"` or `"at most 256"` fails `pnpm lint` with its location
- [ ] A value added to one of the four contracts sets is checked with no change to the script

**Verification:** Add a `node --test` script test for each check, run by `pnpm test:scripts`, with one passing and one failing fixture each. Prior art: the docs checker and hook tests under `scripts/`.

**Out of scope:** `no-magic-numbers` (Tickets 05 and 06); checking test files; other enum-like sets beyond the four named.

## Comments
