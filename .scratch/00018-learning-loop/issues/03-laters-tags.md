# 03: Every Laters entry has a tag

**What to build:** `docs/laters.md` mixes product features, code debt and Factory ideas. Each entry gets a tag line so one kind can be listed with `grep`, and `pnpm docs:check` keeps it that way. Rules:

- Each entry (a `## ` heading in `docs/laters.md`) has `**Tag:** product`, `**Tag:** debt` or `**Tag:** factory` as the first non-blank line under its heading. One value per entry.
  - `product`: a Chat feature or behaviour users would see (for example "Presence", "Message search").
  - `debt`: a cleanup or fix in the code or its tests (for example "API tests redefine `signUp`").
  - `factory`: the workflow, the agents, the hooks or the docs for agents (for example "Enforce the doc and convention rules", "Replay past Tickets when the workflow changes").
  - When an entry could be two, pick the one its **Idea** line changes. If still unsure, escalate with the entry's name rather than guess.
- `scripts/docs/check.ts` gets a check that lists every Laters entry with no tag line or a value outside the three, naming the entry's heading. `pnpm docs:check` fails on any.
- Every existing entry is tagged in this Ticket, so the check starts green. Edit only the tag lines; the entries' text doesn't change.
- The header paragraph of `docs/laters.md` says to add the `**Tag:**` line when appending an entry, with the three values.
- Laters can only be read section by section: find entries with `grep -n '^## ' docs/laters.md`.

See the Spec's "Laters tags".

**Packages:** scripts

**Also writes:** docs/laters.md

**Allowed packages:** None

**Blocked by:** None

**Status:** resolved

- [x] An entry with a valid tag passes the check
- [x] An entry with no tag line fails, and the message names its heading
- [x] An entry with an unknown value fails, and the message names its heading
- [x] Every existing entry in `docs/laters.md` has exactly one tag line, and no other line in it changed
- [x] The Laters header tells an agent to add the tag line and lists the three values
- [x] `pnpm docs:check` passes

**Verification:** Script tests in `check.test.ts` for the three check cases, with docs built by hand as the existing cases do. `pnpm docs:check` passes on the branch.

**Out of scope:** Reordering, merging or rewording Laters entries; tags on any other file.

## Comments

Added `findUntaggedLaters` to `scripts/docs/check.ts` with three script tests, tagged all 30 Laters entries (9 product, 18 debt, 3 factory) and added the tag rule to the header. Judgement call: "CI pipeline and deployment" tagged factory, "Scale out the API" and "Contract-first development" tagged debt.
