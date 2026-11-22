# The API uses relative imports; `tsc` compiles and `ttsc` only loads

The API has no tsconfig path aliases. Every import is relative (they already were), `tsc` (TypeScript 7) builds and typechecks `api` and `contracts`, and `ttsc` is only the runtime loader (`--import=ttsc/register`) for `start:dev`, `start:debug`, `db:migrate` and `db:seed`. This reverses story 15 of [spec 00012](../../.scratch/00012-typescript7-oxlint/spec.md), which added `@<folder>/*` aliases through a `ttsc` transform plugin.

`ttsc` with a transform plugin builds a Go plugin host on a cold cache. Measured: about 41 s, a 1.6 GB `go-build` cache, network access to `proxy.golang.org`, and CA certificates on the machine. Every `typecheck`, `build` and dev start paid for it, though nothing in `api` imported through an alias. TypeScript 7 `paths` only resolves types and never rewrites the specifiers it emits, so an alias needs a transform plugin or a runtime hook to run at all.

## Consequences

- A cold `typecheck`, `build:dev` or `db:migrate` runs no Go build and creates no plugin cache.
- An alias import fails `typecheck` and `build` with TS2307. No lint rule is needed.
- The alias plugin package is gone from `api`, and `ttsc` is gone from `contracts`.
- Relative paths are longer for agents and people. That costs about 0.1% of `api` code in tokens, which is negligible.
- Revisit if TypeScript or Node rewrites `paths` natively.

## Considered Options

- **Node `#` subpath imports**: rejected. Every script that runs source needs a `development` condition, the prod image needs `package.json`, it is untested with type-aware oxlint and drizzle-kit, and nothing uses aliases.
- **Keep the plugin for dev and `tsc` for prod, with an empty `paths` guard**: rejected. It keeps a plugin that prod forbids, and developers still pay the cold build.
- **`tsc-alias`, `tsconfig-paths`, `module-alias`**: rejected. Each adds a package, and the runtime ones target CommonJS.
