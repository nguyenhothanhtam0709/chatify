## Agent skills

### Issue tracker

Issues and specs are local markdown files under `.scratch/NNNNN-<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Git workflow

Never push directly to `main`; every commit goes through a PR. See `docs/workflow/git-workflow.md`.

### Domain docs

Multi-context: a root `GLOSSARY-MAP.md` lists the Chat (`GLOSSARY.md`) and Factory (`docs/factory/GLOSSARY.md`) glossaries; all ADRs live in `docs/adr/`. See `docs/agents/domain.md`.

### No assumptions

Don't assume; ask. Never add, remove or change a package without the ticket saying so. See `docs/workflow/no-assumptions.md`.

## Packages

Before changing a package, read its `AGENTS.md`: [api](packages/api/AGENTS.md), [web](packages/web/AGENTS.md), [contracts](packages/contracts/AGENTS.md).

## Workflow

When doing a Ticket, read each doc only when you reach its step:

| When                                    | Read                                                                                                     |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Starting                                | The Ticket, your brief if you have one, and the `AGENTS.md` of each package you change                   |
| Writing code                            | The conventions that package's `AGENTS.md` names                                                         |
| Writing or running tests                | [Testing policy](docs/workflow/testing-policy.md)                                                        |
| The Ticket needs a browser check        | [Browser check](docs/workflow/browser-check.md)                                                          |
| Working outside the main checkout       | [Worktree](docs/workflow/worktree.md)                                                                    |
| About to open the PR                    | [Definition of done](docs/workflow/definition-of-done.md), [git workflow](docs/workflow/git-workflow.md) |
| Stuck                                   | [Escalation](docs/workflow/escalation.md)                                                                |
| Writing a Ticket or changing its fields | [Ticket template](docs/workflow/ticket-template.md)                                                      |
| Changing a Ticket's Status              | [Ticket status](docs/workflow/ticket-status.md)                                                          |
| The environment isn't ready             | [Setup](docs/workflow/setup.md)                                                                          |

An Implementer doesn't need `docs/factory/` except its own Role file, other Specs or `docs/architecture/` unless the Ticket names them.

Orchestrator: run `/orchestrator`, which reads its [Role file](docs/factory/roles/orchestrator.md) and [orchestrator](docs/workflow/orchestrator.md). Never spawn a merger sub-agent, even when `implement-spec` says to.

The pipeline from idea to merge (Stages, Agent Roles, Gates): [SDLC](docs/factory/sdlc.md).

## Skill-generated files

The mattpocock skills generate the `## Agent skills` block above, `docs/agents/`, `docs/workflow/git-workflow.md`, `.agents/`, `.claude/skills/` and `skills-lock.json`. Ask the human before changing any of them, even in auto mode; if an edit prompts, wait for the answer, and never write them through the shell.

The Factory's own skills in `.claude/skills/` (`spec-writer`, `orchestrator`) are written by hand, not generated. Edits to them still ask the human, like the rest.
