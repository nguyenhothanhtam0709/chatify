# 02: Stay at newest Message while a short page fills itself

**What to build:** When the first page of a Conversation doesn't fill the view, the older pages that load by themselves to fill it keep the view at the newest Message, until the User scrolls. Then the Spec's one browser check runs for both of this Spec's fixes (spec 00010, "Implementation Decisions"). Touches the web package only, and keep the change as small as possible.

**The rule:**

- The automatic loads of older pages that happen because the view isn't full are part of opening. Until the User scrolls, the view stays at the newest Message after each one.
- Today each prepend holds the previous first Message in place (the scroller's preserve-on-prepend), which can leave the User away from the newest Message. That stays the behaviour once the User has scrolled: reading older history keeps their place, as today.
- Don't edit the generated shadcn/ui components. Use the props and hooks the scroller already offers.

**Allowed packages:** None

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] A Conversation whose first page doesn't fill the view ends at its newest Message after the automatic older-page loads, with the "Jump to latest" button hidden
- [ ] After the User scrolls up, loading older Messages keeps the Message they were reading in place
- [ ] The existing history pagination, mark-as-read and live-Message tests pass unchanged
- [ ] The browser check is done and recorded in the PR

**Verification:**

- A whole-app jsdom test (MSW and the existing fake layout helper, as in the history pagination tests) with a first page too short to fill the view and older pages behind it. Assert the viewport's scroll position at the end. Write it first and show it failing.
- One browser check, following the browser check doc. Create a long Conversation (enough Messages to scroll) and a short one whose first page doesn't fill the view, through the API with the seeded Users. Open each by clicking it in the Conversation list, by its URL and after a reload, and check the newest Message is in view right after opening. Check "No messages yet" doesn't flash on open, and appears for a new Direct Conversation. Scroll up in the long one and check older Messages load with your place kept. Check the console for errors. Delete the test Conversations afterwards (deleting a Conversation cascades to its Messages and Members).

**Out of scope:** Opening at the first Unread Message. Changing how live Messages, sent Messages or the "Jump to latest" button behave. Keeping a Conversation's scroll position between visits. Upgrading the scroller package.

## Comments
