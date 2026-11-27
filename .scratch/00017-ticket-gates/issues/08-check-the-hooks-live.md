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

**Blocked by:** 03, 04, 05, 06, 07, 09, 10, 11

**Status:** resolved

- [x] `guard-writes` denied the out-of-scope edit with its reason
- [x] The stop check blocked once on the lint error and then let the agent stop
- [x] The PR guard denied the PR and named the uncovered doc
- [x] `pnpm preflight` failed on the modified file and passed when clean
- [x] The PR guard denied a PR with a lint error, with the output
- [x] In a worktree, `guard-writes`, the stop check and the PR guard gave the same results as in the main checkout
- [x] A session started on Node 24 showed the `SessionStart` warning
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

### Probe run 2, 2026-11-27

Status stays `ready-for-human`. Tickets 09 and 10 fix both gaps of run 1: every hook now fires in a worktree, and the PR guard runs the fast checks. One criterion is still open: _In a worktree, the hooks gave the same results as in the main checkout._ In a worktree set up as [Worktree](../../../docs/workflow/worktree.md) says (`pnpm install`, `.env`), the stop check also reports errors that have nothing to do with the branch, so it would block a clean branch too. This needs a fix Ticket:

- **The fast checks don't build `@chat/contracts` first.** The stop check and the PR guard run `lint` and `typecheck` for each package with `pnpm --filter`. That skips the root `build:contracts`, so in a new worktree `packages/contracts/dist` doesn't exist. Lint then reports `no-redundant-type-constituents` errors in `src/auth`, `src/messages`, `src/groups` and `src/db/seed.ts`, and typecheck reports `TS2307: Cannot find module '@chat/contracts'` for every file that imports it. The fix could build contracts in the fast checks, or add `pnpm build:contracts` to the worktree set-up. After `pnpm build:contracts` in the worktree, every result matched the main checkout.

Set-up was the same as run 1. The session started on Node 26.13.1 and showed no `SessionStart` warning. For (b), the main session's `cwd` stayed on the main checkout on the Feature Branch, so every hook input had the main checkout as `cwd`. The probe branch was reset to `origin/feat/00017-ticket-gates` between probes. Each probe used one `implementer`. Its stop block was read from its transcript.

**Probe 1, `guard-writes`: (a) pass, (b) pass.** In both runs the Edit of `packages/web/src/main.tsx` was denied with the same text:

```
PreToolUse:Edit hook error: packages/web/src/main.tsx is outside this Ticket's Writes (packages: api). If the Ticket needs it, list it under Also writes; otherwise escalate.
```

The Edit of `packages/api/src/realtime/socket-types.ts` was allowed in both runs.

**Probe 2, stop check: (a) pass, (b) pass once contracts were built.** The Implementer committed `debugger;` in `enter()` of `packages/api/src/realtime/keyed-serializer.ts` and ended its turn. In each run the stop was blocked once:

```
SubagentStop hook blocking error from command: "node "$CLAUDE_PROJECT_DIR/scripts/hooks/stop-check.ts"": The stop check failed. Fix these before you stop:

lint @chat/api:
src/realtime/keyed-serializer.ts:18:5: error eslint(no-debugger): `debugger` statement is not allowed help: Remove the debugger statement
$ GOMAXPROCS=2 oxlint --type-aware --threads=2 -c ../../.oxlintrc.json src test vitest.config.ts drizzle.config.ts
[ELIFECYCLE] Command failed with exit code 1.
Error: ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL
```

In (b) the failing path was `.../.claude/worktrees/00017-99-probe/packages/api`, so the hook checked the worktree. The first (b) attempt, before `pnpm build:contracts`, gave the same lint error plus the unrelated contracts errors described above.

The agent handed back and did not keep working, as in run 1. In each transcript the `SubagentHandback` call comes first and the block is the last event. The agent never saw the block, so the stop check blocks once and then lets the agent stop.

**Probe 3, PR guard with a lint error: (a) pass, (b) pass.** The Implementer called `mcp__github__create_pull_request` (draft, head `agent/00017-99-probe`, base the Feature Branch). The call was denied in both runs:

```
PreToolUse:mcp__github__create_pull_request hook error: The PR changes code a Descriptive Doc covers, and the doc is unchanged:
docs/architecture/runtime-flows.md
Update the doc, or if that is deliberate add to the PR body a line for each:
Doc not updated: <doc path> — <reason>

The fast checks failed. Fix these before opening the PR:

lint @chat/api:
src/realtime/keyed-serializer.ts:18:5: error eslint(no-debugger): `debugger` statement is not allowed help: Remove the debugger statement
$ GOMAXPROCS=2 oxlint --type-aware --threads=2 -c ../../.oxlintrc.json src test vitest.config.ts drizzle.config.ts
[ELIFECYCLE] Command failed with exit code 1.
Error: ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL
```

In (b) the `pnpm recursive run` path was the worktree's. The stop that followed was blocked with the same lint output.

**Probe 3, PR guard with an out-of-scope file: (a) pass, (b) pass.** With the lint error reverted, the main session committed a change to `packages/web/src/main.tsx`. The Implementer's PR call was denied in both runs:

```
PreToolUse:mcp__github__create_pull_request hook error: The branch changed files outside its Role's Writes:
packages/web/src/main.tsx: packages/web/src/main.tsx is outside this Ticket's Writes (packages: api). If the Ticket needs it, list it under Also writes; otherwise escalate.
```

In both runs the stop that followed was blocked with `Diff scope (files outside the Role's Writes):` and the same file.

**Probe 4, covers check: (a) pass, (b) pass.** The Implementer committed a change to `packages/api/src/realtime/socket-types.ts` without touching the doc and opened a draft PR. The call was denied in both runs:

```
PreToolUse:mcp__github__create_pull_request hook error: The PR changes code a Descriptive Doc covers, and the doc is unchanged:
docs/architecture/runtime-flows.md
Update the doc, or if that is deliberate add to the PR body a line for each:
Doc not updated: <doc path> — <reason>
```

**Probe 5, `pnpm preflight`: pass.** This was run by the main session in the probe worktree on Node 26. Clean, it printed `Preflight passed.` (exit 0). With `README.md` modified it printed (exit 1):

```
Preflight failed:

Tracked files are modified or staged:
   M README.md
Commit or restore them before starting.
```

**Probe 6, Node warning: pass, with two caveats.** The main session can't open an interactive terminal, so it started a headless session with `nvm use 24 && claude -p … --output-format stream-json --verbose`.

- With the default setting sources, the hook ran and printed nothing. `.claude/settings.local.json` still has the `env.PATH` from run 1, which puts Node 26 first, so the hooks never run on Node 24 there.
- With `--setting-sources user,project` (no local settings), the `SessionStart:startup` hook printed:

  ```
  {"systemMessage":"Node 24.18.1 does not satisfy engines \">=26\". pnpm, the stop check and the PR guard will fail. Exit, run \"nvm use\" and start the session again."}
  ```

Nobody saw how an interactive session shows the warning. To see it, drop the `env.PATH` override from `.claude/settings.local.json` and run `nvm use 24 && claude` in a terminal.

**Cleanup:** the probe branch, worktree and scope file are deleted. No probe branch reached `origin`, and no PR was created. The newest PR on the repo is still #234.

### Probe run 3, 2026-11-27

Status is `resolved`. Ticket 11 closes the gap from run 2: in a worktree set up as [Worktree](../../../docs/workflow/worktree.md) says (`pnpm install`, `.env`, no `pnpm build:contracts`), every hook gave the same result as in the main checkout, with no contracts errors.

Set-up was the same as run 2, with `worktree: yes`. Only the worktree runs were repeated, since the main-checkout runs passed in run 2. The main checkout stayed on the Feature Branch, so every hook input had the main checkout as `cwd`. The session started on Node 26.13.1. Each probe used one `implementer`. Its stop block was read from its transcript. Between probes the probe branch was reset to `origin/feat/00017-ticket-gates`.

**Probe 0, clean stop: pass.** The Implementer made no change and ended its turn. No stop block came. The worktree's `packages/contracts/dist` didn't exist before the probe and did after it, so the stop check built the contracts itself.

**Probe 1, `guard-writes`: pass.** The Edit of `packages/web/src/main.tsx` was denied:

```
PreToolUse:Edit hook error: packages/web/src/main.tsx is outside this Ticket's Writes (packages: api). If the Ticket needs it, list it under Also writes; otherwise escalate.
```

The Edit of `packages/api/src/realtime/socket-types.ts` was allowed, then reverted.

**Probe 2, stop check: pass.** The Implementer committed `debugger;` in `enter()` of `packages/api/src/realtime/keyed-serializer.ts` and ended its turn. The stop was blocked with only the lint error:

```
SubagentStop hook blocking error from command: "node "$CLAUDE_PROJECT_DIR/scripts/hooks/stop-check.ts"": The stop check failed. Fix these before you stop:

lint @chat/api:
src/realtime/keyed-serializer.ts:18:5: error eslint(no-debugger): `debugger` statement is not allowed help: Remove the debugger statement
$ GOMAXPROCS=2 oxlint --type-aware --threads=2 -c ../../.oxlintrc.json src test vitest.config.ts drizzle.config.ts
[ELIFECYCLE] Command failed with exit code 1.
Error: ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL

  × "pnpm recursive run" failed in /Users/tamnguyenhothanh/tam/learning/ai-workflow-practice/mattpocock-skills-test-chat-app/.claude/worktrees/00017-99-probe/packages/api
```

**Probe 3, PR guard with a lint error: pass.** With the lint error committed, the Implementer called `mcp__github__create_pull_request` (draft, head `agent/00017-99-probe`, base the Feature Branch). It was denied:

```
PreToolUse:mcp__github__create_pull_request hook error: The PR changes code a Descriptive Doc covers, and the doc is unchanged:
docs/architecture/runtime-flows.md
Update the doc, or if that is deliberate add to the PR body a line for each:
Doc not updated: <doc path> — <reason>

The fast checks failed. Fix these before opening the PR:

lint @chat/api:
src/realtime/keyed-serializer.ts:18:5: error eslint(no-debugger): `debugger` statement is not allowed help: Remove the debugger statement
$ GOMAXPROCS=2 oxlint --type-aware --threads=2 -c ../../.oxlintrc.json src test vitest.config.ts drizzle.config.ts
[ELIFECYCLE] Command failed with exit code 1.
Error: ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL

  × "pnpm recursive run" failed in /Users/tamnguyenhothanh/tam/learning/ai-workflow-practice/mattpocock-skills-test-chat-app/.claude/worktrees/00017-99-probe/packages/api
```

The stop that followed was blocked with the same lint output.

**Probe 3, PR guard with an out-of-scope file: pass.** With the lint error reverted, the main session committed a change to `packages/web/src/main.tsx`. The Implementer's PR call was denied:

```
PreToolUse:mcp__github__create_pull_request hook error: The branch changed files outside its Role's Writes:
packages/web/src/main.tsx: packages/web/src/main.tsx is outside this Ticket's Writes (packages: api). If the Ticket needs it, list it under Also writes; otherwise escalate.
```

The stop that followed was blocked:

```
The stop check failed. Fix these before you stop:

Diff scope (files outside the Role's Writes):
packages/web/src/main.tsx: packages/web/src/main.tsx is outside this Ticket's Writes (packages: api). If the Ticket needs it, list it under Also writes; otherwise escalate.
```

**Probe 4, covers check: pass.** The Implementer committed a change to `packages/api/src/realtime/socket-types.ts` without touching the doc and opened a draft PR. It was denied:

```
PreToolUse:mcp__github__create_pull_request hook error: The PR changes code a Descriptive Doc covers, and the doc is unchanged:
docs/architecture/runtime-flows.md
Update the doc, or if that is deliberate add to the PR body a line for each:
Doc not updated: <doc path> — <reason>
```

No stop block came, since the change is a comment and the stop check doesn't check covers.

**Probe 5, Node warning: pass.** The `env.PATH` override was removed from `.claude/settings.local.json`. The human ran `nvm use 24 && claude` in a terminal. The interactive session showed:

```
SessionStart:startup says: Node 24.18.1 does not satisfy engines ">=26". pnpm, the stop check and the PR guard will fail. Exit, run "nvm use" and start the session again.
```

**Cleanup:** the probe branch, worktree and scope file are deleted. No probe branch reached `origin`, and no PR was created. The newest PR on the repo is still #236.
