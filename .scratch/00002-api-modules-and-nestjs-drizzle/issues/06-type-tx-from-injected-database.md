# 06: Type `Tx` from the injected `Database` instead of `any`

**What to build:** `Tx` in `messages/message-rows.ts` is `PgTransaction<NodePgQueryResultHKT, any, any>` with an `eslint-disable`, so helpers that take a transaction lose schema typing. Derive it from the shared `Database` type (for example from `Database['transaction']`) so the schema is checked, and keep `Reader` consistent with it.

**Blocked by:** None (can start immediately)

**Status:** wontfix

**Question for the human:** a schema-typed `Tx` breaks `src/db/seed.ts`, whose schema-less `drizzle(pool)` transaction is not assignable to it (tried in the review-fixes work). The spec says the seed CLI keeps using `drizzle` directly. Is it OK to change `seed.ts` (and any test setup) to build its database with `{ schema }`, or should the `any` stay?

- [ ] `Tx` is derived from `Database`, with no `any` and no `eslint-disable`
- [ ] `Reader` and `Tx` agree about the schema
- [ ] Typecheck, lint and all existing tests pass without edits to test behaviour

## Comments

2026-10-31, the human's decision: closed here because the Spec is resolved. The question moves to [spec 00008](../../00008-typed-transaction/spec.md).
