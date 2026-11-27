---
kind: descriptive
---

# A second worktree

`node_modules` and `packages/api/.env` are git-ignored, so a new worktree has neither. From the new worktree's root:

```sh
pnpm install
cp "$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")/packages/api/.env" packages/api/.env   # from the main checkout
```

If the main checkout has no `.env` either, create one as in [Environment](setup.md#environment).

The hooks still check your work in a worktree, though their `cwd` is the main checkout. `guard-writes` and the read guard find your Task Branch from the file's path, and the PR guard from the PR's head: name your Task Branch as `head` (MCP tool) or `--head` (`gh pr create`), or an Implementer's PR is denied. The stop check finds the one `agent/` worktree whose scope file says `worktree: yes`.

Gotcha: every worktree uses the same ports: 3000 (API), 5173 (web) and 5432 (Postgres). Only one dev stack runs at a time. Stop it (`dev:api`, `dev:web`, then `pnpm db:down` in the worktree that started it) before starting one in another worktree. Docker Compose names the project after the folder, so each worktree's `db:up` gets its own `pgdata` volume: migrate and seed again there. `pnpm test` is not affected: the API tests start their own Postgres on a random port.
