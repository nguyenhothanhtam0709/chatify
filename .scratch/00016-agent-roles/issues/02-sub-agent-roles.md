# 02: The four sub-agent Roles are spawned by `subagent_type`

**What to build:** The Orchestrator spawns the Implementer, Reviewer, Explorer and Doc Sync by `subagent_type`. Each gets its model and tools from its agent file and reads its contract from its Role file. Touches docs and Claude agent files only. Rules:

- **Role files** in `docs/factory/roles/`: `implementer.md`, `reviewer.md`, `explorer.md`, `doc-sync.md`. Each has `kind: intent` front matter and about 20 lines: what the Role is for (one sentence), Writes, Never writes, Stops when, Returns, and links that each say when to read them. No "You are…" text. Writes and Never writes repeat the Role's row of this table, which is also the SDLC page's Writes column:

  | Role | Writes | Never writes |
  | --- | --- | --- |
  | Spec Writer | its Spec's folder, both glossaries, ADRs, Laters | code, other Specs, the workflow rules |
  | Orchestrator | briefs, scope files, handoff notes (outside the repo), squash-merges of task PRs, the feature PR, the `Status:` line of `spec.md` | code, Tickets, a Spec's content, docs, a merge of the Spec PR |
  | Implementer | the packages in its scope file, its own Ticket, appends to Laters, Generated Docs through their generator, `package.json` and the lockfile only as Allowed packages say | Specs, other Tickets, Intent Docs, skill-generated files, Claude settings and agent files |
  | Reviewer | nothing | everything |
  | Explorer | notes outside the repo | every file in the repo |
  | Doc Sync | Descriptive Docs (`kind: descriptive`) | code, Specs, Intent Docs, Generated Docs |
- **The Implementer's Role file** takes the whole Rules block of the Implementer brief from the orchestrator page.
- **The Doc Sync Role file** takes the Doc Sync rules from the orchestrator page: a wrong Descriptive Doc is fixed in a task PR on `agent/<NNNNN>-doc-sync`, an Intent Doc that contradicts the code is reported and not changed, and no Spec or code is changed.
- **The Explorer's Role file** says its note path comes from the hand-off and wins over where `research` saves by default.
- **Agent files** in `.claude/agents/`, one per Role, named after it. Frontmatter: `name`, `description`, `model`, `tools`, and `skills` where listed. Body: one line, "Your Role is defined in `docs/factory/roles/<role>.md`. Read it first."
  - Implementer: `sonnet`, preloads `tdd`.
  - Reviewer: `opus`, preloads `code-review`, no `Edit`, no `Write`.
  - Explorer: `sonnet`, no `Edit`.
  - Doc Sync: `sonnet`.
  - None has `Agent`. Every one keeps Bash.
  - Check whether a plugin skill must be written with its plugin prefix in `skills` (for example `mattpocock-skills:tdd`), and use the form that loads.
- **The SDLC page's Agent Roles table**: add a Writes column for all six Roles, filled from the table above. Remove the Ticket Writer row; the Spec Writer's Outputs become the Spec and its Tickets. Link the four Roles' rows to their Role files. The Model column states each sub-agent's default. Say that the Spec Writer and Orchestrator run as the main session because they ask the human, and a sub-agent has no `AskUserQuestion` and doesn't see the conversation.
- **The SDLC page's Hand-off table** stays, and says sub-agents read their Role file.
- **The orchestrator page**: *Hand-off* says to spawn each Role by its `subagent_type`, never a general-purpose agent. The Implementer brief keeps only its data fields. *Choosing the model* keeps the Opus signals and the Opus re-run, and drops the per-Role defaults (they live in the agent files); `model` is passed only on an Opus signal. *Doc Sync* keeps when to run it and what to compare.

See the Spec's "Roles and Role files", "Agent files for sub-agent Roles" and "Writes column".

**Allowed packages:** None

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Four Role files exist with the parts above and pass `pnpm docs:check`
- [ ] Four agent files exist with the models, tools and skills above, and none lists `Agent`
- [ ] The SDLC table has a Writes column for all six Roles and no Ticket Writer row
- [ ] The orchestrator page says to spawn by `subagent_type`, and its brief has no Rules block
- [ ] No Doc Sync rule is stated both in the orchestrator page and in the Doc Sync Role file

**Verification:** Spawn each of the four Roles by its `subagent_type` with a small question (for example, "name your Writes and your tools"). Check that each read its Role file, that the Reviewer and Explorer have no `Edit`, that the Reviewer has no `Write`, and that none has `Agent`. Report the answers in the PR body.

**Out of scope:** The Spec Writer and Orchestrator Role files and skills (Tickets 03 and 04); enforcing the Writes column (Spec 00017).

## Comments
