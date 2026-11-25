# A Spec and its Tickets merge into their Feature Branch, not `main`

The Spec Writer cuts `feat/NNNNN-<slug>` from `main` and pushes it before grilling starts. The Spec and its Tickets are written on `spec/NNNNN-<slug>` and reach the Feature Branch through a Spec PR, which the human merges. That merge is the approval that used to be the merge of a Spec PR and a Ticket PR to `main`. A feature then reaches `main` as one PR holding its Spec, its Tickets and its code. This reverses the git workflow rule that Specs and Tickets go straight to `main`.

One Spec Writer session runs grilling, the Spec and the Tickets back to back, so two PRs to `main` gave the human two approvals of one piece of work, and the Feature Branch could only be cut after both were merged.

## Consequences

- A Spec is not on `main` until its feature is. Two Specs in progress at once don't see each other's glossary entries or ADRs. Conflicts are resolved when the second feature PR merges `main`.
- `main` no longer shows the next free Spec or ADR number. The Spec Writer takes the next number after checking `main` and every `origin/feat/*` branch, and pushing the Feature Branch first reserves it.
- `spec.md` is `ready-for-agent` once the Spec PR is merged into the Feature Branch, not once it is on `main`.
- The Spec PR is a PR to the Feature Branch that no agent merges: agents only squash-merge task PRs.
- `main` gets one extra squash commit per feature, for the Spec PR.

## Considered Options

- **Keep the Spec PR to `main`**: rejected. It needs two branches and two merges to `main` for one feature, and the Feature Branch waits for the first.
- **Approve in the session, no Spec PR**: rejected. The agent would record the human's approval itself, and there would be no diff to review.
- **Triage as the only approval**: rejected. The human would push Status edits straight to the Feature Branch, and the Spec itself would be approved by nobody.
