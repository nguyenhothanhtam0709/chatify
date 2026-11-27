# The Doc Writer writes the Intent Docs the human approved in the Orchestrator's session

At the end of a feature, the Orchestrator drafts the Learning section, proposes an action for each item and asks the human about each one in the session. For each action the human approves, it writes the exact paths into the `writes:` line of the Doc Writer's scope file, then spawns the Doc Writer, which opens one task PR into the Feature Branch. That PR holds the approved Laters entries and convention edits and the feature's `metrics.md`. `guard-writes` and the Diff-scope check enforce those paths through the scope file, as they already do for a Ticket's Also writes ([ADR 0012](0012-writes-are-enforced-on-edit-agent-stop-and-pr-open.md)).

This is a second way to approve a write to an Intent Doc. The first is merging the Spec PR, which approves a Ticket's Also writes before any work starts. Learning items only exist once the work is done, so they can't be listed in a Ticket. The Orchestrator can't write them itself: it never pushes to the Feature Branch, and it writes no docs.

## Consequences

- The human's approval of a Learning item is an answer in the session, recorded in the Doc Writer's brief and scope file. There is no diff to review until the Doc Writer's PR is open, and the human sees that PR again in the feature PR to `main`.
- The Doc Writer runs once per feature, even when every Learning item is None, because `metrics.md` is always written.
- Doc Sync keeps writing only Descriptive Docs. Intent Docs change only through a Ticket's Also writes or through the Doc Writer.

## Considered Options

- **Let Doc Sync write Intent Docs too**: rejected. Doc Sync fixes docs to match the code; an Intent Doc is the side the code must match ([ADR 0008](0008-documents-are-classed-by-how-they-are-maintained.md)), so one Role would do both.
- **The review-fix Implementer writes `metrics.md`**: rejected. It runs before Doc Sync and before the Learning section exists, and it would need a new write rule that only this file uses.
- **Leave every Learning item to the human when reviewing the feature PR**: rejected. The human would write the Laters entries and edits by hand after the merge, and nothing would check that they did.
