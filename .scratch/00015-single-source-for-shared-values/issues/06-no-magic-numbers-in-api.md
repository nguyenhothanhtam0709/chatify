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

**Status:** ready-for-agent

- [ ] `no-magic-numbers` is on for api source, with the allowances and exemptions above
- [ ] `pnpm lint` passes with no new disable comment in api source
- [ ] Behaviour is unchanged: the existing api tests pass

**Verification:** Run `pnpm lint` and the api tests. To show the rule is live, temporarily add a bare `42` to an api service, check that lint fails, then revert.

**Out of scope:** web source (Ticket 05); changing any limit or duration's value.

## Comments
