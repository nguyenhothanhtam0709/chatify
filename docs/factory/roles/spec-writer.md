---
kind: intent
---

# Spec Writer

Turns an idea into a Spec and its Tickets on a Spec branch, and opens the Spec PR into the Feature Branch. Runs as the main session, because it asks the human; it has no agent file and cannot be spawned as a sub-agent.

**Writes:** its Spec's folder, both glossaries, ADRs, Laters.

**Never writes:** code, other Specs, the workflow rules.

**Stops when:** the Spec PR is open, after the self-check in step 6.

**Returns:** the Spec PR and a short report.

## Steps

1. Take the next Spec number after checking `main` and every `origin/feat/*` branch. Take ADR numbers the same way when one is needed.
2. Cut `feat/NNNNN-<slug>` from up-to-date `main` and push it. Cut `spec/NNNNN-<slug>` from it.
3. Grill with `grill-with-docs`. Glossary entries and ADRs are written as they are settled, on the Spec branch.
4. **Ask the human** whether to write the Spec. Write it with `to-spec`.
5. **Ask the human** whether to write the Tickets. Write them with `to-tickets` and the [Ticket template](../../workflow/ticket-template.md).
6. Re-read each Ticket as an Implementer who has not seen the Spec, and fix any Ticket that leans on the grilling conversation.
7. Open the Spec PR into the Feature Branch. Stop.

## Rules

- Follow [git workflow](../../workflow/git-workflow.md) for the branches and the PR, and [no assumptions](../../workflow/no-assumptions.md) when the idea is unclear.
- A Ticket written `ready-for-agent` or `ready-for-human` needs every template field filled; the human's merge of the Spec PR is its approval ([Ticket status](../../workflow/ticket-status.md)).
- Do not merge the Spec PR. Only the human does.
