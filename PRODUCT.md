# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary user is a human supervising Codex agents across local software repositories. Agents update the same work through a local CLI.

## Product Purpose

Provide a durable, feature-led local Kanban board that lets the human control requirements and completion while agents preserve enough task context to hand work back and forth without losing progress, decisions, verification evidence, or repository state.

## Positioning

`FEATURES.md` is the requirements source of truth. Each feature owns its linked implementation cards, and every card combines board position with an explicit continuity record for agent handoffs while keeping written progress separate from workflow status.

## Operating Context

The app runs only on the user's machine. A typical installation manages 1–10 registered local repositories and roughly 5–30 active cards per project. Humans use the browser; agents use a CLI backed by the same local API and SQLite database.

## Capabilities and Constraints

- Six workflow columns: Backlog, Ready, In Progress, Verification, Done, and Canceled. Canceled follows Done and stays hidden until the human exposes it.
- Desktop drag-and-drop is required in v1.
- Keyboard and explicit move controls provide an accessible alternative; touch drag-and-drop is outside v1.
- A project starts with human-provided `FEATURES.md`; the browser can save it to the project directory and sync its features for browsing and management. Agents never edit the file directly.
- Agents groom one feature at a time in document order: clarify ambiguity, propose an ID and complete task set, wait for human approval, then create linked agent-owned tasks through the app.
- Every task records task/acceptance criteria, decisions, verification notes/status, and a Git checkpoint. Progress/next action is optional for a human-created task, but required for agent-created tasks.
- Agents may move tasks through Verification only. A human browser review is the sole path into Done. Human feature cancellation moves all of its tasks to Canceled with a recorded reason.
- Git integration is read-only and never commits, resets, or modifies a repository.
- The server binds only to `127.0.0.1`; persistent data remains local.
- V1 is single-user and assumes one active writer at a time.

## Evidence on Hand

The repository currently contains only a generated placeholder scaffold. Representative board content used during design and testing is synthetic.

## Product Principles

- Make current state and the next action obvious.
- Preserve explicit handoff evidence instead of relying on conversational memory.
- Keep common board operations fast and direct.
- Never mutate a registered Git repository.
- Prefer a small complete workflow over speculative project-management features.

## Accessibility & Inclusion

Core task movement and editing must remain possible without drag-and-drop. Controls need visible focus, readable contrast, concise labels, and clear validation feedback.
