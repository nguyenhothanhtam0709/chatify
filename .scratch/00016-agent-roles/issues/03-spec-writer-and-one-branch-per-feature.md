# 03: `/spec-writer` writes the Spec and Tickets into a Spec PR on the Feature Branch

**What to build:** The human starts a feature with `/spec-writer`. It reserves the Spec number by pushing the Feature Branch, grills, asks before writing the Spec and again before the Tickets, and opens a Spec PR into the Feature Branch. The git workflow, Ticket status and SDLC Stages describe that model. Touches docs, a project skill and the root `AGENTS.md`. Rules:

- **Spec Writer Role file** at `docs/factory/roles/spec-writer.md`, in the same shape as the Ticket 02 Role files, with Writes and Never writes from its row of the SDLC page's Writes column (added by Ticket 02), and these seven steps:
  1. Take the next Spec number after checking `main` and every `origin/feat/*` branch. Take ADR numbers the same way.
  2. Cut `feat/NNNNN-<slug>` from up-to-date `main` and push it. Cut `spec/NNNNN-<slug>` from it.
  3. Grill with `grill-with-docs`. Glossary entries and ADRs are written as they are settled, on the Spec branch.
  4. Ask the human whether to write the Spec. Write it with `to-spec`.
  5. Ask the human whether to write the Tickets. Write them with `to-tickets` and the Ticket template.
  6. Re-read each Ticket as an Implementer who has not seen the Spec, and fix any Ticket that leans on the grilling conversation.
  7. Open the Spec PR into the Feature Branch. Stop.

  It stops when the Spec PR is open, after the self-check of step 6. It runs as the main session because it asks the human.
- **Skill `spec-writer`** in `.claude/skills/spec-writer/`, with `disable-model-invocation: true`. It reads the Role file and runs the steps. Rules stay in their docs; the skill links to them. Write it with `writing-for-agents`.
- **Git workflow**: replace "Specs and Tickets go straight to `main`" with the Spec branch `spec/NNNNN-<slug>` and a Spec PR into the Feature Branch, which a human merges. The Feature Branch is cut from `main` and pushed before grilling. Rewrite the "Spec and Tickets" flow to match. Keep the rule that agents only squash-merge task PRs.
- **Ticket status**: a Ticket written `ready-for-agent` or `ready-for-human` is approved by the human's merge of the Spec PR. A Spec is `ready-for-agent` once its Spec PR is merged into the Feature Branch, and the Orchestrator sets it to `resolved` when every Ticket is `resolved`.
- **SDLC page**: Spec and Tickets become one Stage, "Spec", done by the Spec Writer, with the Spec PR into the Feature Branch as output and the human's merge as Gate. The Feature Branch Stage keeps only the Orchestrator's Gate for starting a Ticket. "Where the human must approve" lists the merge of the Spec PR. Link the Spec Writer's row to its Role file. The Mermaid diagram matches the Stages.
- **Root `AGENTS.md`**: the "Skill-generated files" sentence gains an exception for the Factory's own skills in `.claude/skills/` (`spec-writer`, `orchestrator`).
- The git workflow, the root `AGENTS.md` and `.claude/skills/` are skill-generated or guarded: every edit goes through the permission prompt, and never through the shell. Wait for the human's answer.

See the Spec's "Spec Writer steps" and "Branch model and Stages", and ADR 0011.

**Allowed packages:** None

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] `/spec-writer` is listed as a skill and is not invoked by the model on its own
- [ ] The Spec Writer Role file lists the seven steps, with the two points where it asks the human
- [ ] No doc still says Specs or Tickets go to `main` in their own PR
- [ ] The SDLC Stages table has one Spec Stage and its Gate is the merge of the Spec PR
- [ ] The root `AGENTS.md` names the Factory's own skills as an exception to the skill-generated list

**Verification:** `grep` the docs for "straight to `main`", "Ticket PR" and "Ticket Writer" and find no hit outside Specs and ADRs. `pnpm docs:check` passes. Running `/spec-writer` on a real idea happens with Spec 00017, not here.

**Out of scope:** The Orchestrator's skill and overrides (Ticket 04); the briefs of Specs 00017 and 00018 (Ticket 05).

## Comments
