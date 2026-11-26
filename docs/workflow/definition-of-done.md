---
kind: intent
---

# Definition of done

Every PR passes this one checklist.

## How to use it

- Copy the checklist into the PR body and tick each item. An item that doesn't apply is ticked with "n/a" and a reason, never deleted.
- The Implementer ticks the checklist; the Orchestrator checks it before merging. A PR with any unticked item stays in draft.
- The last commit of the PR closes the Ticket: set `**Status:** resolved` and add a short summary under `## Comments` (what was verified, follow-ups created). A commit that changes only the Ticket file needs no re-run: "final commit" in the checklist means the last commit that changes anything else. Example summary:

  ```markdown
  ## Comments

  Resolved. Verified with `pnpm test` and a browser check of the badge at mobile and desktop widths. Follow-up: "Stored Unread Count" in `docs/laters.md`.
  ```

## Checklist

```markdown
- [ ] Every acceptance criterion in the Ticket is met and ticked in the Ticket file.
- [ ] No dependency changed beyond the Ticket's Allowed packages (the PR guard checks this).
- [ ] Tests follow the testing policy: the right kind, written first, nothing weakened without approval.
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass locally on the final commit, and `pnpm docs:check` passes.
- [ ] Docs affected by the change are updated in this PR; `pnpm docs:generate` was run and committed if the schema, routes or realtime events changed.
- [ ] Migrations follow ADR 0003 (never hand-edited).
- [ ] No limit, code or wire shape is re-declared outside contracts.
- [ ] Nothing outside the Ticket changed (the PR guard checks this); anything noticed is appended to `docs/laters.md` or raised.
- [ ] Every assumption is listed in the PR body and under the Ticket's `## Comments`.
- [ ] The latest feature branch is merged in; the PR targets the feature branch, links the Ticket and says how the change was verified (including the browser check when the testing policy requires one).
```

## Opening the PR

- Open and update the PR with the GitHub MCP tools: `mcp__github__create_pull_request` to open it, `mcp__github__update_pull_request` to mark it ready. Not `gh`, which may not be logged in.
- Write the body with the `pr` skill, with the checklist above copied in verbatim.
- Open it ready for review, unless [How to use it](#how-to-use-it) keeps it in draft.

## A check you cannot run

A check cannot run when something it needs is missing from the environment, such as Docker for the API tests in `pnpm test` ([setup](setup.md)). A check that runs and fails never counts: fix it or [escalate](escalation.md).

- Leave its item unticked, and under it in the PR body say which check did not run and why.
- Add one line saying the same to the Ticket's closing summary under `## Comments`.
