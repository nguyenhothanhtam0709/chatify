---
kind: intent
---

# Ticket template

Every new Ticket has these fields, in this order. Where Tickets live and how they are numbered is in [issue tracker](../agents/issue-tracker.md).

```markdown
# NN: Title

**What to build:** ...

**Packages:** None

**Also writes:** None

**Allowed packages:** None

**Blocked by:** None

**Status:** needs-triage

- [ ] ...

**Verification:** ...

**Out of scope:** None

## Comments
```

## Fields

- **Title**: the Ticket's two-digit number and a short name.
- **What to build**: the change and the workspace packages (api, web, contracts, scripts) it touches. The Ticket states every rule it needs, so the Implementer doesn't have to read the whole Spec; name a Spec section where more detail may be needed.
- **Packages**: the workspace packages the Ticket touches (`api`, `web`, `contracts`, `scripts`), comma-separated, or `None`. The Orchestrator copies them into the scope file.
- **Also writes**: exact repo paths, no globs, comma-separated, of files the Role does not normally write (an Intent Doc, `.claude/settings.json`, an agent file, a `package.json` whose `scripts` change), or `None`. Merging the Spec PR is the human's approval of them, so the Implementer doesn't ask again.
- **Allowed packages**: npm dependency changes this Ticket may make, each with its version (for example `add zod-to-json-schema@^3`). `None` by default. See [no assumptions](no-assumptions.md).
- **Blocked by**: the numbers of the Tickets that must be `resolved` first (`NN, NN`), or `None`.
- **Status**: one of the five labels in [triage labels](../agents/triage-labels.md), or `resolved`.
- **Acceptance criteria**: one checkbox per result someone can check (a behaviour, a file, a command that passes), never a step in how to build it.
- **Verification**: only checks specific to this Ticket: which tests to add, a browser check, a manual command. The checks every PR runs, `pnpm docs:generate` among them, are in the [definition of done](definition-of-done.md).
- **Out of scope**: things a reader might reasonably expect but that this Ticket does not do, or `None`.
- **Comments**: questions, answers and the closing summary, appended over time. See [escalation](escalation.md).

## Existing and skill-written Tickets

- Tickets written before this template stay as they are; for one without `Packages:`, the Orchestrator reads the packages from _What to build_. [12-fix-stale-throttling-comments.md](../../.scratch/00004-agent-docs-foundation/issues/12-fix-stale-throttling-comments.md) shows the style of the older fields.
- When a skill (to-tickets, Wayfinder) writes a Ticket that is missing fields, the writer adds them before setting it `ready-for-agent` or `ready-for-human`.
