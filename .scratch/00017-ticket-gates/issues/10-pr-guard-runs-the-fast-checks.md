# 10: The PR guard runs the fast checks, and a session warns when Node is below `engines`

**What to build:** Ticket 08 found two problems with the stop check.

- A block doesn't keep the Implementer working. It hands back anyway, and sees the block only if it is resumed. That is how Claude Code behaves, so the gate moves to the moment the PR opens: the PR guard runs the same fast checks. The stop check stays as an early warning.
- A session started on a Node below `engines` blocks every stop with `ERR_PNPM_BAD_RUNTIME_VERSION`. A `SessionStart` hook warns about that at once.

Rules:

- **PR guard:** for `agent_type: implementer`, after the Diff-scope and `covers:` checks, `guard-pr.ts` runs the stop check's fast checks.
  - The checks are: lint and typecheck of each package in the scope file, and the test files changed on the branch. They are the same commands, from the same function, as the stop check (Ticket 05).
  - They run in the worktree of the PR's head (Ticket 09).
  - Any failure denies the PR, with the failing output.
  - They share the stop check's 180 s budget. A timeout is reported through `systemMessage` and does not deny.
  - Raise the PR guard's `timeout` in `.claude/settings.json` to 200, as for the stop check.
- **Stop check:** unchanged. It still blocks once on a failure.
- **`SessionStart` hook:** a new `scripts/hooks/node-version.ts`, registered as `SessionStart` in `.claude/settings.json`.
  - When `process.version` doesn't satisfy the root `engines` range, it prints a `systemMessage`. The message says that pnpm, the stop check and the PR guard will fail, and to exit, run `nvm use` and start the session again.
  - It reads the range with the same rule as `pnpm preflight` (Ticket 06). Share that code; don't copy it.
  - It never blocks, and prints nothing when Node satisfies the range or on any error.
- ADR 0012 says the PR guard is the gate for the fast checks, and why the stop block isn't (it doesn't hold the agent). The SDLC page's Checks Stage says the PR guard runs them. [Setup](../../../docs/workflow/setup.md) says to run `nvm use` before starting Claude Code, and that a session started on a lower Node warns.

See the Spec's "Hooks" and Ticket 08's `## Comments`.

**Packages:** scripts

**Also writes:** .claude/settings.json, docs/adr/0012-writes-are-enforced-on-edit-agent-stop-and-pr-open.md, docs/factory/sdlc.md, docs/workflow/setup.md

**Allowed packages:** None

**Blocked by:** 09

**Status:** resolved

- [x] An Implementer PR with a lint, typecheck or changed-test failure in a scope package is denied with the output
- [x] A clean Implementer PR is let through, and a run over 180 s is reported without denying
- [x] The PR guard and the stop check run the fast checks through one shared function
- [x] The PR guard's timeout in settings is 200
- [x] The `SessionStart` hook warns when Node is below `engines`, and prints nothing when it satisfies it or on an error
- [x] The engines rule is shared with `pnpm preflight`
- [x] ADR 0012, the SDLC Checks Stage and setup match the rules above

**Verification:** Extend the PR guard's suite with the fast checks passed in: a failure denies, a clean run and a timeout don't. Script tests for the Node check with the version and range passed in. Pipe a sample PR hook input into the PR guard on a branch with a lint error and check it denies. Ticket 08 checks it live.

**Out of scope:** Making a stop block hold the agent; running the full test suite at PR open; switching Node inside the hooks; checks on the main session's PRs.

## Comments

### Closing summary (Implementer)
New `scripts/hooks/fast-checks.ts` holds the shared fast checks (`runChecks`, `fastChecks`, `stopChecks`, `BUDGET_MS`); the stop check and the PR guard both call it. `guard-pr.ts` has `checkFastOnPr`, run after the docs checks, in the head's worktree; a timeout goes to `systemMessage`. PR guard timeout is 200. `scripts/hooks/node-version.ts` is the `SessionStart` hook and uses `satisfies`, now exported from `scripts/preflight/preflight.ts`. ADR 0012, the SDLC page and setup updated. Not live-tested; Ticket 08.

Assumptions: the fast checks run last, after the docs checks, and their failures are joined to the other reasons. A fast-check setup error (no diff base) runs none and doesn't deny.
