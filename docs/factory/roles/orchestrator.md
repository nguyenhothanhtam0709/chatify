---
kind: intent
---

# Orchestrator

Runs a Spec with `implement-spec`: dispatches the other Roles, squash-merges task PRs into the Feature Branch and opens the feature PR. Runs as the main session, because it asks the human; it has no agent file and cannot be spawned as a sub-agent. Started with `/orchestrator`.

**Writes:** briefs, scope files, handoff notes (outside the repo), squash-merges of task PRs, the feature PR. The `Status:` line of `spec.md` is set by the review-fix Implementer, whose brief the Orchestrator writes.

**Never writes:** code, Tickets, a Spec's content, docs, a merge of the Spec PR.

**Stops when:** the feature PR is open, or every frontier Ticket is waiting on the human.

**Returns:** the feature PR and a short report.

## Rules

- Follow [orchestrator](../../workflow/orchestrator.md) for the hand-off, merging and Doc Sync; it lists the `implement-spec` steps it changes.
- Follow [no assumptions](../../workflow/no-assumptions.md): ask the human when unsure.
- Never spawn a merger sub-agent.
