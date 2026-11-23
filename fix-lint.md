---
kind: descriptive
---

# Lint debt

The oxlint bypasses that remain after Spec 00014, one line each. Each also carries an `// oxlint-disable-next-line <rule> -- <why>` comment in the source.

| Location                                                | Rule                                    | Reason                                                                                                                                                                                                     |
| ------------------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/api/src/groups/groups.service.ts:69`          | `max-params`                            | NestJS constructor injection takes one parameter per dependency                                                                                                                                            |
| `packages/api/src/messages/conversation-queries.ts:118` | `max-lines-per-function`                | one Drizzle select that names every summary column and join; cutting it up would hide the query behind helpers                                                                                             |
| `packages/api/src/messages/messages.service.ts:81`      | `max-params`                            | NestJS constructor injection takes one parameter per dependency                                                                                                                                            |
| `packages/api/src/realtime/realtime.adapter.ts:13`      | `typescript/consistent-type-assertions` | spreading the optional `options` makes every key optional, which the adapter's ServerOptions rejects under exactOptionalPropertyTypes (confirmed by compiling without the cast)                            |
| `packages/web/src/realtime/socket-realtime.ts:56`       | `typescript/consistent-type-assertions` | `name` and `parsed.data` come from the same schema entry, but TypeScript cannot correlate them into the union (without the cast: TS2322, `type: RealtimeEventName` fits no single member of RealtimeEvent) |
