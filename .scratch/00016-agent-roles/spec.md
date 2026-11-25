# Spec: Agent Roles

Status: ready-for-agent

## Problem Statement

The Factory has six Agent Roles on paper, but most of what defines them is written as one sentence that nothing enforces, and the table doesn't match what happens.

- The Agent Roles table in the SDLC page says what each Role reads, outputs and stops on. Its write boundary is "Edits only what the Ticket covers" for the Implementer and "read-only" for the Reviewer, and nothing else. A Reviewer spawned as a general-purpose agent has `Edit` and `Write` and can change code.
- Each Role's model is in that table and again in the orchestrator page's "Choosing the model". The Orchestrator has to remember to pass `model` on every spawn.
- The table lists Spec Writer and Ticket Writer as two Roles. In practice one session runs `grill-with-docs`, `to-spec` and `to-tickets` back to back. The Factory glossary defines an Agent Role as what one agent session is for, so the table describes something that doesn't happen.
- The Spec and its Tickets go to `main` in their own PR, and the Feature Branch can only be cut after the human merges it. One feature costs two branches and two merges to `main`.
- The Orchestrator writes each Implementer's read scope by hand as a list of globs.
- The Orchestrator runs `implement-spec`, and the orchestrator page says "where this differs from the skill, this page wins". The two differ at six steps, and the agent has to work out which side wins at each. The merger sub-agent that the root `AGENTS.md` now forbids came from that.
- The table says the Orchestrator runs as the main session because sub-agents can't spawn sub-agents. That is no longer true: a sub-agent can spawn up to three levels below the main session. The real reason is that a sub-agent never gets `AskUserQuestion` and doesn't see the conversation, and both main-session Roles have to ask the human.

## Solution

1. **Six Roles, each defined by one Role file.** The Roles keep their functional names (Spec Writer, Orchestrator, Implementer, Reviewer, Explorer, Doc Sync). No persona names. Ticket Writer is gone. A Role file holds the Role's contract: what it is for, what it writes and never writes, when it stops, what it returns, and links that say when to read them. It has no "You are…" text.
2. **Sub-agent Roles are spawned through an agent file.** The Implementer, Reviewer, Explorer and Doc Sync each get a thin agent file that sets the model and the tools and points to the Role file. The Orchestrator spawns them by `subagent_type`, never as a general-purpose agent. The Reviewer and Explorer have no `Edit`, and no sub-agent has `Agent`.
3. **Main-session Roles are started by a skill.** `/spec-writer` and `/orchestrator` read their Role file and run their steps. Only the human can invoke them.
4. **A feature is one branch and one PR to `main`.** The Spec Writer cuts and pushes the Feature Branch first. It writes the Spec and the Tickets on a Spec branch and opens a Spec PR into the Feature Branch, which the human merges. Grilling, the Spec and the Tickets are one Stage, and the Spec Writer asks the human before writing the Spec and again before writing the Tickets ([ADR 0011](../../docs/adr/0011-specs-merge-into-their-feature-branch.md)).
5. **Every Role has a write boundary.** The SDLC table gets a Writes column with what each Role writes and never writes. This Spec defines the boundaries; Spec 00017 enforces them.
6. **The read scope holds facts, not globs.** The Orchestrator records the packages a Ticket touches and whether it needs a browser check or a worktree. The read guard works out the readable docs from those facts, and always lets a Role read its own Role file.
7. **The Orchestrator follows `implement-spec`, with a short list of overrides.** The orchestrator page names each step of the skill it changes, by the step's name, and every other step runs as the skill says.

## User Stories

1. As the human, I want to start a new feature with one command, `/spec-writer`, so that I don't have to remember which skills to run in which order.
2. As the human, I want the Spec Writer to ask me before it writes the Spec, so that grilling ends only when I say we share an understanding.
3. As the human, I want the Spec Writer to ask me again before it writes the Tickets, so that I can read the Spec first and correct it while it is cheap.
4. As the human, I want the Spec and the Tickets in one Spec PR into the Feature Branch, so that I approve one piece of work once.
5. As the human, I want each feature to reach `main` as one PR holding its Spec, Tickets and code, so that `main` shows a feature as one unit.
6. As the human, I want merging the Spec PR to be the approval that lets implementation start, so that no agent records my approval for me.
7. As the human, I want the Feature Branch pushed before grilling starts, so that its Spec number is reserved and no second Spec takes it.
8. As the human, I want the Spec Writer to check `main` and every `origin/feat/*` branch for the next Spec and ADR number, so that two Specs in progress don't collide.
9. As the human, I want to start implementation with `/orchestrator` in a new session, so that the grilling conversation doesn't fill the Orchestrator's context.
10. As the human, I want neither `/spec-writer` nor `/orchestrator` to start unless I invoke it, so that no branch is cut or agent spawned without me asking.
11. As the human, I want a draft feature PR to open after the first task PR merges, so that I can follow the feature on GitHub from its first Ticket.
12. As the human, I want Roles named for what they do, not as personas, so that no agent widens its scope to fit a job title.
13. As the Spec Writer, I want my Role file to list my steps and the two points where I must ask, so that I never skip a checkpoint.
14. As the Spec Writer, I want to re-read each Ticket as an Implementer who hasn't seen the Spec before I open the Spec PR, so that no Ticket leans on the grilling conversation.
15. As the Spec Writer, I want to know that I may write my Spec's folder, both glossaries, the ADRs and Laters, so that domain modelling during grilling is in my boundary.
16. As the Spec Writer, I want to know that I never write code, other Specs or the workflow rules, so that a rule change the Spec needs becomes a Ticket.
17. As the Orchestrator, I want to spawn each Role by its `subagent_type`, so that the model and tools come from its agent file and I don't have to repeat them.
18. As the Orchestrator, I want to pass `model: opus` only when a Ticket hits an Opus signal, so that the default lives in one place.
19. As the Orchestrator, I want to re-run a stuck Sonnet Implementer on Opus on the same Task Branch, so that the new agent continues the work in progress from the handoff note and `git log`.
20. As the Orchestrator, I want a list of the `implement-spec` steps I change, by name, so that I never have to decide which instruction wins.
21. As the Orchestrator, I want to follow every other `implement-spec` step as the skill says, so that the Factory keeps up with the skill.
22. As the Orchestrator, I want to merge task PRs myself and never spawn a merger sub-agent, so that each merge is checked against the git workflow rules.
23. As the Orchestrator, I want the review step to be a Reviewer sub-agent, then an Implementer for the findings, then Doc Sync if needed, so that the read-only Reviewer and the doc check stay in the flow.
24. As the Orchestrator, I want to set the Spec's Status to `resolved` myself just before the feature PR is ready, so that it doesn't need a task PR of its own.
25. As the Orchestrator, I want to write three facts per Ticket (packages, browser check, worktree) instead of a glob list, so that the read scope can't be listed wrong by hand.
26. As the Orchestrator, I want a brief of about twelve lines of data, with the rules in the Implementer's Role file, so that I don't repeat the same rules in every brief.
27. As the Orchestrator, I want to know that I never write code, Tickets or a Spec's content, and never merge a Spec PR, so that my boundary is as clear as an Implementer's.
28. As the Orchestrator, I want the Spec Writer and Orchestrator to stay out of the sub-agent list, so that neither is spawned as a sub-agent by mistake.
29. As an Implementer, I want my Role file to be readable whole even inside a read scope, so that I can always read my own rules.
30. As an Implementer, I want my Role file to say which packages I may write, so that I know my boundary before Spec 00017's checks enforce it.
31. As an Implementer, I want to know that I may write my own Ticket, append to Laters, regenerate Generated Docs, and change `package.json` and the lockfile only when Allowed packages say so, so that the files every PR touches are inside my boundary.
32. As an Implementer, I want `tdd` preloaded, so that I don't spend a turn loading the skill I always use.
33. As an Implementer, I want no `Agent` tool, so that only the Orchestrator decides what runs and on which model.
34. As an Implementer whose Ticket needs a browser check or a worktree, I want those docs readable whole because the scope says so, so that I don't have to read them in sections.
35. As an Implementer fixing review findings, I want a scope built from the packages the findings touch, so that I read only the conventions I need.
36. As a Reviewer, I want no `Edit` or `Write` tool, so that the fix always goes to an Implementer.
37. As a Reviewer, I want `code-review` preloaded and Opus as my model, so that every review runs the same way.
38. As a Reviewer, I want no read scope, so that I can compare the diff with the Spec, the conventions and the docs.
39. As an Explorer, I want a `Write` tool limited by my Role file to notes outside the repo, so that I can save notes for later agents without touching the repo.
40. As an Explorer, I want the note path in my hand-off to win over where `research` would save by default, so that research files reach the repo only through an Implementer's PR.
41. As Doc Sync, I want to know that I may write only Descriptive Docs, so that I report an Intent Doc that contradicts the code instead of changing it.
42. As any sub-agent, I want my agent file's body to be one line that points to my Role file, so that my contract lives in one place.
43. As a reader of the SDLC page, I want a Writes column for all six Roles, so that I can see every boundary in one table.
44. As a reader of the Factory glossary, I want Role file defined, so that a Role's contract and its agent file aren't confused.
45. As the author of Spec 00017, I want the Writes column and the scope facts to exist, so that the diff-scope check reads them instead of parsing Ticket prose.
46. As the author of Spec 00017, I want its brief to say which of its questions 00016 settled or handed over, so that its grilling doesn't reopen them.
47. As the author of Spec 00018, I want its brief to say that the handoff note's "had to guess" line goes into the Implementer's Role file, and that its metrics and Learning section extend the Writes column, so that it edits the right files.
48. As a maintainer, I want the orchestrator page to name the `mattpocock-skills` version its overrides were written against, so that an upgrade of the skill is checked against the list.
49. As a maintainer, I want the reason the two main-session Roles run in the main session to be the real one (they ask the human), so that nobody moves them to sub-agents on a false premise.

## Implementation Decisions

### Roles and Role files

- **Role files** live in `docs/factory/roles/`, one per Role, named after the Role (`spec-writer`, `orchestrator`, `implementer`, `reviewer`, `explorer`, `doc-sync`). Each is an Intent Doc of about 20 lines with these parts: what the Role is for (one sentence), Writes, Never writes, Stops when, Returns, and links that each say when to read them. No persona text.
- **The SDLC page** keeps one row per Role. A row links to its Role file and gains a Writes column. Ticket Writer's row goes. The Spec Writer's Outputs become the Spec and its Tickets. The Model column states each sub-agent's default; the two main-session Roles use the session's model.
- **The SDLC page** states that the Spec Writer and Orchestrator run as the main session because they ask the human, and a sub-agent has no `AskUserQuestion` and doesn't see the conversation.
- **Glossary.** Already on this Spec's branch: Agent Role now includes "what it may write" and "Each Role is defined by a Role file", and **Role file** is a new term with *Avoid: Agent file (that is only the spawn wrapper), persona file*.

### Agent files for sub-agent Roles

- One agent file per sub-agent Role, named after the Role. Frontmatter: `name`, `description`, `model`, `tools` and, where the Role always uses a skill, `skills`. Body: one line, "Your Role is defined in `docs/factory/roles/<role>.md`. Read it first."
- **Implementer**: model `sonnet`; preloads `tdd`. One file for both models: the Agent call's `model` parameter overrides the file's `model`, so the Orchestrator passes `opus` on an Opus signal. A re-run on Opus after a stuck Sonnet run is a new spawn of the same file on the same Task Branch, which reads the handoff note and `git log` and continues; the reason goes in the handoff note.
- **Reviewer**: model `opus`; preloads `code-review`; no `Edit`, no `Write`.
- **Explorer**: model `sonnet`; no `Edit`; keeps `Write` for its notes.
- **Doc Sync**: model `sonnet`.
- **No agent file has `Agent` in its tools**, so a sub-agent can't spawn more agents.
- Bash stays for every Role: the Reviewer and Explorer need `git diff`, `grep` and test runs. Taking away `Edit` and `Write` doesn't stop writes through Bash; Spec 00017 adds the write guard.
- Plugin skills may need their plugin prefix in `skills` (for example `mattpocock-skills:tdd`). The Ticket checks the working name.

### Skills for main-session Roles

- Two project skills, `spec-writer` and `orchestrator`, with `disable-model-invocation: true`. Each one reads its Role file first and then runs its steps. Rules stay in their docs; a skill links to them.
- The Spec Writer and the Orchestrator have no agent file, so neither can be spawned as a sub-agent.
- The root `AGENTS.md` lists `.claude/skills/` as skill-generated. Its sentence gains an exception for the Factory's own skills (`spec-writer`, `orchestrator`). Its "Orchestrator: read orchestrator" line points to `/orchestrator`, and keeps "Never spawn a merger sub-agent". Both edits need the human's approval.

### Spec Writer steps

1. Take the next Spec number after checking `main` and every `origin/feat/*` branch. Take ADR numbers the same way when one is needed.
2. Cut `feat/NNNNN-<slug>` from up-to-date `main` and push it. Cut `spec/NNNNN-<slug>` from it.
3. Grill with `grill-with-docs`. Glossary entries and ADRs are written as they are settled, on the Spec branch.
4. Ask the human whether to write the Spec. Write it with `to-spec`.
5. Ask the human whether to write the Tickets. Write them with `to-tickets` and the Ticket template.
6. Re-read each Ticket as an Implementer who has not seen the Spec, and fix any Ticket that leans on the grilling conversation.
7. Open the Spec PR into the Feature Branch. Stop.

The Spec Writer's row says "Stops when: the Spec PR is open, after the self-check in step 6".

### Branch model and Stages

- Recorded in ADR 0011.
- **Git workflow** (skill-generated, needs the human's approval): "Specs and Tickets go straight to `main`" is replaced by the Spec branch and the Spec PR into the Feature Branch. The Feature Branch is cut from `main` before grilling, not once the Spec is on `main`. The "Spec and Tickets" flow is rewritten to match. The rule that agents only squash-merge task PRs stays, so no agent merges a Spec PR.
- **SDLC Stages**: Spec and Tickets become one Stage, "Spec", done by the Spec Writer. It covers grilling, the Spec and the Tickets, its output is the Spec PR into the Feature Branch, and its Gate is that the human merged it. The Feature Branch Stage keeps only the Orchestrator's Gate for starting a Ticket: every Ticket in `Blocked by` is `resolved` and the Feature Branch is up to date with `main`. "Where the human must approve" lists the merge of the Spec PR instead of the Spec PR and Ticket PR to `main`.
- **Ticket status**: a Ticket written `ready-for-agent` or `ready-for-human` is approved by the human's merge of the Spec PR. A Spec is `ready-for-agent` once its Spec PR is merged into the Feature Branch, and the Orchestrator sets it to `resolved` when every Ticket is `resolved`.
- This Spec itself still goes to `main` the old way, because the new model isn't merged yet. Spec 00017 is the first to use it.

### Writes column

| Role | Writes | Never writes |
| --- | --- | --- |
| Spec Writer | its Spec's folder, both glossaries, ADRs, Laters | code, other Specs, the workflow rules |
| Orchestrator | briefs, scope files, handoff notes (outside the repo), squash-merges of task PRs, the feature PR, the `Status:` line of `spec.md` | code, Tickets, a Spec's content, docs, a merge of the Spec PR |
| Implementer | the packages in its scope file, its own Ticket, appends to Laters, Generated Docs through their generator, `package.json` and the lockfile only as Allowed packages say | Specs, other Tickets, Intent Docs, skill-generated files, Claude settings and agent files |
| Reviewer | nothing | everything |
| Explorer | notes outside the repo | every file in the repo |
| Doc Sync | Descriptive Docs (`kind: descriptive`) | code, Specs, Intent Docs, Generated Docs |

- Each Role file repeats its own row, so the agent knows its boundary before a check stops it.
- A research file a Ticket asks for in the repo is committed by an Implementer from the Explorer's note.
- Doc Sync's rules move from the orchestrator page to its Role file. The orchestrator page keeps only when to run Doc Sync and what to compare.

### Read scope

- The scope file moves from `<git-common-dir>/read-scope/<task-branch>.txt` to `<git-common-dir>/scope/<task-branch>.txt` and holds facts:

  ```
  packages: api contracts
  browser-check: yes
  worktree: no
  ```

- The Orchestrator copies `packages` from the Ticket's *What to build*. Whether the Ticket template gets a field for it is Spec 00017's question 7.
- The read guard keeps its decision function and context. The context's scope stays the scope file's lines; the guard reads them as facts and derives the readable docs: each package's `AGENTS.md` and its convention, plus the general convention, plus the browser-check doc or the worktree doc when its fact is `yes`. The Ticket and the docs every PR needs stay always allowed.
- The hook input's `agent_type` is read. The Role file named by it is always readable whole. Role files of other Roles fall under the scope like any doc. With no `agent_type` (the main session), nothing changes.
- Only the Implementer has a scope file. The Reviewer, Explorer and Doc Sync are guarded only by the always-guarded files. An Implementer fixing findings gets a scope file built from the packages the findings touch.
- A scope file in the old glob format reads as no facts. The hand-off cleanup deletes the new file.

### Orchestrator and `implement-spec`

- `/orchestrator` reads its Role file, then runs `implement-spec`. The orchestrator page replaces "where this differs, this page wins" with a list of the skill's steps it changes, named by the step, not its number, and says which `mattpocock-skills` version the list was written against (1.3.1). When the installed version changes, the Orchestrator tells the human so the list is checked.
- **Overrides**:
  - "merger subagent": the Orchestrator merges each task PR itself, as in the orchestrator page's Merging section.
  - "code-review on the integration branch": a Reviewer sub-agent reviews the Feature Branch, an Implementer fixes the findings, then Doc Sync runs if the Orchestrator decides so.
  - "mark it ready for review": the Orchestrator first sets the Spec's Status to `resolved`.
  - "each in its own worktree": with one Implementer running, it works in the main checkout. A worktree is used when two or more run at once.
- **Addition** to "implementer subagents": spawn by `subagent_type`, pass the brief path, write the scope file, and pass `model` only on an Opus signal.
- Every other step runs as the skill says. That includes using the existing Feature Branch as the integration branch, and opening a draft feature PR after the first merge.
- The orchestrator page's "Choosing the model" keeps the Opus signals and drops the per-Role defaults, which live in the agent files. The Implementer brief keeps its data fields, about twelve lines. Its Rules block moves to the Implementer's Role file.

### Briefs of Specs 00017 and 00018

- **00017**: uses the new branch model; its question 4 (`guard-writes`) and the write guard, Bash, and diff-scope are its own; its question 8 (files every PR may touch) is answered by the Writes column; its question 7 (a `Packages:` field) fills the scope file's `packages` fact.
- **00018**: uses the new branch model; the handoff note's "had to guess" line goes into the Implementer's Role file; its Learning section and metrics extend the Orchestrator's and Implementer's Writes.

## Testing Decisions

- A good test drives the outermost seam and checks what the caller gets back: for the read guard, whether a tool call is denied and why. Tests don't mock our own code (testing policy).
- **Read guard, the one automated seam.** Tests go in the existing `node --test` suite and call the decision function with a hook input and a context, as the existing tests do. New cases:
  - `packages: api` makes the api `AGENTS.md` and the api convention readable whole, and the web ones denied.
  - `browser-check: yes` makes the browser-check doc readable; `no` or a missing line leaves it denied. The same for `worktree`.
  - With `agent_type: implementer`, the Implementer's Role file is readable whole inside a scope, and the Reviewer's Role file is denied.
  - With no `agent_type`, behaviour is the same as today.
  - Existing cases are rewritten from glob lines to fact lines; none is dropped.
- **Docs check.** The Role files, ADR 0011 and every changed doc pass `pnpm docs:check`: `kind:` front matter and valid links. No new test.
- **Agent files and skills.** No automated test. A Ticket's Verification spawns each sub-agent Role by its `subagent_type` with a small question and checks that it read its Role file, that the Reviewer and Explorer have no `Edit`, and that none has `Agent`. Running `/spec-writer` and `/orchestrator` for real happens with Spec 00017.

## Out of Scope

- Persona names for Roles.
- Running a main-session Role through `claude --agent`. Its body would replace Claude Code's system prompt, and its `tools` list would add little to Roles that need nearly every tool.
- Enforcing the Writes column: `guard-writes`, a Bash write guard and the diff-scope check are Spec 00017.
- A `Packages:` field in the Ticket template: Spec 00017.
- Typechecking `scripts/`, preflight, the `covers:` check: Spec 00017.
- Metrics, the Learning section, the Spec Issue Report format: Spec 00018.
- Any package change.

## Further Notes

- This Spec came out of a grilling session on the grill brief in this folder, with an outside workflow overview as a reference: its agents each have a strict write boundary with a "never edits" list, which the Writes column follows.
- The Claude Code facts this Spec relies on were checked against the sub-agents, skills and hooks docs: the spawn's `model` overrides the agent file's; a sub-agent never gets `AskUserQuestion`; a sub-agent can spawn sub-agents unless `Agent` is removed from its tools; only files in the agent folder are spawnable; hook input carries `agent_type`.
- The SDLC page says a Role gets a row only once it really runs. All six run today, so all six get Role files.
- Nothing in Laters is removed by this Spec.
