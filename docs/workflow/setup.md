---
kind: descriptive
---

# Setup

From a clean checkout to green tests. Run every command from the repo root.

## Prerequisites

- Node at the version in `engines` in [package.json](../../package.json).
- pnpm at the version in `packageManager` in the same file. If pnpm is not installed, `corepack enable` provides it. That replaces any global `pnpm` shim, so skip it if pnpm is already there.
- Docker with the daemon running. The local database and the API tests both need it.

## Install

```sh
pnpm install
```

## Environment

The API reads its config from `packages/api/.env`. Every variable is described in [.env.example](../../packages/api/.env.example) and validated by [config.ts](../../packages/api/src/config/config.ts). The defaults in the example match [docker-compose.yml](../../docker-compose.yml). Only the JWT key pair must be filled in: an Ed25519 key pair in PEM, newlines written as `\n`.

```sh
openssl genpkey -algorithm ed25519 -out private.pem
openssl pkey -in private.pem -pubout -out public.pem
grep -v '^JWT_' packages/api/.env.example > packages/api/.env
printf 'JWT_PRIVATE_KEY=%s\n' "$(awk '{printf "%s\\n", $0}' private.pem)" >> packages/api/.env
printf 'JWT_PUBLIC_KEY=%s\n' "$(awk '{printf "%s\\n", $0}' public.pem)" >> packages/api/.env
rm private.pem public.pem
```

Use `printf`, not `echo`: zsh's `echo` turns each `\n` into a real newline and breaks the file. `.env` is git-ignored. `pnpm db:migrate`, `pnpm db:seed` and `pnpm dev:api` need it. `pnpm test` does not.

## Database

```sh
pnpm db:up             # Postgres from docker-compose.yml on localhost:5432, waits until healthy
pnpm build:contracts   # the API imports the built contracts; migrate and seed run the TypeScript source through ttsc/register
pnpm db:migrate        # applies packages/api/drizzle/
pnpm db:seed           # optional dev data, safe to rerun, refuses in production
```

`pnpm db:down` stops it. The data stays in the `pgdata` volume. The seeded Users are listed in [seed.ts](../../packages/api/src/db/seed.ts).

Gotcha: `db:up` fails if something else already listens on port 5432. Stop that service or point `DATABASE_URL` at it.

## A second worktree

When working outside the main checkout: [worktree](worktree.md).

## Adding a dependency

When a dependency may be added at all: [no assumptions](no-assumptions.md).

```sh
pnpm --filter @chat/<package> add <name>      # runtime dependency
pnpm --filter @chat/<package> add -D <name>   # dev dependency
```

`<package>` is `api`, `web` or `contracts`. Commit the package's `package.json` and the root `pnpm-lock.yaml` together.

## Browser check

When the Ticket needs one: [browser check](browser-check.md).

## Tests

```sh
pnpm test
```

It builds contracts first, runs each package's tests one package at a time, then the root script tests. What each part needs:

| Tests                                   | Needs                                                                                                                                                                   |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/api`                          | Docker. [global-setup.ts](../../packages/api/test/global-setup.ts) starts its own Postgres with Testcontainers and migrates it. It does not use `pnpm db:up` or `.env`. |
| `packages/api` with `TEST_DATABASE_URL` | That Postgres instead of a container. Tables are truncated before each test, so never point it at a database you care about.                                            |
| `packages/web`, `packages/contracts`    | Nothing. No database, no Docker. The web tests fake the network with MSW ([server.ts](../../packages/web/src/test/server.ts)).                                          |
| `scripts/docs` (`pnpm test:scripts`)    | Nothing. Node's built-in test runner.                                                                                                                                   |

While working, run only one test file or one package, as the [testing policy](testing-policy.md#how-often) says:

```sh
pnpm build:contracts                                     # once, and again after a contracts change
pnpm --filter @chat/<package> exec vitest run <file>     # one file, path relative to the package
pnpm --filter @chat/<package> test                       # one package
```

## Other checks

```sh
pnpm lint            # builds contracts, then type-aware oxlint per package, then Prettier check
pnpm typecheck       # builds contracts, then ttsc in api and contracts, tsc in web
pnpm docs:generate   # rewrites the Generated Docs in docs/architecture/
pnpm docs:check      # Generated Docs match the code, links resolve, docs declare a kind, resolved Specs have no open Ticket
```

`pnpm format` fixes Prettier issues. See [package.json](../../package.json) for every script.
