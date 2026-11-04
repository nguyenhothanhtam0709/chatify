# 04: Mobile sheet closes on open

**What to build:** On mobile, opening a Conversation closes the sidebar sheet, so the User sees the Conversation straight away. Today the sheet stays open until Escape. Touches the web package only. Details are in spec 00011, "Implementation Decisions", "Mobile sidebar sheet".

- Close the sheet whenever the open Conversation changes on a mobile viewport. That covers a pick from the sheet, a pick from the new-conversation dialog, and Back or Forward. Tying it to the route change covers all three in one place.
- A Conversation URL opened on mobile shows the Conversation with the sheet closed, as today.
- Back from a Conversation on mobile shows the previous Conversation or the empty state, without reopening the sheet.
- Don't edit the generated shadcn/ui components. Use the sidebar's existing mobile open state.

**Allowed packages:** None

**Blocked by:** 01

**Status:** resolved

- [x] On a mobile viewport, picking a Conversation in the sheet closes the sheet and shows the Conversation
- [x] On a mobile viewport, a Conversation URL opens with the sheet closed
- [x] On a mobile viewport, Back from a Conversation doesn't reopen the sheet
- [x] On desktop, the sidebar is unchanged
- [x] Existing tests pass unchanged

**Verification:**

- Whole-app jsdom tests: `<App />` with MSW, and a mobile viewport the way the existing mobile sidebar tests set one up, or a narrow `matchMedia` if none exist. Assert that the sheet dialog is gone after a pick.
- Browser check, as in `docs/workflow/browser-check.md`: at 375x667 with touch emulation, tap a Conversation in the sheet and confirm the sheet closes.

**Out of scope:** Any other mobile layout change. Swipe gestures.

## Comments
