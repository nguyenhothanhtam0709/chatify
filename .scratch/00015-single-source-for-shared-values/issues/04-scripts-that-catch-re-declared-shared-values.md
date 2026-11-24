# 04: Scripts catch re-declared shared values

**What to build:** Two checks that fail when a value contracts owns is written again in api or web source, so the next re-declaration is caught before review. Touches scripts and the root `lint` script. Rules:

- **Literal check.** Import the built contracts, read every value of `ErrorCode`, `RealtimeEvent`, `MESSAGE_KINDS` and `CONVERSATION_KINDS`, and fail when any value appears as a quoted string literal in api or web source. The script reads the values from contracts every run and keeps no list of its own. Skip test files (`*.test.*`, `*.contract.ts`, and the api and web test helper folders). Print each hit as `file:line` with the value and the contracts export it belongs to.
- **UI number check.** Fail when a string in web source spells out a limit as a number. At least the patterns `<n>-<m> characters` and `at most <n>`. Skip test files. Print each hit as `file:line`.
- Both run in the root `pnpm lint`, after `build:contracts`.
- Both scripts follow the existing `scripts/` conventions (TypeScript run by Node, linted by `lint:scripts`).

See the Spec's Part 3.

**Allowed packages:** None

**Blocked by:** 02, 03

**Status:** needs-info

- [ ] `pnpm lint` runs both checks and passes on the current code
- [ ] A quoted `ErrorCode`, `RealtimeEvent`, Message kind or Conversation kind value in api or web source fails `pnpm lint` with its location
- [ ] A web string such as `"1-50 characters"` or `"at most 256"` fails `pnpm lint` with its location
- [ ] A value added to one of the four contracts sets is checked with no change to the script

**Verification:** Add a `node --test` script test for each check, run by `pnpm test:scripts`, with one passing and one failing fixture each. Prior art: the docs checker and hook tests under `scripts/`.

**Out of scope:** `no-magic-numbers` (Tickets 05 and 06); checking test files; other enum-like sets beyond the four named.

## Comments

### Implementer question (needs-info)

**Tried:** WIP literal and UI number checks in `scripts/shared-values/` (reads `ErrorCode`, `RealtimeEvent`, `MESSAGE_KINDS`, `CONVERSATION_KINDS` from `packages/contracts/dist`; skips tests, `*.contract.ts`, `/test/` folders). Against current code the literal check reports 106 hits and the UI number check 1.

**Why "passes on the current code" fails:** the hits are mostly not re-declarations.

- About 90 are real uses in web and api: `kind === 'group'`, `case 'direct'`, `{ type: 'conversation.read' }`, the `'text'` message kind, SQL and drizzle fragments in `packages/api/src/db/schema.ts` and `conversation-queries.ts`, and `seed.ts`. The Spec says `ErrorCode` is not re-declared, yet `ErrorCode` strings appear in `conversation-rules.ts` and `web/src/api/conversations.ts`.
- About 10 are false positives on unrelated words: shadcn `components/ui/*` (`"group"` as a CSS class or slot), and `login-form.tsx` / `signup-form.tsx` (`"text"` as an input type).
- UI number check: `packages/web/src/shell/NewConversationDialog.tsx:77` says "Type at least 2 characters to search." It matches my extra `at least <n>` pattern; the Ticket only requires `at most <n>` and `<n>-<m> characters`.

**Options:**

1. Keep the Ticket as written and fix the ~100 sites here (far beyond "Allowed packages: None").
2. Narrow the check: skip `components/ui/`, `type="text"` and SQL fragments. A grep cannot tell a real use from a re-declaration reliably.
3. Land the scripts with a baseline of existing hits (file and value), fail only on new ones, and add a follow-up Ticket to clear the baseline. Drop `at least` from the patterns. Recommended.
4. Replace the grep with a type-aware lint rule.

**Blocked:** the whole Ticket until the human picks an option. WIP committed; no script tests written yet.
