# 07: Clear the literal check baseline

**What to build:** Replace each quoted `ErrorCode`, `RealtimeEvent`, Message kind and Conversation kind value listed in `scripts/shared-values/literal-baseline.json` with the contracts export (`ConversationKind`/`CONVERSATION_KINDS`, `MessageKind`, `RealtimeEvent.X`, `ErrorCode.X`), then delete each entry as its code is fixed (the literal check fails on an entry that no longer matches). Where a literal cannot import from contracts (for example a SQL fragment or a drizzle `check`), say why in the Ticket's Comments and keep a documented exemption in the script instead of the baseline. Touches api, web and scripts.

**Allowed packages:** None

**Blocked by:** 04

**Status:** resolved

- [ ] `scripts/shared-values/literal-baseline.json` is empty (`[]`) or removed, with every remaining exemption explained in the script
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass with the behaviour unchanged

**Verification:** The existing tests; the literal check itself.

**Out of scope:** New contracts constants; other enum-like sets.

## Comments

Triaged by the human on 2026-11-24: run in this feature.

Resolved. `literal-baseline.json` is `[]`. Contracts has no `ConversationKind`/`MessageKind` constant objects and the Ticket forbids new ones, so kinds use the existing zod enum accessor (`ConversationKindSchema.enum.group`, `MessageKindSchema.enum.text`; `typeof` of it in type positions). Events use `RealtimeEvent.X`. `ErrorCode` had no hits. SQL in `conversation-queries.ts` binds the kind as a parameter; the two `check`s in `schema.ts` use the existing `sqlList` raw helper (a check cannot take a bound parameter); `pnpm db:generate` reports no schema change. Exemptions kept in `literal-check.ts` as line shapes, not files: `type="text"` (HTML input type, login and signup forms) and `readProperty(..., 'text')` (a pg wire property in `instrument-pool.ts`). No assumptions.
