# A Role's Writes are enforced on each edit, when a sub-agent stops and when a PR opens

The Writes column of the SDLC page is enforced by scripts, not by the agent ticking a checklist. `guard-writes`, a `PreToolUse` hook on `Edit|Write`, denies an edit outside the Role's Writes as it happens. Writes made through Bash are not guarded per command: the diff-scope check compares every file changed on the Task Branch with the Writes, in a `SubagentStop` hook for the Implementer and again in `guard-pr.ts` when the PR opens. Both read the Role from the hook input's `agent_type` and the Implementer's boundary from its scope file. The main session (Spec Writer, Orchestrator) is not checked.

A hook can't tell what a shell command will write without parsing it, and any parser misses `sed -i`, redirects, generators and package managers. The diff, read after the fact, sees every write whatever made it, and gives the same answer every run.

## Consequences

- A write through Bash outside the boundary is caught only when the sub-agent stops or opens its PR, not when it is made.
- A file a Role does not normally write (an Intent Doc, `.claude/settings.json`) is allowed only when its Ticket lists it under **Also writes**, which the human approves by merging the Spec PR.
- The `SubagentStop` hook blocks a stop once; when `stop_hook_active` is set it lets the agent stop, so a failing check can't loop.
- Like the other guards, these hooks fail open: a broken hook never blocks an agent.
- Hooks run only in agent sessions. A human's PR is unchecked until CI exists.

## Considered Options

- **A Bash write guard that parses commands**: rejected. It can't be made complete, and a partial guard reads as a promise it can't keep.
- **A `Stop` hook**: rejected. It also fires in the main session, whose Roles write Specs, glossaries and ADRs that no Implementer scope covers.
- **Check only when the PR opens**: rejected. An Implementer would find a scope breach after all its work; the stop check catches it a turn earlier.
