# 06: `pnpm preflight` checks the environment and the branch before a Ticket starts

**What to build:** One command an Implementer runs right after creating its Task Branch, which says whether the Ticket can start and, if not, what is wrong and what to do. Examples it must catch: the shell's default Node is 24 while the repo needs 26; `pnpm-lock.yaml` modified and uncommitted; Docker not running. Rules:

- A root script `pnpm preflight`. Its decision function, `checkPreflight(env)`, takes facts already gathered (Node version, branch name, git state, Docker state, files on the Feature Branch tip on `origin`, the scope file's facts via the shared module from Ticket 02) and returns the list of failures. The wrapper gathers them and prints the result.
- Checks, each failure saying what is wrong and what to do:
  - Node satisfies the root `engines` range.
  - The branch is `agent/NNNNN-NN-<slug>` or `agent/NNNNN-doc-sync`, and a Feature Branch `feat/NNNNN-*` exists on `origin`.
  - The Feature Branch's tip on `origin` is merged into the branch.
  - No tracked file is modified or staged.
  - Untracked files: list them and fail, saying to escalate so the human decides what to do with them.
  - Docker is running.
  - The Spec PR is merged: on the Feature Branch tip, `spec.md` reads `ready-for-agent` or `resolved`, and the scope file's `ticket` exists there. No GitHub API call.
  - Every Ticket in the Ticket's `Blocked by` is `resolved` on the Feature Branch tip. Skipped when `ticket: none`.
- It fails closed: any error, including one it can't classify, exits non-zero.
- The Implementer's Role file says to run `pnpm preflight` right after creating the Task Branch and to stop or escalate when it fails. [Setup](../../../docs/workflow/setup.md) describes it. The root `AGENTS.md` is not changed.
- The orchestrator page's *Before spawning* drops "Check that Docker is running" and keeps building the task graph. The SDLC page's Feature Branch Stage is checked by Machine.

See the Spec's "Preflight".

**Packages:** scripts

**Also writes:** package.json, docs/workflow/setup.md, docs/workflow/orchestrator.md, docs/factory/roles/implementer.md, docs/factory/sdlc.md

**Allowed packages:** None

**Blocked by:** 02

**Status:** resolved

- [x] Each check has a failing and a passing case, and each failure message says what to do
- [x] Untracked files fail with a message that says to escalate to the human
- [x] `agent/NNNNN-doc-sync` passes the branch check; `ticket: none` skips the `Blocked by` check
- [x] An unexpected error makes `pnpm preflight` exit non-zero
- [x] `pnpm preflight` passes on a clean, up-to-date Task Branch with Docker running
- [x] The Implementer Role file, setup, the orchestrator page and the SDLC page match the rules above

**Verification:** Script tests for `checkPreflight`, with `env` built by hand: one failing and one passing case per check. Run `pnpm preflight` on your own Task Branch, once clean and once with a modified tracked file.

**Out of scope:** Fixing what it finds (it only reports); changing the root `AGENTS.md`; the Orchestrator running preflight itself.

## Comments

## Comments
Resolved. `checkPreflight` has one failing and one passing case per check (18 tests, the failing run seen first as a missing module). `pnpm preflight` passed on this clean Task Branch with Docker running and failed, listing the file, with a modified tracked file. The wrapper runs `git fetch origin` first, and any thrown error exits 1. Assumptions: the engines range is read only as `>=N[.M.P]` and anything else fails closed; a missing scope file fails preflight; the Spec folder is `.scratch/<Feature Branch name without feat/>`; a `Blocked by` number resolves to the file `NN-*` beside the Ticket. No follow-ups.
