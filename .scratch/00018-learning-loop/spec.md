# Spec: Learning Loop

Status: ready-for-agent

## Problem Statement

The Factory does a feature's work, but it doesn't record what the feature taught it.

- Stage 10 Learning in the SDLC page has Gate "None" and is checked by "Nobody", so it is the Stage most likely to be skipped. Its output, "Notes in Laters", has no Actor who can write it: the Orchestrator never pushes to the Feature Branch and writes no docs, and every Implementer has left by then.
- The Orchestrator page says "No Haiku until there are numbers", but nothing collects numbers. Model, escalations, PR guard denials and re-runs per Ticket are not recorded anywhere. `pnpm metrics:tokens` reads token use, but nobody runs it or keeps the result.
- "A rule broken twice gets automated" has no record of what was broken, or of how each rule is enforced today. The definition of done marks two items "(the PR guard checks this)"; the other items say nothing.
- Escalation step 2 ("what you tried, the question, the options with your recommendation, and what is blocked") has no fixed shape, so questions vary in how quickly the human can answer them. The "A wrong Spec" section still says the human fixes the Spec through a PR to `main`, which [ADR 0011](../../docs/adr/0011-specs-merge-into-their-feature-branch.md) replaced.
- The Orchestrator's merge step 1 is "Read the PR". Findings that a check against the Ticket's acceptance criteria would catch reach the end-of-branch review instead (Spec 00015 needed a separate findings PR, #209).
- An Implementer's handoff note has no line for guesses or reads outside scope, so there is nothing to collect them from.
- `docs/laters.md` has about 30 entries that mix product features, code debt and Factory ideas, with no way to tell them apart.
- The read guard denies a whole read of a file in the scope file's `writes:` (seen in Ticket 00017-09), so a Role that must edit an Intent Doc can only read it in parts.

## Solution

1. **A Learning section** in every feature PR to `main`, with five fixed headings; "None" is valid, the section is never left out. This gives Stage 10 a Gate, checked by the human.
2. **The Orchestrator drafts it and asks the human** about each item in the session, proposing an action for each: a Laters entry, a convention edit, a brief or scope fix, or no action.
3. **A new Role, the Doc Writer**, writes what the human approved and the feature's metrics file, in one task PR into the Feature Branch, before the feature PR. The human's in-session approval reaches the write guards through the scope file's `writes:` ([ADR 0013](../../docs/adr/0013-doc-writer-writes-what-the-human-approved-in-the-session.md)).
4. **A metrics file per feature**, `.scratch/NNNNN-<slug>/metrics.md`: one row per Ticket and one row for the branch's review.
5. **Three fixed lines in the Implementer's handoff note**: guesses, reads outside scope, PR guard denials.
6. **Enforcement tags** on each item of the definition of done, and broken prose rules counted in Laters so the second break is seen.
7. **An Escalation Report** with a fixed shape replaces escalation step 2 and is reused in the draft PR body.
8. **The merge check reads an acceptance-criteria map**: every task PR body maps each criterion to its evidence, and the Orchestrator checks the map against the diff before merging.
9. **Every Laters entry has a tag**, `product`, `debt` or `factory`, checked by `pnpm docs:check`.
10. **The read guard allows a whole read of every path in `writes:`**, except `docs/laters.md`.

## User Stories

1. As the human, I want every feature PR to `main` to have a Learning section, so that I see what the feature taught the Factory before I merge it.
2. As the human, I want the Learning section to have the same five headings every time, so that I can scan it quickly and notice an empty one.
3. As the human, I want "None" under a heading to be an explicit answer, so that I can tell "nothing happened" from "nobody looked".
4. As the human, I want the Orchestrator to ask me about each Learning item in the session, with a proposed action, so that I decide what changes before anything is written.
5. As the human, I want to reject a Learning item, so that one-off noise doesn't become a rule.
6. As the human, I want the approved items written in a task PR I can see again in the feature PR, so that nothing is written behind my back.
7. As the Orchestrator, I want to collect repeated review findings, reads outside scope, guesses and broken rules from the handoff notes, task PRs and findings, so that I can draft the Learning section without re-reading the code.
8. As the Orchestrator, I want each Implementer's handoff note to carry fixed `Guessed:`, `Read outside scope:` and `PR guard denials:` lines, so that I can collect them with `grep`.
9. As the Orchestrator, I want to hand the approved actions to a Doc Writer, so that I keep writing no docs.
10. As the Orchestrator, I want the Doc Writer's scope file `writes:` to list exactly the approved paths, so that the existing guards enforce the human's approval.
11. As the Doc Writer, I want my brief to list each approved action, its target path and its wording, so that I write what was approved and nothing else.
12. As the Doc Writer, I want to read every file in my `writes:` whole, so that I can edit a convention without reading it in pieces.
13. As the Doc Writer, I want `guard-writes` to deny any path not in my `writes:`, so that I can't drift outside the approved items.
14. As the Doc Writer, I want to run even when every Learning item is None, so that the metrics file is always written.
15. As the human, I want one metrics file per feature, committed with the feature, so that the numbers reach `main` and can be compared across features.
16. As the human, I want each Ticket's row to show its model, whether it escalated, how many times the PR guard denied it, how many merge-check findings it had, whether it was re-run and its tokens, so that a later decision on models has evidence.
17. As the human, I want one row for the branch's review findings, so that I see how much the end-of-branch review caught.
18. As the Orchestrator, I want to run `pnpm metrics:tokens` once per feature, so that token use per agent is recorded without each agent measuring itself.
19. As a reader of a workflow doc, I want each definition of done item to say how it is enforced (a hook, a check or prose), so that I know which rules a machine guarantees.
20. As the human, I want a prose rule's first break recorded in a Laters entry tagged `factory`, so that its second break is seen and proposed for automation.
21. As the Orchestrator, I want a second break of the same rule to show up in the Learning section as a proposal to automate it, so that "broken twice, automate it" actually happens.
22. As the human, I want every escalation to arrive as an Escalation Report with a fixed shape, so that I can answer it quickly.
23. As an escalating agent, I want the report to quote the Ticket or Spec text, give evidence with `file:line`, say why it blocks, give the options with my recommendation, and say what is blocked and what continues, so that I don't have to decide what to include.
24. As the human, I want the same report in the draft PR body, so that I can answer from the PR.
25. As the human, I want the "A wrong Spec" rule to match ADR 0011, so that a Spec fix goes into the Feature Branch, not `main`.
26. As an Implementer, I want the PR body to map each acceptance criterion to a test name, a `file:line` or a command, so that the merge check is quick.
27. As the Orchestrator, I want to check that map against the diff before merging, opening a file only when the evidence is unclear, so that a missed criterion is caught before the end-of-branch review.
28. As the Orchestrator, I want to send a PR with a missed criterion back to its Implementer through `SendMessage`, and count it as a merge-check finding, so that the miss is fixed and counted.
29. As a reader of Laters, I want each entry tagged `product`, `debt` or `factory`, so that I can list one kind with `grep`.
30. As an agent appending to Laters, I want the file's header to tell me to add a `**Tag:**` line, so that my entry passes `docs:check`.
31. As the human, I want `docs:check` to fail on an untagged Laters entry, so that the tags don't rot.
32. As the human, I want the existing Laters entries tagged by this Spec, so that the check starts green.
33. As a reader of the SDLC page, I want Stage 10's row, the Agent Roles table and the Hand-off table to show the Learning section and the Doc Writer, so that the frame matches what runs.

## Implementation Decisions

### The Learning section

- The Orchestrator writes `## Learning` into the body of the feature PR to `main`. Its Writes already include "the feature PR"; they don't change.
- Five headings, in this order, each with its items or `None`:
  - **Repeated findings**: review or merge-check findings that came up in two or more Tickets (a candidate convention).
  - **Reads outside scope**: from the task PR bodies and the `Read outside scope:` lines (a brief or scope to fix).
  - **Guesses**: from the `Guessed:` lines and the PR bodies' assumptions (a doc to fill in).
  - **Broken rules**: definition of done items or other rules broken during the feature, with the rule's enforcement tag.
  - **Metrics**: a link to the feature's `metrics.md`.
- Each item says the action the human approved and the PR that did it, or that the human rejected it.
- The rule lives in a new section of `docs/workflow/orchestrator.md`. It is not added to `docs/workflow/git-workflow.md`, which is skill-generated.
- Stage 10's row in the SDLC page: Actor becomes the Orchestrator, then the Doc Writer; Output the Learning section and the Doc Writer's task PR; Gate "The feature PR has a Learning section with every heading filled, None allowed"; Checked by "Human". The row also states "broken twice, automate it" and points at the enforcement tags.

### The order at the end of a feature

1. Review, then the review-fix Implementer (which still sets the Spec's `Status: resolved`), then Doc Sync if the Orchestrator decides so. Unchanged.
2. The Orchestrator drafts the Learning section and runs `pnpm metrics:tokens`.
3. It asks the human about each item with `AskUserQuestion`, each with a proposed action: `Laters entry`, `convention edit`, `fix brief/scope`, or `no action`.
4. It writes the Doc Writer's brief and scope file, and spawns it by `subagent_type: doc-writer`.
5. It merges the Doc Writer's task PR as any task PR.
6. It opens or updates the feature PR with the Learning section.

`implement-spec`'s own steps are unchanged except as `orchestrator.md`'s list of changes says; this adds one entry to that list.

### The Doc Writer

- A new Agent Role: an agent file `.claude/agents/doc-writer.md` (Sonnet; the same tools as Doc Sync) and a Role file `docs/factory/roles/doc-writer.md`, in the shape of the other Role files.
- **Writes:** the paths in its scope file's `writes:`, which always hold `.scratch/NNNNN-<slug>/metrics.md` and hold `docs/laters.md` and each convention file only when an approved action targets them.
- **Never writes:** code, Descriptive Docs (that is Doc Sync), a Spec's content, Tickets, Generated Docs, skill-generated files.
- **Stops when:** the task PR is open. **Returns:** the task PR and a short report.
- Task Branch `agent/NNNNN-doc-writer`, which preflight accepts beside `agent/NNNNN-doc-sync`. Its scope file has `ticket: none`, no packages and the approved `writes:`.
- It runs once per feature, even when every Learning item is None.
- Doc Sync keeps writing only Descriptive Docs.
- Rows in the SDLC page's Agent Roles and Hand-off tables. Gets: a brief with each approved action (kind, target path, wording) and the metrics rows. Returns: a task PR.
- `guard-writes` and the Diff-scope check know the `doc-writer` agent type: only `writes:` paths pass, and `docs/laters.md` may change existing lines when it is in `writes:`, as for any Role today.

### Approval through the scope file

ADR 0013. The human's answers in the session are the approval; the Orchestrator copies each approved path into `writes:`. No new scope fact is added.

### The metrics file

- Path `.scratch/NNNNN-<slug>/metrics.md`, written by the Doc Writer from the rows in its brief.
- One table, one row per Ticket, columns: Ticket, model, escalated (yes/no), PR guard denials (a count), merge-check findings (a count), re-run (no, or yes and why), tokens (the total for that Ticket's agents from `pnpm metrics:tokens`).
- One more row, for the branch: the number of review findings.
- Where the Orchestrator gets each column: model, escalated, re-run and merge-check findings it knows itself; PR guard denials from the handoff note; tokens from `pnpm metrics:tokens`, run once for the session.

### The Implementer's handoff note

Three fixed lines are added to the handoff note rule in the Implementer Role file, each `None` when empty: `Guessed:`, `Read outside scope:`, `PR guard denials: <n>`. The note stays at most 15 lines.

### Enforcement tags

- An inline marker at the end of each item: `(hook: <name>)`, `(check: <command>)` or `(prose)`. The two existing "(the PR guard checks this)" become `(hook: guard-pr)`.
- This Spec tags only the definition of done checklist. Because the checklist is copied into every PR body, the tags appear there too.
- A prose rule's first break: the Doc Writer adds a Laters entry tagged `factory`, named after the rule, with a `Broken:` line linking the PR. A second break: the Doc Writer adds the second link to the same entry (found by `grep` on the rule's name), and the Orchestrator's Learning section proposes automating the rule.

### The Escalation Report

- A Factory glossary term (already on this Spec's branch).
- It replaces the text of step 2 of "How to escalate" in `docs/workflow/escalation.md`, under the Ticket's `## Comments`, with these parts: the quoted Ticket or Spec text, the evidence with `file:line`, why it blocks, the options with a recommendation and the proposed Ticket fix, the work that is blocked, the work that continues.
- Step 4 puts the same report in the draft PR body.
- "A wrong Spec" changes to: stop and set `needs-info` on each affected Ticket; the human fixes the Spec through a PR into the Feature Branch.

### The merge check

- The definition of done gets one checklist item: the PR body maps each acceptance criterion to its evidence (a test name, a `file:line` or a command).
- Merging step 1 in `orchestrator.md` changes from "Read the PR" to: check the map against the diff, criterion by criterion, opening a file only when the evidence is unclear.
- A criterion the diff doesn't meet: the PR goes back to its Implementer through `SendMessage`, and counts as one merge-check finding in the metrics.

### Laters tags

- A `**Tag:** product | debt | factory` line right under each `## ` heading, one value per entry.
- `pnpm docs:check` fails when a `## ` entry in `docs/laters.md` has no tag line or a value outside the three.
- This Spec tags every existing entry in one Ticket, which lists `docs/laters.md` under Also writes, landing with the check or before it so the check starts green.
- The header line of `docs/laters.md` tells an agent to add the tag line when appending.

### The read guard

`guard-reads` allows a whole read of every path in the scope file's `writes:`, except `docs/laters.md`, which stays readable by section only.

### Docs this changes

- **SDLC page**: Stage 10's row, the Agent Roles table (a Doc Writer row), the Hand-off table.
- **Orchestrator page**: the list of changes to `implement-spec`, the Learning section, the Doc Writer's brief and scope file, the merge check, gathering metrics.
- **Escalation**, **definition of done**, **Implementer Role file**.
- **New**: Doc Writer Role file and agent file.
- **Scripts**: `guard-writes`, the Diff-scope check, preflight's branch name, `guard-reads`, `docs:check`.
- **Laters**: tags on every entry and its header. This Spec's PR already removes the "Enforcement tags" bullet of "Enforce the doc and convention rules" and the entry "The read guard denies a Ticket's Also writes files whole".
- **Glossary** (already on this Spec's branch): Escalation Report, Learning section; Task Branch now includes the Doc Writer's branch. **ADR 0013** (already on this Spec's branch).

### Building this Spec

- Every Ticket is a task PR into the Feature Branch; Intent Docs, agent files and settings are listed under each Ticket's Also writes.
- The Doc Writer's hooks (write boundary, preflight, read guard) land before the docs that tell the Orchestrator to spawn it.
- This feature's own end follows the old order: the Doc Writer exists only once the Feature Branch is merged and a new session starts, because agent files load at session start.

## Testing Decisions

- A good test drives a script's decision function with the input a hook or the shell would give it, and checks the verdict and its reason. I/O is passed in, as in the existing hook tests; our own code is not mocked ([testing policy](../../docs/workflow/testing-policy.md)).
- Tests are `node --test` files next to each script, run by `test:scripts`. Prior art: `guard-writes.test.ts`, `check-diff.test.ts`, `guard-reads.test.ts`, `preflight.test.ts`, `check.test.ts`.
- **Write boundary** for `doc-writer`: a path in `writes:` passes; a convention not in `writes:` fails; code fails; `metrics.md` in `writes:` passes; a changed line in `docs/laters.md` passes only when it is in `writes:`.
- **Preflight**: `agent/00018-doc-writer` passes with `ticket: none`; `agent/00018-doc-writers` fails.
- **Read guard**: a path in `writes:` reads whole; `docs/laters.md` in `writes:` still doesn't; a doc in neither is still denied.
- **`docs:check` on Laters**: an entry with a valid tag passes; a missing tag line fails; an unknown value fails; the error names the entry's heading.
- **Docs-only Tickets** (the Learning section, escalation, definition of done, tags) have no automated test; `pnpm docs:check` passes on them.
- **The Doc Writer end to end**: a final `ready-for-human` Ticket in a fresh session on the Feature Branch spawns a Doc Writer with a sample brief and checks that an edit outside `writes:` is denied.

## Out of Scope

- Replaying past Tickets to compare workflow changes: it needs the numbers first; it stays in Laters.
- Choosing Haiku or changing any model rule: this Spec only collects the numbers.
- A required retro: the SDLC page keeps it optional.
- Enforcement tags on docs other than the definition of done.
- Automating any prose rule: this Spec only records breaks.
- Any change to `docs/workflow/git-workflow.md`, `docs/agents/`, the root `AGENTS.md` or other skill-generated files.
- Doc Sync's Writes.
- Rewriting existing Tickets, PR bodies or handoff notes in the new shapes.
- CI and branch protection.
- Any npm package change.

## Further Notes

- This Spec came out of a grilling session on the grill brief in this folder, which first checked the brief against the workflow Specs 00016 and 00017 merged. The conflicts it found: Learning is Stage 10, not 11; the Orchestrator can't commit, so neither it nor a merged Implementer can write Laters or a metrics file; review findings exist per branch, not per Ticket; a new file in the repo needs a Role's Writes and `guard-writes`; "A wrong Spec" contradicts ADR 0011; `git-workflow.md` is skill-generated; `pnpm metrics:tokens` already reads tokens; the definition of done already has two enforcement notes; and Laters' `cat >>` instruction must mention the tag.
- The Doc Writer was the human's answer to "who acts on a Learning item". It also takes the metrics file, which the brief had left to the review-fix Implementer.
