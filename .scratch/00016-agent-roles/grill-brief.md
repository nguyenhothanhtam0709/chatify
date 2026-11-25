# Grill brief: Agent Roles

Input for a `grill-with-docs` session that ends in `spec.md` in this folder. It records what the human has already decided, so the session spends its questions on the open points. This is not the Spec.

Part 1 of 3 Factory hardening Specs: **00016 Agent Roles** → 00017 Ticket Gates → 00018 Learning Loop. This one goes first, because 00017's diff-scope check and the read scopes depend on each Role's write boundary.

## Problem

- The Agent Roles table in `docs/factory/sdlc.md` says what each Role reads, outputs and stops on, but its write boundary is one sentence for the Implementer ("Edits only what the Ticket covers") and "read-only" for the Reviewer. Nothing enforces either: a Reviewer spawned as a general-purpose agent can edit code.
- The model for each Role lives in a table and in `docs/workflow/orchestrator.md#choosing-the-model`. The Orchestrator has to remember to pass `model` on every spawn.
- The table lists Spec Writer and Ticket Writer as two Roles, but in practice one session runs `grill-with-docs`, `to-spec` and `to-tickets` back to back. The Factory glossary defines an Agent Role as "what one agent session is for", so the table describes something that does not happen.
- Read scopes (`<git-common-dir>/read-scope/<task-branch>.txt`) are written by hand for each Ticket.

## Decided

- **Six Roles, functional names kept.** No persona names (PM, team lead, dev): the Factory glossary avoids "Persona", and a persona name invites an agent to widen its scope.

  | Role | Runs as | Defined in |
  | --- | --- | --- |
  | Spec Writer | main session (interactive grilling) | sdlc.md row |
  | Orchestrator | main session (it spawns sub-agents, which can't spawn) | sdlc.md row |
  | Implementer | sub-agent | `.claude/agents/implementer.md` |
  | Reviewer | sub-agent, read-only | `.claude/agents/reviewer.md` |
  | Explorer | sub-agent, read-only | `.claude/agents/explorer.md` |
  | Doc Sync | sub-agent | `.claude/agents/doc-sync.md` |

- **Spec Writer absorbs Ticket Writer.** Outputs become the Spec and its Tickets. The human's merge of the PR stays the Gate. Add a final self-check: re-read each Ticket as an Implementer who has not seen the Spec, and fix any Ticket that leans on the grilling conversation.
- **Agent files declare `model` and `tools`.** Reviewer and Explorer get no `Edit`/`Write`, so "read-only" is enforced by the tool list, not by a sentence.
- **A Writes column** for all six Roles in the sdlc.md table.
- **Hand-off in orchestrator.md** spawns with `subagent_type` instead of a general-purpose agent.
- **Read scope is derived per Role**, not hand-listed per Ticket, as far as the open questions below allow.

## Open questions to grill

1. **Implementer model**: one `implementer.md` with the Orchestrator overriding `model` on Opus signals, or two files (`implementer.md` on Sonnet and `implementer-opus.md`)? What does the Opus re-run after a stuck Sonnet run look like?
2. **Writes column content**: fixed globs per Role (for example Doc Sync: `docs/**` except Intent Docs), or "the packages the Ticket's *What to build* names" for the Implementer? Spec 00017's diff-scope check reads whatever this decides.
3. **Writes for the main-session Roles**: Spec Writer `.scratch/**` only? Orchestrator: briefs, read scopes, handoff notes, plus the merge itself; anything else?
4. **`guard-writes.ts`**: is the `tools` list enough, or does the Implementer need a hook like `guard-reads.ts` that denies writes outside its scope? (A hook is the only way to scope writes by path; `tools` is all or nothing.)
5. **Doc Sync tools**: it edits Descriptive Docs but must not touch code, Specs or Intent Docs. That needs a path rule, so it may need the same hook as question 4.
6. **Read scope by Role**: which part becomes a fixed list per Role, and what still comes from the brief (package `AGENTS.md` and conventions, browser-check, worktree)?
7. **What stays in the agent file and what stays in docs**: the body of each agent file should be short (stop condition, return shape, links with "read when"). Which rules move from orchestrator.md's brief template into the agent file, so the brief shrinks?
8. **The Spec Writer self-check**: is the re-read a step in the Role row, a line in the Ticket template, or a checkbox in the Ticket PR body?
9. **`implement-spec` differences**: the skill spawns general-purpose agents. orchestrator.md already says it wins where the two differ; is a line there enough?

## Constraints

- `.claude/skills/` and the root `AGENTS.md` are skill-generated: ask the human before changing them, and never through the shell. The root `AGENTS.md` Workflow table may need a row. `.claude/agents/` is not on that list.
- No package changes are expected. If one turns out to be needed, it must be in a Ticket's Allowed packages.
- sdlc.md: "A new Stage or Role is a new row here, and only once it really runs." Only Roles that run today get rows and files.

## Docs this touches

`docs/factory/sdlc.md` (Agent Roles, Hand-off tables), `docs/factory/GLOSSARY.md` (Ticket Writer goes, Agent Role may mention agent files), `docs/workflow/orchestrator.md` (Choosing the model, Hand-off, Read scope), `.claude/agents/*.md` (new), possibly `scripts/hooks/` and `.claude/settings.json`.

## Out of scope

- Persona names for Roles (rejected, see Decided).
- An agent file for the Orchestrator or the Spec Writer: they run as the main session.
- Pre- and post-gates, typechecking `scripts/`: Spec 00017.
- Metrics, the Learning section, the escalation report format: Spec 00018.

## Laters

Nothing in `docs/laters.md` is removed by this Spec.
