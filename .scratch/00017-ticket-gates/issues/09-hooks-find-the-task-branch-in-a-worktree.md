# 09: The hooks find the Task Branch when the Implementer works in a worktree

**What to build:** Ticket 08's probes showed that for a sub-agent in a worktree, every hook input's `cwd` is the session's main checkout, not the worktree. The hooks read the branch from that `cwd`, find the Feature Branch, see no scope file and check nothing. Each hook must find the Task Branch from what its input does carry. Rules:

- One shared function in `scripts/hooks/` resolves a directory to its git root, git common dir and branch (what each hook now does inline with `git rev-parse` on `cwd`). Every hook below uses it.
- **`guard-writes`** and **`guard-reads`** (the `Read` tool): resolve from the directory of the absolute `tool_input.file_path`, or its nearest existing parent for a file not yet created, instead of `cwd`. A relative path still resolves against `cwd`. `guard-reads` on `Bash` keeps its `cd` handling.
- **PR guard** (`guard-pr.ts`), for sub-agent sessions:
  - The branch is the PR's head: `tool_input.head` for the GitHub MCP tool, `--head` (or `-H`) for `gh pr create`. With no head given, the branch of `cwd`, after any leading `cd <dir> &&` of the command.
  - The Diff-scope and `covers:` checks diff that branch ref against the Feature Branch tip (`merge-base(origin/feat/NNNNN-*, <head>)..<head>`), so they need no worktree.
  - The worktree checked out on that branch, from `git worktree list --porcelain`, is where any command runs (Ticket 10 needs it). With none, the main checkout.
  - For `agent_type: implementer`, a head that is not an `agent/NNNNN-…` branch with a scope file denies the PR, saying the PR guard can't find its Task Branch. This replaces failing open for that case only; a broken input still fails open.
- **Stop check:** its input names no file or branch.
  - When `cwd` is on an `agent/` branch, as today.
  - Otherwise, the `agent/` worktrees from `git worktree list --porcelain` whose scope file says `worktree: yes`. Exactly one: check it as today. Several: it can't tell which is this agent's, so it reports that through `systemMessage` and does not block. None: nothing.
- ADR 0012's Consequences say which hook still fails open and that the PR guard denies an Implementer PR whose Task Branch it can't find. [Worktree](../../../docs/workflow/worktree.md) says the hooks find the worktree from the file path and the PR head.

See the Spec's "Hooks" and Ticket 08's `## Comments`.

**Packages:** scripts

**Also writes:** docs/adr/0012-writes-are-enforced-on-edit-agent-stop-and-pr-open.md, docs/workflow/worktree.md

**Allowed packages:** None

**Blocked by:** None

**Status:** resolved

- [x] With `cwd` on the Feature Branch and the file in an `agent/` worktree, `guard-writes` denies an out-of-scope edit and `guard-reads` denies an out-of-scope read
- [x] The PR guard runs the Diff-scope and `covers:` checks on the MCP `head` and on `gh pr create --head`, with `cwd` on the Feature Branch
- [x] An Implementer PR whose head has no scope file, or is not an `agent/` branch, is denied with the reason
- [x] The stop check checks the single `agent/` worktree with `worktree: yes` when `cwd` is not on an `agent/` branch, and reports without blocking when there are several
- [x] In the main checkout, every hook behaves as before
- [x] ADR 0012 and the worktree page match the rules above

**Verification:** Script tests for each resolution rule, with a temp repo that has a second worktree on an `agent/` branch and the main checkout on a `feat/` branch. Pipe a sample hook input with that `cwd` into each of the four hooks and check that it denies or blocks. Ticket 08 checks it live.

**Out of scope:** The PR guard running lint, typecheck and tests (Ticket 10); finding the worktree from the agent's transcript; guarding Bash writes.

## Comments

Resolved. `scripts/hooks/git-context.ts` resolves a directory to its checkout, shared git dir and branch, and every hook uses it. Verified with script tests on a temp repo whose main checkout is on `feat/00007-x` and whose second worktree is on an `agent/` branch (`scripts/hooks/worktree-fixture.ts`): each of the four hooks gets that `cwd` piped in and denies or blocks. Then `pnpm test:scripts`, `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm docs:check`. Ticket 08 checks it live. Follow-up: "The read guard denies a Ticket's Also writes files whole" in `docs/laters.md`.

Assumptions:

- A file outside any repo resolves from `cwd`, as before, so Doc Sync and the Explorer get the same answers there.
- An `owner:branch` head gives the branch.
- The Diff-scope and `covers:` checks read files (Ticket, front matter, docs) at the head ref with `git cat-file --batch`, not from disk, so they see committed work only, like the diff.
- The PR guard's `docs:generate`, Generated Docs diff and `docs:check` steps now run in the head's worktree, or the main checkout when none, instead of `cwd`.
- A PR from a sub-agent other than the Implementer with no Task Branch still fails open, as do a broken input and a `cwd` outside any repo.
- The stop check's "several worktrees" notice goes to `systemMessage` and stderr, like its timeout notice.
