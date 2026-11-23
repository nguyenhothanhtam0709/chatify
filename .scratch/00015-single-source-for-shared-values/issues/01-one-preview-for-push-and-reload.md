# 01: The Preview is the same after a push and after a reload

**What to build:** Today a Message whose body starts or ends with a newline gets a different Preview depending on the path. Over the realtime push the web app shows `hello`. After a reload, `GET /conversations` shows ` hello `. The cause: the API builds the Preview in SQL, where Postgres `trim()` strips only spaces, while the web app builds it in JS. Make one definition and use it on both sides. Touches contracts, api, web and docs. Rules:

- Contracts export `previewOf(body: string): string`. It trims the body with JS `String.prototype.trim`, replaces each run of `/\s+/g` with one space, and keeps the first `LAST_MESSAGE_PREVIEW_MAX` code points (not UTF-16 units). This is the same definition of whitespace that `MessageBodySchema` uses for its "not blank" check, so NBSP, U+FEFF and U+2028/2029 count as whitespace.
- The Conversation summary query stops building the Preview in SQL. It selects the last visible Message's full `body`, and the row mapping applies `previewOf`. Which Message counts as the last visible one does not change: a System Message still never becomes the Preview.
- The web Conversation list deletes its local preview helper, together with the comment that claims it matches the server, and imports `previewOf` instead.
- `ConversationSummarySchema` keeps its shape. The doc comment on `preview` points to `previewOf` instead of restating the rule.
- No migration and no backfill: the Preview is computed at query time and is never stored.
- Docs, using the wording in the Spec's Implementation Decisions → Docs:
  - Add **Preview** to the Chat glossary, under Conversations.
  - In the contracts conventions, change the Package shape line so it allows pure helpers that api and web must compute identically.
  - Also in the contracts conventions, add to the Tests boundaries: leading and trailing whitespace (including newline and NBSP), and characters outside the BMP at a length limit.
  - In the general conventions, add the rule "a value both api and web compute comes from one contracts helper".
  - In the API conventions, add the rule "don't transform user text in SQL".

See the Spec's Part 1 for the reasoning.

**Allowed packages:** None

**Blocked by:** None

**Status:** ready-for-agent

- [ ] After a Message with body `"\nhello\n"` is sent, `GET /conversations` returns the Preview `hello`
- [ ] Contracts export `previewOf`, and both the API and the web Conversation list use it; neither has its own copy of the rule
- [ ] No SQL in the API trims, collapses or cuts a Message body to build the Preview
- [ ] A System Message still never becomes a Conversation's Preview, and the existing tests for that pass
- [ ] The glossary has a **Preview** entry, and the contracts, general and API conventions have the lines listed above

**Verification:** Test first. Add an API behaviour test for the `"\nhello\n"` body to the existing Preview tests in the API messages suite, and watch it fail before the fix. Add a table-driven `it.each` contracts test for `previewOf` covering:

- a leading and trailing newline, tab and NBSP
- mixed whitespace in the middle of the body
- bodies of exactly 100 and 101 code points
- an emoji outside the BMP straddling the 100-code-point boundary

No new web test: the existing realtime push test for the Preview must stay green.

**Out of scope:** How System Messages are filtered from the Preview (the `owner_changed` entry in Laters); rejecting zero-width-only bodies; any change to the `ConversationSummary` wire shape; limit constants (Ticket 02).

## Comments
