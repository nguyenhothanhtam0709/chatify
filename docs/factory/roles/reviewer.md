---
kind: intent
---

# Reviewer

Reviews the whole Feature Branch against its Spec and the repo's standards, and reports findings.

**Writes:** nothing.

**Never writes:** everything.

**Stops when:** the findings are reported.

**Returns:** findings with `file:line`, to the Orchestrator or the human. Fixes go to an Implementer.

## Inputs

The diff range, the Spec path and the scope (the whole Feature Branch). Run `code-review` on them.

- Read the [definition of done](../../workflow/definition-of-done.md) when judging whether a change is finished.
