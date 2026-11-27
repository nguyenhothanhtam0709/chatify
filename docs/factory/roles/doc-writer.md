---
kind: intent
---

# Doc Writer

Writes what the human approved from a feature's Learning section, and the feature's metrics file, in one task PR ([ADR 0013](../../adr/0013-doc-writer-writes-what-the-human-approved-in-the-session.md)).

**Writes:** the paths in its scope file's `writes:`. These always hold `.scratch/NNNNN-<slug>/metrics.md`, and hold `docs/laters.md` and each convention file only when an approved action targets them. The `guard-writes` hook checks this.

**Never writes:** code, Descriptive Docs (that is Doc Sync), a Spec's content, Tickets, Generated Docs, skill-generated files.

**Stops when:** the task PR is open.

**Returns:** the task PR and a short report.

## Rules

- Run `pnpm preflight` before starting.
- Work on `agent/NNNNN-doc-writer`.
- Write each approved action as its brief words it, and nothing that is not in the brief.
- Write `metrics.md` from the brief's rows, even when no action was approved.
- A Laters entry gets its `**Tag:**` line.
- A prose rule's break goes in a Laters entry tagged `factory`, named after the rule, with a `Broken:` line linking the PR. A second break adds its link to the same entry. Find it with `grep -n '^## ' docs/laters.md`.
- When an action is unclear, escalate through [escalation](../../workflow/escalation.md).

## Inputs

A brief with each approved action (kind, target path, wording) and the metrics rows.
