# Spec: Typed Transaction

Status: ready-for-agent

## Problem Statement

The API's shared transaction type, `Tx`, is declared with `any` behind an `eslint-disable`. It is the only rule exception of its kind in the API, and it exists only so the seed CLI's schema-less transaction can be passed to the same helpers as the services' transactions.

There is also a separate gap around the Conversation lock. `Tx` already rejects the plain database, even with the `any`, but `lockConversation` accepts anything that can execute SQL. Passing it the plain database compiles, and the lock would then be released as soon as the statement ends. Message sends and membership changes on that Conversation would no longer be serialised, and nothing would fail at compile time.

The earlier attempt (ticket 06 of spec 00002) stalled on whether the seed CLI could build its database with the schema. That question is now answered: it can.

## Solution

`Tx` is derived from the injected `Database`, with no `any` and no lint exception, and it goes on rejecting the plain database. This removes the exception and gives any future `tx.query` correct types, but adds no transaction safety by itself. `lockConversation` also takes `Tx`, and that is the one new safety gain: passing it the plain database stops compiling. The seed CLI builds its database with the schema so its transaction has the same type, and it stays outside Nest.

Behaviour does not change: the same SQL runs in the same order, and every existing test passes unedited.

## User Stories

1. As a developer, I want `Tx` to have no `any`, so that the API has no exception to the no-`any` rule.
2. As a developer, I want `Tx` to have no `eslint-disable`, so that lint applies to every line of the API without exceptions.
3. As a developer, I want `Tx` derived from `Database`, so that the two cannot drift apart.
4. As a developer, I want passing the plain database as a `Tx` to keep failing typecheck, so that removing the `any` does not lose that protection.
5. As a developer, I want `nextSequence` to keep requiring a real transaction, so that the Conversation counter's row lock is still always held until commit.
6. As a developer, I want `lockConversation` to start requiring a real transaction, so that the lock it takes cannot be released as soon as its statement ends.
7. As a developer, I want `Reader` to pick from `Database` as well, so that `Tx` and `Reader` agree on one source type.
8. As a developer, I want `Reader` to still accept the plain database, so that rule checks can keep running outside the Conversation lock.
9. As a developer, I want a comment on `Tx` saying it must stay a real transaction and why, so that nobody loosens it to a narrower `Pick` to make a call compile.
10. As a developer, I want the seed CLI to keep calling `drizzle` directly, so that seeding still does not load Nest.
11. As a developer, I want the seed helpers to keep sharing `nextSequence` with the services, so that seeded Conversations get their sequences the same way real ones do.
12. As a developer, I want `pnpm db:seed` to keep seeding the same data and skipping when it is already there, so that the local setup is unaffected.
13. As a Member, I want Messages to keep their order in a Conversation, so that this change is invisible to me.
14. As an Implementer, I want this delivered as one Ticket with no dependency changes, so that it stays small and easy to review.

## Implementation Decisions

- **`Tx`** is the parameter of the callback that `Database['transaction']` takes. This shape was typechecked against a scratch copy of the API:

  ```ts
  type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
  ```

  The plain database is not assignable to it, the same as today's `Tx`. A comment on `Tx` replaces the current one and says it must stay a real transaction, because helpers taking it rely on locks held until commit.
- **`Tx` stays a full transaction type, not a `Pick` of methods.** A `Pick` would leave the seed CLI untouched and match how `Reader` is written, but it would accept the plain database, which `Tx` rejects today.
- **`Reader`** becomes a `Pick` of `select` from `Database`. It remains a `Pick` on purpose, because rule checks run both inside and outside the Conversation lock.
- **`lockConversation`** takes `Tx` instead of a `Pick` of `execute`. Both of its callers already pass a real transaction. This is the only new compile-time protection in this Spec.
- **The seed CLI** builds its database inline by calling `drizzle` with the pool and the schema. It does not reuse the database module's factory, because importing that module at runtime would load Nest and `@nestjs/drizzle` into the CLI. The type import of `Database` is erased at compile time, so the seed CLI is not affected by it.
- **Other schema-less `drizzle(pool)` calls stay as they are.** The migration CLI and the migration test helper never pass a transaction to anything typed `Tx`.
- **Spec 00002 and ADR 0007 still hold.** They keep the CLIs and tests on `pg` and `drizzle` directly, outside Nest, and building with the schema is still direct use. A test already does this. Neither document changes.
- **No ADR and no glossary change.** The change is easy to reverse and the comment on `Tx` explains it. `Tx` and `Reader` are code names, not domain terms.
- **No migration, no API change and no dependency change.** Only the API package changes.

## Testing Decisions

- A good test here checks external behaviour, so none is written for the shape of a type. The compiler is the check for the types: typecheck covers both source and tests.
- No new test is added. A test proving the plain database is rejected as a `Tx` would need a type assertion helper, since `@ts-` comments are banned, and the comment on `Tx` was judged enough for a one-line type.
- Existing tests pass with no edits to what they test. That covers behaviour: the same SQL still runs for Messages, Groups and the seed.
- The seed is covered by its existing test, which runs `seedDatabase` against a real Postgres, including rerunning it. The CLI wrapper does not change, so no manual `pnpm db:seed` run is required.

## Out of Scope

- Moving the migration or seed CLIs, or the tests, onto Nest or `@nestjs/drizzle`.
- Using relational queries (`tx.query`). Nothing uses them today, and this Spec does not start.
- Giving the migration CLI or migration test helper a schema.
- Sharing one database factory between the Nest module and the CLIs.
- Adding a type-level test.
- Tightening any other `Pick`-based parameter. `Reader` keeps accepting the plain database.

## Further Notes

- This answers the question left open by ticket 06 of spec 00002, which was closed as `wontfix` and moved to a brief for this work.
- Typecheck in a scratch copy of the API: a derived `Tx` alone gave two errors, both in the seed CLI. The full change, including `Reader` and `lockConversation`, gave none.
- The same copy showed which calls reject the plain database. Today `nextSequence` rejects it and `lockConversation` accepts it. After the full change both reject it.
- Not yet proven: lint and tests have not been run on any of this. The Ticket's checks cover them.
