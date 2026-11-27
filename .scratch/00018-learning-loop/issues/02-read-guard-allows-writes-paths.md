# 02: The read guard allows a whole read of the paths in `writes:`

**What to build:** A sub-agent that must edit a file listed in its scope file's `writes:` line can read that file whole. Today the read guard denies it: in Ticket 00017-09, `docs/workflow/worktree.md` was in `writes:` but could only be read with a limit, because `worktree: no`. The Doc Writer (this Spec) edits conventions it has to read first, so it needs this. Rules:

- `docsFromFacts` in `scripts/hooks/guard-reads.ts` also returns every path in the scope's `writes:` line.
- `docs/laters.md` stays readable by section only, even when it is in `writes:`: it is in `ALWAYS_GUARDED`, and that wins.
- Nothing else about what is readable changes.

See the Spec's "The read guard".

**Packages:** scripts

**Also writes:** None

**Allowed packages:** None

**Blocked by:** None

**Status:** ready-for-agent

- [ ] A doc listed in `writes:` can be read whole
- [ ] `docs/laters.md` listed in `writes:` is still denied when read whole
- [ ] A doc in neither the scope's docs nor `writes:` is still denied
- [ ] The existing `guard-reads` tests still pass

**Verification:** Script tests in `guard-reads.test.ts` for the three cases, with the scope lines passed in as the existing cases do.

**Out of scope:** Changing which docs every PR may read; the write boundary (Ticket 01).

## Comments
