---
kind: descriptive
---

# Lint debt

Every bypass of an oxlint rule that Ticket 00012-01 could not fix, one line each. Each also carries an `// oxlint-disable-next-line <rule> -- <why>` comment in the source. Fixing them is out of scope there.

| Location                                                | Rule                                    | Reason                                                                                                                                                                                                     |
| ------------------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/api/src/groups/groups.service.ts:69`          | `max-params`                            | NestJS constructor injection takes one parameter per dependency                                                                                                                                            |
| `packages/api/src/messages/conversation-queries.ts:118` | `max-lines-per-function`                | one Drizzle select that names every summary column and join; cutting it up would hide the query behind helpers                                                                                             |
| `packages/api/src/messages/messages.service.ts:81`      | `max-params`                            | NestJS constructor injection takes one parameter per dependency                                                                                                                                            |
| `packages/web/src/realtime/socket-realtime.ts:56`       | `typescript/consistent-type-assertions` | `name` and `parsed.data` come from the same schema entry, but TypeScript cannot correlate them into the union (without the cast: TS2322, `type: RealtimeEventName` fits no single member of RealtimeEvent) |
