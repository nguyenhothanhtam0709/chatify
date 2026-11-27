# 06: The Escalation Report

**What to build:** Every Escalation asks its question in one fixed shape, the Escalation Report (a Factory glossary term), so the human can answer it quickly. The "A wrong Spec" rule is brought in line with [ADR 0011](../../../docs/adr/0011-specs-merge-into-their-feature-branch.md). All changes are in `docs/workflow/escalation.md`. Rules:

- Step 2 of "How to escalate" is replaced: under `## Comments`, write an Escalation Report with these parts, in this order:
  - **Quote**: the Ticket or Spec text the question is about, quoted.
  - **Evidence**: what was found, with `file:line`, and what was tried.
  - **Why it blocks**: why the Ticket can't go on without an answer.
  - **Options**: each option, with your recommendation, and the Ticket fix it would mean.
  - **Blocked**: the work that waits for the answer.
  - **Continues**: the work that can go on meanwhile, or None.
  Show the shape as a short markdown template in the doc.
- Step 4 says the draft PR body holds the same Escalation Report.
- "A wrong Spec" becomes: stop and set `needs-info` on each affected Ticket; the human fixes the Spec through a PR into the Feature Branch (not `main`), and the Feature Branch is then pulled before work resumes.
- The rest of the doc doesn't change.

See the Spec's "The Escalation Report".

**Packages:** None

**Also writes:** docs/workflow/escalation.md

**Allowed packages:** None

**Blocked by:** 02

**Status:** resolved

- [x] Step 2 names the Escalation Report and its six parts, with a template
- [x] Step 4 says the draft PR body holds the same report
- [x] "A wrong Spec" says the Spec is fixed through a PR into the Feature Branch
- [x] `pnpm docs:check` passes

**Verification:** `pnpm docs:check` passes. Check that `docs/workflow/escalation.md` no longer says a Spec is fixed through a PR to `main`.

**Out of scope:** When to escalate (unchanged); the Factory glossary entry (already on the Feature Branch).

## Comments

Done. `docs/workflow/escalation.md` step 2 now names the Escalation Report with its six parts and a template; step 4 puts the same report in the draft PR body; "A wrong Spec" fixes the Spec through a PR into the Feature Branch. `pnpm docs:check` passes.
