---
kind: intent
---

# API conventions

Rules for `packages/api`, on top of the [general conventions](general.md).

## Modules

- One feature is one folder holding its controller, service, module and tests. `AppModule` only imports modules (ADR 0007).
- No import cycles. Give a shared leaf its own module. Use `@Global()` only for Clock, Database and Logging.

## Controllers

- Controllers are thin: validate, call one service method, return the contract type. No database access and no business rules.
- Validate bodies and queries with `ZodValidationPipe` and a contracts schema, and path ids with `ZodValidationPipe(z.uuid())`.
- Handlers return contracts types and set the status with `@HttpCode`. Responses are not validated on output (ADR 0002). Use `@Res({ passthrough: true })` only when the status depends on the outcome, as the idempotent resend in `messages.controller.ts` does.
- Every non-public route uses `@UseGuards(AuthGuard)` and reads the caller with `@Auth()`. Only register, login, refresh and health are public.

## Services and database access

- Services get the database with `@InjectDrizzle() private readonly db: Database`. Only CLIs and tests call `drizzle(pool)` (ADR 0007).
- Run multi-step writes in `db.transaction`. Re-check rules that depend on membership under the Conversation lock.
- Shared access rules are `require*` helpers that take a `Reader`. Shared queries live in `*-queries.ts` and row mapping in `message-rows.ts`. A query only one service uses may stay private in that service.

## Errors

- Throw domain failures as `DomainException(ErrorCode, HttpStatus, message, details?)`. The one `AllExceptionsFilter` maps everything else.
- Throw `DomainException` inline by default. Add a named factory once two or more places throw the same error, like `conversationNotFound()`.
- Map Postgres constraint violations to domain errors by constraint name, like `users_username_lower_unique` in `auth.service.ts`.

## Throttling

The global default limit comes from `ThrottlingModule` and `AppThrottlerGuard`. Named throttlers keyed by User (search, send, typing) are set in the module. Per-IP limits are `@Throttle` on the route. The exception is `typingIp`, a named per-IP throttler with its own counter, so typing doesn't count against the default limit.

## Config and logging

- Read config only through `loadConfig` or `ConfigService<Config, true>`.
- The server logs through the injected pino (`PINO`).

## Tests

- Tests run the real app against Testcontainers Postgres through `withApp`. Adapters of one port share a `*.contract.ts` suite.
- Create test Users with `signUp` from `test/people.ts`.
