# 05: The Learning section and the metrics

**What to build:** Every feature PR to `main` has a Learning section, which gives Stage 10 Learning a Gate. The Orchestrator drafts it, asks the human about each item in the session, and hands the approved actions and the feature's metrics to the Doc Writer (Ticket 04). Implementers leave the inputs in their handoff notes. Rules:

- **`docs/workflow/orchestrator.md`**:
  - A new section, **Learning**, that says the Orchestrator writes `## Learning` into the feature PR body, with these five headings in this order, each with its items or `None` (the section is never left out):
    - **Repeated findings**: review or merge-check findings that came up in two or more Tickets.
    - **Reads outside scope**: from the task PR bodies and the handoff notes' `Read outside scope:` lines.
    - **Guesses**: from the handoff notes' `Guessed:` lines and the PR bodies' assumptions.
    - **Broken rules**: rules broken during the feature, each with its enforcement tag (`(hook: …)`, `(check: …)` or `(prose)`). A `(prose)` rule that already has a `factory` Laters entry with a `Broken:` line is broken for the second time: propose automating it.
    - **Metrics**: a link to `.scratch/NNNNN-<slug>/metrics.md`.
    Each item ends with the action the human approved and the PR that did it, or "rejected".
  - The order at the end of a feature: review, review-fix, Doc Sync if decided (unchanged); then draft the Learning section and run `pnpm metrics:tokens` once; ask the human about each item with `AskUserQuestion`, proposing one of `Laters entry`, `convention edit`, `fix brief/scope`, `no action`; write the Doc Writer's brief and scope file; spawn it; merge its task PR; then open or update the feature PR. The Doc Writer runs even when every item is None.
  - The Doc Writer's brief: each approved action with its kind, target path and wording, and the metrics rows. Its scope file: `ticket: none`, no packages, and `writes:` with `.scratch/NNNNN-<slug>/metrics.md` plus each approved action's target path, exactly ([ADR 0013](../../../docs/adr/0013-doc-writer-writes-what-the-human-approved-in-the-session.md)).
  - The metrics: one table, one row per Ticket, columns Ticket, model, escalated (yes/no), PR guard denials (count), merge-check findings (count), re-run (no, or yes and why), tokens (that Ticket's agents' total from `pnpm metrics:tokens`); plus one row for the branch with the number of review findings. Model, escalated, re-run and merge-check findings come from the Orchestrator itself; PR guard denials from the handoff note.
  - The list of changes to `implement-spec` gets an entry for the Learning section and the Doc Writer before the feature PR.
  - The Hand-off "Other Roles" list gets the Doc Writer, and the Read scope section says its scope file has `ticket: none`.
  - "No Haiku until there are numbers" points to the metrics files.
- **`docs/factory/sdlc.md`**: Stage 10's row: Actor "Orchestrator, then Doc Writer"; Output "The Learning section in the feature PR, and the Doc Writer's task PR"; Gate "The feature PR has a Learning section with every heading filled, None allowed"; Checked by "Human"; Rules link to the orchestrator page's Learning section. Its Output keeps "a review comment that repeats becomes a convention" and "a rule broken twice gets automated", and the `retro` stays optional. The mermaid diagram stays as it is: Learning still follows the feature PR being opened, and comes before the human merges it.
- **`docs/factory/roles/implementer.md`**: the handoff note rule gets three fixed lines, each `None` or `0` when empty: `Guessed:`, `Read outside scope:`, `PR guard denials: <n>`. The note stays at most 15 lines.

See the Spec's "The Learning section", "The order at the end of a feature", "The metrics file" and "The Implementer's handoff note".

**Packages:** None

**Also writes:** docs/workflow/orchestrator.md, docs/factory/sdlc.md, docs/factory/roles/implementer.md

**Allowed packages:** None

**Blocked by:** 04

**Status:** ready-for-agent

- [ ] The orchestrator page has a Learning section with the five headings, the "None" rule and the per-item outcome
- [ ] The orchestrator page states the end-of-feature order, including asking the human per item and always spawning the Doc Writer
- [ ] The orchestrator page states the Doc Writer's brief, its scope file and the metrics table's columns and sources
- [ ] The list of changes to `implement-spec` has the new entry
- [ ] Stage 10's row in the SDLC page has the new Actor, Output, Gate, Checked by and Rules link
- [ ] The Implementer Role file names the three handoff note lines
- [ ] `pnpm docs:check` passes

**Verification:** `pnpm docs:check` passes. Re-read the orchestrator page's end-of-feature steps as an Orchestrator who hasn't seen this Spec and check that each step says who acts and what it writes.

**Out of scope:** The merge check and enforcement tags (Ticket 07); the Escalation Report (Ticket 06); `docs/workflow/git-workflow.md` (skill-generated).

## Comments
