# Spec: Live Signals (Typing Indicators)

Status: resolved

## Problem Statement

While a User waits for a reply, nothing tells them whether the other person is writing one. In a quiet Conversation they cannot tell "nobody is answering" from "someone is answering right now", so they send follow-ups, switch away, or talk over each other in a Group. MVP1 left typing indicators and presence out on purpose (MVP1 spec, Out of Scope). This spec covers typing. Presence is a later slice.

## Solution

When a Member is writing in a Conversation, the other Members who have it open see a **Typing Indicator**: "Alice is typing…", "Alice and Bob are typing…", or "Several people are typing…". It appears within moments of the Member starting to type. It disappears as soon as their Message arrives, when they clear the composer or leave it, or by itself a few seconds after they stop typing.

Typing is never stored. The server relays each signal to the other Members and keeps no record or timer, so a restart or a lost signal costs nothing worse than an indicator that fades early or late by a few seconds.

## User Stories

1. As a Member, I want to see when another Member is typing in the Conversation I have open, so that I know a reply is coming.
2. As a Member of a Direct Conversation, I want to see "Alice is typing…" when the other User writes, so that I wait instead of sending a follow-up.
3. As a Member of a Group, I want to see who is typing when one or two Members are, so that I know whose reply is coming.
4. As a Member of a Group, I want "Several people are typing…" when three or more Members are typing, so that the indicator stays short.
5. As a Member, I want typing shown with the typist's Nickname, or their Username when they have none, so that I recognise them the same way as everywhere else.
6. As a Member, I want the indicator for a Member to disappear the moment their Message arrives, so that I don't see "typing" next to the Message they just sent.
7. As a Member, I want the indicator to disappear when the typist clears their composer or leaves it, so that I am not told someone is writing when they gave up.
8. As a Member, I want the indicator to fade by itself a few seconds after the typist stops typing, so that a closed tab or a lost connection never leaves a stuck indicator.
9. As a Member, I want the indicator to stay visible while the other Member keeps typing, so that it does not flicker during a long Message.
10. As a Member, I want never to see my own typing indicator, on this tab or any of my other tabs and devices, so that the indicator is only about other people.
11. As a Member, I want typing indicators shown only for the Conversation I have open, so that they don't distract me elsewhere.
12. As a Member, I want my typing to be signalled only while I am actually typing, so that leaving text in the composer does not keep telling others I am writing.
13. As a Former Member, I want to be unable to send typing signals to a Group I left or was removed from, so that only Members can signal.
14. As a Former Member, I want to stop receiving typing signals from a Group once I leave or am removed, so that its activity stays private.
15. As a User, I want a Closed Group to accept no typing signals, so that a read-only record stays quiet.
16. As a non-Member, I want any attempt to signal typing in a Conversation I was never part of to look like the Conversation does not exist, so that its existence is not leaked.
17. As a Member, I want typing signals to be rate limited separately from my other actions, so that typing can never use up the allowance for sending Messages or other requests.
18. As a Member, I want a rate-limited or failed typing signal to fail silently, so that a missing indicator never shows me an error.
19. As a Member, I want typing indicators to clear when my connection drops, so that I never see a stale indicator from before a reconnect.
20. As an operator, I want typing pushes logged without flooding the logs, so that tracing other events stays practical.
21. As a developer, I want the typing request and the typing push event defined in contracts, so that the API and the SPA validate against the same shapes.
22. As a developer, I want typing to keep no server state, so that it keeps working unchanged when the API scales out.

## Implementation Decisions

### Domain rules

- A **Typing Indicator** is ephemeral. It is never stored, and the server keeps no state or timer for it (ADR 0009, ephemeral kind).
- Only current Members may signal typing, and only current Members receive it. The typist never receives their own signal on any of their sockets.
- The receiving client owns the expiry. An indicator shows for about **6 s** after the last signal from that Member, unless a newer signal refreshes it, a `stopped` signal clears it, or a `message.created` from that Member in that Conversation clears it.
- The sending client signals `typing` when the User types in the composer, and then at most every **3 s** while they keep typing. Text left in the composer with no keystrokes sends nothing, so the indicator fades on the other side. It signals `stopped` when the composer is cleared or loses focus with no Message sent. Sending a Message needs no `stopped`, because the Message itself clears the indicator.

### HTTP API

- **Signal typing**: `POST /conversations/:id/typing` with body `{ state }`, where `state` is `typing` or `stopped`.
  - Response `204`. Nothing is stored.
  - Access checks are the same as for sending a Message to an existing Conversation, with the same error codes. A never-Member gets `404 CONVERSATION_NOT_FOUND`, a Former Member gets `403 NOT_A_MEMBER`, and a Closed Group is rejected the way a send to it is. The implementer reuses the existing membership rules rather than restating them.
  - It takes no Conversation row lock and does not go through the commit-order serializer. Ordering against Messages doesn't matter, because a late typing signal just expires.
- **Rate limit**: a dedicated limit keyed by User and Conversation, separate from the generic 120 / min / User. It is **2 requests per 2 s**, enough for a refresh plus a `stopped`. A request over the limit gets `429 RATE_LIMITED` as usual. If the existing throttler can't key by Conversation without a custom tracker, the implementer adds one; that is not a new package. If it would need one, escalate.

### Real-time push

- `typing.updated` with payload `{ conversationId, state, user }`, where `user` is the typist's `{ id, username, nickname }`. It is the same shape as a System Message's subject, so the SPA can show the name without fetching Group details.
- **Group**: emitted to the `conversation:<id>` room, excluding every socket in the typist's own `user:<id>` room.
- **Direct Conversation**: emitted to the other User's `user:<id>` room, since Direct Conversations have no room.
- Removing a Member or a Member leaving already takes their sockets out of the Group room (MVP1), so a Former Member stops receiving typing with no extra rule.
- **Logging**: `typing.updated` pushes are logged at debug level, not at the level used for other pushes, because they are frequent. The fields are the same (event name, target count, Conversation ID, no payload). This is a deliberate exception to the MVP1 rule that every push is logged.

### Contracts

- The typing request schema (`state` enum).
- The `typing.updated` event in the event catalogue.

### SPA

- **Sending.** The composer sends `typing` on input, throttled to at most once every 3 s while input continues. It sends `stopped` when the composer is cleared, or loses focus without a send, after a `typing` was sent. Failures and `429`s are ignored silently.
- **Receiving.** The SPA keeps, per open Conversation, the set of Members currently typing, each with an expiry 6 s after their last signal.
  - `typing.updated` with `typing` adds the Member or refreshes their expiry.
  - `stopped` removes them, as does a `message.created` from them in that Conversation, or the expiry passing.
  - Switching Conversation or losing the connection clears the set.
- **Display.** Shown near the composer, inside the Conversation view only, using each typist's Nickname or else their Username:
  - one typist: "X is typing…"
  - two: "X and Y are typing…"
  - three or more: "Several people are typing…"
- Components follow the existing shadcn conventions of the web package.

## Testing Decisions

- **Good tests check external behaviour only.** They drive the system through its public seam and assert on what a client or user can observe: status codes, `ErrorCode`s, pushed events, rendered UI. They never reach into services, repositories or component internals.
- **Seams** (all existing, no new seam):
  1. **API behaviour test** (prior art: the Groups and Group-room tests, the app harness and a real `socket.io-client`). It covers:
     - `204` for a Member;
     - the event reaching the other Members' sockets with the right payload, in both Groups and Direct Conversations;
     - no event on any of the typist's own sockets;
     - a removed Member no longer receiving it;
     - `404` for a never-Member, `403` for a Former Member, and the Closed Group rejection matching a send;
     - the dedicated rate limit (lowered in test config, as with the other limits) not consuming the generic one;
     - typing pushes absent from logs at the default level, using the in-memory log destination.
  2. **Web behaviour test** (prior art: the login test, MSW and the fake realtime). It covers:
     - the one, two and three-or-more text;
     - Nickname with a fallback to Username;
     - clearing on a `message.created` from the typist, on `stopped`, and on switching Conversation;
     - expiry after about 6 s and a refresh keeping it shown;
     - the composer sending `typing` at most every 3 s and `stopped` on clear or blur;
     - no indicator for the User's own events.

     Time is controlled with Vitest's fake timers, a test clock and not a mock of our own code, consistent with the testing policy's rule against real sleeps.
  3. **Contracts test** (prior art: the realtime contract tests). It covers the request and event schemas.
- Strict test-first with the `tdd` skill, one behaviour at a time.

## Out of Scope

- **Presence** (online and offline status). It is a later slice of Live Signals with its own spec, after this ships. Still open: how multiple tabs and devices count as online, who can see a User's presence (the app has no contacts), and the offline timeout. Its known constraint: it keeps in-memory connection state, which must move to Redis together with the scale-out change (ADR 0009, `docs/laters.md`, "Scale out the API").
- An opt-out from Typing Indicators.
- Typing indicators in the Conversation list or anywhere outside the open Conversation.
- Server-side typing timers or any stored typing state.
- Read State (spec 00006).
- Horizontal scaling (ADR 0006). A stateless relay needs no change for it beyond the Socket.IO Redis adapter.

## Further Notes

- Domain term: Typing Indicator is defined in `GLOSSARY.md`.
- ADR 0009 sets the pattern: client signals are HTTP writes with a socket push, and typing is the ephemeral kind. It extends ADR 0001, under which the socket stays server-push only and client-emitted events are still ignored.
- Three decisions sharpened while writing this spec:
  - The rate limit is 2 per 2 s, not the 1 per 2 s floated in the design session, so a `stopped` right after a refresh is not throttled.
  - The push carries the typist's Username and Nickname.
  - Typing pushes are logged at debug level.
- The new route changes the HTTP routes Generated Doc. Regenerate it per the definition of done.
- This spec does not depend on spec 00006, and either can ship first.
- Tickets (in `issues/`), each a PR:
  1. Typing in Direct Conversations, end to end (the tracer bullet).
  2. Typing in Groups: the room relay, Former Members and Closed Groups, and the multi-typist text.
