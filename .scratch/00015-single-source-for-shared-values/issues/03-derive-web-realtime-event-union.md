# 03: The web realtime event union is derived from contracts

**What to build:** The web app writes out its own union of realtime events, one hand-typed event name per member (`'message.created'`, `'group.member_added'`, …). Contracts already define these names in `RealtimeEvent` and the payloads in `RealtimeEventSchemas`. When contracts add an event, the web union does not change and nothing fails to compile. Derive the union instead. Touches web and docs. Rules:

- The web `RealtimeEvent` type becomes a mapped type over `RealtimeEventSchemas`: for each event name, `{ type: <name> }` together with that event's inferred payload. Every event, `session.revoked` included, is already in contracts, so nothing stays hand-typed.
- Code that narrows on `event.type` keeps working with no casts.
- Docs: in the contracts conventions, add the Enums and codes rule from the Spec's Implementation Decisions → Docs. A subset of a shared set is derived with `Extract<…>`, never re-typed, and a map over a whole set uses `satisfies Record<…, …>`.

See the Spec's Part 2.

**Allowed packages:** None

**Blocked by:** None

**Status:** ready-for-agent

- [ ] The web realtime event type contains no hand-typed event name; it is derived from `RealtimeEventSchemas`
- [ ] Adding an event to `RealtimeEventSchemas` adds it to the web type with no web edit
- [ ] The contracts conventions have the `Extract` / `satisfies Record` rule

**Verification:** `pnpm typecheck` is the test. The existing web realtime tests must pass unchanged. To show the type is derived, temporarily add a dummy event to `RealtimeEventSchemas`, check that it appears in the web type (for example, a narrowing on its name compiles), then revert.

**Out of scope:** Changing any event's payload or name; `switch-exhaustiveness-check` for web (left off on purpose, see the Spec's Part 3).

## Comments
