# Git workflow

## Rules

- You MUST NOT push directly to `main`. You MUST NOT push directly to a feature branch except to create it or to merge `main` into it.
- Every commit MUST reach `main` through a pull request.
- A feature has one **feature branch** named `feat/<NNNNN>-<feature-slug>`, exactly matching the spec's `.scratch/NNNNN-<feature-slug>/` folder (e.g. `feat/00004-agent-docs-foundation`). It is cut from `main` and pushed before grilling starts, which reserves the Spec number.
- Specs and Tickets (everything under `.scratch/`) are written on a **Spec branch** `spec/<NNNNN>-<feature-slug>`, cut from the feature branch, and reach it through a **Spec PR** into the feature branch. A human merges the Spec PR; no agent does.
- Each Ticket gets a **task branch** `agent/<NNNNN>-<NN>-<ticket-slug>` (e.g. `agent/00004-01-ask-before-editing-skill-files`), cut from the feature branch, with a PR targeting the feature branch.
- You MAY squash-merge a task PR into its feature branch, and delete the task branch, once the PR is out of draft (every [definition of done](definition-of-done.md) item ticked) and the latest feature branch is merged into it. You MUST NOT merge any other PR, and never a PR into `main`.

## Flow

### Spec and Tickets

1. Take the next Spec number after checking `main` and every `origin/feat/*` branch.
2. Create the feature branch from up-to-date `main` and push it. Create the Spec branch from it.
3. Write the spec and Tickets on the Spec branch, open a Spec PR to the feature branch.
4. A human squash-merges it. That merge approves the Tickets written `ready-for-agent` or `ready-for-human`.

### Implementing a Ticket

1. Fetch and pull the feature branch. If `main` has moved on, merge `main` into the feature branch first (merge, never rebase: the branch is shared).
2. Check out a task branch from the feature branch.
3. Commit in small steps on that branch.
4. Run lint, typecheck and tests locally before opening the PR.
5. Push the task branch and open a PR to the feature branch that links the Ticket and states how the change was verified.
6. Address review feedback with further commits on the same branch.
7. The AI (when [Rules](#rules) allow it) or a human squash-merges the PR into the feature branch and deletes the task branch.

### Finishing the feature

1. When every Ticket is resolved, set `Status: resolved` in `spec.md` through a task PR as above.
2. Open a PR from the feature branch to `main`.
3. A human merges it with a merge commit (not squash), keeping one commit per Ticket on `main`, and deletes the feature branch.
