# 11: The fast checks build the contracts first

**What to build:** Ticket 08's second probe run found a problem in a fresh worktree, set up as [worktree](../../../docs/workflow/worktree.md) says (`pnpm install` and `.env`). There `packages/contracts/dist` doesn't exist. The fast checks run lint and typecheck per package with `pnpm --filter`, so they skip the root `build:contracts`. The result is `TS2307: Cannot find module '@chat/contracts'` and `no-redundant-type-constituents` lint errors, which block even a clean branch. After `pnpm build:contracts`, every result matched the main checkout. Rules:

- `stopChecks` in `scripts/hooks/fast-checks.ts` puts `pnpm build:contracts` first when the scope's packages include `api` or `web`, before any lint, typecheck or test. With only `contracts` or `scripts`, it doesn't. The stop check and the PR guard get it through the shared function.
- It runs every time, not only when `dist` is missing, so a branch that changes `packages/contracts` is never checked against a stale build.
- A failing build counts as a failed check. Its output is the reason, and the checks after it don't run, since they would only repeat it.
- It counts against the same 180 s budget.

See Ticket 08's `## Comments`, "Probe run 2".

**Packages:** scripts

**Also writes:** None

**Allowed packages:** None

**Blocked by:** None

**Status:** ready-for-agent

- [ ] With `api` or `web` in the scope, `pnpm build:contracts` runs before every other fast check
- [ ] With only `contracts` or `scripts` in the scope, it doesn't run
- [ ] A failing build is reported as the failure, and the checks after it are skipped
- [ ] In a fresh worktree with no `packages/contracts/dist`, the fast checks pass on a clean branch with `packages: api`

**Verification:** Script tests for `stopChecks`'s command list and for the stop on a failed build, with the commands' results passed in. Run the stop check by hand in a fresh worktree on a clean branch. Ticket 08 checks it live.

**Out of scope:** Building contracts in preflight or in the worktree setup; caching the build.

## Comments
