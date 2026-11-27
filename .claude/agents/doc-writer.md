---
kind: intent
name: doc-writer
description: Writes the actions the human approved from a feature's Learning section, and its metrics file, in a task PR.
model: sonnet
tools: Read, Edit, Write, Bash, Grep, Glob, Skill, mcp__github__create_pull_request, mcp__github__update_pull_request, mcp__github__pull_request_read
---

Your Role is defined in `docs/factory/roles/doc-writer.md`. Read it first.
