---
kind: intent
---

# Contracts package

The Zod schemas and types that api and web share: HTTP bodies, error codes and realtime events. Both import it from `dist`. Only when a change crosses packages: [architecture overview](../../docs/architecture/overview.md).

## Commands

Run from the repo root. Only when the environment isn't ready: [setup](../../docs/workflow/setup.md).

- `pnpm build:contracts`: rebuilds `dist` through `ttsc` (`--checkers 2`). Run it after a change so api and web see it. `build:dev`, `build:clean`, `test:cov` and `lint:fix` also exist.
- `pnpm --filter @chat/contracts test`: needs nothing. No database, no Docker.
- `pnpm docs:generate`: rewrites the Generated Docs. When to run it: [definition of done](../../docs/workflow/definition-of-done.md).

## Rules

- When writing code here: [contracts conventions](../../docs/conventions/contracts.md) and [general conventions](../../docs/conventions/general.md).
- When writing tests: [testing policy](../../docs/workflow/testing-policy.md).
- ADRs, only when the change touches their subject:
  - Realtime events: [0001 server-push-only WebSocket](../../docs/adr/0001-websocket-is-server-push-only.md).
  - Validating input: [0002 validate input, encode output](../../docs/adr/0002-validate-input-encode-output-no-sanitizer.md).

## Never

- Never ship a breaking schema change alone. It updates api and web in the same PR ([breaking changes](../../docs/conventions/contracts.md#breaking-changes)).

## Reference files

Open these when you need the pattern:

- Exports: [index.ts](src/index.ts). Errors: [error.ts](src/error.ts). Realtime events: [realtime.ts](src/realtime.ts).
- Writing tests: [group.test.ts](src/group.test.ts).
- Looking up events without reading code: Generated Doc [realtime events](../../docs/architecture/realtime-events.md).
