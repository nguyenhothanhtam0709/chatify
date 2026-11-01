# 02: ESLint `strict` and no `!`

**What to build:** Move ESLint from `recommended` to `strict`, so that `!` fails lint outside tests, and replace the non-test uses (spec 00009, "Implementation Decisions"). Touches the api, web and contracts packages. Behaviour doesn't change, apart from clearer errors on paths that can't happen today.

**Config:**

- Use `tseslint.configs.strict`, not `strictTypeChecked`.
- Set `@typescript-eslint/no-extraneous-class` to `allowWithDecorator: true`, which clears all 14 Nest `@Module` errors with no code change.
- Turn `@typescript-eslint/no-non-null-assertion` off for test code only: `**/*.test.{ts,tsx}`, `packages/web/src/test/**` and `packages/api/test/**`.

At commit 71e66a6 this gives 8 errors in 5 files, all fixed below.

**Prefactor first:** move the `exactlyOne` helper from the Messages area to the database area and update its callers, so that the auth service doesn't import from Messages.

**Replace the 7 `!`:**

- **`AuthService`, login and register (3):** use `exactlyOne` on the `returning` rows.
- **Route docs, the HTTP method lookup (1):** a guard that throws. A miss should stop docs generation loudly.
- **Web entry point, the root element (1):** a guard that throws, in the style of `useAuth`.
- **`ConversationView`, `transmit` (1):** branch on `conversationId`, then on `target.kind`, and throw if a group has no ID. Every place that opens a group passes an ID today.
- **`ConversationView`, the Retry button (1):** capture `m.outgoing` in a `const` before the closure, with no runtime check.

**The one other error:** `no-dynamic-delete` in the contracts test for required registration fields. Build the object without the key, and keep what the test checks.

**Docs:** add the `!` rule to what lint enforces in the general conventions.

**Allowed packages:** None

**Blocked by:** 01

**Status:** resolved

- [x] `pnpm lint` passes on `strict`, with no `eslint-disable` added for these rules
- [x] A `!` in non-test code fails lint, and one in the test paths doesn't
- [x] Non-test code has no `!`
- [x] `exactlyOne` lives in the database area, and auth doesn't import from Messages
- [x] No Nest module changed to satisfy `no-extraneous-class`
- [x] The general conventions are updated

**Verification:** No new tests: every new throw is on a path that can't happen today, so this falls under the testing policy's refactor rule. Existing tests stay green, and the one test edit keeps its assertion.

**Out of scope:** Access modifiers (Ticket 03). Typed promise rules (Ticket 05). Banning `as` (Ticket 06). `strictTypeChecked`. Removing `!` from tests. Linting generated shadcn components, which stay ignored.

## Comments

Resolved. Config moved to `tseslint.configs.strict`; `no-extraneous-class` allows decorators; `!` is off for tests only. `exactlyOne` moved to `packages/api/src/db/exactly-one.ts`. The 7 `!` replaced as specified; the contracts test builds the object without the key and keeps its assertion. General conventions list the `!` rule.
Verified: `pnpm lint`, `pnpm typecheck`, `pnpm test` (187/312/188), `pnpm docs:check` all pass. No new tests (refactor rule).
Assumptions: the Retry button narrows via `const outgoing = m.outgoing` inside a block-bodied `map` callback, so that JSX was re-indented. The contracts test uses `Object.fromEntries(...filter)` to drop the key.
