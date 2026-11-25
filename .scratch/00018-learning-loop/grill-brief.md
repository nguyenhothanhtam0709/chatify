# Grill brief: Learning Loop

Input for a `grill-with-docs` session that ends in `spec.md` in this folder. It records what the human has already decided, so the session spends its questions on the open points. This is not the Spec.

Part 3 of 3 Factory hardening Specs: 00016 Agent Roles → 00017 Ticket Gates → **00018 Learning Loop**. Enforcement tags (D2) need to know which rules 00017 turned into hooks, so grill this after 00017. The doc-only parts (D4, D5) don't depend on it.

## Problem

- Stage 11 Learning in `docs/factory/sdlc.md` has Gate "None" and is checked by "Nobody", so it is the Stage most likely to be skipped.
- `orchestrator.md` says "No Haiku until there are numbers", but nothing collects numbers: model, escalations, failed checks and review findings per Ticket are not recorded anywhere.
- "Broken twice, automate it" is a principle with no record of what was broken, or how each rule is enforced today.
- Escalation step 2 ("what you tried, the question, the options with your recommendation, and what is blocked") gives no fixed shape, so questions vary in how quickly the human can answer them.
- The Orchestrator's merge step 1 is "Read the PR". Findings that a check against the Ticket's acceptance criteria would catch reach the end-of-branch review instead (spec 00015 needed a separate findings PR, #209).
- `docs/laters.md` has about 30 entries mixing product features, code debt and Factory ideas, with no way to tell them apart.

## Decided

- **D1 – A Learning section in the feature PR to `main`**: repeated review findings (a candidate convention), reads outside the read scope (fix the brief or scope), and guesses or assumptions (a doc to fill in). "None" is a valid answer; the section is never omitted. This gives Stage 11 a Gate.
- **D2 – Enforcement tags** on each rule, saying how it is enforced, plus "broken twice, automate it". D1 records what was broken; the tags show what to automate next.
- **D3 – A per-Ticket metrics line**: model, escalated or not, failed checks, review findings, re-run or not.
- **D4 – A Spec Issue Report format** in `docs/workflow/escalation.md`: quoted Ticket text, evidence with `file:line`, why it blocks, the proposed Ticket fix, blocked work and work that continues.
- **D5 – Merge step 1 checks the diff against each acceptance criterion**, not just "read the PR".
- **D6 – Tags on Laters entries**: `product`, `debt` or `factory`.

## Open questions to grill

1. **D1, where it lives**: a section the `pr` skill writes into the feature PR body, a line in `git-workflow.md#finishing-the-feature` (skill-generated: ask first), or in sdlc.md's Stage 11 row? Who writes it, the Orchestrator?
2. **D1, its inputs**: does it read handoff notes, PR bodies ("read outside scope" lines), review findings? Do Implementer handoff notes get a fixed "had to guess" line so D1 can collect them?
3. **D1, what happens to it**: does each item become a Laters entry, a convention edit, or a Ticket? Who decides?
4. **D2, the tag format**: an inline marker on each rule (for example `(hook)`, `(check)`, `(prose)`), or a table per doc? Which docs get tagged in this Spec: all of `docs/workflow/`, or only the definition of done?
5. **D2, counting breaks**: where is "broken once" recorded so the second break is noticed? D1's Learning section, a file, the Laters entry?
6. **D3, where metrics are stored**: a CSV in the repo (which file, who appends), handoff notes outside the repo, or the Ticket's closing summary? A file in the repo makes every task PR touch it, which 00017's diff-scope check must allow.
7. **D3, who writes them**: the Implementer (knows check failures, not review findings) or the Orchestrator at merge (knows both)?
8. **D3, the fields**: are the five above right? Tokens or cost if they can be read? Time to PR?
9. **D4, replacing step 2**: does the report replace step 2 of "How to escalate", or add to it? Does the same format go in the draft PR body?
10. **D5, what "checks" means**: the Orchestrator reads the diff and each criterion, or the Implementer's PR body maps each criterion to a test or file and the Orchestrator verifies the map? The second is cheaper for the Orchestrator.
11. **D6, the format and the backlog**: a `Tag:` line under each `##` heading? Does this Spec tag the existing entries, and does `docs:check` enforce a tag on new ones?

## Constraints

- `docs/workflow/git-workflow.md` and `docs/agents/` are skill-generated: ask the human before changing them, and never through the shell.
- Laters may only be read section by section (`grep -n '^## '`), never whole.
- No package changes.

## Docs this touches

`docs/factory/sdlc.md` (Stage 11), `docs/workflow/orchestrator.md` (Merging, the brief's handoff note), `docs/workflow/escalation.md`, `docs/workflow/definition-of-done.md` (if the PR body changes), `docs/laters.md`, possibly `scripts/docs/check.ts` (D6).

## Out of scope

- Replaying past Tickets to compare workflow changes: needs D3's numbers first; kept in Laters.
- Choosing Haiku or changing model rules: this Spec only collects the numbers.
- Retro as a required step: sdlc.md keeps it optional.

## Laters

This Spec's PR removes from `docs/laters.md` the "Enforcement tags" bullet of "Enforce the doc and convention rules". After 00017 and this Spec, that entry keeps only "Required CI checks" and "Drift audit".
