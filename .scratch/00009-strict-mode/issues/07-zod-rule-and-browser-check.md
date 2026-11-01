# 07: Zod rule and browser check

**What to build:** A misspelled optional key gets a 400 on the 2 converted routes, a contracts test enforces a mechanical rule for strict schemas, and the Spec's one browser check runs on the real app (spec 00009, "Implementation Decisions"). Touches the contracts and api packages, with web if it needs to change.

**The rule, replacing the judgement call in the contracts conventions:**

- A request or query schema with an optional key, including a key with a default, uses `z.strictObject`. A misspelled optional key is otherwise ignored with no error: `?befor=5` returns the newest page as a 200.
- A request or query schema with only required keys uses plain `z.object`. A misspelled key already fails as a missing one.
- Responses and realtime events use plain `z.object`, because strict output would make a new API field throw on web clients not yet updated.
- The one exception is `UserSearchResultSchema` and its alias `ConversationMemberSchema`. They stay strict so that API tests fail if a response leaks an extra User field.

Include one small example of each case.

**Convert** `GetMessagesQuerySchema` and `RegisterRequestSchema` to `z.strictObject`. This narrows accepted input, which the conventions call breaking, so api and web change in this PR if they need to. No current web request sends an unknown key to either route.

**Correct the docs:**

- The `UserSearchResultSchema` comment and the conventions say strict stops a leak. The API never parses responses, so it doesn't stop the server sending a field. It makes API tests fail on a leak, and it throws on the client.
- The conventions say adding output fields is not breaking. Name the exception: adding a field to `UserSearchResultSchema` is breaking.
- Under Breaking changes, make clear that adding a key to a strict request is fine as long as api and web change in the same PR.

**Add a table-driven contracts test** that walks the package's exports:

1. An exported `*RequestSchema` or `*QuerySchema` with an optional key is strict, and one with only required keys is plain.
2. Any other exported object schema is plain, apart from an allowlist of the two names above.

An earlier read-only script did this through `schema._zod.def`: `def.catchall` of type `never` means strict, and `_zod.optin === 'optional'` means optional. That script did not detect `.default()` keys as optional, so the test must count them. Don't walk nested objects. Say in a comment that it relies on the conventions' schema naming and on Zod's `_zod` definitions.

**Log in `docs/laters.md`:**

- Type-checking `scripts/`: 25 errors under the flags measured from an ad hoc run. 24 have one cause, a helper in the read guard's test. The docs generator's import needs a design choice, because the API's `dist` has no declarations and `@ts-` comments are banned.
- Server-side checks on API responses: strict output doesn't stop the server sending a field.
- Other API clients with the malformed 2xx pattern, from Ticket 04's `## Comments`.

**Allowed packages:** None

**Blocked by:** 01, 02, 04, 06

**Status:** ready-for-agent

- [ ] The contracts conventions have the rule, its reasons, examples and the named exception
- [ ] `GetMessagesQuerySchema` and `RegisterRequestSchema` are strict
- [ ] A Messages request with `?befor=5` and a register request with an unknown key each get a 400, and requests without unknown keys behave as before
- [ ] The new contracts test passes, and fails if a schema breaks the rule
- [ ] The `UserSearchResultSchema` comment and the Breaking changes section are corrected
- [ ] The `docs/laters.md` entries are added
- [ ] The browser check is done and recorded in the PR

**Verification:**

- Contracts tests for both converted schemas, and API behaviour tests for both routes, written first.
- Confirm the new test can fail by temporarily making one schema break the rule, then revert.
- If an existing test sends an unknown key to either route, raise it rather than loosening the test.
- One browser check, following the browser check doc, with this Spec's runtime changes in: log in, sign up with a Nickname, open a Conversation and scroll back for older Messages, search for a User, create a group, add and remove a Member, leave the group, and check the console for errors. If you're logged out unexpectedly, compare with `pnpm serve:web` before treating it as a regression: the dev `<StrictMode>` refresh problem in `docs/laters.md` can cause that.

**Out of scope:** Making all-required requests strict. Making other outputs strict. Parsing responses in the API. An ADR. Fixing the dev `<StrictMode>` refresh problem. Walking nested schemas in the test.

## Comments
