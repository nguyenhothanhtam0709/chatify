# 06: No magic numbers in api source

**What to build:** Turn on `no-magic-numbers` for api source, so a bare limit or duration fails lint, and fix every site it flags. Touches the root oxlint config and api. Rules:

- Scope the rule to api source in the oxlint config. Allow `0`, `1` and `-1`. Exempt test files, shared contract suites (`*.contract.ts`), the api test helper folder and the config schema.
- A trial run flagged about 43 sites. Fix each one in code:
  - an HTTP status uses Nest's `HttpStatus`
  - a duration or byte size uses a named constant that states its unit
  - a limit uses its contracts constant where one exists, otherwise a named constant next to its use
- No disable comment and no new override for production source. If a site truly can't take a constant, stop and ask (escalation), don't bypass.

See the Spec's Part 3.

**Allowed packages:** None

**Blocked by:** 02

**Status:** resolved

- [x] `no-magic-numbers` is on for api source, with the allowances and exemptions above
- [x] `pnpm lint` passes with no new disable comment in api source
- [x] Behaviour is unchanged: the existing api tests pass

**Verification:** Run `pnpm lint` and the api tests. To show the rule is live, temporarily add a bare `42` to an api service, check that lint fails, then revert.

**Out of scope:** web source (Ticket 05); changing any limit or duration's value.

## Comments

Resolved. `no-magic-numbers` is on for `packages/api/src` (allows 0, 1, -1; off for tests, `*.contract.ts`, `packages/api/test/**` and `config/config.ts`). About 40 sites fixed: HTTP statuses use `HttpStatus`; durations and byte sizes use named constants (shared unit factors and `roundMs` in `packages/api/src/common/time.ts`, local constants for the throttler windows and byte sizes). No limit's value changed. Verified with `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm docs:check`, and a temporary bare `42` in api source failing lint (reverted). Assumption: oxlint's default skips bare numbers as object property values (`limit: 30`), so those were left. No contracts constant existed for any flagged limit.
