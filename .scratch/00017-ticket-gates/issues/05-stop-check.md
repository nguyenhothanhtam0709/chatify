# 05: The stop check runs when an Implementer stops

**What to build:** When an Implementer ends its turn, a hook checks its branch and runs the fast checks, so a scope breach or a lint, type or test failure reaches it before the PR does. Rules, from [ADR 0012](../../../docs/adr/0012-writes-are-enforced-on-edit-agent-stop-and-pr-open.md):

- A `SubagentStop` hook, registered in `.claude/settings.json`. It acts only when the hook input's `agent_type` is `implementer`; for any other Role it does nothing. Not a `Stop` hook, which would also fire in the main session.
- When `stop_hook_active` is set in the input, it lets the agent stop without checking, so it blocks at most once and never loops.
- It runs, in order:
  1. `checkDiff` (Ticket 04) on the branch's diff against the Feature Branch tip.
  2. Lint and typecheck of each package in the scope file's `packages`: `pnpm --filter @chat/<name> lint` and `typecheck` for a workspace package, `pnpm lint:scripts` and `pnpm typecheck:scripts` (Ticket 01) for `scripts`.
  3. The test files changed on the branch (from `git diff --name-only` against the Feature Branch tip). No changed test file means no tests run.
- On any failure it blocks the stop once, with the violations or the failing output as the reason.
- Its time budget is 180 s. A timeout is reported to the agent and does not block.
- It fails open on a broken input or a check that can't start, like the other guards.
- Remove the "Stop hook" bullet of "Enforce the doc and convention rules" from `docs/laters.md`.
- The SDLC page's Checks Stage says a hook runs the fast checks when an Implementer stops; the definition of done still asks for the full `pnpm lint`, `pnpm typecheck` and `pnpm test` before the PR.

See the Spec's "Hooks".

**Packages:** scripts

**Also writes:** .claude/settings.json, docs/laters.md, docs/factory/sdlc.md

**Allowed packages:** None

**Blocked by:** 04

**Status:** resolved

- [x] The hook does nothing for any `agent_type` other than `implementer`, and nothing when `stop_hook_active` is set
- [x] A scope violation blocks the stop with the violation listed
- [x] A lint or typecheck failure in a scope package blocks the stop with its output
- [x] Only the test files changed on the branch run; with none, no tests run
- [x] A run over 180 s is reported and does not block
- [x] The hook is registered as `SubagentStop`, not `Stop`
- [x] The "Stop hook" bullet is gone from Laters, and the SDLC Checks Stage mentions the stop check

**Verification:** Script tests for the stop check's decision function, with the commands' results and the clock passed in: each case above. Pipe a sample `SubagentStop` input into the hook on a branch with a lint error and check it blocks. Ticket 08 checks it live.

**Out of scope:** Running the full test suite on stop; changing the definition of done's full checks; a self-repair loop.

## Comments

Resolved. Verified with script tests for `checkOnStop` and `stopChecks` (each criterion), then a sample `SubagentStop` input piped into the hook on a branch with a committed lint error: it blocked with the lint output; `stop_hook_active` and a `reviewer` input did nothing. Full `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm docs:check` pass. Not run live in a sub-agent session (Ticket 08).

Assumptions: a timeout (a check over the remaining budget, or the budget spent before a check starts) is reported through `systemMessage` and stderr, and a real failure found before that still blocks. A check that cannot start is skipped. The hook's `timeout` in settings is 200 s, above the 180 s budget. Test files changed on the branch are committed work, like the Diff-scope check.
