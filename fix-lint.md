---
kind: descriptive
---

# Lint debt

Every bypass of an oxlint rule that Ticket 00012-01 could not fix, one line each. Each also carries an `// oxlint-disable-next-line <rule> -- <why>` comment in the source. Fixing them is out of scope there.

| Location                                                          | Rule                        | Reason                                                                                            |
| ----------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------- |
| `packages/api/src/auth/login.test.ts:32`                          | `max-lines-per-function`    | a test suite or case keeps its setup and assertions in one block; splitting it would scatter them |
| `packages/api/src/auth/logout.test.ts:53`                         | `max-lines-per-function`    | a test suite or case keeps its setup and assertions in one block; splitting it would scatter them |
| `packages/api/src/auth/profile.test.ts:57`                        | `max-lines-per-function`    | a test suite or case keeps its setup and assertions in one block; splitting it would scatter them |
| `packages/api/src/auth/profile.test.ts:158`                       | `max-lines-per-function`    | a test suite or case keeps its setup and assertions in one block; splitting it would scatter them |
| `packages/api/src/auth/register.test.ts:45`                       | `max-lines-per-function`    | a test suite or case keeps its setup and assertions in one block; splitting it would scatter them |
| `packages/api/src/auth/session.test.ts:118`                       | `max-lines-per-function`    | a test suite or case keeps its setup and assertions in one block; splitting it would scatter them |
| `packages/api/src/auth/session.test.ts:177`                       | `max-lines-per-function`    | a test suite or case keeps its setup and assertions in one block; splitting it would scatter them |
| `packages/api/src/auth/token-deny-list.contract.ts:16`            | `max-lines-per-function`    | a contract suite shared by adapters keeps its cases in one block                                  |
| `packages/api/src/auth/token-deny-list.contract.ts:21`            | `max-lines-per-function`    | a contract suite shared by adapters keeps its cases in one block                                  |
| `packages/api/src/auth/user-search.test.ts:53`                    | `max-lines-per-function`    | a test suite or case keeps its setup and assertions in one block; splitting it would scatter them |
| `packages/api/src/common/errors.test.ts:66`                       | `max-lines-per-function`    | a test suite or case keeps its setup and assertions in one block; splitting it would scatter them |
| `packages/api/src/db/migrations.test.ts:10`                       | `max-lines-per-function`    | a test suite or case keeps its setup and assertions in one block; splitting it would scatter them |
| `packages/api/src/db/seed.test.ts:45`                             | `max-lines-per-function`    | a test suite or case keeps its setup and assertions in one block; splitting it would scatter them |
| `packages/api/src/db/seed.test.ts:65`                             | `max-lines-per-function`    | a test suite or case keeps its setup and assertions in one block; splitting it would scatter them |
| `packages/api/src/db/seed.test.ts:68`                             | `max-lines-per-function`    | a test suite or case keeps its setup and assertions in one block; splitting it would scatter them |
| `packages/api/src/db/system-message-invariant.test.ts:6`          | `max-lines-per-function`    | a test suite or case keeps its setup and assertions in one block; splitting it would scatter them |
| `packages/api/src/groups/group-locking.test.ts:151`               | `max-lines-per-function`    | a test suite or case keeps its setup and assertions in one block; splitting it would scatter them |
| `packages/api/src/groups/group-members.test.ts:90`                | `max-lines-per-function`    | a test suite or case keeps its setup and assertions in one block; splitting it would scatter them |
| `packages/api/src/groups/group-members.test.ts:262`               | `max-lines-per-function`    | a test suite or case keeps its setup and assertions in one block; splitting it would scatter them |
| `packages/api/src/groups/group-rooms.test.ts:80`                  | `max-lines-per-function`    | a test suite or case keeps its setup and assertions in one block; splitting it would scatter them |
| `packages/api/src/groups/group-rooms.test.ts:205`                 | `max-lines-per-function`    | a test suite or case keeps its setup and assertions in one block; splitting it would scatter them |
| `packages/api/src/groups/groups.service.ts:69`                    | `max-params`                | NestJS constructor injection takes one parameter per dependency                                   |
| `packages/api/src/groups/groups.test.ts:97`                       | `max-lines-per-function`    | a test suite or case keeps its setup and assertions in one block; splitting it would scatter them |
| `packages/api/src/groups/groups.test.ts:226`                      | `max-lines-per-function`    | a test suite or case keeps its setup and assertions in one block; splitting it would scatter them |
| `packages/api/src/groups/groups.test.ts:354`                      | `max-lines-per-function`    | a test suite or case keeps its setup and assertions in one block; splitting it would scatter them |
| `packages/api/src/groups/history-windows.test.ts:124`             | `max-lines-per-function`    | a test suite or case keeps its setup and assertions in one block; splitting it would scatter them |
| `packages/api/src/groups/history-windows.test.ts:168`             | `max-lines-per-function`    | a test suite or case keeps its setup and assertions in one block; splitting it would scatter them |
| `packages/api/src/groups/history-windows.test.ts:170`             | `max-lines-per-function`    | a test suite or case keeps its setup and assertions in one block; splitting it would scatter them |
| `packages/api/src/groups/leave-group.test.ts:111`                 | `max-lines-per-function`    | a test suite or case keeps its setup and assertions in one block; splitting it would scatter them |
| `packages/api/src/groups/leave-group.test.ts:333`                 | `max-lines-per-function`    | a test suite or case keeps its setup and assertions in one block; splitting it would scatter them |
| `packages/api/src/groups/system-messages.test.ts:124`             | `max-lines-per-function`    | a test suite or case keeps its setup and assertions in one block; splitting it would scatter them |
| `packages/api/src/logging/logging.test.ts:99`                     | `max-lines-per-function`    | a test suite or case keeps its setup and assertions in one block; splitting it would scatter them |
| `packages/api/src/logging/request-logging.test.ts:6`              | `max-lines-per-function`    | a test suite or case keeps its setup and assertions in one block; splitting it would scatter them |
| `packages/api/src/messages/conversation-queries.ts:118`           | `max-lines-per-function`    | splitting this would not make it clearer                                                          |
| `packages/api/src/messages/direct-conversation-lookup.test.ts:62` | `max-lines-per-function`    | a test suite or case keeps its setup and assertions in one block; splitting it would scatter them |
| `packages/api/src/messages/mark-read.test.ts:112`                 | `max-lines-per-function`    | a test suite or case keeps its setup and assertions in one block; splitting it would scatter them |
| `packages/api/src/messages/mark-read.test.ts:205`                 | `max-lines-per-function`    | a test suite or case keeps its setup and assertions in one block; splitting it would scatter them |
| `packages/api/src/messages/messages.service.ts:81`                | `max-params`                | NestJS constructor injection takes one parameter per dependency                                   |
| `packages/api/src/messages/messages.test.ts:110`                  | `max-lines-per-function`    | a test suite or case keeps its setup and assertions in one block; splitting it would scatter them |
| `packages/api/src/messages/messages.test.ts:268`                  | `max-lines-per-function`    | a test suite or case keeps its setup and assertions in one block; splitting it would scatter them |
| `packages/api/src/messages/messages.test.ts:379`                  | `max-lines-per-function`    | a test suite or case keeps its setup and assertions in one block; splitting it would scatter them |
| `packages/api/src/messages/messages.test.ts:537`                  | `max-lines-per-function`    | a test suite or case keeps its setup and assertions in one block; splitting it would scatter them |
| `packages/api/src/messages/read-receipts.test.ts:101`             | `max-lines-per-function`    | a test suite or case keeps its setup and assertions in one block; splitting it would scatter them |
| `packages/api/src/messages/read-receipts.test.ts:154`             | `max-lines-per-function`    | a test suite or case keeps its setup and assertions in one block; splitting it would scatter them |
| `packages/api/src/messages/typing.test.ts:79`                     | `max-lines-per-function`    | a test suite or case keeps its setup and assertions in one block; splitting it would scatter them |
| `packages/api/src/messages/typing.test.ts:303`                    | `max-lines-per-function`    | a test suite or case keeps its setup and assertions in one block; splitting it would scatter them |
| `packages/api/src/messages/unread-counts.test.ts:90`              | `max-lines-per-function`    | a test suite or case keeps its setup and assertions in one block; splitting it would scatter them |
| `packages/api/src/realtime/realtime.test.ts:62`                   | `max-lines-per-function`    | a test suite or case keeps its setup and assertions in one block; splitting it would scatter them |
| `packages/api/src/realtime/realtime.test.ts:167`                  | `max-lines-per-function`    | a test suite or case keeps its setup and assertions in one block; splitting it would scatter them |
| `packages/api/src/realtime/realtime.test.ts:364`                  | `max-lines-per-function`    | a test suite or case keeps its setup and assertions in one block; splitting it would scatter them |
| `packages/api/src/realtime/realtime.test.ts:419`                  | `max-lines-per-function`    | a test suite or case keeps its setup and assertions in one block; splitting it would scatter them |
| `packages/api/src/security/security.test.ts:36`                   | `max-lines-per-function`    | a test suite or case keeps its setup and assertions in one block; splitting it would scatter them |
| `packages/contracts/src/realtime.test.ts:27`                      | `max-lines-per-function`    | a test suite or case keeps its setup and assertions in one block; splitting it would scatter them |
| `packages/web/src/test/layout.ts:12`                              | `typescript/unbound-method` | saves the prototype method to delegate to it from the stub                                        |
| `packages/web/src/test/setup.ts:33`                               | `typescript/unbound-method` | jsdom lacks scrollIntoView; the polyfill is assigned onto the prototype                           |
