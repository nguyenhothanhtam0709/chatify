# Laters

Notes for a later MVP, not commitments. Any agent may append an entry with `cat >> docs/laters.md`. Remove an entry when it becomes a spec. To find an entry, run `grep -n '^## ' docs/laters.md` and read only that section: whole-file reads are denied.

## Conversation URLs

A URL per Conversation, so reload, Back and deep links work. Today the open Conversation lives in app shell state. Awkward for a new Direct Conversation, which has no id until the first Message is sent.

Spec 00010 asked for a Conversation opened from its URL or after a reload to land at its newest Message (user stories 2 and 3). Those stories were marked n/a because no such route exists. When this entry becomes a spec, carry them over and test them like the click case in `packages/web/src/open-at-newest-message.test.tsx`.

## Contract-first development

Today `packages/contracts` (Zod) is shared by the API and SPA, but endpoints are built code-first and there are no generated API docs (OpenAPI is out of scope for MVP1). In a later MVP, move to contract-first: define the HTTP contract (request, response and error shapes) before the implementation, and drive the API and SPA from it. Decide the contract format (extending the Zod contracts vs. OpenAPI) in an ADR when this is picked up.

## Scale out the API

The API runs as a single instance (ADR [0006](adr/0006-api-runs-as-a-single-instance.md)): commit ordering uses an in-process serializer and Socket.IO rooms are in memory. To run more than one instance, add the Socket.IO Redis adapter and move ordering to the database. Turn that into a spec before starting. Once Presence exists (ADR [0009](adr/0009-client-signals-are-http-writes-with-socket-push.md)), its in-memory connection counts have to move to Redis in the same change.

## Presence

Online and offline status, the later slice of Live Signals (spec 00007). Open questions: how multiple tabs and devices count as online, who can see a User's presence (there are no contacts, so it would mean everyone who shares a Conversation with them), and the offline timeout. It keeps in-memory connection state, so it has to move to Redis together with "Scale out the API" (ADR [0009](adr/0009-client-signals-are-http-writes-with-socket-push.md)). Turn it into a spec after 00007 ships.

## Stored Unread Count

The Unread Count is computed when the Conversation list is fetched, capped at 100 ("99+"), from an index range scan on `(conversation_id, sequence)` starting at the Member's Read Marker. If the list query turns out slow, store a per-Member counter instead. Cost to weigh: up to 255 extra row updates per Message in a Group, inside the Conversation row lock.

## Refresh-token rotation can end a session if a refresh is cancelled mid-flight

- **Seen:** reloading the SPA several times quickly in dev gave 401s (`/auth/refresh` 401, or `/users/me` 401 `SESSION_REVOKED` with a valid token). The user tested it and found it happens only in dev mode (`pnpm dev:web`); it does not happen with the production build (`pnpm serve:web`).
- **Why dev:** `main.tsx` uses `<StrictMode>`, so every mount effect runs twice in dev (`/auth/refresh` and `/conversations` are each sent twice, the first aborted). The extra, aborted refresh can reach the API and rotate the cookie before the page throws the response away.
- **Underlying API behaviour:** `AuthService.refresh` treats a refresh token that was already rotated away as a stolen-token replay and deletes the whole session. Anything that sends a cancelled-then-repeated refresh with the same cookie (dev StrictMode, two tabs reloading together, a client retrying) gets 401 and a dead session. Reproduced against the API alone: send `POST /auth/refresh`, drop the connection without reading the reply, then refresh again with the old cookie: 401.
- **Not done:** no fix, because it is dev-only. If it ever shows up outside dev, the idea is a short grace window on the previous refresh token (the `sessions` table already has `previous_refresh_token_hash` and `rotated_at`), so a cancelled refresh does not end the session while a late replay still does.
- **Workaround:** `pnpm serve:web` builds and serves the production bundle (no StrictMode) at http://localhost:4173.

## `owner_changed` System Message in the Conversation preview and list ordering

- **Seen:** ticket 48 added the `owner_changed` System Message kind. The spec says System Messages stay out of the Conversation preview and list ordering, but the 48 diff did not touch that code, so it relies on the existing kind-based filtering. Nobody checked it, and no test covers it for this kind.
- **Not done:** no check or test yet.
- **Idea:** add a test (API) that an `owner_changed` message does not become the preview or move the Conversation in the list, or confirm the filter is by `kind` for every System Message.

## Mobile sidebar sheet stays open after picking a Conversation

- **Seen:** while verifying ticket 46 at 375x667 with touch emulation, choosing a Conversation in the sidebar sheet left the sheet open until Escape was pressed.
- **Not done:** not ticketed, and not part of ticket 46.
- **Idea:** close the sheet when a Conversation is selected on mobile.

## Throttler route strings are duplicated away from the controllers

- **Seen:** in the spec 00002 code review. `throttling/throttling.module.ts` hard-codes `SEARCH_URL`, `SEND_URLS` and `/api/v1/auth/login`, separate from the controllers that define those routes. Renaming a route or the global prefix would silently switch the matching limit off, and no test ties the strings to the real routes.
- **Not done:** spec 00002 said to move the limits and route rules unchanged, so this was left as it was.
- **Idea:** derive the throttler routes from the controllers' route metadata, or add a test that each limited route is actually limited.

## Enforce the doc and convention rules

`pnpm docs:check` covers the Generated Docs, links, `kind` and Ticket Status, and a hook runs it when an agent opens a PR. Nothing checks a human's PR, and the other rules are followed by reading. Enforcement to build in a later MVP:

- **Enforcement tags:** tag each rule with how it is enforced, and apply "broken twice, automate it": once a rule is broken a second time, replace the prose with an automated check.
- **Required CI checks:** lint, typecheck, tests with Postgres, migration drift, generated-doc drift, and a front matter and link check. Back them with branch protection and a required human approval.
- **`covers:` check:** a PR that touches code covered by a Descriptive Doc without updating that doc fails, unless the PR body justifies it.
- **Stop hook:** run the fast checks when the agent stops.
- **Drift audit:** a periodic audit of docs against code that opens Tickets for each drift found.

## Review the mocks in tests

- **Seen:** while extracting conventions (spec 00004, ticket 05). The [testing policy](workflow/testing-policy.md#mocking) says to test through public seams and to mock only where no seam exists. Four files use `vi.mock` or `vi.spyOn`: `api/src/groups/group-rooms.test.ts`, `api/src/db/database.module.test.ts`, `web/src/realtime/socket-realtime.test.ts` and `web/src/history-pagination.test.tsx`.
- **Not done:** nobody checked whether each mock is needed.
- **Idea:** for each file, switch to a public seam or note why there is none.

## One shared uuid path pipe in the API

- **Seen:** while extracting conventions (spec 00004, ticket 05). The same `new ZodValidationPipe(z.uuid())` is declared twice: `IdPipe` in `api/src/groups/groups.controller.ts` and `ConversationIdPipe` in `api/src/messages/messages.controller.ts`.
- **Not done:** left as two copies.
- **Idea:** export one uuid path pipe from `api/src/common/` and use it in both controllers.

## API tests redefine `signUp`

- **Seen:** while extracting conventions (spec 00004, ticket 05). `docs/conventions/api.md` says test Users come from `signUp` in `api/test/people.ts`. Four files keep a local copy: `api/src/messages/messages.test.ts`, `api/src/groups/groups.test.ts`, `api/src/realtime/realtime.test.ts` and `api/src/auth/user-search.test.ts`.
- **Not done:** test-only cleanup, no behaviour change.
- **Idea:** switch those four files to the shared helper, and add anything they need to it.

## Web cleanups found while extracting conventions

- **Seen:** while extracting conventions (spec 00004, ticket 05), against `docs/conventions/web.md`:
  - `web/src/realtime/socket-realtime.test.ts` imports `../test/server`, the only upward relative import. It should use `@/test/server`.
  - `web/src/shell/NewGroupDialog.tsx:68` renders a raw `<button>` inside a `Badge`, the only raw control outside `components/ui`. It should be the shadcn `Button`; check how it looks after the change.
- **Not done:** small and outside ticket 05.
- **Idea:** fix both in one small Ticket.

## Shared request helper for the web API client

- **Seen:** while extracting conventions (spec 00004, ticket 05). Seven files in `web/src/api/` (`auth.ts`, `conversations.ts`, `groups.ts`, `messages.ts`, `profile.ts`, `register.ts`, `users.ts`) repeat the fetch, try and catch block and the strings "Could not reach the server. Try again." and "Something went wrong. Try again." `groups.ts` also declares them as constants and `messages.ts` has its own `post` helper. `api/health.ts` throws instead of returning an `{ ok, ... }` union.
- **Not done:** an eight-file refactor with no visible change.
- **Idea:** one request helper in `web/src/api/` that owns the fetch, the error strings and the union, used by every endpoint function, including `health.ts`.

## Shared test people in web tests

- **Seen:** while extracting conventions (spec 00004, ticket 05). Each web test file (`routing.test.tsx`, `login.test.tsx`, `profile.test.tsx`, ...) redefines its own `alice` user and fake access token.
- **Not done:** test-only cleanup.
- **Idea:** a helper in `web/src/test/`, mirroring `api/test/people.ts`.

## Contracts cleanups found while extracting conventions

- **Seen:** while extracting conventions (spec 00004, ticket 05), against `docs/conventions/contracts.md`:
  - `SearchUsersQuery` (`contracts/src/user.ts:132`) uses `z.input`, but only the API uses it, after parsing, so it should be `z.infer`. Harmless today because the schema has no transform.
  - `contracts/src/search.test.ts` tests schemas from `user.ts`, with no `search.ts` beside it. `contracts/src/code-point.ts` has no test of its own.
- **Not done:** small and outside ticket 05.
- **Idea:** switch the type to `z.infer`, merge `search.test.ts` into `user.test.ts`, and test `code-point.ts` directly or through the schemas that use it.

## Password reset and password change

Out of scope for MVP1 along with email verification, account deletion and Username change. Reset needs email delivery, a new external dependency, so the ticket must name the provider. Decide whether reset invalidates existing sessions (the `sessions` table and deny-list already exist).

## Message edit and delete

A Message is defined as immutable in `GLOSSARY.md`, so this changes the domain: update the glossary and add an ADR first. Delete could be a soft delete shown as a tombstone. Decide what Former Members see and whether edits need an `edited` marker and a realtime event.

## Message search

Out of scope for MVP1 (User search exists, see issue 07). Postgres full-text search is the simplest start. Results must respect Former Member history boundaries and the `404` for never-Members.

## Replies and reactions

Replies (and threads) need a reference from a Message to another Message in the same Conversation. Reactions need a new entity and realtime events. Both are blocked by the Message immutability rule if reactions are stored on the Message.

## Attachments

The largest item: storage, upload validation, size limits, and a new look at ADR [0002](adr/0002-validate-input-encode-output-no-sanitizer.md). Rich text and markdown are out of scope for MVP1 too and would need the same output-encoding review.

## Block and report Users

Contacts, friend requests, blocking and reporting were all out of scope for MVP1. Decide how blocking interacts with Direct Conversations (at most one per pair) and with Groups.

## Group renaming, ownership transfer and invitations

MVP1 has only the Owner role and no renaming, deletion or invitations needing acceptance. Admin and moderator roles are a further step. Each changes the Owner and Member rules in `GLOSSARY.md`.

## Real-time Nickname updates

`user.updated` was left out of MVP1; Nickname changes only show after a refetch. Small: one realtime event, pushed to the rooms of the User's Conversations. Respect ADR [0001](adr/0001-websocket-is-server-push-only.md).

## CI pipeline and deployment

CI, deployment and OpenAPI docs were out of scope for MVP1. The required CI checks are already listed under "Enforce the doc and convention rules" and OpenAPI under "Contract-first development"; this entry is the rest: a hosting target, environment config and a deploy pipeline.

## Typing Indicator in a new Direct view

A Direct view opened through the new-conversation dialog sends no Typing Indicator signal until its first Message, even when the Conversation already exists, because the route needs a Conversation ID. Fix by resolving the existing Direct Conversation for the picked User when the view opens.

## Type-checking `scripts/`

`scripts/` is outside every package's `tsc` run. An ad hoc run under the strict flags found 25 errors. 24 have one cause: a helper in the read guard's test. The docs generator's import of the API needs a design choice, because the API's `dist` has no declarations and `@ts-` comments are banned.

## Server-side checks on API responses

Strict output doesn't stop the server sending a field: the API never parses its responses. `UserSearchResultSchema` only makes API tests fail on a leak and makes the client throw. Decide whether to parse responses in the API, in tests or at runtime.

## Other web clients with the malformed 2xx pattern

Ticket 00009-04 made the mutation clients (`login`, `register`, `updateProfile`, `createGroup`, `changeMembers`, `leaveGroup`) `safeParse` a 2xx body. These still `parse` it and can reject with a `ZodError`: `getGroup` (`groups.ts`), `conversations.ts` (list, get, messages), `messages.ts` (send direct and group), `users.ts` (search) and `health.ts`. `refreshAccessToken` and `fetchCurrentUser` (`auth.ts`) have the pattern too, but a `try/catch` makes them return undefined.
