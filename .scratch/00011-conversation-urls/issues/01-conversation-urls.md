# 01: Conversation URLs

**What to build:** Every Conversation, Direct or Group, opens at `/conversations/:id`, and the URL becomes the only record of which Conversation is open. Touches the web package only. The API already has what this needs. Details are in spec 00011, "Implementation Decisions".

**Routes and state**
- Add `/conversations/:id` inside the signed-in wrapper, rendered in the app shell next to the sidebar.
- `/` keeps "Select a conversation to start chatting." and the catch-all keeps showing the shell, as in spec 00003.
- The shell's in-memory record of the open Conversation (a target plus an optional id) goes away for Conversations with an id. The list's selected item, the view's key and the "reading" signal fed to the list all come from the route's id.

**History**
- A list click pushes a history entry, and so does creating a Group.
- Clicking the Conversation that is already open does nothing.
- Back and Forward move between the Conversations opened.

**Where the header comes from**
- The header (Group name or the other User's name) and a Group's membership state come from the Conversation list entry when it is there.
- Otherwise they come from `GET /api/v1/conversations/:id`, which returns the Group name, or the Direct Conversation's Members, from which the other User is found. The header shows a loading state until either arrives.
- A Group's permission to write the Read Marker comes from the same data, so it works however the Group was opened.

**Who may open it**
- A Former Member or a Closed Group opens from its URL exactly as from a click: read-only, with the history the User may read.
- A 404 `CONVERSATION_NOT_FOUND` (no such Conversation, or a never-Member) or a 400 `VALIDATION_FAILED` (malformed id) shows "This conversation doesn't exist or you don't have access to it." in the main pane. There is no redirect, the URL is kept, and the sidebar still works.

**Left for later Tickets**
- The new-conversation dialog keeps opening today's "Say hello" view with no Conversation id, outside the URL. Ticket 02 replaces it.
- Realtime is unchanged: the server joins rooms at connect time, and nothing depends on the open Conversation.

**Allowed packages:** None

**Blocked by:** None

**Status:** resolved

- [ ] Clicking a Conversation in the list changes the location to `/conversations/<id>`
- [ ] Clicking the already-open Conversation adds no history entry
- [ ] Back and Forward move between two opened Conversations, and Back past the first one shows the empty state at `/`
- [ ] A long Conversation opened from its URL, with no click, lands at its newest Message with "Jump to latest" hidden (spec 00010 story 2)
- [ ] A long Conversation still lands at its newest Message after a reload (spec 00010 story 3)
- [ ] A Conversation opened from its URL before the Conversation list has loaded shows its name or the other User's name
- [ ] A Group opened from its URL before its list entry loads still moves the Read Marker when its newest Message is in view in a visible tab
- [ ] Creating a Group changes the location to the new Group's URL
- [ ] A Former Member's Group and a Closed Group open read-only from their URL
- [ ] A URL that returns 404, or a malformed id, shows "This conversation doesn't exist or you don't have access to it." The location is kept and the sidebar still works
- [ ] `/` still shows "Select a conversation to start chatting.", and unknown paths still show the shell
- [ ] Existing tests pass unchanged

**Verification:**

- Whole-app jsdom tests: render `<App />` after `history.pushState`, with MSW faking the API.
  - Assert what the User sees, the location, and the scroll position. Don't assert router internals.
  - Stories 2 and 3 follow the click case in `open-at-newest-message.test.tsx`: same assertions and fake layout. For the reload, click, `unmount`, then render again at the same location.
- Browser check, as in `docs/workflow/browser-check.md`:
  - Reload an open Conversation.
  - Step Back and Forward between Conversations.
  - Open a pasted `/conversations/` URL in a new tab.
  - Open an unreachable `/conversations/` URL.

**Out of scope:** `/direct/:userId` and the new lookup endpoint (Ticket 02). Returning to the link after login (Ticket 03). Closing the mobile sheet (Ticket 04). Message-level links. A 404 page. Page or tab titles.

## Comments
