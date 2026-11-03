# 03: Back to the link after login

**What to build:** A signed-out visitor who opens a Conversation link signs in or signs up, then lands on that Conversation instead of `/`. Touches the web package only. Details are in spec 00011, "Implementation Decisions", "Return after login".

- When the signed-in wrapper sends a signed-out visitor to `/login`, it keeps the requested path and query in router location state. They never go into the URL: no `?next=` parameter, so there is no open-redirect surface.
- Login and signup go to that location on success. It survives moving between the login and signup pages.
- The location is followed only when it is an in-app path that isn't `/login` or `/signup`. Otherwise, or when there is none, login and signup go to `/` as today.
- Redirects keep replacing the history entry, as in spec 00003.
- This applies to any signed-in path, including the `/direct/` routes from Ticket 02, without code specific to those routes.

**Allowed packages:** None

**Blocked by:** 01

**Status:** needs-info

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

Escalation 00011-03 (two questions; work is paused)

1. Signup does not sign a visitor in. Today a successful signup shows "Account created" in place, with no link anywhere (the signup test "offers no social sign-up or extra links" pins that the signup page has no link). So "signup goes to the remembered location on success" and "going from login to signup and signing up ends at `/conversations/<id>`" cannot happen without a behaviour change the Ticket doesn't name. Options:
   - A (recommended): the "Account created" card gets a "Log in" link that carries the remembered location back to `/login`; logging in then lands on the Conversation. Smallest change, no new auth behaviour, the existing signup tests stay unchanged (the no-link test checks the form, before submit). The acceptance line becomes "signs up, then logs in, and ends at the Conversation".
   - B: signup signs the visitor in right after a successful register (calls login with the new credentials) and goes to the remembered location. Matches the Ticket wording, but changes signup for everyone (no "Account created" card, so the existing signup tests change) and adds a second request that can fail or be rate-limited after the account exists.
   - C: only when a remembered location exists, B; otherwise today's card.
   Blocked: the signup half and forwarding the location through the Login/Signup links (it is only observable once signup goes somewhere).
2. Flaky test from Ticket 01: `conversation-urls.test.tsx` "opens the new Group at its URL after creating it" times out at 4s in about half of the runs of that file alone, also on the Feature Branch tip a0a47c2 without this change. The testing policy says to escalate, not rerun. It will block `pnpm test` on the final commit.

Done so far (committed on the Task Branch, all green): RequireSignedIn keeps the path and query in location state (`packages/web/src/auth/return-to.ts`), SignedOutOnly follows it after login when it is a same-origin path other than `/login` or `/signup`, else `/`. Tests in `packages/web/src/return-after-login.test.tsx`: login lands on the Conversation, the URL never carries it, Back skips `/login`, seven invalid locations end at `/`.

