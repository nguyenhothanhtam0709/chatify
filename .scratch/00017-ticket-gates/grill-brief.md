# Grill brief: Ticket Gates

Input for a `grill-with-docs` session that ends in `spec.md` in this folder. It records what the human has already decided, so the session spends its questions on the open points. This is not the Spec.

Part 2 of 3 Factory hardening Specs: 00016 Agent Roles → **00017 Ticket Gates** → 00018 Learning Loop. It builds on 00016's Writes column; grill it after 00016 is merged.

## Problem

- There is no CI, and CI is deferred for now. The only machine checks are hooks in `.claude/settings.json`: `guard-reads.ts` (read scope) and `guard-pr.ts` (blocks opening a PR while `pnpm docs:check` fails). Every other Gate is ticked by the agent that did the work.
- Before work starts, nothing checks the Implementer's environment. Example: the shell's default Node is 24, the repo needs 26, and `pnpm` refuses to run.
- After work, "Nothing outside the Ticket changed" and "No dependency changed beyond the Ticket's Allowed packages" in the definition of done are self-ticked. Example: `pnpm-lock.yaml` was found modified and uncommitted on `main`, outside any Ticket.
- Whether a diff needs Doc Sync is a judgment call (`orchestrator.md#doc-sync`).
- `scripts/` is outside every package's `tsc` run, so the hooks that enforce the Factory are themselves not typechecked (Laters: 25 errors under strict flags).

## Decided

- **A3 – Typecheck `scripts/`**, before the new hooks are written, so they are typechecked from the start.
- **B1 – `pnpm preflight`**, run by the Implementer before work. It checks: the Node version, the branch name is a valid Task Branch, the Feature Branch tip is merged in, the tree is clean, Docker is running, and every Ticket in `Blocked by` is `resolved`.
- **B2 – A stop hook** that runs the fast checks and a **diff-scope check**: changed files stay inside the Ticket's scope (from 00016's Writes column), and `package.json` or the lockfile change only when the Ticket's Allowed packages say so.
- **B3 – A `covers:` check**: a PR that touches code a Descriptive Doc covers, without updating that doc, fails unless the PR body justifies it. Its result also tells the Orchestrator whether to run Doc Sync.
- Gates are scripts that give the same answer every run, not checklists for the agent to tick.

## Open questions to grill

1. **A3, the docs generator**: `scripts/docs/generate.ts` imports the API, whose `dist` has no declarations, and `@ts-` comments are banned. Emit declarations, import from source, or type the import by hand?
2. **A3, where it runs**: part of `pnpm typecheck` at the root, or its own script? Its own `tsconfig` for `scripts/`?
3. **B1, who runs it**: the Implementer as its first step, the Orchestrator before spawning, or both? Does it replace the checks in orchestrator.md's "Before spawning"?
4. **B1, `Blocked by`**: preflight needs the Ticket path. Passed as an argument, or derived from the Task Branch name (`agent/NNNNN-NN-<slug>`)?
5. **B2, which hook event**: a `Stop` hook (fires when the agent ends its turn), a `SubagentStop` hook, or folded into `guard-pr.ts` so it blocks the PR instead? A stop hook that blocks may loop; what does it do on failure?
6. **B2, which checks are "fast"**: lint and typecheck only, or the changed package's tests too? What is the time budget?
7. **B2, how the Ticket declares its scope**: "What to build" names packages in prose. Does the Ticket template get a machine-readable field (for example `**Packages:** api, web`)? That changes `docs/workflow/ticket-template.md` and existing Tickets.
8. **B2, files every PR may touch**: the Ticket file itself, `docs/laters.md`, generated docs. Where is that list kept?
9. **B3, the `covers:` format**: a front matter list of globs on each Descriptive Doc? Which docs get it first?
10. **B3, fail or report**: does a missing doc update block the PR (in `guard-pr.ts`), or only print a list the Orchestrator reads to decide on Doc Sync?
11. **Human PRs**: hooks run only in agent sessions. Is that accepted until CI exists, or does any check also become a git hook?

## Constraints

- No package changes unless a Ticket's Allowed packages name them.
- `.claude/settings.json` is not skill-generated, but the root `AGENTS.md` is: if the Workflow table needs a row for preflight, ask first.
- Each script gets `node --test` tests (testing policy: script tests).

## Docs this touches

`docs/workflow/definition-of-done.md`, `docs/workflow/orchestrator.md` (Before spawning, Doc Sync), `docs/workflow/ticket-template.md` (if question 7 adds a field), `docs/workflow/setup.md`, `docs/factory/sdlc.md` (Gates and "Checked by"), `.claude/settings.json`, `scripts/`.

## Out of scope

- CI and branch protection: deferred, kept in Laters.
- A periodic drift audit: ADR 0008 chose same-PR doc updates instead; it stays in Laters.
- A self-repair loop on a failed Gate (as in AIDLC): it would contradict "never retries blind" in `escalation.md`.
- Role definitions: Spec 00016. Learning and metrics: Spec 00018.

## Laters

This Spec's PR removes from `docs/laters.md`:

- The whole "Type-checking `scripts/`" entry.
- The "Stop hook" and "`covers:` check" bullets of "Enforce the doc and convention rules".
