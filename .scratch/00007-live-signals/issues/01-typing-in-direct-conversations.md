# 01: Typing in Direct Conversations (tracer bullet)

**What to build:** In a Direct Conversation, each User sees "Alice is typing…" while the other User writes (spec 00007, "Domain rules", "HTTP API", "Real-time push" and "SPA"; ADR 0009). Typing is relayed and never stored. Touches the api, contracts and web packages.

**Demo:** two browsers signed in as two Users with the same Direct Conversation open. Typing in one shows the indicator in the other. It clears when the Message arrives, when the composer is cleared, or after about 6 s idle.

- **API.** `POST /api/v1/conversations/:id/typing` with body `{ state: 'typing' | 'stopped' }`, returning `204`. Nothing is stored, in the database or in memory.
  - Access checks and error codes are the same as for sending a Message to an existing Conversation, reusing the existing membership rules.
  - No Conversation row lock and no commit-order serializer.
- **Rate limit.** A dedicated limit of 2 requests per 2 s, keyed by User and Conversation, separate from the generic limit. If the throttler can't do this without a new package, escalate.
- **Push.** `typing.updated` with `{ conversationId, state, user: { id, username, nickname } }`, to the other User's `user:<id>` room. Typing pushes are logged at debug level, with the usual fields and no payload.
- **SPA sending:**
  - The composer sends `typing` on input, at most once every 3 s while input continues.
  - It sends `stopped` when the composer is cleared, or loses focus without a send, after a `typing` was sent.
  - Failures and `429`s are ignored silently.
- **SPA receiving.** For the open Conversation, the SPA shows "X is typing…", using the Nickname or else the Username.
  - It expires 6 s after the last signal, unless a new signal refreshes it.
  - `stopped`, a `message.created` from the typist, switching Conversation, or losing the connection clears it.
- Contracts: the request schema and the `typing.updated` event.

**Allowed packages:** None

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] A Member gets `204`, and the other User's sockets receive `typing.updated` with the right payload. None of the typist's own sockets receives it.
- [x] A never-Member gets `404 CONVERSATION_NOT_FOUND`, and an invalid `state` gets `400 VALIDATION_FAILED`
- [x] The third request within 2 s for the same User and Conversation gets `429 RATE_LIMITED`. Typing doesn't consume the generic limit, and a different Conversation isn't throttled.
- [x] Typing pushes don't appear in logs at the default level
- [x] The SPA shows "X is typing…" with the Nickname or else the Username, keeps it while refreshed, and clears it on `stopped`, on the typist's Message, after about 6 s, on switching Conversation and on losing the connection
- [x] The composer sends `typing` at most every 3 s, sends `stopped` on clear or blur, and sends nothing more for text left untouched. A failed or rate-limited request shows no error.
- [x] The new schemas have contracts tests

**Verification:**
- API behaviour tests with a real `socket.io-client`, with lowered limits in test config and the in-memory log destination.
- Web behaviour tests with the fake realtime and Vitest fake timers.
- A browser check with two Users in two browser profiles.

**Out of scope:** Groups, the multi-typist text, and Former Member and Closed Group handling (ticket 02). Presence. An opt-out.

## Comments

Resolved. Verified with `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm docs:check` and a browser check with two Users in two isolated browser contexts (Alice typing showed "alice is typing…" for Bob, and it faded after about 6 s). Assumption: Groups get no push yet (ticket 02): `signalTyping` relays only in Direct Conversations, after the same membership checks as a send. The SPA also already has the one/two/several text.
