# Spec: Ticket Gates

Status: ready-for-agent

## Problem Statement

Most Gates in the Factory are ticked by the agent that did the work. There is no CI, and CI stays deferred. The only machine checks are two hooks: the read guard and the PR guard, which blocks a PR while `pnpm docs:check` fails.

- Before work starts, nothing checks the environment or the branch. The shell's default Node is 24, the repo needs 26, and `pnpm` refuses to run. Running `pnpm` under the wrong setup has also rewritten `pnpm-lock.yaml` outside any Ticket.
- After work, "Nothing outside the Ticket changed" and "No dependency changed beyond the Ticket's Allowed packages" are self-ticked. Spec 00016 wrote every Role's boundary into the Writes column of the SDLC page, but nothing enforces it.
- The Writes column also blocks work it should allow. The Implementer never writes Intent Docs or Claude settings, yet a Factory Spec's Tickets must change both. It never writes Descriptive Docs either, while the definition of done says docs affected by a change are updated in the same PR.
- Some branches have no Ticket: the review-fix branch (`agent/00016-06-…` had no Ticket 06) and Doc Sync's `agent/<NNNNN>-doc-sync`.
- Whether a branch needs Doc Sync is a judgment call, even for the docs a script could tell about.
- `scripts/` is outside every package's `tsc` run, so the hooks that enforce the Factory are not typechecked.

## Solution

1. **`scripts/` is typechecked** as part of `pnpm typecheck`, before any new hook is written.
2. **`pnpm preflight`** is run by the Implementer right after it creates its Task Branch. It checks the Node version, the branch, the Feature Branch, the working tree, Docker, that the Spec PR is merged and that every Ticket in `Blocked by` is `resolved`. Any failure stops the Implementer.
3. **A Role's Writes are enforced** ([ADR 0012](../../docs/adr/0012-writes-are-enforced-on-edit-agent-stop-and-pr-open.md)): `guard-writes` denies an edit outside them as it happens, and the Diff-scope check compares every changed file with them when the Implementer stops and when a PR opens.
4. **A Ticket declares what it touches** in two new fields: **Packages** and **Also writes**. A file a Role does not normally write is allowed only when its Ticket lists it, and the human approves that by merging the Spec PR.
5. **When the Implementer stops**, the fast checks run: lint and typecheck of its packages, and the test files it changed.
6. **A Descriptive Doc declares the code it covers.** A PR that changes covered code without updating the doc is blocked unless its body says why. The same check tells the Orchestrator whether to run Doc Sync.

## User Stories

1. As the human, I want every Gate a script can check to be checked by a script, so that a Gate means the same thing on every Ticket.
2. As the human, I want the Implementer to stop before work when the environment is wrong, so that no Ticket is built on Node 24 or without Docker.
3. As the human, I want preflight to stop and ask me when the working tree has untracked files, so that a stray file is never committed or lost without my say.
4. As the human, I want preflight to fail when tracked files are modified or staged, so that a changed lockfile on `main` is caught before a Ticket starts on top of it.
5. As the human, I want a Ticket to start only once its Spec PR is merged into the Feature Branch, so that my merge stays the approval.
6. As the human, I want a Ticket to start only once every Ticket in its `Blocked by` is `resolved`, so that no Ticket is built on missing work.
7. As the human, I want any file a Role does not normally write to be listed in the Ticket, so that I see and approve every widened boundary when I merge the Spec PR.
8. As the human, I want an Implementer that writes outside its boundary to be stopped, so that "nothing outside the Ticket changed" is true and not just ticked.
9. As the human, I want a dependency change outside Allowed packages to block the PR, so that no package is added without my approval.
10. As the human, I want the hooks never to block an agent because the hook itself is broken, so that a bug in a guard can't stall a Spec.
11. As the human, I want my own sessions and PRs left unchecked until CI exists, so that the hooks don't get in the way of work I do myself.
12. As the human, I want the definition of done to keep requiring the full `pnpm test`, so that the only safety net before CI stays in place.
13. As the human, I want Spec 00017 itself built through task PRs like any Spec, including the Tickets that change Claude settings and Intent Docs, so that nothing is pushed straight to a branch.
14. As the Implementer, I want one command that tells me whether I can start, so that I don't discover a wrong Node or a missing Docker halfway through.
15. As the Implementer, I want preflight's failure message to say what is wrong and what to do, so that I can fix it or escalate without guessing.
16. As the Implementer, I want an edit outside my boundary denied with the reason, so that I learn the boundary at the moment I cross it.
17. As the Implementer, I want the files every PR touches allowed without listing them (my own Ticket, appends to Laters, Generated Docs), so that routine work is never blocked.
18. As the Implementer, I want to be allowed to update the Descriptive Docs covering the code I change, so that I can keep docs in step in the same PR, as the definition of done asks.
19. As the Implementer, I want the fast checks to run when I stop, so that a lint, type or test failure reaches me before the PR does.
20. As the Implementer, I want the stop check to block me at most once, so that a check I can't fix never traps me in a loop.
21. As the Implementer, I want a stop check that times out to be reported, not counted as a failure, so that slow API tests don't block me.
22. As the Implementer fixing review findings, I want preflight to work on a branch with no Ticket, so that the review-fix PR starts like any other.
23. As the Implementer of the review-fix PR, I want the `Status:` line of `spec.md` allowed only when my scope file says so, so that only that PR changes the Spec's Status.
24. As the Implementer, I want a PR blocked when I changed code a Descriptive Doc covers without updating it, unless I say why in the PR body, so that docs go stale only on purpose.
25. As the Orchestrator, I want to copy a Ticket's Packages and Also writes fields into the scope file, so that I never derive the boundary from prose.
26. As the Orchestrator, I want to record the Ticket path, or `none`, in the scope file, so that preflight and the guards know which Ticket a branch is for.
27. As the Orchestrator, I want preflight to check Docker and the Ticket's blockers, so that my "Before spawning" step keeps only building the task graph.
28. As the Orchestrator, I want the `covers:` check run on the whole Feature Branch to tell me which Descriptive Docs it touched, so that running Doc Sync is no longer a judgment call for them.
29. As the Orchestrator, I want to keep judging Doc Sync for Intent Docs (the glossary, the conventions), so that a script doesn't pretend to know when prose went wrong.
30. As Doc Sync, I want my writes limited to Descriptive Docs, so that I report an Intent Doc instead of changing it.
31. As Doc Sync, I want my branch name `agent/<NNNNN>-doc-sync` accepted by preflight, so that I start like any Task Branch.
32. As the Explorer, I want my writes limited to notes outside the repo, so that a note never lands in the repo by accident.
33. As the Spec Writer and the Orchestrator, I want my main-session writes unchecked, so that Specs, glossaries, ADRs and briefs are never blocked by an Implementer's scope.
34. As the Reviewer, I want nothing to change for me, so that my lack of `Edit` and `Write` stays my boundary.
35. As a maintainer, I want the hooks typechecked from their first commit, so that the scripts that enforce the Factory don't drift from their own types.
36. As a maintainer, I want the docs generator's import of the API typed by the API's own declarations, so that its types can't drift from the code.
37. As a maintainer, I want one module to decide whether a path is writable, used by every guard, so that the edit guard, the stop check and the PR guard never disagree.
38. As a maintainer, I want each new script tested through its decision function, so that a guard's verdict is covered without spawning agents.
39. As a maintainer, I want the reasons for enforcing Writes at edit, stop and PR time recorded in an ADR, so that nobody re-adds a Bash parser or a `Stop` hook without knowing why they were rejected.
40. As a reader of the Factory glossary, I want Scope file, Preflight and Diff-scope check defined, so that I can tell them from the read scope, setup and the write guard.
41. As a reader of the SDLC page, I want "Checked by" to say Machine where a script now checks the Gate, so that I can see which Gates still rely on an agent.
42. As the author of Spec 00018, I want the Also writes field and the Writes enforcement in place, so that its Tickets can change Intent Docs and its metrics file through the same mechanism.

## Implementation Decisions

### Typechecking `scripts/`

- `scripts/` gets its own TypeScript config and a root `typecheck:scripts` script, added to the root `typecheck`, the same way `lint:scripts` and `test:scripts` sit in `lint` and `test`. Its flags match the strictest package's.
- The API's build emits declarations, so the docs generator's import of the API's built docs entry is typed by the API itself. No `@ts-` comment, no hand-written type, no new package. Splitting the generator into its own package was considered and rejected: it would still import the API and still need its declarations.
- The existing errors under strict flags (mostly one helper in the read guard's test) are fixed in the same Ticket.
- This lands first, so every new script is typechecked from its first commit.

### Ticket template and scope file

- The Ticket template gains two fields after *What to build*:
  - `**Packages:**` — the workspace packages the Ticket touches (`api`, `web`, `contracts`, `scripts`), or `None`.
  - `**Also writes:**` — exact paths, no globs, of files the Role does not normally write (an Intent Doc, `.claude/settings.json`, an agent file), or `None`. Merging the Spec PR is the human's approval of them, so the Implementer doesn't ask again.
- Existing Tickets are not rewritten; for them the Orchestrator still reads packages from *What to build*.
- The scope file holds these facts, one per line; a missing line means `no`, `none` or empty:

  ```
  ticket: .scratch/00017-ticket-gates/issues/03-preflight.md
  packages: scripts
  writes: docs/workflow/setup.md .claude/settings.json
  spec-status: no
  browser-check: no
  worktree: no
  ```

- `ticket` is the Ticket's path, or `none` for the review-fix branch. `spec-status: yes` only for the review-fix PR. `writes` is copied from Also writes. The Orchestrator writes the file before spawning, as today.
- The name `scripts` in `packages` means `scripts/**` for writing. The read guard adds no docs for it.

### Preflight

- A root `pnpm preflight` script. The Implementer runs it right after creating its Task Branch; it is named in the Implementer's Role file and in [setup](../../docs/workflow/setup.md). The root `AGENTS.md` is not changed.
- Checks, each failing with what is wrong and what to do:
  - Node satisfies the root `engines` range.
  - The branch is `agent/NNNNN-NN-<slug>` or `agent/NNNNN-doc-sync`, and `NNNNN` matches a Feature Branch on `origin`.
  - The Feature Branch's tip is merged into the branch.
  - No tracked file is modified or staged.
  - Untracked files: preflight lists them and fails, and the Implementer escalates so the human decides what to do with them.
  - Docker is running.
  - The Spec PR is merged: `spec.md` on the Feature Branch tip on `origin` reads `ready-for-agent` (or `resolved`) and, when the scope file names a Ticket, that Ticket is there too. No GitHub API call.
  - Every Ticket in the Ticket's `Blocked by` is `resolved` on the Feature Branch tip. Skipped when `ticket: none`.
- Preflight fails closed: any error, including one it can't classify, exits non-zero and the Implementer stops.
- The orchestrator page's "Before spawning" drops its Docker check and keeps building the task graph from `Blocked by` and `Status`. The SDLC page's Feature Branch Stage is checked by Machine.

### The write boundary

- One module decides whether a Role may write a path, and is the only place that reads the Writes column's rules:
  - `canWrite(path, role, facts)` returns allowed, or a reason.
  - `checkDiff(changes, role, facts)` calls it for every changed file and adds the rules only a diff shows.
- The Role is the hook input's `agent_type`. With none (the main session), everything is allowed.
- **Implementer**: the packages in `packages`; the paths in `writes`; its own Ticket (`ticket`); Descriptive Docs whose `covers:` matches a file it changed; appends to Laters; Generated Docs; `package.json` and the lockfile when Allowed packages is not `None`; the `Status:` line of `spec.md` when `spec-status: yes`.
- **Diff-only rules**: Laters only gains lines; `spec.md` changes only on its `Status:` line; `package.json` and the lockfile change only when the Ticket's Allowed packages is not `None` (versions are not compared). Generated Docs are allowed because `docs:check` already proves they match their generator.
- **Doc Sync**: only files with `kind: descriptive` front matter.
- **Explorer**: only paths outside the repo.
- **Reviewer**: unchanged; it has no `Edit` or `Write`.
- The Writes column on the SDLC page and the Implementer's Role file add "Descriptive Docs covering the code it changes" and "files its Ticket lists under Also writes".

### Hooks

Recorded in ADR 0012.

- **`guard-writes`**: a `PreToolUse` hook on `Edit|Write` that denies with `canWrite`'s reason. Bash commands are not parsed.
- **Stop check**: a `SubagentStop` hook that acts only for `agent_type: implementer`. It runs `checkDiff` on the branch's diff against the Feature Branch tip, then the fast checks: lint and typecheck of the scope's packages, and the test files changed on the branch. No changed test file means no tests run. On a failure it blocks once with the output; when `stop_hook_active` is set it lets the agent stop. Its time budget is 180 s; a timeout is reported to the agent and does not block.
- **PR guard**: `guard-pr.ts` also runs `checkDiff` and the `covers:` check, for sub-agent sessions, and denies the PR with the reasons.
- No `Stop` hook: it would fire in the main session. No git hook: human PRs stay unchecked until CI.
- Every hook fails open, like the read and PR guards today.

### `covers:` and Doc Sync

- A Descriptive Doc may have a `covers:` front matter list of globs naming the code it describes. The architecture overview and the runtime flows get it first. A Descriptive Doc without `covers:` is not checked.
- `docsNotUpdated(changedFiles, docs, prBody)` returns each Descriptive Doc whose `covers:` matches a changed file while the doc itself is unchanged, less those the PR body names on a line `Doc not updated: <doc> — <reason>`.
- In the PR guard it blocks the PR. Run by the Orchestrator over the whole Feature Branch before the feature PR, with no PR body, any doc it lists means Doc Sync runs.
- The orchestrator page's Doc Sync section is rewritten: the script decides for Descriptive Docs; the Orchestrator still judges the glossary and the conventions, which are Intent Docs and have no `covers:`.
- `docs:check` validates that `covers:` is a list of strings, and appears only on Descriptive Docs.

### Docs this changes

- **Definition of done**: the dependency and "nothing outside the Ticket" items say a hook checks them; the full `pnpm test` stays.
- **Orchestrator page**: Before spawning, the scope file's facts, Doc Sync.
- **SDLC page**: "Checked by" for Stages 4 to 6, the paragraph on what machines check, the Writes column.
- **Implementer and Doc Sync Role files**, **Ticket template**, **setup**, **`.claude/settings.json`**.
- **Laters**: removes the whole "Type-checking `scripts/`" entry, and the "Stop hook" and "`covers:` check" bullets of "Enforce the doc and convention rules".
- Glossary (already on this Spec's branch): Scope file, Preflight, Diff-scope check; Task Branch now includes branches for review fixes and Doc Sync.

### Building this Spec

- Every Ticket is a task PR into the Feature Branch, including those that change `.claude/settings.json` and Intent Docs.
- Typechecking `scripts/` lands first. Every Ticket that lands after `guard-writes` lists its Intent Docs and settings under Also writes.

## Testing Decisions

- A good test drives a script's decision function with the input a hook or the shell would give it, and checks the verdict and its reason. I/O (stdin, `git`, `docker`) is passed in, as `guard-pr`'s `run` and `guard-reads`' context are today. Our own code is not mocked; the thin wrappers that read stdin and call commands are not tested ([testing policy](../../docs/workflow/testing-policy.md)).
- Tests are `node --test` files next to each script, run by `test:scripts`. Prior art: `guard-reads.test.ts`, `guard-pr.test.ts`.
- **Write boundary**, the main seam. Cases:
  - An Implementer with `packages: api` may write under the API and not under the web package.
  - A path in `writes` is allowed; an Intent Doc not in it is denied.
  - Its own Ticket is allowed; another Ticket and the rest of a Spec are denied.
  - A Descriptive Doc whose `covers:` matches a changed file is allowed.
  - Laters: an added line passes, a removed line fails.
  - `spec.md`: a `Status:` change passes only with `spec-status: yes`; any other line fails.
  - The lockfile fails with Allowed packages `None` and passes otherwise.
  - Doc Sync: a `kind: descriptive` file passes, an Intent Doc and code fail.
  - Explorer: a path in the repo fails, one outside passes.
  - No `agent_type`: everything passes.
- **Preflight**, through `checkPreflight(env)`. One failing case and one passing case per check. Untracked files fail with a message that says to ask the human. `ticket: none` skips the `Blocked by` check. The Doc Sync branch name passes.
- **`covers:`**, through `docsNotUpdated`. A doc whose glob matches an unchanged doc is listed. Updating the doc clears it. A `Doc not updated:` line clears it. A doc without `covers:` is never listed.
- **Hook wiring.** No automated test. A Ticket's Verification triggers each hook once in a real sub-agent session: an edit outside the boundary, a stop with a lint error, a PR with an uncovered change.
- **Typechecking `scripts/`.** `pnpm typecheck` passes and fails on a deliberate type error in a script.

## Out of Scope

- CI and branch protection: deferred, kept in Laters.
- A periodic drift audit: [ADR 0008](../../docs/adr/0008-documents-are-classed-by-how-they-are-maintained.md) chose same-PR doc updates; it stays in Laters.
- A self-repair loop on a failed Gate: it would contradict "never retries blind" in [escalation](../../docs/workflow/escalation.md).
- Parsing Bash commands to guard writes (ADR 0012).
- Git hooks and checks on human PRs.
- Changing the definition of done's full `pnpm test`.
- Changing the root `AGENTS.md`.
- Rewriting existing Tickets with the new fields.
- `covers:` on Descriptive Docs other than the architecture overview and the runtime flows.
- Role definitions (Spec 00016); learning, metrics and enforcement tags (Spec 00018).
- Any npm package change.

## Further Notes

- This Spec came out of a grilling session on the grill brief in this folder, which first checked the brief against the workflow Spec 00016 merged. The conflicts it found are in the Problem Statement: the Writes column blocking Intent Docs, settings and Descriptive Docs; branches without a Ticket; Doc Sync having no scope file; line-level and append-only Writes; a `Stop` hook firing in the main session; untracked files in the main checkout; preflight overlapping "Before spawning"; and Doc Sync's comparison list mixing Intent and Descriptive Docs.
- While this Spec was written, running `pnpm` under Node 24 failed and a `pnpm` run rewrote `pnpm-lock.yaml` with an `@pnpm/exe` entry. Both are what preflight and the Diff-scope check exist to catch.
- Hook facts to check in the Ticket: `SubagentStop`'s input carries `agent_type` and `stop_hook_active`, and a block's reason reaches the sub-agent.
