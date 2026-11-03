# Spec: Conversation URLs

Status: ready-for-agent

## Problem Statement

The open Conversation lives only in the app shell's memory, and the address bar always shows `/`. That causes these problems:

- Reloading the page closes the Conversation and shows the empty pane.
- Back and Forward don't move between Conversations. They leave the app instead.
- Nobody can bookmark a Conversation, or paste a link to one into a new tab.
- A link opened while signed out goes through login and then lands on `/`, not on the Conversation.

Picking a User in the new-conversation dialog always opens an empty "Say hello" view with no Conversation id, even when a Direct Conversation with that User already exists. That view shows none of its history and sends no Typing Indicator signal until a Message is sent.

On mobile, picking a Conversation in the sidebar sheet leaves the sheet open over it until the User presses Escape.

Spec 00010 asked for a Conversation opened from its URL or after a reload to land at its newest Message (its user stories 2 and 3). Those stories were marked n/a because no such URL existed.

## Solution

Every Conversation has its own URL, `/conversations/:id`, for Direct Conversations and Groups alike. Opening a Conversation, by any means, moves the browser to that URL. Reload, Back, Forward, bookmarks and pasted links all open that Conversation at its newest Message.

Picking a User in the new-conversation dialog goes to `/direct/:userId`. The app asks the API whether a Direct Conversation with that User already exists:

- If one exists, the URL becomes `/conversations/:id` in place, and the full Conversation opens, with history and Typing Indicator.
- If none exists, the "Say hello" view shows. The URL becomes `/conversations/:id` as soon as the Conversation exists, whether the User or the other User sends first.

A URL for a Conversation the User can't read shows one message in the main pane. A `/direct/` URL for a User who can't be found shows a similar message. The sidebar keeps working, and the URL stays as typed.

A link opened while signed out goes through login or signup and then on to the Conversation. On mobile, opening a Conversation closes the sidebar sheet.

`/` still shows the empty state, "Select a conversation to start chatting."

## User Stories

1. As a User, I want each Conversation to have its own URL, so that I can bookmark it or paste it into another tab.
2. As a User, I want a Conversation I open from its URL to open at its newest Message, so that a link or bookmark behaves like a click (carried over from spec 00010, story 2).
3. As a User, I want a Conversation to still be open at its newest Message after I reload the page, so that a reload doesn't lose my place (carried over from spec 00010, story 3).
4. As a User, I want the URL to change to the Conversation's URL when I click it in the Conversation list, so that the address bar always shows what is open.
5. As a User, I want Direct Conversations and Groups to use the same kind of URL, so that every Conversation link looks and behaves the same.
6. As a User, I want Back to return me to the Conversation I had open before, so that I can move between Conversations like pages.
7. As a User, I want Forward to take me back to the Conversation I left with Back, so that browser navigation works both ways.
8. As a User, I want Back to go to `/` with the empty state after I go Back past the first Conversation I opened, so that history ends where I started.
9. As a User, I want clicking the Conversation that is already open not to add a history entry, so that Back doesn't seem to do nothing.
10. As a User, I want the Conversation list to highlight the Conversation the URL names, so that the list and the open Conversation always agree.
11. As a User, I want `/` to show "Select a conversation to start chatting." and not open a Conversation by itself, so that the start page stays as it is today.
12. As a User, I want an unknown path to keep showing the app shell, so that a mistyped URL doesn't strand me (unchanged from spec 00003).
13. As a User, I want a Conversation opened from its URL to show its name or the other User's name, even before the Conversation list has loaded, so that I know where I am.
14. As a User, I want a Conversation that isn't in my loaded Conversation list to still open from its URL, so that the list's loading doesn't decide what I can open.
15. As a User, I want a Conversation URL that doesn't exist to show "This conversation doesn't exist or you don't have access to it." in the main pane, so that I know the link is wrong.
16. As a User, I want a URL for a Conversation I was never a Member of to show the same message, so that the app reveals no more than the API does.
17. As a User, I want a malformed Conversation URL to show the same message, so that a mangled link fails the same way as a wrong one.
18. As a User looking at that message, I want the URL kept as I typed it and the sidebar still working, so that I can fix the link or pick another Conversation.
19. As a Former Member, I want a Group's URL to open it read-only with the history from my time as a Member, exactly as clicking it does, so that links behave like the list.
20. As a User, I want a Closed Group's URL to open it read-only exactly as clicking it does, so that links behave like the list.
21. As a User picking someone in the new-conversation dialog, I want an existing Direct Conversation with them to open with its history, so that I don't start what looks like a new Conversation with someone I've already talked to.
22. As a User picking someone in the new-conversation dialog, I want the URL to become that Conversation's URL when the Direct Conversation already exists, so that reload and Back work for it like any other.
23. As a User picking someone I've never talked to, I want to see the "Say hello" view at `/direct/` followed by their user id, so that I can write the first Message.
24. As a User at that `/direct/` URL, I want a reload to show the same "Say hello" view with the other User's name, so that reloading doesn't lose who I was about to write to.
25. As a User sending the first Message in a new Direct Conversation, I want the URL to become the new Conversation's URL in place, so that Back skips the `/direct/` step and the link I copy is the lasting one.
26. As a User at a `/direct/` URL, I want the URL to become the Conversation's URL in place if the other User sends the first Message, so that the URL is right however the Conversation started.
27. As a User, I want a `/direct/` URL for a User who doesn't exist to show "This user can't be found.", so that I know the link is wrong.
28. As a User, I want a `/direct/` URL with my own user id, or a malformed id, to show the same message, so that impossible Direct Conversations fail the same way.
29. As a User typing in a Direct Conversation I opened through the new-conversation dialog, I want the other User to see my Typing Indicator when the Conversation already exists, so that it works as it does from the list.
30. As a User starting a brand-new Direct Conversation, I accept that no Typing Indicator is sent before the first Message, because the Conversation doesn't exist yet.
31. As a signed-out visitor opening a Conversation URL, I want to be sent to login and then on to that Conversation once I sign in, so that a link survives the login step.
32. As a signed-out visitor who goes from login to signup, I want to be sent on to the Conversation I asked for once I have signed up, so that the link survives either path.
33. As a User signing in after following a link, I want to be sent to `/` if the remembered location isn't a page inside the app, so that login can never send me somewhere strange.
34. As a User signing in with no remembered location, I want to land on `/` as today, so that a normal login is unchanged.
35. As a User on mobile, I want the sidebar sheet to close when I pick a Conversation in it, so that I see the Conversation straight away.
36. As a User on mobile, I want a Conversation URL to open with the sidebar sheet closed, so that the Conversation is what I see.
37. As a User on mobile, I want Back from a Conversation to show the previous Conversation or the empty state without reopening the sheet, so that Back behaves like on desktop.
38. As a User opening a Conversation from its URL in a visible tab, I want my Read Marker to move to its newest Message as it does after a click, so that its Unread Count clears.
39. As a User opening a Group from its URL before the Conversation list has loaded, I want my Read Marker to still move, so that the Unread Count is right however I opened it.
40. As a User with a Conversation open from its URL, I want new Messages in it not to count as unread while I'm reading it, as after a click, so that the Unread Count behaves the same.
41. As a User with a Conversation open from its URL, I want live Messages, Typing Indicators and Read Receipts to arrive as they do today, so that realtime doesn't depend on how I opened it.
42. As a User who leaves or is removed from a Group while it is open, I want its URL to stay and the view to become read-only as today, so that nothing jumps away under me.
43. As a User creating a Group, I want the URL to become the new Group's URL, so that the new Group is linkable straight away.
44. As a developer, I want the URL to be the only record of which Conversation is open, so that reload, Back and links can't disagree with the screen.
45. As a developer, I want a read-only API endpoint that finds the Direct Conversation with a given User, so that the client can resolve a `/direct/` URL without creating anything.

## Implementation Decisions

- **Routes.** Two new routes sit inside the signed-in wrapper that spec 00003 added. They render inside the app shell next to the sidebar:
  - `/conversations/:id` for any Conversation. There is no kind in the URL, because Direct Conversations and Groups share one id space, and the kind comes from the data.
  - `/direct/:userId` for a Direct view picked by User. It uses the user id, not the Username, so the URL stays stable if Username change is ever added.
- `/` keeps the empty state. The catch-all keeps showing the shell as in spec 00003. There is still no 404 page.
- **The URL is the only open-Conversation state.** The shell's in-memory record of the open Conversation (a target plus an optional id) goes away. The Conversation list's selected item, the view's key and the "reading" signal that feeds the list all come from the route's id.
- **Where the open view's data comes from.** The header (Group name or the other User's name) and a Group's membership state come from the Conversation list entry when it is there. Otherwise they come from the existing `GET /api/v1/conversations/:id`, which already returns the Group name, or a Direct Conversation's Members. The header shows a loading state until either arrives.
  - A Group's permission to write the Read Marker comes from the same data, so it is the same however the Group was opened.
- **History.** Opening a Conversation yourself pushes a history entry. That covers a list click, a dialog pick, and creating a Group.
  - Clicking the already-open Conversation does nothing.
  - URL changes the app makes on its own replace the current entry: `/direct/:userId` resolving to an existing Conversation, the first Message being sent, or the peer's first Message arriving.
  - Redirects keep replacing, as in spec 00003.
- **New API endpoint.** `GET /api/v1/direct-conversations/:userId`, read-only, for the signed-in User. It never creates a Conversation, and creation stays inside the first Direct send.
  - **200:** `{ peer, conversationId? }`. `peer` is the existing User search result shape, so it carries no field that search doesn't. `conversationId` is present only when a Direct Conversation with that User exists.
  - **404 `USER_NOT_FOUND`:** no such User, or the User's own id. A Direct Conversation needs two distinct Users.
  - **400 `VALIDATION_FAILED`:** a malformed uuid, through the same uuid path validation the Conversation routes use.
  - The response schema lives in the contracts package. The client parses it like the other Conversation responses.
- **Resolving `/direct/:userId`.** On open, the view calls the lookup endpoint.
  - If it returns a `conversationId`, the view replaces the URL with `/conversations/:id`.
  - If not, the view shows the "Say hello" state with `peer` as the header. On reload there is no picked User, so `peer` is the only source of the name.
  - Whenever the view learns the Conversation id, from its own first send or from the peer's `message.created`, it replaces the URL with `/conversations/:id`.
- **Unreachable URLs.**
  - On `/conversations/:id`, a 404 `CONVERSATION_NOT_FOUND` (no such Conversation, or a never-Member) or a 400 shows "This conversation doesn't exist or you don't have access to it." in the main pane. The three cases look the same, so the client reveals nothing the API keeps hidden.
  - On `/direct/:userId`, a 404 or 400 shows "This user can't be found."
  - In every case there is no redirect, the URL is kept, and the sidebar works.
- **Former Members and Closed Groups.** These open from their URL exactly as from a click: read-only, with the history the User may read. The API already returns them with 200 and `isMember: false`.
- **Typing Indicator.** No signal code changes. The signal needs a Conversation id. A dialog pick for an existing Direct Conversation now opens with that id, so the existing signal path works. A brand-new Direct Conversation still sends no signal before its first Message.
- **Return after login.** When the signed-in wrapper redirects a signed-out visitor to `/login`, it keeps the requested path and query in router location state. They never go into the URL, so there is no `?next=` parameter and no open-redirect surface.
  - Login and signup go to that location on success, and the location survives moving between the login and signup pages.
  - The location is followed only when it is an in-app path that isn't `/login` or `/signup`. Otherwise, or when there is none, they go to `/` as today.
- **Mobile sidebar sheet.** Opening a Conversation closes the sheet on mobile, whether from the sheet, the dialog or Back.
- **Realtime is unchanged.** The server joins a socket to its rooms at connection time, and nothing depends on which Conversation is open (ADR 0001, ADR 0006).
- **Packages.** web, api and contracts.
  - The API endpoint goes in the module that owns Conversations and Direct sends. It reuses the existing Direct lookup, without the create step.
  - No new dependency. No database schema change, because the existing tables answer the lookup.
- **Docs.** Add the new endpoint to the HTTP routes architecture doc, regenerating it if it is a Generated Doc. No ADR, because routing is easy to reverse. No `GLOSSARY.md` change, because URLs aren't domain language (as in spec 00003).

## Testing Decisions

- **A good test** drives the app as a User would and asserts what they would see: the text on screen, the browser location, where the message view sits, and which requests the API received. It never asserts router internals, component state or which hook was called.
- **Two seams, both existing:**
  - **Web:** render the whole app after `history.pushState`, with MSW faking the API.
  - **API:** HTTP tests against the running API, with test Users from the shared sign-up helper.
- **Web tests:**
  - Story 2: push `/conversations/<id>` for a long Conversation, render the app without clicking, and assert that the view sits at the newest Message and at the live edge. Use the same assertions as the click case in the open-at-newest-message test.
  - Story 3: click a long Conversation, unmount, render the app again at the same location, and assert the same.
  - Clicking a list item changes the location, and clicking the open one adds no history entry.
  - Back and Forward between two Conversations, and Back to `/` showing the empty state.
  - The "doesn't exist or no access" state for a 404 and for a malformed id. The location is kept and the sidebar still works.
  - A Former Member's Group opened by URL is read-only.
  - `/direct/:userId` for an existing Direct Conversation replaces the location with `/conversations/:id` and shows history. For a new one, it shows "Say hello" with the peer's name, also after a reload. For an unknown User, it shows "This user can't be found."
  - The first send, and a peer's first Message, replace `/direct/:userId` with `/conversations/:id`. Back does not return to `/direct/`.
  - A Group opened by URL before its list entry loads shows its name and still writes its Read Marker.
  - A dialog-picked User with an existing Direct Conversation sends the Typing Indicator signal. This replaces the test that pins "sends no signal until the first Message exists" as a known limit. A brand-new Direct Conversation still sends none.
  - A signed-out visit to a Conversation URL goes to `/login`, and after login it ends at that Conversation. The same goes through signup. An invalid remembered location ends at `/`.
  - On a mobile viewport, picking a Conversation in the sheet closes it.
- **API tests for the new endpoint:**
  - 200 with a `conversationId` when the Direct Conversation exists, and without one when it doesn't.
  - The lookup never creates a Conversation.
  - 404 for an unknown User and for the caller's own id.
  - 400 for a malformed id.
  - 401 when signed out.
  - `peer` carries only the User search result fields.
- **Prior art:**
  - The open-at-newest-message test, for the scroll assertions and the fake layout.
  - The routing test, for location and redirect assertions.
  - The login and session-revocation tests, for auth flows.
  - The Typing Indicator test, for signal assertions.
  - The messages API tests, for the endpoint.
- Existing tests stay green. The only existing test whose expectation changes is the typing "known limit" test above.

## Out of Scope

- Links to a single Message, and restoring a scroll position. A Conversation opened from its URL always lands at its newest Message, as in spec 00010.
- URLs for dialogs: new Group, Group members, profile.
- URLs by Username.
- A 404 page.
- Router data loaders, lazy routes or route-level error boundaries.
- Query-string state.
- A page or tab title per Conversation.
- Any change to realtime rooms, events or the socket.
- A Typing Indicator for a Direct Conversation that doesn't exist yet.
- Creating a Direct Conversation without a Message.

## Further Notes

- **Browser check required.** jsdom can't show real reload, Back and Forward behaviour, or the mobile sheet. A browser check covers these steps:
  - Reload an open Conversation.
  - Step Back and Forward between Conversations.
  - Open a pasted Conversation URL in a new tab, signed in and signed out.
  - Pick an existing and a new Direct Conversation in the dialog.
  - On a phone-sized viewport, confirm that picking a Conversation closes the sheet.

  Create the test data through the API and remove it afterwards.
- `main.tsx` uses `StrictMode`, so the `/direct/:userId` lookup runs twice in dev. The lookup is read-only, so that is harmless. Check dev mode manually anyway.
- This Spec takes over three `docs/laters.md` entries, which are removed with it: "Conversation URLs", "Typing Indicator in a new Direct view" and "Mobile sidebar sheet stays open after picking a Conversation".
