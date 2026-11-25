---
kind: intent
---

# Factory

The process that turns Tickets into pull requests on the Chat product, and the documents agents rely on while doing it.

## Language

**Ticket**:
A unit of work for one agent and one pull request, written as a Markdown file under a spec's `issues/` folder.
_Avoid_: Issue (the `issues/` folder keeps its name), task, story

**Intent Doc**:
A document that says why something is or what it should be; it outranks the code, so code that contradicts it is the defect.
_Avoid_: Spec doc, requirements doc

**Generated Doc**:
A document produced from the code by a script and never edited by hand; the code outranks it, so a mismatch means the doc is stale.
_Avoid_: Auto doc, derived doc

**Descriptive Doc**:
A hand-written document that says how something works today; the code outranks it, so a mismatch means the doc is the defect.
_Avoid_: Explanation, reference doc

**Laters**:
The single file where anyone notes work for a later MVP without widening their current Ticket.
_Avoid_: Backlog, TODO list

**Spec**:
A feature's problem, solution and decisions, written before any code and split into Tickets.
_Avoid_: PRD, epic

**Stage**:
One step on the way from an idea to a merged change and what was learned from it, done by one Actor.
_Avoid_: Phase, step

**Actor**:
Whoever does a Stage's work: the human, an agent or a machine. A machine runs checks and never makes a decision.
_Avoid_: Owner (a Chat term), assignee

**Gate**:
What must be true before work leaves a Stage.
_Avoid_: Check (a machine's job inside a Gate), milestone

**Agent Role**:
What one agent session is for: its inputs, outputs, what it may write, allowed tools and skills, and when it stops. Each Role is defined by a Role file.
_Avoid_: Persona, agent type

**Role file**:
The document that defines one Agent Role; every sub-agent spawn and every main-session skill for that Role points to it.
_Avoid_: Agent file (that is only the spawn wrapper), persona file

**Feature Branch**:
The shared branch where one Spec's Tickets are collected before they reach `main`.
_Avoid_: Integration branch, epic branch

**Task Branch**:
The branch for one Ticket's work, cut from its Feature Branch.
_Avoid_: Ticket branch, topic branch

**Escalation**:
An agent stopping work on a Ticket and asking the human a question it cannot settle itself.
_Avoid_: Blocker (that is a Ticket's `Blocked by`), handoff
