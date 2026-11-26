# 01: The read guard reads scope facts and always allows a Role's own Role file

**What to build:** The Orchestrator writes three facts per Ticket instead of a list of globs, and the read guard works out from them which docs the Implementer may read whole. A sub-agent can always read its own Role file whole. Touches scripts and the orchestrator page. Rules:

- The scope file is `<git-common-dir>/scope/<task-branch>.txt` (it was `read-scope/`). Its lines are facts:

  ```
  packages: api contracts
  browser-check: yes
  worktree: no
  ```

- From `packages`, each named package's `AGENTS.md` and its convention doc are readable whole, plus the general convention. From `browser-check: yes` and `worktree: yes`, the browser-check doc and the worktree doc. A missing line means `no`, or no packages.
- The Ticket and the docs every PR needs stay always allowed, as today. The Spec stays left out.
- The hook input's `agent_type` is read. `docs/factory/roles/<agent_type>.md` is always readable whole. Another Role's file falls under the scope like any doc. With no `agent_type`, behaviour is the same as today.
- A scope file still in the old glob format is read as no facts. There is no migration.
- The decision function and its context keep their shape: the context's scope is still the scope file's lines. No new export.
- The orchestrator page's *Read scope* section is rewritten for the facts file, and its cleanup step deletes the new file.

See the Spec's "Read scope".

**Allowed packages:** None

**Blocked by:** None

**Status:** resolved

- [x] With `packages: api`, the api `AGENTS.md` and the api convention are readable whole and the web ones are denied
- [x] With `browser-check: yes`, the browser-check doc is readable whole; with `no` or no line it is denied. The same for `worktree`
- [x] With `agent_type: implementer`, the Implementer's Role file is readable whole inside a scope, and the Reviewer's Role file is denied
- [x] With no `agent_type`, every existing case gives the same answer as before
- [x] The orchestrator page describes the facts file and no longer asks for globs

**Verification:** Extend the existing read guard suite under `scripts/hooks/`, run by `pnpm test:scripts`. Rewrite the existing scoped cases from glob lines to fact lines; drop none.

**Out of scope:** Any write guard (Spec 00017); a `Packages:` field in the Ticket template (Spec 00017); a read scope for the Reviewer, Explorer or Doc Sync.

## Comments

Resolved. Verified with `pnpm test:scripts` (scoped cases rewritten from globs to facts, none dropped; new cases for each fact, the old glob format and `agent_type`), plus `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm docs:check`. Assumptions: the general convention is readable only when `packages` names at least one package; an `agent_type` that is not a plain name (letters, digits, `_`, `-`) grants no Role file. Shell globs are now denied inside a scope unless their text matches an allowed path or the Ticket glob, since the facts derive exact paths.

Human decision: confirmed that Bash globs are denied inside a scope, and the dropped `docs/adr/0009-*` case is accepted.
