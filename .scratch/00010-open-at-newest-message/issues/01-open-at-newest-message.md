# 01: Open at newest Message

**What to build:** Opening a Conversation lands at its newest Message, however it is opened: a click in the Conversation list, its URL, or a reload. "No messages yet" shows only when the Conversation really has no Messages (spec 00010, "Implementation Decisions"). Touches the web package only, and keep the change as small as possible.

**The cause:** the Conversation view mounts the message scroller only once the first page arrives, so the viewport, the content and every Message mount in one React commit. The shadcn scroller primitive does its first scroll to the end in the content's layout effect, which React runs before it attaches the parent viewport's ref. The scroll finds no viewport, does nothing, and never retries, because auto-scroll is off. The primitive is designed for the viewport to exist before Messages arrive into it.

**The fix:**

- Keep the scroller mounted from the first render of the Conversation view, with an empty list while the first page loads. Messages then arrive into a viewport that already exists, and the primitive's own default scroll to the end applies. Don't add an imperative scroll-to-end on top of today's structure.
- Don't edit the generated shadcn/ui components. Use the props and hooks the scroller already offers.
- Track whether the first page has answered. Show "No messages yet" only after it has answered with no Messages, or straight away for a Direct Conversation that doesn't exist yet (opened with no Conversation ID). While loading, show nothing in its place: no skeleton or spinner.
- Live Messages, sent Messages, the "Jump to latest" button, the at-latest signal that drives mark-read, and history pagination all keep their current rules.

**Allowed packages:** None

**Blocked by:** None

**Status:** ready-for-agent

- [ ] Clicking a long Conversation in the Conversation list opens it at its newest Message, with the "Jump to latest" button hidden
- [ ] Opening a long Conversation from its URL opens it at its newest Message
- [ ] Switching from one Conversation to another lands at the newest Message of the one switched to
- [ ] "No messages yet" doesn't show while the first page is loading
- [ ] "No messages yet" shows for a Conversation whose first page answers with no Messages, and straight away for a new Direct Conversation
- [ ] The existing history pagination, mark-as-read, pane height and live-Message tests pass unchanged

**Verification:**

- Whole-app jsdom tests (MSW and the existing fake layout helper, as in the history pagination tests) that assert the viewport's scroll position, not which scroller function was called. Write them first and show the click and URL tests failing before the fix: the cause is the order of React effects and refs, not real layout, so they are expected to fail in jsdom.
- Tests for the empty state: delay the first page's response and assert "No messages yet" is absent, then answer with no Messages and assert it appears.
- No browser check in this Ticket: Ticket 02 runs it for both fixes.

**Out of scope:** Keeping the view at the newest Message while a short first page loads older pages to fill itself (Ticket 02). Opening at the first Unread Message. A loading skeleton or spinner. Keeping a Conversation's scroll position between visits. Upgrading the scroller package.

## Comments
