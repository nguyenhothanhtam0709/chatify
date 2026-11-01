# 01: Type `Tx` as a real transaction

**What to build:** Derive `Tx` from the injected `Database` to remove its `any`, and make `lockConversation` take `Tx` so it can't be handed the plain database (spec 00008, "Implementation Decisions"). `Tx` already rejects the plain database, so `lockConversation` is the only new safety gain. Behaviour doesn't change: the same SQL runs in the same order. Touches the api package only.

- **`Tx`** is the parameter of the callback that `Database['transaction']` takes, with no `any` and no `eslint-disable`. This shape was typechecked against a scratch copy of the API:

  ```ts
  type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
  ```

  Import `Database` as a type only. Don't make `Tx` a `Pick` of methods, because a `Pick` accepts the plain database, which `Tx` rejects today. Replace the comment on `Tx`: it must stay a real transaction, because helpers taking it rely on locks held until commit.
- **`Reader`** becomes `Pick<Database, 'select'>`. It stays a `Pick` because rule checks run both inside and outside the Conversation lock.
- **`lockConversation`** takes `Tx` instead of a `Pick` of `execute`. Both callers already pass a real transaction, and the full change typechecked in the scratch copy. If it doesn't compile, escalate rather than loosening `Tx`.
- **The seed CLI** calls `drizzle` with the pool and `{ schema }` inline. It doesn't import the database module's factory, because that would load Nest and `@nestjs/drizzle` into the CLI at runtime.

**Allowed packages:** None

**Blocked by:** None

**Status:** resolved

- [x] `Tx` has no `any` and no `eslint-disable`, and is derived from `Database`
- [x] Passing the plain database to `nextSequence` or `lockConversation` fails typecheck
- [x] `Reader` is picked from `Database`, and rule checks can still be given the plain database
- [x] The seed CLI builds its database with the schema, and has no runtime import of the database module
- [x] Existing tests pass with no edits, including the `seedDatabase` test against Postgres

**Verification:** No new tests. To check the second criterion, temporarily pass `this.db` to `nextSequence` and to `lockConversation`, confirm typecheck fails on both, then revert. Only the `lockConversation` failure is new: `nextSequence` already fails today. A manual `pnpm db:seed` isn't required: the seed CLI's wrapper doesn't change and the `seedDatabase` test covers the rest.

**Out of scope:** Moving the CLIs or tests onto Nest or `@nestjs/drizzle`. Using `tx.query`. Giving the migration CLI or migration test helper a schema. Sharing one database factory between the Nest module and the CLIs. Adding a type-level test. Amending Spec 00002 or ADR 0007.

## Comments

Resolved. Verified with `pnpm lint`, `pnpm typecheck`, `pnpm test` (api suite 312/312, no test edits, including the `seedDatabase` test against Postgres) and `pnpm docs:check`. Temporarily passing `this.db` to `lockConversation` and `nextSequence` failed typecheck on both (TS2345); reverted. No follow-ups. Assumptions: none.
