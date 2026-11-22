---
kind: descriptive
---

# Lint debt

Every bypass of an oxlint rule that Ticket 00012-01 could not fix, one line each. Each also carries an `// oxlint-disable-next-line <rule> -- <why>` comment in the source. Fixing them is out of scope there.

| Location                                                | Rule                                    | Reason                                                                                                                                                                          |
| ------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/api/src/db/seed.ts:65`                        | `typescript/consistent-type-assertions` | the insert above adds one row per SEED_USERNAMES entry, so every key is present                                                                                                 |
| `packages/api/src/docs/routes.ts:21`                    | `typescript/consistent-type-assertions` | only plain and dynamic modules are listed in imports here; see the comment above                                                                                                |
| `packages/api/src/groups/groups.service.ts:69`          | `max-params`                            | NestJS constructor injection takes one parameter per dependency                                                                                                                 |
| `packages/api/src/messages/conversation-queries.ts:118` | `max-lines-per-function`                | one Drizzle select that names every summary column and join; cutting it up would hide the query behind helpers                                                                  |
| `packages/api/src/messages/messages.service.ts:81`      | `max-params`                            | NestJS constructor injection takes one parameter per dependency                                                                                                                 |
| `packages/api/src/realtime/realtime.adapter.ts:13`      | `typescript/consistent-type-assertions` | spreading the optional `options` makes every key optional, which the adapter's ServerOptions rejects under exactOptionalPropertyTypes (confirmed by compiling without the cast) |
| `packages/contracts/src/realtime-events-doc.ts:50`      | `typescript/consistent-type-assertions` | zod's JSON Schema type is looser than the subset JsonSchema reads, and every event schema fits it                                                                               |
| `packages/web/src/realtime/socket-realtime.ts:56`       | `typescript/consistent-type-assertions` | `name` and `parsed.data` come from the same schema entry, but TypeScript cannot correlate them into the union                                                                   |
| `packages/web/src/test/layout.ts:12`                    | `typescript/unbound-method`             | saves the prototype method to delegate to it from the stub                                                                                                                      |
| `packages/web/src/test/setup.ts:33`                     | `typescript/unbound-method`             | jsdom lacks scrollIntoView; the polyfill is assigned onto the prototype                                                                                                         |
