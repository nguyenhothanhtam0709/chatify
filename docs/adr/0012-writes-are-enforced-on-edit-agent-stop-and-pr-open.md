# A Role's Writes are enforced on each edit, when a sub-agent stops and when a PR opens

The Writes column of the SDLC page is enforced by scripts, not by the agent ticking a checklist. `guard-writes`, a `PreToolUse` hook on `Edit|Write`, denies an edit outside the Role's Writes as it happens. Writes made through Bash are not guarded per command: the diff-scope check compares every file changed on the Task Branch with the Writes, in a `SubagentStop` hook for the Implementer and again in `guard-pr.ts` when the PR opens. Both read the Role from the hook input's `agent_type` and the Implementer's boundary from its scope file. The main session (Spec Writer, Orchestrator) is not checked.

A hook can't tell what a shell command will write without parsing it, and any parser misses `sed -i`, redirects, generators and package managers. The diff, read after the fact, sees every write whatever made it, and gives the same answer every run.

## Consequences

- A write through Bash outside the boundary is caught only when the sub-agent stops or opens its PR, not when it is made.
- A file a Role does not normally write (an Intent Doc, `.claude/settings.json`) is allowed only when its Ticket lists it under **Also writes**, which the human approves by merging the Spec PR.
- The `SubagentStop` hook blocks a stop once; when `stop_hook_active` is set it lets the agent stop, so a failing check can't loop.
- A sub-agent in a worktree gets the main checkout as its hook `cwd`, so the hooks don't trust `cwd` for the Task Branch. `guard-writes` and the read guard take it from the file's path, the PR guard from the PR's head, and the stop check from the one `agent/` worktree whose scope file says `worktree: yes`.
- The PR guard is the gate for the fast checks: after the Diff-scope and `covers:` checks it runs `pnpm build:contracts` first when api or web is in scope (a failed build stops the rest), then lint and typecheck of each scope package and the test files changed on the branch, in the head's worktree, through the function the stop check uses. A stop block doesn't hold the agent (it hands back anyway, and sees the block only if resumed), so the stop check stays an early warning. The 180 s budget runs from the start of the hook, so the docs steps count against it and the fast checks get only what is left (the hook's timeout is 200 s); running out is reported without denying.
- A `SessionStart` hook warns when the session's Node is below `engines`, since pnpm, the stop check and the PR guard then fail.
- Like the other guards, these hooks fail open: a broken hook never blocks an agent. The stop check also lets the agent stop, with a notice, when several worktrees could be its own.
- One exception: the PR guard denies an Implementer's PR whose Task Branch it can't find, an `agent/` branch with a scope file, since failing open there would let every worktree PR through unchecked.
- Hooks run only in agent sessions. A human's PR is unchecked until CI exists.

## Considered Options

- **A Bash write guard that parses commands**: rejected. It can't be made complete, and a partial guard reads as a promise it can't keep.
- **A `Stop` hook**: rejected. It also fires in the main session, whose Roles write Specs, glossaries and ADRs that no Implementer scope covers.
- **Check only when the PR opens**: rejected. An Implementer would find a scope breach after all its work; the stop check catches it a turn earlier.
