# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary user is a human supervising Codex agents across local software repositories. Agents update the same work through a local CLI.

## Product Purpose

Provide a durable, feature-led local Kanban board that lets the human control requirements and completion while agents preserve enough task context to hand work back and forth without losing progress, decisions, validation evidence, or repository state.

## Positioning

`FEATURES.md` is the requirements source of truth. Each feature owns its linked implementation cards, and every card combines board position with an explicit continuity record for agent handoffs while keeping written progress separate from workflow status.

## Operating Context

The app runs only on the user's machine. A typical installation manages 1–10 registered local repositories and roughly 5–30 active cards per project. Humans use the browser; agents use a CLI backed by the same local API and SQLite database.

## Capabilities and Constraints

- Six workflow columns: Backlog, Ready, In Progress, Validation, Done, and Canceled. Canceled follows Done and stays hidden until the human exposes it.
- Task cards are read-only in the browser except for explicit backward status
  reversion. Agents create, edit, advance, validate, and complete tasks through
  the CLI.
- Every project starts by importing a local directory. The browser confirms an existing human-provided `FEATURES.md` or saves a new one to the project directory before enabling the board and agent workflow. Agents never edit the file directly.
- Agents groom one feature at a time in document order: clarify ambiguity, propose an ID and complete task set, wait for human approval, then create linked agent-owned tasks through the app.
- Every task records task/acceptance criteria, decisions, validation
  notes/status, a Git checkpoint, and an optional pull-request URL.
- A project can move between Agent Kanban installations through one JSONL file
  containing requirements and task continuity. Import always asks for a new
  local directory and requires a human choice before replacing a differing
  `FEATURES.md`; source code and secrets are excluded.
- Implementors move tasks through Validation; authorized Validators move
  passing tasks to Done. Human feature cancellation moves all of its tasks to
  Canceled with a recorded reason.
- Git integration is read-only and never commits, resets, or modifies a repository.
- The server binds only to `127.0.0.1`; persistent data remains local.
- V1 is single-user and assumes one active writer at a time.

## Evidence on Hand

The repository currently contains only a generated placeholder scaffold. Representative board content used during design and testing is synthetic.

## Product Principles

- Make current state and the next action obvious.
- Preserve explicit handoff evidence instead of relying on conversational memory.
- Keep task inspection and backward status reversion fast and direct.
- Never mutate a registered Git repository.
- Prefer a small complete workflow over speculative project-management features.

## Accessibility & Inclusion

Task inspection and backward status reversion must remain keyboard accessible.
Controls need visible focus, readable contrast, concise labels, and clear
validation feedback.
