# 01: Write boundary and preflight for the Doc Writer

**What to build:** A new sub-agent Role, the Doc Writer (agent type `doc-writer`), writes only the paths the Orchestrator put in its scope file's `writes:` line, on a Task Branch named `agent/NNNNN-doc-writer`. Those paths are what the human approved in the session at the end of a feature ([ADR 0013](../../../docs/adr/0013-doc-writer-writes-what-the-human-approved-in-the-session.md)). The hooks must know this Role before any doc tells the Orchestrator to spawn it. Rules:

- `canWrite` in `scripts/hooks/guard-writes.ts` gets a `doc-writer` branch: a path passes only when it is in `facts.writes`. Nothing else passes: not code, not Descriptive Docs, not `docs/laters.md` or the lockfile unless listed, not a path outside the repo. The denial reason names the path and says that the Doc Writer writes only its scope file's `writes:`.
- The Diff-scope check (`scripts/hooks/check-diff.ts`) applies the same boundary to every file changed on the branch, through `canWrite`. Its existing diff-only rules stay: `docs/laters.md` may change existing lines only when it is in `writes`, which it is for the Doc Writer whenever an approved action targets Laters.
- Preflight (`scripts/preflight/preflight.ts`) accepts `agent/NNNNN-doc-writer` beside `agent/NNNNN-doc-sync`, with `ticket: none` (so the `Blocked by` check is skipped, as for Doc Sync). Its failure message lists the new name too.
- The other Roles' boundaries don't change.

See the Spec's "The Doc Writer" and "Approval through the scope file".

**Packages:** scripts

**Also writes:** None

**Allowed packages:** None

**Blocked by:** None

**Status:** ready-for-agent

- [ ] A `doc-writer` write to a path in `writes` passes
- [ ] A `doc-writer` write to a convention, code, a Descriptive Doc or `docs/laters.md` not in `writes` is denied with a reason that names the path
- [ ] A `doc-writer` write outside the repo is denied
- [ ] The Diff-scope check reports a file changed outside `writes` on a Doc Writer branch, and passes a changed line in `docs/laters.md` when it is in `writes`
- [ ] Preflight passes `agent/00018-doc-writer` with `ticket: none` and fails `agent/00018-doc-writers`
- [ ] The existing `guard-writes`, Diff-scope and preflight tests still pass

**Verification:** Script tests in `guard-writes.test.ts`, `check-diff.test.ts` and `preflight.test.ts`, one case per criterion, with facts and changes built by hand as the existing cases do. Pipe a sample `PreToolUse` hook input with `agent_type: doc-writer` into `guard-writes` and check that it denies a path not in `writes`.

**Out of scope:** The Doc Writer's agent file and Role file (Ticket 04); the read guard (Ticket 02); any new scope fact.

## Comments
