---
kind: intent
---

# API package

The NestJS server on Fastify. It serves the HTTP API, pushes realtime events over Socket.IO and owns the Postgres schema through Drizzle. Only when a change crosses packages: [architecture overview](../../docs/architecture/overview.md).

## Commands

Run from the repo root. Only when the environment isn't ready: [setup](../../docs/workflow/setup.md).

- `pnpm dev:api`: runs the source through `ttsc/register` in watch mode (no build first). Needs the database up (`pnpm db:up`, `pnpm db:migrate`) and `packages/api/.env`.
- `pnpm --filter @chat/api build`, then `start:prod`: the production build and the built output. `build:dev` and `build:clean` also exist. Every `tsc` script passes `--checkers 2`; keep it on new ones. `ttsc` is only the runtime loader (`ttsc/register`).
- `test:watch`, `test:cov`, `test:debug`, `lint:fix` and `format:check` are package scripts. Imports are relative only: there are no tsconfig path aliases, and an alias import fails with TS2307 ([ADR 0010](../../docs/adr/0010-api-uses-relative-imports-no-path-aliases.md)).
- `pnpm build:contracts`, then `pnpm --filter @chat/api test`: needs Docker running. The tests start their own Postgres.
- `pnpm db:generate`: writes a migration after a change to [schema.ts](src/db/schema.ts).
- `pnpm docs:generate`: rewrites the Generated Docs. When to run it: [definition of done](../../docs/workflow/definition-of-done.md).

## Rules

- When writing code here: [API conventions](../../docs/conventions/api.md) and [general conventions](../../docs/conventions/general.md).
- When writing tests: [testing policy](../../docs/workflow/testing-policy.md).
- ADRs, only when the change touches their subject:
  - Realtime: [0001 server-push-only WebSocket](../../docs/adr/0001-websocket-is-server-push-only.md).
  - Input or output handling: [0002 validate input, encode output](../../docs/adr/0002-validate-input-encode-output-no-sanitizer.md).
  - Ordering or Socket.IO rooms: [0006 single instance](../../docs/adr/0006-api-runs-as-a-single-instance.md).
  - Adding a module: [0007 feature modules](../../docs/adr/0007-api-feature-modules-and-nestjs-drizzle.md).

## Database

- The Drizzle schema is the source of truth. Generate migrations with `pnpm db:generate` and never hand-edit them ([ADR 0003](../../docs/adr/0003-drizzle-schema-is-source-of-truth.md)).
- Generated IDs and timestamps are produced by the DB (column defaults, or `now()` / `now() + interval` in SQL), never passed from app code. Pass durations, not `Date`s ([ADR 0004](../../docs/adr/0004-db-generates-ids-and-created-timestamps.md)).
- Avoid nullable columns and prefer DB-generated values (defaults, built-ins like `now()`) ([ADR 0005](../../docs/adr/0005-avoid-nullable-columns-prefer-db-generated-values.md)).

## Reference files

Open these when you need the pattern:

- Adding a feature module: [groups/](src/groups/). Wiring: [app.module.ts](src/app.module.ts).
- Writing tests: [app-harness.ts](test/app-harness.ts) and [people.ts](test/people.ts).
- Looking up the current API without reading code: Generated Docs [ER diagram](../../docs/architecture/er-diagram.md) and [HTTP routes](../../docs/architecture/http-routes.md).
