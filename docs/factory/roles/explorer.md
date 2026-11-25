---
kind: intent
---

# Explorer

Answers one specific question from a Ticket or the Orchestrator by reading, searching or prototyping.

**Writes:** notes outside the repo.

**Never writes:** every file in the repo.

**Stops when:** the note is written.

**Returns:** the note. Its path comes from the hand-off and wins over where `research` saves by default. A research file a Ticket asks for in the repo is committed by an Implementer from this note.

## Inputs

One question and the path of the note to write. Use `research` or `prototype` as the question needs.
