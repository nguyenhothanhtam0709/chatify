# 07: A PR that changes code a Descriptive Doc covers must update the doc or say why

**What to build:** A Descriptive Doc names the code it describes in a `covers:` front matter list. A sub-agent's PR that changes covered code without updating the doc is blocked unless its body explains why, and the same check, run over the whole Feature Branch, tells the Orchestrator whether to run Doc Sync. Rules:

- `covers:` is a front matter list of globs, for example `covers: [packages/api/src/realtime/**]`. The architecture overview (`docs/architecture/overview.md`) and the runtime flows (`docs/architecture/runtime-flows.md`) get it first, with globs that match the code each describes. A Descriptive Doc without `covers:` is never checked.
- `docs:check` fails when `covers:` is not a list of strings, or appears on a doc that isn't `kind: descriptive`.
- `docsNotUpdated(changedFiles, docs, prBody)` returns each Descriptive Doc whose `covers:` matches a changed file while the doc itself is unchanged, less those the PR body names on a line `Doc not updated: <doc path> — <reason>`. With no PR body, nothing is excused.
- The PR guard runs it for sub-agent sessions, with the changed files against the Feature Branch tip (as in Ticket 04) and the PR body from the GitHub MCP tool's `body` or `gh pr create`'s `--body`, and denies the PR, listing each doc and the line to add if the change is deliberate.
- A root script runs it over the Feature Branch's diff against `main` and prints the docs it lists. The orchestrator page's *Doc Sync* section says: run that script before the feature PR; any doc it lists means Doc Sync runs; for the glossary and the conventions (Intent Docs, no `covers:`) the Orchestrator still judges as today. Replace the sentence "A script can't tell whether new code made a hand-written doc wrong" to match.
- `canWrite` (Ticket 03) allows an Implementer to write a Descriptive Doc whose `covers:` matches a file it changed on the branch.
- Remove the "`covers:` check" bullet of "Enforce the doc and convention rules" from `docs/laters.md`.

See the Spec's "`covers:` and Doc Sync".

**Packages:** scripts

**Also writes:** package.json, docs/architecture/overview.md, docs/architecture/runtime-flows.md, docs/workflow/orchestrator.md, docs/laters.md

**Allowed packages:** None

**Blocked by:** 04

**Status:** ready-for-agent

- [ ] The overview and the runtime flows have `covers:` globs that match their code
- [ ] `docs:check` fails on a malformed `covers:` and on `covers:` outside a Descriptive Doc
- [ ] A changed covered file with the doc unchanged is listed; updating the doc or a `Doc not updated:` line clears it
- [ ] A Descriptive Doc without `covers:` is never listed
- [ ] The PR guard denies a PR with an unexcused doc and lets it through once excused
- [ ] The root script lists the docs for a Feature Branch, and the orchestrator page's Doc Sync section uses it
- [ ] An Implementer may write a Descriptive Doc that covers a file it changed
- [ ] The "`covers:` check" bullet is gone from Laters

**Verification:** Script tests for `docsNotUpdated` (each case above), for the new `docs:check` rule (in the existing check suite), and a `canWrite` case for a covering doc. Pipe a sample hook input into the PR guard for a PR that changes covered code without the doc and check it denies.

**Out of scope:** `covers:` on other Descriptive Docs (setup, worktree, browser check); a periodic drift audit; checking Intent Docs.

## Comments
