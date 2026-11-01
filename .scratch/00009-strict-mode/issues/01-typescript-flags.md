# 01: TypeScript flags

**What to build:** Turn on 10 more compiler flags in the shared TypeScript config and fix what they report (spec 00009, "Implementation Decisions"). Behaviour doesn't change. Touches the api and web packages and the shared config; contracts reports nothing.

- **Flags:** `noImplicitOverride`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `noUnusedLocals`, `noUnusedParameters`, `exactOptionalPropertyTypes`, `noPropertyAccessFromIndexSignature`, `allowUnreachableCode: false`, `allowUnusedLabels: false`, `noUncheckedSideEffectImports`. Leave `strict: true` as it is and don't restate its family.
- **`exactOptionalPropertyTypes` (8 errors at commit 71e66a6):**
  - Seven pass a possibly undefined `signal` to `fetch` in the web API clients. Pass `signal ?? null`, which behaved the same as an undefined `signal` in Node's `fetch`.
  - The logger's stream builder returns a possibly undefined `file`. Declare its return type as `file: FileStream | undefined`.
- **`noPropertyAccessFromIndexSignature` (29 errors in 12 files):** change `x.y` to `x['y']`. Nearly all are in tests and test helpers; the rest are `process.env` reads in API config and test setup.
- **Generated shadcn components are never hand-edited.** They report nothing today. If one does, escalate.

**Allowed packages:** None

**Blocked by:** None

**Status:** ready-for-agent

- [ ] All 10 flags are set in the shared config, and no package config overrides them
- [ ] `erasableSyntaxOnly` is not set, and the `strict` family is not restated
- [ ] `pnpm typecheck` and the API build pass
- [ ] No generated shadcn component changed
- [ ] Edits to existing tests change access syntax only, and no assertion is weakened

**Verification:** No new tests: this is a refactor, so existing tests stay green. No browser check here: Ticket 07 covers `signal` in the real app.

**Out of scope:** ESLint changes. Type-checking `scripts/`. Changing how requests are aborted. Changing `verbatimModuleSyntax` in the API config.

## Comments
