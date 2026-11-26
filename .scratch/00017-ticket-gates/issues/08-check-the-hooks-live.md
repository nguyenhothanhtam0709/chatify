# 08: Check every new hook live in a fresh session

**What to build:** Claude Code reads the hooks in `.claude/settings.json` when a session starts, so no Implementer could trigger the hooks its own Ticket added. The human checks each one once in a fresh session on the Feature Branch, with Tickets 03 to 07 merged. Steps:

1. Check out the Feature Branch `feat/00017-ticket-gates` in the main checkout and start a new Claude Code session there. Review the new hooks in `/hooks` if Claude Code asks.
2. Create a throwaway Task Branch `agent/00017-99-hook-probe` and write its scope file (`packages: api`, `ticket: none`) as the orchestrator page says.
3. Spawn an `implementer` with a probe brief and ask it, one at a time, to:
   - edit a file under the web package (expect `guard-writes` to deny);
   - add a lint error under the API and end its turn (expect the stop check to block once, then let it stop);
   - change covered API code without the doc and open a draft PR (expect the PR guard to deny, naming the doc);
   - commit a lint error under the API and open a draft PR (expect the PR guard to deny with the lint output, Ticket 10).

   Then repeat these with the probe branch in a worktree and the main checkout on the Feature Branch (Ticket 09). Expect the same results.
4. Run `pnpm preflight` on the probe branch with a modified tracked file (expect a failure) and clean (expect it to pass).
5. Start one session on Node 24 (expect the `SessionStart` warning, Ticket 10), then exit it.
6. Delete the probe branch, its scope file and any draft PR. Nothing from the probe is merged.

**Packages:** None

**Also writes:** None

**Allowed packages:** None

**Blocked by:** 03, 04, 05, 06, 07, 09, 10

**Status:** ready-for-human

- [x] `guard-writes` denied the out-of-scope edit with its reason
- [ ] The stop check blocked once on the lint error and then let the agent stop
- [x] The PR guard denied the PR and named the uncovered doc
- [x] `pnpm preflight` failed on the modified file and passed when clean
- [ ] The PR guard denied a PR with a lint error, with the output
- [ ] In a worktree, `guard-writes`, the stop check and the PR guard gave the same results as in the main checkout
- [ ] A session started on Node 24 showed the `SessionStart` warning
- [x] The probe branch, scope file and draft PR are gone

**Verification:** The human records what each step showed under `## Comments`. A hook that doesn't fire becomes a fix Ticket on this Feature Branch.

**Out of scope:** Code changes; checks on the main session or on a human's PR.

## Comments

### Probe run, 2026-11-26

Status stays `ready-for-human`. Three of the four hooks fire in the main checkout. Two hooks fail open when the Implementer works in a worktree. These need fix Tickets:

1. **Worktree: the stop check and the PR guard fail open.** For a sub-agent in a worktree, every hook input's `cwd` is the session's directory (the main checkout, on the Feature Branch), not the worktree. The hooks then see no Task Branch and check nothing. Run by hand with the worktree as `cwd`, the stop check blocks.
2. **The stop check needs the session to start on Node 26.** The hooks inherit the session's `PATH`. Started on Node 24, `pnpm lint` and `pnpm typecheck` stop with `ERR_PNPM_BAD_RUNTIME_VERSION`, so the stop check blocks every Implementer stop, even on a clean branch. For the second run, `env.PATH` in `.claude/settings.local.json` put Node 26 first.
3. **A stop block doesn't keep the Implementer working.** The agent ends at its hand-back anyway. The block reaches it only if it is resumed, and the resumed turn's first stop is blocked again.

Set-up for every probe: a throwaway Task Branch `agent/00017-99-probe` from `origin/feat/00017-ticket-gates`, never pushed, with scope file `.git/scope/agent/00017-99-probe.txt` (`ticket:` this Ticket, `packages: api`, `writes: none`, `spec-status: no`, `browser-check: no`, `worktree: no` or `yes`). One `implementer` per probe did only the probe step. The worktree was `.claude/worktrees/00017-99-probe`, with the main checkout on the Feature Branch.

**Probe 1, `guard-writes` (main checkout): pass.** An Edit of `packages/web/src/main.tsx` was denied:

```
PreToolUse:Edit hook error: packages/web/src/main.tsx is outside this Ticket's Writes (packages: api). If the Ticket needs it, list it under Also writes; otherwise escalate.
```

An Edit of `packages/api/src/realtime/socket-types.ts` was allowed.

**Probe 2, stop check, main checkout: fires, but the stop is not held.** The Implementer committed `debugger;` in `packages/api/src/realtime/keyed-serializer.ts` and stopped.

- Session on Node 24: blocked, but on the runtime, not the lint error:
  ```
  SubagentStop hook blocking error from command: "node "$CLAUDE_PROJECT_DIR/scripts/hooks/stop-check.ts"": The stop check failed. Fix these before you stop:

  lint @chat/api:
  Error: ERR_PNPM_BAD_RUNTIME_VERSION

    × This project requires Node.js >=26. Your current Node.js is v24.18.1
  ...
  typecheck @chat/api:
  Error: ERR_PNPM_BAD_RUNTIME_VERSION
  ```
- Session on Node 26: blocked with the lint output:
  ```
  SubagentStop hook blocking error from command: "node "$CLAUDE_PROJECT_DIR/scripts/hooks/stop-check.ts"": The stop check failed. Fix these before you stop:

  lint @chat/api:
  src/realtime/keyed-serializer.ts:28:1: error eslint(no-debugger): `debugger` statement is not allowed help: Remove the debugger statement
  $ GOMAXPROCS=2 oxlint --type-aware --threads=2 -c ../../.oxlintrc.json src test vitest.config.ts drizzle.config.ts
  [ELIFECYCLE] Command failed with exit code 1.
  Error: ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL
  ```
  The transcript shows the hand-back at 16:12:43, the block at 16:12:45 and the task completed. The agent saw the block only when resumed at 16:15:30. Its next hand-back was blocked again, since the resumed turn starts with `stop_hook_active` false. Run by hand with `stop_hook_active: true`, the hook prints nothing, so a second stop in the same turn is allowed.

**Probe 2, stop check, worktree: fail (fails open).** Same steps, on Node 24 and on Node 26 with the worktree's `node_modules` installed. No block came. Every event in the agent's transcript has `"cwd"` set to the main checkout and `"gitBranch":"feat/00017-ticket-gates"`.

**Probe 3, PR guard, main checkout: pass.** The main session committed the change to `packages/web/src/main.tsx`, because `guard-writes` denies it to the Implementer. The Implementer called `mcp__github__create_pull_request` (draft, into the Feature Branch):

```
PreToolUse:mcp__github__create_pull_request hook error: The branch changed files outside its Role's Writes:
packages/web/src/main.tsx: packages/web/src/main.tsx is outside this Ticket's Writes (packages: api). If the Ticket needs it, list it under Also writes; otherwise escalate.
```

Its stop block also listed the same Diff-scope violation.

**Probe 3, PR guard, worktree: fail (fails open).** The same call was not denied. Only GitHub stopped it, because the branch was never pushed:

```
failed to create pull request: Validation Failed
PullRequest.head (invalid)
```

No stop block came either. The transcript `cwd` is again the main checkout on the Feature Branch.

**Probe 4, covers check (main checkout): pass.** The Implementer committed a change to `packages/api/src/realtime/socket-types.ts` without touching the doc, then opened a draft PR:

```
PreToolUse:mcp__github__create_pull_request hook error: The PR changes code a Descriptive Doc covers, and the doc is unchanged:
docs/architecture/runtime-flows.md
Update the doc, or if that is deliberate add to the PR body a line for each:
Doc not updated: <doc path> — <reason>
```

**Probe 5, `pnpm preflight`: pass.** Run by the main session in a fresh worktree on the probe branch, because the main checkout has an untracked `overview.md`. On Node 26, clean, it printed `Preflight passed.` (exit 0). With `README.md` modified it printed (exit 1):

```
Preflight failed:

Tracked files are modified or staged:
   M README.md
Commit or restore them before starting.
```

On Node 24 it fails with `Node 24.18.1 does not satisfy ">=26". Run "nvm use" in this shell and run preflight again.`

**Cleanup:** the probe branch, worktree and scope file are deleted. No probe branch reached `origin`, and no PR was created.
