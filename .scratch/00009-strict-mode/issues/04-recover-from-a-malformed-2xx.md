# 04: Recover from a malformed 2xx

**What to build:** When a 2xx response fails its schema, the User sees a message and can try again (spec 00009, "Implementation Decisions"). Touches the web package only.

The API clients call `parse` on a 2xx response outside their error handling, so a bad response throws. Handlers are written for a result, so the throw skips their cleanup:

| Flow | On a malformed 2xx today |
| --- | --- |
| New Group | Button stuck disabled, no message |
| Leave Group, Add Member, Remove Member | Controls stuck disabled, no message |
| Log in, sign up, profile update | Button recovers, no message, unhandled rejection |

**The fix:**

- Fix the client functions those flows call. A 2xx that fails its schema returns that function's existing `ok: false` shape with the message `Something went wrong. Try again.` For sign up, the message goes in `formError`.
- Use `safeParse`, or move the `parse` inside the existing error handling, whichever suits the function.
- Don't change the handlers. Don't change results for valid responses or for other failures.

**Allowed packages:** None

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] For each flow in the table, a malformed 2xx shows `Something went wrong. Try again.` and the control can be used again
- [ ] A malformed 2xx causes no unhandled rejection in those flows
- [ ] Results for valid responses and for other failures are unchanged
- [ ] Other API clients are unchanged

**Verification:** Web behaviour tests, written first: render `<App />`, have MSW return a malformed 2xx for each flow, and check the message and that the control recovers. Show them failing before the fix. No browser check here: the real API can't easily return bad data, and Ticket 07's browser check covers these flows on valid responses.

**Out of scope:** Other API clients with the same pattern: note any you see in this Ticket's `## Comments`, for Ticket 07 to log. Adding `try/finally` to handlers. Changing the API.

## Comments
