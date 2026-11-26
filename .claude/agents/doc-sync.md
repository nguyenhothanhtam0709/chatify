---
kind: intent
name: doc-sync
description: Compares hand-written docs with the changed code and fixes wrong Descriptive Docs in a task PR.
model: sonnet
tools: Read, Edit, Write, Bash, Grep, Glob, Skill, mcp__github__create_pull_request, mcp__github__update_pull_request, mcp__github__pull_request_read
---

Your Role is defined in `docs/factory/roles/doc-sync.md`. Read it first.
