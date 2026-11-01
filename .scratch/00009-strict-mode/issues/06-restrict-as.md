# 06: Restrict `as`

**What to build:** `as` fails lint in non-test code in the 3 packages, and a token with a non-numeric `exp` counts as expired (spec 00009, "Implementation Decisions"). The ban is prevention: a trace of the 12 casts on outside or request data found no reachable bug. So this is a refactor, apart from the `exp` gap. Touches the api, web and contracts packages.

**Config:** set `@typescript-eslint/consistent-type-assertions` to `assertionStyle: 'never'` for `packages/**`, off for `**/*.test.{ts,tsx}`, `packages/web/src/test/**` and `packages/api/test/**`. `scripts/` isn't covered, and `as const` stays allowed. At commit 71e66a6 this leaves 34 non-test sites.

**The 12 traced sites:**

| Where | Today | Replacement |
| --- | --- | --- |
| Unique violation translation (2), Fastify status in the exception filter, SQL text in pool instrumentation, the socket handshake token, the login identifier throttle key, validation issues in the sign up client | The cast lets the code read a property, and the value is checked next | A small type guard, with the same behaviour. Share one helper per package if it reads better |
| `socket.data` in the gateway, `req.auth` and route params in throttling | Values the app set itself or the router supplied | Better types where the library allows, otherwise a commented `eslint-disable` |
| `verifyAccessToken` | jose checks the signature and that the claims exist, but not their types | A Zod schema for `AccessClaims`. Failure returns `undefined`, the same as today's `catch` |
| `msUntilExpiry` | A non-numeric `exp` gives `NaN`, and `refreshDelay` passes that on to `setTimeout` | A type guard: a non-numeric or missing `exp` returns `0`, the same as an unparsable token. This is the one behaviour change |

**The other 22 sites** were grouped by reading each line, so confirm as you go:

- **Library and framework gaps (about 19):** for example Nest metadata in the route docs, patching `pool.query`, the Socket.IO adapter options, the logger's streams, the seed's ID map, the realtime events doc and the realtime event union. Use better types where possible, otherwise `// eslint-disable-next-line` with a reason.
- **Harmless (about 3):** for example the empty errors object in the sign up form. Use a type annotation.

**Rules:**

- Every `eslint-disable` for this rule states why the cast is safe. Add that convention and the ban to the general conventions. It's checked in review, because a lint rule for it would need a new package.
- The web package has no direct `zod` dependency and doesn't gain one, so web guards are plain TypeScript. The api package has `zod`.
- A guard must keep the behaviour for every input, apart from the `exp` case. If a site can't, stop and raise it.

**Allowed packages:** None

**Blocked by:** 01, 02

**Status:** resolved

- [x] `pnpm lint` passes with the rule on, and `as const` still works
- [x] Non-test code in the 3 packages has no `as` other than `as const` and commented disables
- [x] Every `eslint-disable` for the rule states a reason
- [x] `msUntilExpiry` returns `0` for a token with a non-numeric or missing `exp`
- [x] `verifyAccessToken` returns `undefined` for claims of the wrong type, and accepts every token the API issues
- [x] The general conventions have the ban and the reason convention

**Verification:** A unit test, written first, for `msUntilExpiry` with a non-numeric `exp`, because the real API can't issue that token: show it failing before the fix. Add a new unit test of `TokenService` for `verifyAccessToken` with wrong-typed claims, signed with a key pair the test generates or supplies, because the real API can't issue that token. Other replacements are refactors, so existing tests stay green.

**Out of scope:** `as` in tests or `scripts/`. A lint rule requiring reasons on `eslint-disable`. Changing throttling keys, socket authentication or error mapping. `no-unsafe-type-assertion`.

## Comments

Resolved. `consistent-type-assertions` (`assertionStyle: 'never'`) is on for `packages/**` and off for tests; `as const` still works. Non-test code has no `as` left except reasoned `eslint-disable`s (routes doc generator, logger streams, Socket.IO adapter options, seed ID map, realtime event union, realtime events doc). Verified: `pnpm lint`, `pnpm typecheck`, `pnpm test` (187/315/199) and `pnpm docs:check` pass. `msUntilExpiry` test was shown failing (NaN) before the fix; the `verifyAccessToken` wrong-type test failed before the Zod schema.

Assumptions:
- `readProperty` (api `common/read-property.ts`) is the one shared guard for the api sites; web guards are plain TypeScript.
- The sign up client reads a validation issue's `path` only when it is an array (the server always sends one); any other `path` counts as absent.
- `socket.data` is `any`, so a type annotation replaced the cast.
- The `routes.ts` generator reads Nest metadata through one typed wrapper, `read<T>`, with a single reasoned `eslint-disable-next-line`; one more next-line disable covers a dynamic module's `imports`.
