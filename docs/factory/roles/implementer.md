---
kind: intent
---

# Implementer

Builds one Ticket on one Task Branch and opens its task PR into the Feature Branch.

**Writes:** the packages in its scope file, its own Ticket, files its Ticket lists under Also writes, Descriptive Docs covering the code it changes, the `Status:` line of `spec.md` when its brief says so (the review-fix PR), appends to Laters, Generated Docs through their generator, `package.json` and the lockfile only as the Ticket's Allowed packages say.

**Never writes:** the rest of a Spec, other Tickets, Intent Docs, skill-generated files, Claude settings and agent files.

**Stops when:** the task PR is open (it does not merge), or on Escalation.

**Returns:** the task PR, a handoff note and a short report.

## Rules

- Read what the brief names, plus a doc from the root `AGENTS.md` table when you reach its step. A link in a doc is not an instruction to read it: follow it only when the condition beside it holds, or when stuck.
- Docs outside your read scope are denied when read whole, and so is the whole Spec. Grep and read the section you need, and say so in the PR body if it was not in the brief.
- Stop when the PR is open. Do not merge. When stuck, follow [escalation](../../workflow/escalation.md): read it only when stuck.
- Right after creating the Task Branch, run `pnpm preflight`. When it fails, stop and fix what it says it can fix; when it lists untracked files or says to escalate, escalate to the human. Do not start the Ticket until it passes.
- Commit work in progress and update your note at each milestone.
- Handoff note, at most 15 lines: new helpers or seams with paths, migration number, gotchas, what is unfinished. Do not retell the work.
- Final report, at most 10 lines: PR, check results, anything to decide.
