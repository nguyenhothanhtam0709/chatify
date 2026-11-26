# 04: The PR guard runs the Diff-scope check

**What to build:** A sub-agent can't open a PR whose branch changed a file outside its Role's Writes, whatever made the change (an edit, a shell command, a generator, a package manager). The Diff-scope check compares every file changed on the branch with the Writes, using `canWrite` from Ticket 03, and adds the rules only a diff shows. The PR guard runs it next to `pnpm docs:check`. Rules:

- `checkDiff(changes, role, facts)` returns the list of violations, each with the file and the reason. `changes` holds each changed file's path and its added and removed lines against the Feature Branch tip; it is passed in, so the function never calls git. The Feature Branch is `origin/feat/NNNNN-*`, with `NNNNN` from the Task Branch name (`agent/NNNNN-…`).
- It calls `canWrite` for every changed file, then applies the diff-only rules:
  - `docs/laters.md` only gains lines; a removed or changed line fails unless `docs/laters.md` is in `writes`.
  - `spec.md` changes only on its `Status:` line, and only with `spec-status: yes`.
  - The lockfile and the dependency fields of a `package.json` (`dependencies`, `devDependencies`, `peerDependencies`, `optionalDependencies`) change only when the Ticket's *Allowed packages* is not `None`. Versions are not compared. The Ticket is read from the `ticket` path; with `ticket: none` the dependency fields may not change.
  - Any other field of a `package.json` (such as `scripts`) changes only when that `package.json` is in `writes`.
- No `agent_type` (the main session): no violations.
- The PR guard (`guard-pr.ts`) runs `checkDiff` for sub-agent sessions when a PR is opened through the GitHub MCP tool or `gh pr create`, and denies with every violation listed. The existing docs checks stay. It fails open on a broken input, as today.
- The definition of done's items "No dependency changed beyond the Ticket's Allowed packages" and "Nothing outside the Ticket changed" say that the PR guard checks them. The item that runs `pnpm test` is unchanged.

See the Spec's "The write boundary" and "Hooks".

**Packages:** scripts

**Also writes:** docs/workflow/definition-of-done.md

**Allowed packages:** None

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] A changed file outside the Writes is a violation with its reason
- [ ] Laters: an added line passes, a removed line fails
- [ ] `spec.md`: a `Status:` change passes only with `spec-status: yes`; any other line fails
- [ ] The lockfile or a dependency field fails with Allowed packages `None` and passes otherwise
- [ ] A `scripts` change in `package.json` passes only when that file is in `writes`
- [ ] With no `agent_type`, nothing is a violation
- [ ] The PR guard denies a PR with a violation and lets a clean one through
- [ ] The definition of done names the PR guard for the two items

**Verification:** Script tests for `checkDiff`, one case per rule, with `changes` built by hand. Extend the PR guard's suite so a violation denies the PR, with the steps passed in as today. Pipe a sample hook input into the PR guard on a branch with an out-of-scope change and check it denies.

**Out of scope:** The stop check (Ticket 05); the `covers:` check (Ticket 07); checks on the main session's PRs or a human's.

## Comments
