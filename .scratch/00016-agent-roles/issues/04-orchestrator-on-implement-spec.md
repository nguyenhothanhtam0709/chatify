# 04: `/orchestrator` runs `implement-spec` with a named list of overrides

**What to build:** The human starts implementation with `/orchestrator` in a new session. It reads its Role file and runs `implement-spec`, changing only the steps the orchestrator page names. Touches docs, a project skill and the root `AGENTS.md`. Rules:

- **Orchestrator Role file** at `docs/factory/roles/orchestrator.md`, in the same shape as the Ticket 02 Role files, with Writes and Never writes from its row of the SDLC page's Writes column (added by Ticket 02). Writes: briefs, scope files, handoff notes (outside the repo), squash-merges of task PRs, the feature PR, the `Status:` line of `spec.md`. Never writes: code, Tickets, a Spec's content, docs, a merge of the Spec PR. It stops when the feature PR is open, or every frontier Ticket is waiting on the human. It runs as the main session because it asks the human.
- **Skill `orchestrator`** in `.claude/skills/orchestrator/`, with `disable-model-invocation: true`. It reads the Role file, then runs `implement-spec` with the orchestrator page's overrides. Write it with `writing-for-agents`.
- **The orchestrator page** replaces "Where this differs from the skill, this page wins" with a list of the `implement-spec` steps it changes. Steps are named by what they say, not their number. The list says it was written against `mattpocock-skills` 1.3.1, and that the Orchestrator tells the human when the installed version differs.
  - "merger subagent": the Orchestrator merges each task PR itself (*Merging*).
  - "code-review on the integration branch": a Reviewer reviews the Feature Branch, an Implementer fixes the findings, then Doc Sync if decided (*Doc Sync*).
  - "mark it ready for review": first set the Spec's Status to `resolved`.
  - "each in its own worktree": one Implementer works in the main checkout; a worktree is used when two or more run at once.
  - Addition to "implementer subagents": spawn by `subagent_type`, pass the brief path, write the scope file, pass `model` only on an Opus signal.
  - Every other step runs as the skill says, including using the existing Feature Branch and opening a draft feature PR after the first merge.
- **SDLC page**: link the Orchestrator's row to its Role file. Its row names `/orchestrator` and `implement-spec`.
- **Root `AGENTS.md`**: "Orchestrator: read orchestrator" points to `/orchestrator`. "Never spawn a merger sub-agent, even when `implement-spec` says to" stays.
- The root `AGENTS.md` and `.claude/skills/` edits go through the permission prompt, and never through the shell. Wait for the human's answer.

See the Spec's "Orchestrator and `implement-spec`".

**Allowed packages:** None

**Blocked by:** 02, 03

**Status:** resolved

- [x] `/orchestrator` is listed as a skill and is not invoked by the model on its own
- [x] The orchestrator page lists four overrides and one addition by step name, with the skill version, and no longer says "this page wins"
- [x] Every Role in the SDLC table links to its Role file
- [x] The root `AGENTS.md` points the Orchestrator to `/orchestrator` and still forbids a merger sub-agent

**Verification:** Read `implement-spec` 1.3.1 and check that each override names a step that exists in it. `pnpm docs:check` passes. Running `/orchestrator` on a real Spec happens with Spec 00017.

**Out of scope:** Checking task PRs against acceptance criteria at merge (Spec 00018); preflight before spawning (Spec 00017).

## Comments
