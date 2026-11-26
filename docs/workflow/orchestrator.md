---
kind: intent
---

# Orchestrator

How the Orchestrator runs a Spec with `implement-spec` at the lowest token cost. It changes the `implement-spec` steps listed in [Changes to `implement-spec`](#changes-to-implement-spec). Only the Orchestrator reads it: every sub-agent gets what it needs through its hand-off.

## Changes to `implement-spec`

Written against `mattpocock-skills` 1.3.1. When the installed version differs, tell the human so this list is checked.

- "merger subagent": merge each task PR yourself, as in [Merging](#merging).
- "code-review on the integration branch": a Reviewer reviews the Feature Branch, an Implementer fixes the findings, then run [Doc Sync](#doc-sync) if you decide so.
- "mark it ready for review": the Spec's Status is set to `resolved` by the Implementer of the review-fix task PR, in its last commit, once every Ticket is `resolved`; tell it so in its brief. Never push to the Feature Branch directly.
- "each in its own worktree": one Implementer works in the main checkout; use a worktree when two or more run at once.
- Addition to "implementer subagents": spawn by `subagent_type`, pass the brief path, write the scope file, and pass `model` only on an Opus signal.

Every other step runs as the skill says, including using the existing Feature Branch as the integration branch and opening a draft feature PR after the first merge.

## Before spawning

- Build the task graph with `grep` on each Ticket's `**Blocked by:**` and `**Status:**` lines. Read a whole Ticket only when writing its brief.
- If a Ticket may change a dependency (for example `shadcn add`) and its Allowed packages don't cover it, ask the human first.
- Run Tickets one at a time when both change the schema (they would take the same migration number) or both need a browser check (they would share ports). Everything else on the frontier may run at once.

## Choosing the model

Decide when writing the brief and record it there with a one-line reason. Each Role's default model lives in its agent file in `.claude/agents/`; pass `model` when spawning only on an Opus signal.

- **Opus** when the Ticket designs something new, not when it follows an existing pattern:
  - a migration with a backfill or a change to existing data;
  - a locking, multi-step transaction or realtime ordering mechanism;
  - an auth, session or permission mechanism;
  - a design decision the Ticket and Spec leave open.
- Package count, line count and Ticket length are not signals. Most Tickets touch several packages, so they would send nearly everything to Opus.
- If a Sonnet run gets stuck or keeps failing, run it again on Opus and say why in the handoff note.
- An Implementer fixing review findings stays on its default unless a finding hits an Opus signal.
- No Haiku until there are numbers to support it.

## Hand-off

Spawn each Role by its `subagent_type` (`implementer`, `reviewer`, `explorer`, `doc-sync`), never a general-purpose agent. The spawn prompt is the absolute path of the brief and one sentence. The brief points at documents instead of copying them. It states directly only what a sub-agent can't find itself: new decisions and the current state of the Feature Branch.

### Implementer brief

Write it to the scratchpad, about 15 lines. The rules are in the [Implementer Role file](../factory/roles/implementer.md).

```markdown
Ticket: <path>
Feature Branch: <name>, tip <sha>
Task Branch: agent/<NNNNN>-<NN>-<slug> (create it first; the read scope is keyed on it)
Spec sections: <headings> (grep -n '^#' the spec, read only these)
Packages: <api, web, contracts>
Commands: <the package test command, then the full checks once before the PR>
Browser check: yes | no
Model: sonnet | opus, because <reason>
Latest migration: <number, if the Ticket changes the schema>
Decisions since the Ticket was written: <human answers, packages allowed, or None>
Handoff notes to read: <absolute paths, only Tickets in Blocked by, or None>
Handoff note: <absolute path>/<NNNNN>-<NN>.md
```

### Other Roles

- **Reviewer**: the diff range, the Spec path and that the scope is the whole Feature Branch. It returns findings with `file:line`.
- **Implementer fixing findings**: the approved findings. It does not re-read the Tickets.
- **Explorer**: one specific question and the path of the note to write.
- **Doc Sync**: the diff range, the Spec path and the hand-written docs to compare, as in [Doc Sync](#doc-sync).

### Resume or respawn

An agent blocked on a question continues through `SendMessage` with the answer, because it still has its context. Spawn a new one only when the agent was stopped and can't resume. The new one reads the note and `git log` and continues from the work in progress, without re-reading the docs.

## Read scope

Before spawning an Implementer, write six facts about its Ticket to `<git-common-dir>/scope/<task-branch>.txt`, one per line:

```
ticket: .scratch/00017-ticket-gates/issues/03-guard-writes.md
packages: api contracts
writes: .claude/settings.json docs/factory/sdlc.md
spec-status: no
browser-check: yes
worktree: no
```

Where each is copied from:

- `ticket`: the Ticket's repo path, or `none` for a branch with no Ticket (the review-fix branch).
- `packages`: the Ticket's _Packages_, space-separated. For a Ticket without that field, read them from _What to build_.
- `writes`: the Ticket's _Also writes_ paths, space-separated.
- `spec-status`: `yes` only for the review-fix PR, which sets the Spec's `Status:` line.
- `browser-check`: the brief's _Browser check_.
- `worktree`: `yes` when the Implementer works in a worktree.

A missing line means `no`, `none` or empty. Write facts, not globs: a file of globs reads as no facts. Only the Implementer gets a scope file; an Implementer fixing findings gets one built from the packages the findings touch. Handoff notes sit outside the repo and need no entry. Delete the file at hand-off cleanup, whether or not there is a worktree.

[scope-facts.ts](../../scripts/hooks/scope-facts.ts) reads the facts by name for every hook.

[guard-reads.ts](../../scripts/hooks/guard-reads.ts) derives from the facts which docs are readable whole: the `AGENTS.md` and convention of each package, plus the general convention, plus [browser-check](browser-check.md) or [worktree](worktree.md) when its fact is `yes`. It always allows the Ticket, the docs every PR needs and the sub-agent's own Role file. The Spec is left out on purpose, so the Implementer reads only the named sections. A PR body that reports a read outside the scope means the scope or the brief was missing something: fix it for the next Ticket.

## Merging

The Orchestrator merges task PRs itself and spawns no merger sub-agent:

1. Read the PR.
2. Check the conditions in the [git workflow](git-workflow.md#rules).
3. Squash-merge, pinned to the head SHA.
4. Delete the Task Branch.

On a conflict or a missing Feature Branch tip, send the PR back to its Implementer. The Orchestrator writes no product code.

## Doc Sync

After the review findings are fixed and before the feature PR, run `pnpm docs:check`, then decide whether the change needs a Doc Sync agent. A script can't tell whether new code made a hand-written doc wrong.

- **Run it** when the diff changes behaviour, a runtime flow or a term, or adds a new pattern.
- **Skip it** when the diff only changes tests, refactors without changing behaviour, or only changes docs. Say why in the feature PR.
- **Compare against:** [runtime flows](../architecture/runtime-flows.md), the [architecture overview](../architecture/overview.md), the [glossary](../../GLOSSARY.md) and the [conventions](../conventions/general.md).
- Its rules are in its [Role file](../factory/roles/doc-sync.md); read it only to change them.

## Keeping the main session small

Don't re-read what a brief already holds. When the context has grown large between Tickets, remind the human to run `/compact`, which an agent can't do itself.
