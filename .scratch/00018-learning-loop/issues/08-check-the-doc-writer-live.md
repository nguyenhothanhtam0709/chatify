# 08: Check the Doc Writer live

**What to build:** Claude Code loads agent files and hooks only when a session starts, so no Implementer of this Spec can spawn the Doc Writer it wrote. The human checks it once in a fresh session on the Feature Branch, after Tickets 01 to 07 are merged, and records what happened. Rules:

- Start a new Claude Code session in the main checkout on the up-to-date Feature Branch `feat/00018-learning-loop`.
- Write a scope file for `agent/00018-doc-writer` as the orchestrator page's Read scope says, with `ticket: none` and `writes: .scratch/00018-learning-loop/metrics.md docs/laters.md`.
- Spawn a Doc Writer by `subagent_type: doc-writer` with a sample brief: one approved Laters entry (tagged `factory`) and two sample metrics rows.
- Check that:
  - it runs `pnpm preflight` on `agent/00018-doc-writer` and it passes;
  - it reads a path in `writes:` whole;
  - an edit to a path not in `writes:` (for example `docs/workflow/testing-policy.md`) is denied by `guard-writes`;
  - its task PR holds only `metrics.md` and the Laters entry, and `pnpm docs:check` passes on it.
- Close the sample PR without merging, delete the branch and the scope file.
- Record each result under `## Comments`, with any failure turned into a new Ticket or a Laters entry.

**Packages:** None

**Also writes:** None

**Allowed packages:** None

**Blocked by:** 01, 02, 03, 04, 05, 06, 07

**Status:** ready-for-human

- [ ] Preflight passes on `agent/00018-doc-writer`
- [ ] The Doc Writer reads a `writes:` path whole
- [ ] An edit outside `writes:` is denied
- [ ] The sample PR holds only the two approved files and passes `pnpm docs:check`
- [ ] The results are recorded under `## Comments`

**Verification:** The human's notes under `## Comments`.

**Out of scope:** Running a whole feature's end with a real Learning section; fixing a failure found here (that is a new Ticket).

## Comments
