# 03: `guard-writes` denies an edit outside the Role's Writes

**What to build:** A sub-agent that edits or writes a file outside its Role's Writes is denied at once, with the reason. One module decides whether a Role may write a path; this Ticket uses it in a `PreToolUse` hook on `Edit|Write`, and Ticket 04 reuses it for the Diff-scope check. Rules, from [ADR 0012](../../../docs/adr/0012-writes-are-enforced-on-edit-agent-stop-and-pr-open.md):

- `canWrite(path, role, facts)` returns allowed, or the reason it isn't. The Role is the hook input's `agent_type`; the facts come from the shared scope file module (Ticket 02).
- **No `agent_type`** (the main session: Spec Writer, Orchestrator): every path is allowed.
- **`implementer`** may write:
  - files under each package in `packages` (`packages/<name>/**`; `scripts` means `scripts/**`);
  - each path in `writes`;
  - its own Ticket (the `ticket` path);
  - `docs/laters.md` (Ticket 04 checks that it only gains lines);
  - the Generated Docs, the files with `kind: generated` front matter (`docs:check` proves they match their generator);
  - `.scratch/NNNNN-*/spec.md` of its own Spec (`NNNNN` from the Task Branch name) only when `spec-status: yes`;
  - the lockfile and any `package.json` (Ticket 04 checks which fields changed).
  - Everything else is denied, including other Tickets, the rest of a Spec, Intent Docs, skill-generated files, `.claude/` and `docs/factory/roles/`, unless listed in `writes`.
- **`doc-sync`**: only files whose front matter is `kind: descriptive`.
- **`explorer`**: only paths outside the repo.
- Any other `agent_type`: unchanged (every path allowed); the Reviewer has no `Edit` or `Write`.
- The hook reads `tool_input.file_path`, denies with `permissionDecision: deny` and `canWrite`'s reason, and fails open on any error, like the read guard. Bash commands are not checked here.
- Register it in `.claude/settings.json` as a `PreToolUse` hook with matcher `Edit|Write`.
- Update the Writes to match: the SDLC page's Writes column and the Implementer's Role file add "Descriptive Docs covering the code it changes" and "files its Ticket lists under Also writes"; the Doc Sync Role file says its writes are checked by front matter.

See the Spec's "The write boundary" and "Hooks".

**Packages:** scripts

**Also writes:** .claude/settings.json, docs/factory/sdlc.md, docs/factory/roles/implementer.md, docs/factory/roles/doc-sync.md

**Allowed packages:** None

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] An Implementer with `packages: api` may write under the API and is denied under the web package
- [ ] A path in `writes` is allowed; an Intent Doc not in it is denied
- [ ] Its own Ticket is allowed; another Ticket and the Spec are denied; the Spec is allowed with `spec-status: yes`
- [ ] Doc Sync may write a `kind: descriptive` file and is denied an Intent Doc and code
- [ ] The Explorer is denied any path in the repo and allowed one outside it
- [ ] With no `agent_type`, every path is allowed
- [ ] The hook is registered for `Edit|Write`, and a broken input lets the call through
- [ ] The SDLC Writes column and the Implementer and Doc Sync Role files match the rules above

**Verification:** Script tests for `canWrite`, one case per rule above, in the style of the read guard's suite (decision function, context passed in). Pipe a sample `PreToolUse` input for an out-of-scope `Edit` into the hook and check it prints a deny. The hook can't be triggered in your own session, because hooks load when a session starts; Ticket 08 checks it live.

**Out of scope:** The Diff-scope check and the diff-only rules (Ticket 04); allowing Descriptive Docs by `covers:` (Ticket 07); guarding Bash writes (ADR 0012).

## Comments
