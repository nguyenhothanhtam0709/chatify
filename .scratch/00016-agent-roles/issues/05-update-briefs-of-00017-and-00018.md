# 05: The briefs of Specs 00017 and 00018 start from what 00016 settled

**What to build:** Whoever grills Spec 00017 or 00018 next finds its brief in step with this Spec, so the grilling doesn't reopen settled questions. Touches the two grill briefs only. Rules:

- **Both briefs**: the Spec and its Tickets go into a Spec PR on the Feature Branch (ADR 0011), not to `main`. "Grill after 00016 is merged" stays.
- **00017**:
  - Its question 4 and Decided B2 own the write guard: `guard-writes`, the Bash write guard and the diff-scope check, reading the Writes column and the scope file.
  - Its question 7 (a `Packages:` field in the Ticket template) now decides what fills the scope file's `packages` fact. Today the Orchestrator copies it from *What to build*.
  - Its question 8 (files every PR may touch) is answered by the Implementer's Writes: its own Ticket, appends to Laters, Generated Docs, and `package.json` and the lockfile only as Allowed packages say.
  - Preflight learns the Spec PR: a Ticket can start only once the Spec PR is merged into the Feature Branch.
- **00018**:
  - The handoff note's "had to guess" line (its question 2) goes into the Implementer's Role file, not the brief.
  - Its Learning section and metrics extend the Orchestrator's and Implementer's Writes.
- Keep each brief's shape. Mark a settled question with a pointer to Spec 00016 instead of deleting it.

See the Spec's "Briefs of Specs 00017 and 00018".

**Allowed packages:** None

**Blocked by:** None

**Status:** ready-for-agent

- [ ] Both briefs describe the Spec PR into the Feature Branch
- [ ] 00017's questions 4, 7 and 8 each point to what Spec 00016 settled or handed over
- [ ] 00018 names the Implementer's Role file for the "had to guess" line and the Writes column for its new files

**Verification:** `pnpm docs:check` passes.

**Out of scope:** Answering any open question of 00017 or 00018.

## Comments
