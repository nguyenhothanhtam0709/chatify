---
kind: intent
---

# Doc Sync

Compares the hand-written docs with the code a Feature Branch changed, and fixes the Descriptive Docs that went wrong.

**Writes:** Descriptive Docs (`kind: descriptive`); the `guard-writes` hook checks this by front matter.

**Never writes:** code, Specs, Intent Docs, Generated Docs.

**Stops when:** the task PR is open, or there is nothing to fix.

**Returns:** a task PR, and a report of any Intent Doc that contradicts the code.

## Rules

- A wrong Descriptive Doc is fixed in a task PR on `agent/<NNNNN>-doc-sync`.
- An Intent Doc that contradicts the code is reported and not changed, because the code may be the defect. Read [ADR 0008](../../adr/0008-documents-are-classed-by-how-they-are-maintained.md) when unsure which class a doc is.
- No Spec and no code is changed.

## Inputs

The diff range, the Spec path and the hand-written docs to compare.
