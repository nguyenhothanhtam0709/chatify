# 04: The Doc Writer Role

**What to build:** The Doc Writer exists as an Agent Role the Orchestrator can spawn by `subagent_type: doc-writer`. It writes, in one task PR into the Feature Branch, what the human approved from a feature's Learning section and the feature's metrics file ([ADR 0013](../../../docs/adr/0013-doc-writer-writes-what-the-human-approved-in-the-session.md)). Ticket 01 already made the hooks enforce its boundary. Rules:

- **Agent file** `.claude/agents/doc-writer.md`, in the shape of `.claude/agents/doc-sync.md`: `kind: intent`, `name: doc-writer`, a one-line description, `model: sonnet`, the same tools as Doc Sync, and a body that says to read its Role file first.
- **Role file** `docs/factory/roles/doc-writer.md`, in the shape of the other Role files (`kind: intent`, a one-line purpose, then **Writes**, **Never writes**, **Stops when**, **Returns**, Rules, Inputs):
  - **Writes:** the paths in its scope file's `writes:`, which always hold `.scratch/NNNNN-<slug>/metrics.md` and hold `docs/laters.md` and each convention file only when an approved action targets them. The `guard-writes` hook checks this.
  - **Never writes:** code, Descriptive Docs (that is Doc Sync), a Spec's content, Tickets, Generated Docs, skill-generated files.
  - **Stops when:** the task PR is open. **Returns:** the task PR and a short report.
  - Rules: run `pnpm preflight` before starting; work on `agent/NNNNN-doc-writer`; write each approved action as its brief words it, and nothing that isn't in the brief; write `metrics.md` from the brief's rows even when no action was approved; a Laters entry gets its `**Tag:**` line; a prose rule's break goes in a Laters entry tagged `factory`, named after the rule, with a `Broken:` line linking the PR, and a second break adds its link to the same entry (found with `grep -n '^## ' docs/laters.md`); escalate through [escalation](../../../docs/workflow/escalation.md) when an action is unclear.
  - Inputs: a brief with each approved action (kind, target path, wording) and the metrics rows.
- **SDLC page** (`docs/factory/sdlc.md`):
  - A Doc Writer row in the Agent Roles table, matching the Role file. Model: Sonnet.
  - The sentence that counts the sub-agents says five, not four.
  - A Doc Writer row in the Hand-off table. Gets: a brief with each approved action and the metrics rows. Returns: a task PR.
- Stage 10's row is not changed here (Ticket 05).

See the Spec's "The Doc Writer" and "The metrics file".

**Packages:** None

**Also writes:** .claude/agents/doc-writer.md, docs/factory/roles/doc-writer.md, docs/factory/sdlc.md

**Allowed packages:** None

**Blocked by:** 01, 02

**Status:** ready-for-agent

- [ ] `.claude/agents/doc-writer.md` exists with `name: doc-writer`, `model: sonnet` and Doc Sync's tools, and points to its Role file
- [ ] `docs/factory/roles/doc-writer.md` states Writes, Never writes, Stops when, Returns, Rules and Inputs as above
- [ ] The SDLC page's Agent Roles and Hand-off tables have a Doc Writer row, and the sub-agent count is five
- [ ] `pnpm docs:check` passes

**Verification:** `pnpm docs:check` passes. The agent file loads only in a new session, so spawning it is checked in Ticket 08.

**Out of scope:** When the Orchestrator spawns it and what goes in its brief (Ticket 05); Doc Sync's Role.

## Comments
