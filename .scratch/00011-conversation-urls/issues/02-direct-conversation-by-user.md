# 02: Direct Conversation by User

**What to build:** Picking a User in the new-conversation dialog goes to `/direct/:userId`. That opens the existing Direct Conversation with them if there is one, or the "Say hello" view if not. This fixes the Typing Indicator for existing Direct Conversations opened through the dialog. Touches the api, contracts and web packages. Details are in spec 00011, "Implementation Decisions".

**The lookup endpoint (api, contracts)**
- Add `GET /api/v1/direct-conversations/:userId` for the signed-in User. It is read-only and never creates a Conversation: creation stays inside the first Direct send.
- 200 returns `{ peer, conversationId? }`.
  - `peer` is the existing User search result shape. Define the response schema in contracts, and give it no field that search doesn't have.
  - `conversationId` is present only when a Direct Conversation with that User exists.
- 404 `USER_NOT_FOUND` for an unknown User, or for the caller's own id: a Direct Conversation needs two distinct Users.
- 400 `VALIDATION_FAILED` for a malformed uuid, through the same uuid path validation the Conversation routes use.
- Put it in the module that owns Conversations and Direct sends, reusing the existing Direct lookup without its create step. No schema change.
- Add the endpoint to `docs/architecture/http-routes.md`, regenerating it if it is a Generated Doc.

**The `/direct/:userId` route (web)**
- A dialog pick pushes `/direct/:userId`. The view calls the lookup endpoint:
  - If it returns a `conversationId`, the view replaces the location with `/conversations/:id`, and Ticket 01's view shows the history.
  - If not, it shows "No messages yet. Say hello to <name>." with `peer` as the header. That also works after a reload, when there is no picked User.
- When the view learns the Conversation id, it replaces the location with `/conversations/:id`. It can learn it from its own first send or from the other User's `message.created`. Back never returns to `/direct/`.
- A 404 or 400 from the lookup shows "This user can't be found." in the main pane. There is no redirect, the URL is kept, and the sidebar still works.
- No Typing Indicator code changes: the signal works once the view has a Conversation id. A brand-new Direct Conversation still sends no signal before its first Message.

**Allowed packages:** None

**Blocked by:** 01

**Status:** resolved

- [x] The lookup returns 200 with `conversationId` when the Direct Conversation exists, and 200 without it when it doesn't
- [x] The lookup never creates a Conversation
- [x] The lookup returns 404 `USER_NOT_FOUND` for an unknown User and for the caller's own id, 400 for a malformed id, and 401 when signed out
- [x] The lookup's `peer` carries only the User search result fields
- [x] Picking a User with an existing Direct Conversation ends at `/conversations/<id>` and shows its history
- [x] Picking a User with no Direct Conversation shows "Say hello" with their name at `/direct/<userId>`, also after a reload
- [x] The first send replaces `/direct/<userId>` with `/conversations/<id>`, and Back doesn't return to `/direct/`
- [x] The other User's first Message arriving at `/direct/<userId>` replaces it with `/conversations/<id>`
- [x] An unknown User, the caller's own id, or a malformed id at `/direct/` shows "This user can't be found."
- [x] Typing in an existing Direct Conversation picked through the dialog sends the Typing Indicator signal. The test that pinned "sends no signal until the first Message exists" as a known limit now asserts this instead. A brand-new Direct Conversation still sends none
- [x] The HTTP routes doc lists the new endpoint

**Verification:**

- **API:** HTTP tests against the running API, with Users from the shared sign-up helper, like the messages API tests.
- **Web:** whole-app jsdom tests: `<App />` after `history.pushState`, with MSW faking the API. Assert the location, what the User sees, and which requests were sent.
- **Browser check,** as in `docs/workflow/browser-check.md`:
  - Pick an existing and a new Direct Conversation in the dialog.
  - Confirm the Typing Indicator reaches the other User for the existing one.
  - Reload `/direct/<userId>`.
  - Open an unreachable `/direct/` URL.

  Create test data through the API and remove it afterwards.

**Out of scope:** URLs by Username. Creating a Direct Conversation without a Message. A Typing Indicator before a Direct Conversation exists. Returning to the link after login (Ticket 03).

## Comments
