---
kind: intent
---

# General conventions

These apply to every package.

## Enforced by tools

Lint and the compiler already enforce these, so they are not restated: Zod-only validation, no `dangerouslySetInnerHTML`, no `any` or `@ts-` comments, no floating or misused promises in `packages/*/src` and `packages/api/test` (typed lint), no `!` non-null assertion outside tests, named exports only in `packages/*/src`, the `node:` prefix on Node built-ins, Prettier style, strict mode, `noUncheckedIndexedAccess` and `.js` suffixes on relative imports (NodeNext). In `packages/api/src`: no `forwardRef`, no `console.*` outside the CLIs, and no `process.env` outside `main.ts` and the CLIs.

## Naming

- Use the glossary terms (Member, Owner, Conversation, Former Member, ...) in code and test names. When unsure of a term: [GLOSSARY-MAP.md](../../GLOSSARY-MAP.md).
- File names are kebab-case. API files take a role suffix (`.controller.ts`, `.service.ts`, `.module.ts`, `.guard.ts`). Web component files follow the [web conventions](web.md#files-and-imports).

## TypeScript

Use `interface` for named object shapes and `type` for unions and aliases. Ambient `.d.ts` files may use `export default`.

## Errors

- Every error that crosses the HTTP boundary is `{ error: { code, message, details? } }` with a stable `ErrorCode` from contracts. Clients and tests branch on the code, never on the message.
- Throw a plain `Error` for impossible states, not a `DomainException`, so they become a logged 500.

## Generated values

The exceptions to ADR 0004 and ADR 0005: app code generates request ids and JWT `jti`/`iat`, and those timestamps go through the injected `Clock`.

## Tests

- In api and contracts, put each test next to its code as `*.test.ts`.
- Web feature tests that render `<App />` live flat in `packages/web/src/`. Tests of a single web module sit next to it.
- Shared test helpers live in the package's `test/` folder (`packages/web/src/test/` in web).
