# 05: No magic numbers in web source

**What to build:** Turn on `no-magic-numbers` for web source, so a bare limit or duration fails lint, and fix every site it flags. Touches the root oxlint config and web. Rules:

- Scope the rule to web source in the oxlint config. Allow `0`, `1` and `-1`. Exempt test files, the web test helper folder and the shadcn `components/ui` folder.
- A trial run flagged about 17 sites, among them HTTP statuses (400, 404, 429), durations (60, 500, 1000, 9000) and small counts like `2`. Fix each one in code: use a contracts constant where one exists, otherwise a named constant next to its use.
- No disable comment and no new override for production source. If a site truly can't take a constant, stop and ask (escalation), don't bypass.

See the Spec's Part 3.

**Allowed packages:** None

**Blocked by:** 02

**Status:** resolved

- [x] `no-magic-numbers` is on for web source, with the allowances and exemptions above
- [x] `pnpm lint` passes with no new disable comment in web source
- [x] Behaviour is unchanged: the existing web tests pass

**Verification:** Run `pnpm lint` and the web tests. To show the rule is live, temporarily add a bare `42` to a web component, check that lint fails, then revert.

**Out of scope:** api source (Ticket 06); `switch-exhaustiveness-check` for web.

## Comments

Resolved. `no-magic-numbers` (ignore 0, 1, -1) is on for `packages/web/src`, off for tests, `src/test` and `components/ui` (already ignored). 17 sites fixed with named constants (HTTP statuses, durations, counts); `initials()` helper in `lib/initials.ts` replaces three `slice(0, 2)` copies. Verified: `pnpm lint`, `pnpm typecheck`, `pnpm docs:check`, web tests (248 pass); the rule flagged all 17 sites before the fixes. No contracts constant exists for HTTP statuses, so they are local. Assumption: statuses stay local per file.
