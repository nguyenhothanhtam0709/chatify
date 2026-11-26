# 08: Check every new hook live in a fresh session

**What to build:** Claude Code reads the hooks in `.claude/settings.json` when a session starts, so no Implementer could trigger the hooks its own Ticket added. The human checks each one once in a fresh session on the Feature Branch, with Tickets 03 to 07 merged. Steps:

1. Check out the Feature Branch `feat/00017-ticket-gates` in the main checkout and start a new Claude Code session there. Review the new hooks in `/hooks` if Claude Code asks.
2. Create a throwaway Task Branch `agent/00017-99-hook-probe` and write its scope file (`packages: api`, `ticket: none`) as the orchestrator page says.
3. Spawn an `implementer` with a probe brief and ask it, one at a time, to:
   - edit a file under the web package (expect `guard-writes` to deny);
   - add a lint error under the API and end its turn (expect the stop check to block once, then let it stop);
   - change covered API code without the doc and open a draft PR (expect the PR guard to deny, naming the doc).
4. Run `pnpm preflight` on the probe branch with a modified tracked file (expect a failure) and clean (expect it to pass).
5. Delete the probe branch, its scope file and any draft PR. Nothing from the probe is merged.

**Packages:** None

**Also writes:** None

**Allowed packages:** None

**Blocked by:** 03, 04, 05, 06, 07

**Status:** ready-for-human

- [ ] `guard-writes` denied the out-of-scope edit with its reason
- [ ] The stop check blocked once on the lint error and then let the agent stop
- [ ] The PR guard denied the PR and named the uncovered doc
- [ ] `pnpm preflight` failed on the modified file and passed when clean
- [ ] The probe branch, scope file and draft PR are gone

**Verification:** The human records what each step showed under `## Comments`. A hook that doesn't fire becomes a fix Ticket on this Feature Branch.

**Out of scope:** Code changes; checks on the main session or on a human's PR.

## Comments
