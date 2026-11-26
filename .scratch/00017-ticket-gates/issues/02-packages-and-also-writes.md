# 02: Tickets declare Packages and Also writes, and the scope file holds them

**What to build:** A Ticket states, in fields a script can read, which packages it touches and which files outside its Role's normal Writes it may change. The Orchestrator copies them into the scope file with the Ticket's path, so the guards that later Tickets build read the boundary from facts instead of prose. Rules:

- The Ticket template gains two fields right after *What to build*, with their descriptions in the template's Fields list:
  - `**Packages:**` — the workspace packages the Ticket touches (`api`, `web`, `contracts`, `scripts`), comma-separated, or `None`.
  - `**Also writes:**` — exact repo paths, no globs, comma-separated, of files the Role does not normally write (an Intent Doc, `.claude/settings.json`, an agent file, a `package.json` whose `scripts` change), or `None`. The human approves them by merging the Spec PR, so the Implementer doesn't ask again.
- Existing Tickets are not rewritten. For a Ticket without `Packages:`, the Orchestrator still reads the packages from *What to build*.
- The scope file (`<git-common-dir>/scope/<task-branch>.txt`) gains three facts. A missing line means `no`, `none` or empty, as today:

  ```
  ticket: .scratch/00017-ticket-gates/issues/03-guard-writes.md
  packages: scripts
  writes: .claude/settings.json docs/factory/sdlc.md
  spec-status: no
  browser-check: no
  worktree: no
  ```

  - `ticket`: the Ticket's repo path, or `none` for a branch with no Ticket (the review-fix branch).
  - `writes`: the Also writes paths, space-separated.
  - `spec-status: yes` only for the review-fix PR, which sets the Spec's `Status:` line.
- Prefactor: move reading the scope file into facts out of the read guard into one shared module under `scripts/hooks/`, which returns the facts by name. The read guard uses it and gives the same answers as before. Later Tickets (the write guard, preflight) use the same module.
- The orchestrator page's *Read scope* section lists all six facts and says where each one is copied from.

See the Spec's "Ticket template and scope file".

**Packages:** scripts

**Also writes:** docs/workflow/ticket-template.md, docs/workflow/orchestrator.md

**Allowed packages:** None

**Blocked by:** 01

**Status:** resolved

- [x] The Ticket template has `Packages:` and `Also writes:` after *What to build*, each described in the Fields list
- [x] The shared module reads `ticket`, `packages`, `writes`, `spec-status`, `browser-check` and `worktree`, and a missing line gives the empty value
- [x] A scope file in the old glob format still reads as no facts
- [x] Every existing read guard test passes unchanged in meaning
- [x] The orchestrator page's *Read scope* section names all six facts and their sources

**Verification:** Script tests (`node --test`, run by `pnpm test:scripts`) for the shared module, driven with scope file lines: each fact present, missing, and the old glob format. The read guard suite stays green.

**Out of scope:** Any guard that reads `writes`, `ticket` or `spec-status` (Tickets 03 to 06); rewriting existing Tickets with the new fields.

## Comments
- scripts/hooks/scope-facts.ts: `scopeFacts(lines)` returns the six facts; `readScopeFile(commonDir, branch)` reads the lines. guard-reads.ts uses both. Docs updated: ticket-template.md, orchestrator.md (Read scope).
- Assumption: `packages: scripts` still maps to packages/scripts/AGENTS.md in the read guard (a path that doesn't exist, harmless), to keep the guard's answers unchanged.
- pnpm lint fails only on untracked overview.md (prettier), not committed.
