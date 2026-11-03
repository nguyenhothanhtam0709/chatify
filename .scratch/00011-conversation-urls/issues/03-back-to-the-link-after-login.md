# 03: Back to the link after login

**What to build:** A signed-out visitor who opens a Conversation link signs in or signs up, then lands on that Conversation instead of `/`. Touches the web package only. Details are in spec 00011, "Implementation Decisions", "Return after login".

- When the signed-in wrapper sends a signed-out visitor to `/login`, it keeps the requested path and query in router location state. They never go into the URL: no `?next=` parameter, so there is no open-redirect surface.
- Login and signup go to that location on success. It survives moving between the login and signup pages.
- The location is followed only when it is an in-app path that isn't `/login` or `/signup`. Otherwise, or when there is none, login and signup go to `/` as today.
- Redirects keep replacing the history entry, as in spec 00003.
- This applies to any signed-in path, including the `/direct/` routes from Ticket 02, without code specific to those routes.

**Allowed packages:** None

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] A signed-out visit to `/conversations/<id>` goes to `/login`, and logging in ends at `/conversations/<id>` with that Conversation open
- [ ] The same visit, going from login to signup and signing up, ends at `/conversations/<id>`
- [ ] The URL never carries the remembered location
- [ ] An invalid remembered location (not an in-app path, or `/login`, or `/signup`) ends at `/`
- [ ] A normal login with no remembered location ends at `/` as today
- [ ] Back after landing on the Conversation doesn't return to `/login`
- [ ] Existing login, signup, routing and session-revocation tests pass unchanged

**Verification:**

- Whole-app jsdom tests: `<App />` after `history.pushState`, with MSW faking the API, like the login and routing tests.
- Browser check, as in `docs/workflow/browser-check.md`: paste a Conversation URL into a signed-out tab, log in, and confirm the Conversation opens.

**Out of scope:** Remembering the location across a closed tab or a new session. Showing a message on the login page about where the visitor is going.

## Comments
