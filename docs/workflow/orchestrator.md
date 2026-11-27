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
- Addition before "mark it ready for review": write the [Learning](#learning) section and spawn the Doc Writer, as in [The order at the end of a feature](#the-order-at-the-end-of-a-feature).

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
- No Haiku until there are numbers to support it: read the feature `metrics.md` files (see [The metrics](#the-metrics)).

## Hand-off

Spawn each Role by its `subagent_type` (`implementer`, `reviewer`, `explorer`, `doc-sync`, `doc-writer`), never a general-purpose agent. The spawn prompt is the absolute path of the brief and one sentence. The brief points at documents instead of copying them. It states directly only what a sub-agent can't find itself: new decisions and the current state of the Feature Branch.

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
- **Doc Writer**: the approved actions and the metrics rows, as in [The Doc Writer's brief](#the-doc-writers-brief).

### Resume or respawn

An agent blocked on a question continues through `SendMessage` with the answer, because it still has its context. Spawn a new one only when the agent was stopped and can't resume. The new one reads the note and `git log` and continues from the work in progress, without re-reading the docs.

## Read scope

Before spawning an Implementer, Doc Sync or Doc Writer, write six facts about its Ticket to `<git-common-dir>/scope/<task-branch>.txt`, one per line:

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

A missing line means `no`, `none` or empty. Write facts, not globs: a file of globs reads as no facts. The Implementer, Doc Sync and Doc Writer get a scope file; Doc Sync's and the Doc Writer's have `ticket: none`. Doc Sync's has the packages of the diff it compares; the Doc Writer's has no packages. An Implementer fixing findings gets one built from the packages the findings touch. Handoff notes sit outside the repo and need no entry. Delete the file at hand-off cleanup, whether or not there is a worktree.

[scope-facts.ts](../../scripts/hooks/scope-facts.ts) reads the facts by name for every hook.

[guard-reads.ts](../../scripts/hooks/guard-reads.ts) derives from the facts which docs are readable whole: the `AGENTS.md` and convention of each package, plus the general convention, plus [browser-check](browser-check.md) or [worktree](worktree.md) when its fact is `yes`. It always allows the Ticket, the docs every PR needs and the sub-agent's own Role file. The Spec is left out on purpose, so the Implementer reads only the named sections. A PR body that reports a read outside the scope means the scope or the brief was missing something: fix it for the next Ticket.

## Merging

The Orchestrator merges task PRs itself and spawns no merger sub-agent:

1. Check the PR body's acceptance-criteria map against the diff, criterion by criterion, opening a file only when the evidence is unclear. A criterion the diff doesn't meet: send the PR back to its Implementer through `SendMessage`, and count it as one merge-check finding for the [metrics](#the-metrics).
2. Check the conditions in the [git workflow](git-workflow.md#rules).
3. Squash-merge, pinned to the head SHA.
4. Delete the Task Branch.

On a conflict or a missing Feature Branch tip, send the PR back to its Implementer. The Orchestrator writes no product code.

## Doc Sync

After the review findings are fixed and before the feature PR, run `pnpm docs:check` and `pnpm docs:covers`. The second lists each Descriptive Doc whose `covers:` matches a file the Feature Branch changed against `main` while the doc is unchanged. Any doc it lists means Doc Sync runs. The glossary and the conventions are Intent Docs with no `covers:`, so you still judge those.

- **Run it** when `pnpm docs:covers` lists a doc, or when the diff changes behaviour, a runtime flow or a term, or adds a new pattern.
- **Skip it** when the diff only changes tests, refactors without changing behaviour, or only changes docs. Say why in the feature PR.
- **Compare against:** [runtime flows](../architecture/runtime-flows.md), the [architecture overview](../architecture/overview.md), the [glossary](../../GLOSSARY.md) and the [conventions](../conventions/general.md).
- Before spawning it, write its scope file, as in [Read scope](#read-scope).
- Its rules are in its [Role file](../factory/roles/doc-sync.md); read it only to change them.

## Learning

Every feature PR to `main` has a `## Learning` section in its body. The Orchestrator writes it; it is never left out. It has these five headings, in this order, each with its items or `None`:

1. **Repeated findings**: review or merge-check findings that came up in two or more Tickets.
2. **Reads outside scope**: from the task PR bodies and the handoff notes' `Read outside scope:` lines.
3. **Guesses**: from the handoff notes' `Guessed:` lines and the PR bodies' assumptions.
4. **Broken rules**: rules broken during the feature, each with its enforcement tag: `(hook: ...)`, `(check: ...)` or `(prose)`. A `(prose)` rule that already has a `factory` Laters entry with a `Broken:` line is broken for the second time: propose automating it.
5. **Metrics**: a link to `.scratch/NNNNN-<slug>/metrics.md`.

Each item ends with the action the human approved and the PR that did it, or "rejected".

### The order at the end of a feature

1. Review, then the review-fix Implementer, then [Doc Sync](#doc-sync) if you decide so (as before).
2. The Orchestrator drafts the Learning section and runs `pnpm metrics:tokens` once.
3. The Orchestrator asks the human about each item with `AskUserQuestion`, proposing one of `Laters entry`, `convention edit`, `fix brief/scope` or `no action`.
4. The Orchestrator writes the Doc Writer's brief and scope file, and spawns it with `subagent_type: doc-writer`. It runs even when every item is `None`.
5. The Orchestrator merges the Doc Writer's task PR, as in [Merging](#merging).
6. The Orchestrator opens or updates the feature PR with the Learning section.

### The Doc Writer's brief

The brief holds each approved action with its kind, target path and wording, and the metrics rows. Its scope file has `ticket: none`, no packages, and `writes:` with `.scratch/NNNNN-<slug>/metrics.md` plus each approved action's target path, exactly ([ADR 0013](../adr/0013-doc-writer-writes-what-the-human-approved-in-the-session.md)). The human's answers in the session are the approval.

### The metrics

The Doc Writer writes `.scratch/NNNNN-<slug>/metrics.md` from the rows in its brief: one table, one row per Ticket, with these columns and sources:

| Column               | Source                                                 |
| -------------------- | ------------------------------------------------------ |
| Ticket               | The Ticket                                             |
| model                | The Orchestrator                                       |
| escalated            | The Orchestrator (yes or no)                           |
| PR guard denials     | The handoff note's `PR guard denials:` line (a count)  |
| merge-check findings | The Orchestrator (a count)                             |
| re-run               | The Orchestrator (no, or yes and why)                  |
| tokens               | That Ticket's agents' total from `pnpm metrics:tokens` |

One more row is for the branch, with the number of review findings.

## Keeping the main session small

Don't re-read what a brief already holds. When the context has grown large between Tickets, remind the human to run `/compact`, which an agent can't do itself.
