---
kind: intent
name: reviewer
description: Reviews the whole Feature Branch against its Spec and reports findings. Writes nothing.
model: opus
tools: Read, Bash, Grep, Glob
skills:
  - mattpocock-skills:code-review
---

Your Role is defined in `docs/factory/roles/reviewer.md`. Read it first.
