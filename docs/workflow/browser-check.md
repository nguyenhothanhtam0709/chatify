---
kind: descriptive
---

# Browser check

It runs the real API in dev mode against the local database. Nothing is mocked. Each of the last two commands keeps running, so give each its own terminal or background process.

```sh
pnpm db:up
pnpm build:contracts
pnpm db:migrate
pnpm db:seed    # the seeded Users to log in as
pnpm dev:api    # http://localhost:3000/api/v1
pnpm dev:web    # http://localhost:5173
```

Then open http://localhost:5173 with the Chrome DevTools MCP. The seeded Users are `alice`, `bob`, `carol`, `dave` and `erin`, all with the password `password123` ([seed.ts](../../packages/api/src/db/seed.ts)). When done, stop `dev:api` and `dev:web`, then `pnpm db:down`.

## Keep it cheap

- Run it once per Ticket, after the automated tests are green.
- Before starting, check that nothing already holds the ports: `lsof -i :3000 -i :5173`. Another worktree's dev stack is stopped by whoever started it.
- Group checks into one `evaluate_script` call. Use `take_snapshot` or a screenshot only to look at layout: they are large and stay in the context for the rest of the run.
- The PR says what was checked. It needs no attached images.
- Stop the dev stack before reporting done. `dev:api` runs under `node --watch`, which restarts its child if only the child is killed, so stop the watcher too. Wait a few seconds, then confirm with `lsof -i :3000 -i :5173` that the ports are still free.
