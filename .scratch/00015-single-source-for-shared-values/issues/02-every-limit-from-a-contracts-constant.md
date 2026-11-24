# 02: Every limit comes from a contracts constant

**What to build:** Several limits are written as bare numbers in schemas, user-facing strings and one query. Some of them have no constant at all, even though the contracts conventions require one. Give every limit one definition in contracts and read it everywhere else. Touches contracts, web, api and docs. Rules:

- Contracts export `NICKNAME_MAX` (50), `USERNAME_MIN` (3), `USERNAME_MAX` (32), `PASSWORD_MIN` (8), `PASSWORD_MAX` (128) and `USER_SEARCH_LIMIT` (20), next to the schemas they belong to. The Nickname, Username and Password schemas use them, and their messages interpolate them. Accepted input does not change.
- Every web string that names a limit interpolates its constant (`GROUP_MEMBERS_MAX`, `GROUP_NAME_MAX`, `NICKNAME_MAX`, `USERNAME_MIN`/`USERNAME_MAX`, `PASSWORD_MIN`/`PASSWORD_MAX`). This covers the sign-up form hints, the profile dialog error, the new-Group dialog hint, and the error messages in the web API client for Groups and the profile. The rendered text stays exactly the same.
- The API User search uses `USER_SEARCH_LIMIT` for its result limit, and its doc comment refers to the constant instead of the number.
- Docs, using the wording in the Spec's Implementation Decisions → Docs:
  - In the web conventions, add "a limit shown to the user is interpolated from its contracts constant", and point to the composer's use of `MessageBodySchema` as the pattern.
  - In the definition of done, add "No limit, code or wire shape is re-declared outside contracts."

See the Spec's Part 2.

**Allowed packages:** None

**Blocked by:** None

**Status:** ready-for-agent

- [x] Contracts export the six constants above, and the Nickname, Username and Password schemas use them
- [x] No web string spells out a limit as a number; each one reads the constant, and the rendered text is unchanged
- [x] The User search limit reads `USER_SEARCH_LIMIT`
- [x] The web conventions and the definition of done have the lines listed above

**Verification:** Change the min and max boundary cases in the existing contracts tests for the Nickname, Username and Password schemas to use the constants. This is a refactor everywhere else, so the existing web and API behaviour tests must pass unchanged, with no assertion loosened.

**Out of scope:** Changing any limit's value; the lint rule and scripts that enforce this (Tickets 04-06); the realtime event union (Ticket 03).

## Comments
