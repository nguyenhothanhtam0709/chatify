# 01: Type `Tx` as a real transaction

**What to build:** Make `Tx` the type of a real transaction of the injected `Database`, so code that relies on a lock held until commit can't be handed the plain database (spec 00008, "Implementation Decisions"). Behaviour doesn't change: the same SQL runs in the same order. Touches the api package only.

- **`Tx`** is the parameter of the callback that `Database['transaction']` takes, with no `any` and no `eslint-disable`. This shape was typechecked against a scratch copy of the API:

  ```ts
  type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
  ```

  Import `Database` as a type only. Don't make `Tx` a `Pick` of methods, because a `Pick` accepts the plain database. Replace the comment on `Tx`: it must stay a real transaction, because helpers taking it rely on locks held until commit.
- **`Reader`** becomes `Pick<Database, 'select'>`. It stays a `Pick` because rule checks run both inside and outside the Conversation lock.
- **`lockConversation`** takes `Tx` instead of a `Pick` of `execute`. Both callers already pass a real transaction. This change hasn't been typechecked yet, so if it doesn't compile, escalate rather than loosening `Tx`.
- **The seed CLI** calls `drizzle` with the pool and `{ schema }` inline. It doesn't import the database module's factory, because that would load Nest and `@nestjs/drizzle` into the CLI at runtime.

**Allowed packages:** None

**Blocked by:** None

**Status:** ready-for-agent

- [ ] `Tx` has no `any` and no `eslint-disable`, and is derived from `Database`
- [ ] Passing the plain database to `nextSequence` or `lockConversation` fails typecheck
- [ ] `Reader` is picked from `Database`, and rule checks can still be given the plain database
- [ ] The seed CLI builds its database with the schema, and has no runtime import of the database module
- [ ] Existing tests pass with no edits, including the `seedDatabase` test against Postgres

**Verification:** No new tests. To check the second criterion, temporarily pass `this.db` to `nextSequence` and to `lockConversation`, confirm typecheck fails on both, then revert. A manual `pnpm db:seed` isn't required: the seed CLI's wrapper doesn't change and the `seedDatabase` test covers the rest.

**Out of scope:** Moving the CLIs or tests onto Nest or `@nestjs/drizzle`. Using `tx.query`. Giving the migration CLI or migration test helper a schema. Sharing one database factory between the Nest module and the CLIs. Adding a type-level test. Amending Spec 00002 or ADR 0007.

## Comments
