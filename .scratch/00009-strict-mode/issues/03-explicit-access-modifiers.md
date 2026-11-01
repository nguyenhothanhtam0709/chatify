# 03: Explicit access modifiers

**What to build:** Every class member except constructors states its visibility, enforced by lint (spec 00009, "Implementation Decisions"). Touches the api package, plus a few classes in web. `public` is erased at compile time, so behaviour doesn't change.

- Set `@typescript-eslint/explicit-member-accessibility` to `explicit`, with `constructors: 'no-public'`. It applies everywhere, including tests.
- At commit 71e66a6 this gives about 86 errors in 27 files, mostly Nest controller and service methods.
- Add `public` to members that have no modifier, which keeps their visibility as it is today. Don't change any existing `private` or `protected`.
- Add a line on access modifiers to the API conventions, and add the rule to what lint enforces in the general conventions.

**Allowed packages:** None

**Blocked by:** 02

**Status:** resolved

- [x] `pnpm lint` passes with the rule on, with no `eslint-disable` added for it
- [x] A class member with no modifier fails lint, and a constructor written with `public` fails too
- [x] `pnpm typecheck` passes
- [x] The diff only adds modifiers, apart from the config and docs
- [x] The API and general conventions are updated

**Verification:** No new tests: this is a refactor, so existing tests stay green. `pnpm docs:check` confirms the generated route docs didn't change.

**Out of scope:** Narrowing a public member to `private`: note any that stand out in `docs/laters.md`. Moving to `#private` fields. Member ordering rules.

## Comments

Resolved. Rule on with `constructors: 'no-public'`; 86 missing modifiers got `public` (applied from ESLint's own suggestions, then Prettier re-wrapped a few lines). `pnpm lint`, `pnpm typecheck`, `pnpm test` (187/312/195) and `pnpm docs:check` pass. Conventions updated in `api.md` and `general.md`. No `private` candidates noted in `docs/laters.md`; none stood out. Assumptions: none.
