# 07: The merge check and enforcement tags

**What to build:** Before merging a task PR, the Orchestrator checks each acceptance criterion against the diff, using a map the Implementer wrote in the PR body, so a missed criterion is caught before the end-of-branch review. Each item of the definition of done says how it is enforced, so the Learning section can tell a rule a machine guarantees from one followed by reading. Rules:

- **`docs/workflow/definition-of-done.md`**:
  - A new checklist item: the PR body maps each acceptance criterion of the Ticket to its evidence (a test name, a `file:line` or a command).
  - Every checklist item ends with one enforcement tag: `(hook: <name>)` when a hook checks it (for example `guard-pr`), `(check: <command>)` when a command the agent runs checks it (for example `pnpm docs:check`), or `(prose)` when only reading enforces it. The two existing "(the PR guard checks this)" become `(hook: guard-pr)`. Tag each item by what checks it today; read the hooks under `scripts/hooks/` when unsure, and if still unsure, `(prose)`.
  - "How to use it" gets one line explaining the three tags and "broken twice, automate it": a `(prose)` rule broken twice is proposed for automation in the Learning section.
- **`docs/workflow/orchestrator.md`**, Merging step 1, "Read the PR", becomes: check the PR body's acceptance-criteria map against the diff, criterion by criterion, opening a file only when the evidence is unclear. A criterion the diff doesn't meet: send the PR back to its Implementer through `SendMessage`, and count it as one merge-check finding for the metrics.

See the Spec's "The merge check" and "Enforcement tags".

**Packages:** None

**Also writes:** docs/workflow/definition-of-done.md, docs/workflow/orchestrator.md

**Allowed packages:** None

**Blocked by:** 05

**Status:** resolved

- [x] The definition of done has the acceptance-criteria map item
- [x] Every checklist item ends with exactly one enforcement tag
- [x] "How to use it" explains the tags and "broken twice, automate it"
- [x] Merging step 1 in the orchestrator page describes the map check and sending a miss back
- [x] `pnpm docs:check` passes

**Verification:** `pnpm docs:check` passes. This PR's own body maps each acceptance criterion to its evidence, as the new item asks.

**Out of scope:** Tags on any other doc; automating any `(prose)` rule; the Learning section (Ticket 05).

## Comments
Resolved. Verified with `pnpm docs:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`. Tags per item: criteria met, map, testing, migrations, assumptions, branch merged are `(prose)`; dependencies and nothing-outside are `(hook: guard-pr)`; contracts is `(check: pnpm lint)`; docs is `(check: pnpm docs:check)`; the checks item lists its four commands in one tag. No assumptions.
