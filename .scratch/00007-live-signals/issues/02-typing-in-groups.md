# 02: Typing in Groups

**What to build:** Typing Indicators work in Groups. Members see who is typing, and the indicator stays short however many Members type at once (spec 00007, "Domain rules", "HTTP API", "Real-time push" and "SPA"). Touches the api and web packages.

**Demo:** three Users in one Group. As one, two and then three of them type, the others see "X is typing…", "X and Y are typing…" and "Several people are typing…".

- **API:**
  - In a Group, `typing.updated` is emitted to the `conversation:<id>` room, excluding every socket in the typist's own `user:<id>` room, so none of their tabs sees it.
  - A Former Member is rejected the way a send is (`403 NOT_A_MEMBER`), and so is a Closed Group.
  - A removed or departed Member no longer receives it, because they have already left the room.
- **SPA.** The open Conversation tracks each typist separately, each with their own 6 s expiry and clearing rules from ticket 01. It shows:
  - one: "X is typing…"
  - two: "X and Y are typing…"
  - three or more: "Several people are typing…"

**Allowed packages:** None

**Blocked by:** 01

**Status:** resolved

- [x] In a Group, every other Member's sockets receive `typing.updated`, and none of the typist's sockets, on any tab, does
- [x] A removed or departed Member stops receiving typing from that Group
- [x] A Former Member gets `403 NOT_A_MEMBER`, and a Closed Group gets the same rejection as a send to it
- [x] The SPA shows the one, two and three-or-more text. Each typist expires and clears on their own, and one typist's Message clears only that typist.

**Verification:**
- API behaviour tests with several real `socket.io-client` connections, including two sockets for the typist.
- Web behaviour tests with the fake realtime and Vitest fake timers.
- A browser check with three Users in a Group.

**Out of scope:** Typing in the Conversation list. Presence. An opt-out.

## Comments

Resolved. Verified with `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm docs:check` and a browser check: Alice in a Group with Bob, Carol and Dave (the others driven over HTTP; the API ran with `THROTTLE_DISABLED=true` because the login limit was hit). Alice saw one, two, three ("Several people are typing…") and back down as typists stopped, expired or sent a Message, each on their own. A second isolated browser as Bob saw Alice's typing appear, clear when she emptied the composer and clear when she sent. No assumptions beyond the ticket. The web needed no change: ticket 01's per-typist state and text already cover Groups, so the new web tests passed on first run.
