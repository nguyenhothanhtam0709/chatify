---
kind: descriptive
---

# Runtime flows

What holds on the main paths today and can't be seen by reading one file. Hand-written from the code; if this page and the code disagree, the code wins and this page is the defect. Package ownership is in [overview.md](overview.md). Routes, event payloads and tables are in the Generated Docs next to this page.

## Sign-up, login and session refresh

- Sign-up only creates the User and does not sign them in. This is intended MVP1 behaviour.
- A signed-out visitor sent to `/login` keeps the path and query they asked for in router location state, never in the URL. The Sign up link and the "Account created" card's Log in link carry it along. After login it is followed only when it is a same-origin path other than `/login` or `/signup`; otherwise login goes to `/`.
- The web app keeps the access token only in memory, so every page load first trades the refresh cookie for one.
- The refresh cookie is `httpOnly`, `secure`, `sameSite=strict`, scoped to path `/api/v1/auth`.
- Refresh tokens are opaque and stored only as a hash. One conditional UPDATE rotates them. A token that is unknown, expired or already rotated away gets `401`, and the replay deletes the session that rotated it away.
- A request is accepted only if the access token verifies, is not on the deny-list, and its session still exists. Logout denies the token, deletes the session and pushes `session.revoked` to that session's sockets, so its other tabs sign out.

## Opening the socket

- A socket joins rooms for the User, the session and each Group the User is a current Member of.
- Group rooms are re-checked against the database after joining, so a membership change committed during the handshake is not missed.
- The access token is checked only at connect. A token that expires later does not close the socket.

## Sending a Message

- HTTP carries the write and the socket only delivers the result (ADR 0001). The sender gets the Message in the HTTP response and also over the socket; the web app merges the two by ID.
- The send transaction locks the Conversation row, requires that the sender is a Member, bumps `last_sequence` and inserts the Message.
- A reused `clientMessageId` from the same sender rolls back and returns `200` with the original Message and no push. A failed send's Retry reuses the id, so a retry can't duplicate.
- After the commit, a send waits for earlier commits of the same Conversation to finish their push (`CommitOrder`). This relies on the API being a single process (ADR 0006).
- A push is best effort: a failure is logged and never fails the send.
- The first Message to a User with no Direct Conversation goes to `POST /direct-messages`, which creates the Direct Conversation in the same transaction and pushes `conversation.created` to the recipient before the Message.
- Pushes for a Group go to its room, and for a Direct Conversation to each Member's User room.

## Read state

- A Member's Read Marker is a column on their membership row, so leaving or removal deletes it and a re-added Member starts fresh. It starts at the start of their membership period, so nothing from before joining is unread.
- `PUT /conversations/:id/read` moves the marker to the larger of the current one and `upToSequence`, clamped to the Conversation's last sequence, in one conditional UPDATE. It takes no Conversation lock and does not wait on `CommitOrder`. A Former Member has no row and gets `403`.
- Sending also moves the sender's own marker to the new Message, in the send transaction.
- Only a move pushes anything: `conversation.read` to the reader's own User room, which syncs their other tabs, and in a Direct Conversation `conversation.receipt` to the other User when both share read receipts. The setting is read after the commit, so turning it off stops later receipts. Like every push, these are best effort.
- The Unread Count is computed per Conversation in the list query: other Members' `text` Messages after the marker, capped at 100. A Former Member and a Closed Group always get 0.
- The web app marks read, debounced and retried, only while the tab is visible and the view is at its latest Message. A Message pushed while the User is reading adds nothing to the count.
- A `conversation.read` that covers the entry's last Message clears its badge. One that doesn't makes the list reload from the server, as does a `conversation.read` or `conversation.created` that lands during a list request. A `message.created` that lands during a list request is replayed onto its response, and one at or below the entry's last sequence is already counted.
- A Direct Conversation's open view gets the other User's marker from `GET /conversations/:id` (`readUpToSequence`, present only when both share receipts) on open and after a reconnect, then from `conversation.receipt`. It only moves forward.

## Loading a Conversation and its history

- A reader sees only Messages whose sequence falls inside one of their membership periods. That is how a Former Member keeps what they were present for and nothing later.
- The Conversation list stays current from pushes, including each entry's last-Message preview and Unread Count. It reloads when a push names a Conversation it doesn't list, or when a Group ends for the User.
- After the socket reconnects, the web app reloads the list and fetches the open Conversation's Messages with `?after=` its newest sequence, page by page, merging by ID.

## Typing Indicator

- `POST /conversations/:id/typing` (`typing` or `stopped`) is relayed and never stored (ADR 0009). It takes no Conversation lock and does not wait on `CommitOrder`; access is the same as for sending a Message. The reply is `204`.
- `typing.updated` goes to the other User of a Direct Conversation, or to a Group's room except every socket of the typist. Like every push it is best effort, and it is logged at debug rather than info.
- It is limited to 2 per 2 s per User and Conversation once authenticated. Before authentication it is limited per IP, with its own counter, so the generic limit doesn't count typing.
- The receiving view owns the expiry: it drops a Member 6 s after their last signal, on `stopped`, on a Message from them, and when the socket is disconnected.
- The composer sends `typing` on input, repeated at most every 3 s, and `stopped` when the text is emptied or the textarea loses focus. Sending a Message sends no `stopped`, because the Message clears the indicator. A view with no Conversation yet sends nothing.
