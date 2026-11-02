# Spec: Open at Newest Message

Status: resolved

## Problem Statement

When a User opens a Conversation, the message list shows the oldest loaded Messages at the top instead of the newest Message. The User has to scroll down by hand to see what was said last. Short Conversations hide the problem because they fit on screen, so it shows up on any Conversation long enough to scroll.

Two smaller problems sit on the same path:

- When the first page of a Conversation doesn't fill the view, older pages load by themselves to fill it. Each of those loads holds the previous first Message in place, which can also leave the User away from the newest Message.
- While the first page is loading, the view says "No messages yet", even for a Conversation that has Messages.

Reproduced in a real browser: opening a Conversation of a few dozen Messages left the view at the top for as long as it was watched, and the scroller never attempted a scroll to the end.

## Solution

Opening a Conversation always lands at its newest Message, however it is opened, and stays there while older pages load by themselves to fill a short view. Once the User scrolls, reading older history behaves as it does today. "No messages yet" appears only when the Conversation really has no Messages.

The fix is kept as small as possible.

## User Stories

1. As a User, I want a Conversation I click in the Conversation list to open at its newest Message, so that I see what was said last without scrolling.
2. As a User, I want a Conversation I open from its URL to open at its newest Message, so that a link or bookmark behaves like a click.
3. As a User, I want a Conversation to still open at its newest Message after I reload the page, so that a reload doesn't lose my place at the end.
4. As a User, I want a Group to open at its newest Message, so that Groups and Direct Conversations behave the same.
5. As a User, I want a Direct Conversation to open at its newest Message, so that I can reply straight away.
6. As a User, I want a Conversation with Unread Messages to open at its newest Message, so that opening behaves the same every time.
7. As a User, I want switching from one Conversation to another to land at the newest Message of the one I switched to, so that the previous Conversation's position never carries over.
8. As a User, I want a Conversation whose first page is too short to fill the view to stay at its newest Message while older pages load to fill it, so that the extra loading doesn't move me.
9. As a User, I want a Conversation whose whole history fits on screen to show every Message with the newest at the bottom, so that short Conversations look right.
10. As a User, I want the "Jump to latest" button hidden when I open a Conversation, so that it only appears once I have actually scrolled away from the newest Message.
11. As a User, I want my place kept when I scroll up and older Messages load, so that reading history still works as it does today.
12. As a User, I want a Message that arrives while I'm at the newest Message to come into view, so that live Messages still follow me as they do today.
13. As a User, I want a Message that arrives while I'm reading older history to leave my place alone, so that live Messages still behave as they do today.
14. As a User, I want a Message I send to come into view, so that I see it was sent, as today.
15. As a User, I want an empty Conversation to say "No messages yet" and invite me to say hello, so that I know it's empty and not broken.
16. As a User, I want a Conversation that is still loading not to say "No messages yet", so that I'm never told a Conversation with Messages is empty.
17. As a User starting a new Direct Conversation, I want to see "No messages yet" straight away, so that I know I can write the first Message.
18. As a User, I want my Read Marker to move to the newest Message when a Conversation opens at its newest Message in a visible tab, so that my Unread Count clears as it does today.
19. As a Former Member, I want a Group I can only read to open at its newest Message from when I was a Member, so that I see where my part of its history ends.
20. As a User reading a Closed Group, I want it to open at its newest Message, so that I see how it ended.

## Implementation Decisions

- **Root cause.** The Conversation view mounts the message scroller only once the first page arrives, so the viewport, the content and every Message mount in one React commit. The shadcn scroller primitive does its first scroll to the end in the content's layout effect. React runs that effect before it attaches the parent viewport's ref, so the scroll finds no viewport, does nothing, and never retries, because auto-scroll is off. The primitive is designed for the viewport to exist before Messages arrive into it.
- **Fix: keep the scroller mounted from the first render** of the Conversation view, with an empty list while the first page loads. Messages then arrive into a viewport that already exists, and the primitive's own default scroll to the end applies. No imperative scroll-to-end workaround on top of today's structure.
- **The generated shadcn/ui components are not edited.** The fix lives in the Conversation view, through the props and hooks the scroller already offers.
- **Short pages that fill themselves.** The older pages that load automatically because the view isn't full are part of opening. Until the User scrolls, the view stays at the newest Message. After the User has scrolled, prepending older Messages keeps their place, as today.
- **Empty state.** The view tracks whether the first page has answered. "No messages yet" shows only after it has answered with no Messages, or straight away for a Direct Conversation that doesn't exist yet. While loading, the view shows nothing in its place: no skeleton or spinner is added.
- **Unchanged behaviour.** Live Messages, sent Messages, the "Jump to latest" button, the at-latest signal that drives mark-read, and history pagination all keep their current rules.
- **Smallest change.** No new dependency, no change to the scroller's package version, and no change to the API or contracts.

## Testing Decisions

- **A good test** drives the app as a User would and asserts what they would see: where the view sits, and which text is on screen. It doesn't assert which scroller function was called or any internal state.
- **One seam: the whole app in jsdom.** Render the app with MSW faking the network and the existing fake layout helper giving the scroller items a fixed height, then assert the viewport's scroll position. The tests cover:
  - Opening a long Conversation from the list lands at the newest Message.
  - Opening it from its URL lands at the newest Message.
  - A short first page that triggers automatic older-page loads ends at the newest Message.
  - "No messages yet" doesn't show while the first page is loading, and does show for an empty Conversation.
  - After the User scrolls up, loading older history keeps their place (existing tests already cover this and must stay green).
- **Prior art:** the history pagination, mark-as-read and pane height tests, which already drive the scroller through the whole app with the fake layout.
- **Browser check required.** The fake layout uses fixed heights and can't reproduce the timing of real layout. A browser check opens a long and a short Conversation and confirms the newest Message is in view right after opening, with the test data created through the API and removed afterwards.

## Out of Scope

- Opening at the first Unread Message instead of the newest one. That is a separate feature.
- An "Unread Messages" divider or any new marker in the list.
- A loading skeleton or spinner for the first page.
- Changing how live Messages, sent Messages or the "Jump to latest" button behave.
- Edits to the generated shadcn/ui components, or upgrading the scroller package.
- Keeping a Conversation's scroll position between visits.

## Further Notes

- The bug reproduced only in Conversations long enough to scroll. The automatic fill of a short first page and the "No messages yet" flash were found while tracing the same code path.
- No existing test asserts where the view lands when a Conversation opens, which is why the bug went unnoticed. The cause is the order in which React runs effects and attaches refs, not real layout, so the jsdom test for opening a long Conversation is expected to fail before the fix. Confirm it fails first.
