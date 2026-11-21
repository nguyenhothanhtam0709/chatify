# 04: End-to-end verification

**What to build:** proof that the whole system works together on Node 26, TypeScript 7, `ttsc` and oxlint, from a clean checkout. This Ticket adds no packages and no test suite; it runs the checks below, records the results, and fixes only what they find. Spec: [spec.md](../spec.md), section "Testing Decisions" (Ticket 04).

Steps, in order, on Node 26:

1. Delete `node_modules` and every `dist`, then `pnpm install --frozen-lockfile`.
2. `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm docs:check` all exit 0.
3. Each package's `build:dev`, `build`, `build:clean` and `test:cov` succeed, and `contracts` output still has `.d.ts` files.
4. `pnpm db:up`, `pnpm db:migrate` and `pnpm db:seed` succeed through `ttsc/register`.
5. Start `pnpm dev:api` and `pnpm dev:web`; edit a source file and confirm the api restarts on change.
6. **API test** against the real running api (real Postgres, seeded Users), over HTTP and the socket, with `curl` and a short script in the scratchpad (nothing committed):
   - health check; sign up, log in, current user, profile update, log out and session revocation;
   - user search; open a direct Conversation; create a group; add and remove a member; leave a group;
   - send a Message; history with `before` and `after` pagination; mark as read and unread counts;
   - invalid input gets a 400 and a missing or revoked session gets a 401, in the existing error shape;
   - rate limiting still answers 429 where it is configured;
   - socket: connect with the session, receive a pushed Message, typing and read-receipt events, and a missed Message filled in after a reconnect.
7. **Browser test** (Chrome DevTools MCP, [browser check](../../../docs/workflow/browser-check.md)) against the real dev stack, with two sessions (for example `alice` and `bob`):
   - sign up, log in, return to the wanted page after login, log out;
   - conversation list, unread badges, search for a User, open a direct Conversation by URL and by click;
   - create a group, add and remove a member, leave a group, member count and the closed-group state;
   - a Message sent in one session arrives live in the other, with typing indicator, read receipts and the unread badge clearing;
   - scroll back through history and open at the newest Message;
   - profile update; a session revoked in one tab is handled in the other;
   - mobile width: the conversation sheet and pane height;
   - console has no errors or warnings, no failed network requests, and the Tailwind and shadcn styling is intact.
8. Build `api` with `build`, run `start:prod`, check `/health` and one authenticated request.
9. `pnpm serve:web` loads the production preview.
10. Add one deliberate violation per ported lint rule (default export, `dangerouslySetInnerHTML`, `forwardRef`, a bare `fs` import, a `class-validator` import, `console.log`, `process.env`, a type assertion), confirm each fails `pnpm lint`, then revert.
11. Re-measure peak memory and wall time for `pnpm lint`, `pnpm typecheck` and `pnpm build` (`/usr/bin/time -l`) and confirm every `ttsc` call still uses `--checkers 2` and every oxlint call `GOMAXPROCS=2` with `--threads=2`, and that memory and time stay in line with the numbers in Tickets 01 and 03, also while the dev stack from step 5 is running.
12. Record every command and its result in the PR's verification section.

A failing step is compared with the same step on `main` before it is blamed on this work. A failure is fixed in this Ticket; if the fix needs a package change, stop and escalate.

**Allowed packages:** None

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] Steps 1 to 11 each pass, or the failure is fixed in this Ticket (or escalated if it needs a package change)
- [ ] The API test covers every endpoint group and socket event listed in step 6
- [ ] The browser test covers every flow listed in step 7 with two sessions
- [ ] The PR records each command and its result, and says which step, if any, also failed on `main`
- [ ] Nothing from the scratchpad scripts is committed, and all dev servers and containers are stopped at the end (ports 3000 and 5173 are free)

**Verification:** the steps above are the verification. Follow [browser check](../../../docs/workflow/browser-check.md) for the dev stack and for stopping it cleanly.

**Out of scope:** a committed `test:e2e` script or e2e spec files; new packages; new lint rules or app behaviour changes; paying down `fix-lint.md`.

## Comments
