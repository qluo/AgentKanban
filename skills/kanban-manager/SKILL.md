---
name: kanban-manager
description: Manage coding-task continuity through the local Agent Kanban app. Use when Codex resumes, updates, moves, verifies, completes, or hands off work recorded on the user's local board. Do not use for unrelated task lists or when the user has not registered the project in Agent Kanban.
---

# Kanban Manager

Use the installed Agent Kanban CLI. The local server must be running. Replace
`<agent-kanban-directory>` with the path to the user's local Agent Kanban
checkout.

```bash
npm --prefix "<agent-kanban-directory>" run kanban -- <command>
```

Set `KANBAN_URL` only when the user runs the server at a non-default local URL. Never expose the app beyond a loopback address.

## Follow the project roles

Read the registered project's `AGENTS.md` before planning or changing board
state. Humans communicate only with the Tech Lead; subagents report to it and
never seek human decisions directly. For the Agent Kanban workflow:

- The Tech Lead owns planning, task contracts, delegation, rework, reopening,
  and human-confirmed cancellation. It moves Backlog → Ready and may return
  failed Validation → Ready; it reopens Done → Ready only at human request.
- An Implementor accepts one delegated Ready card, reads its contract and
  parent feature, and moves only Ready → In Progress → Validation.
- A Validator accepts one delegated Validation card, reviews it independently,
  records evidence, and moves Validation → Done with `task complete <task-id>`
  when validation passes. On failure it leaves the card in Validation and
  reports the blockers; it never fixes the implementation.
- Each Implementor and Validator may hold only one active card. Refuse a
  mismatched or multi-card assignment without changing code or board state.
  Every delegation must name one card ID, role, and expected transition.

## Features are the requirements source of truth

- Read `FEATURES.md` only through the Agent Kanban app or CLI; run `feature list
  --project <project-id> --json` to obtain the app's parsed feature data and raw
  document state.
- Do not assign feature IDs or create agent tasks until the human has confirmed
  the imported project's existing `FEATURES.md` or created it in the browser.
  Treat a confirmation error as a request for human action, not something to
  bypass through another endpoint.
- Never create, edit, cancel, delete, or write `FEATURES.md` directly. The human
  UI owns feature editing and cancellation.
- Tasks linked to a feature are implementation records, not a replacement for
  feature requirements.

## Groom features sequentially

Groom exactly one active feature at a time, in document order. Do not start the
next feature until the current one is approved and persisted.

1. Run `feature list --project <project-id> --json`, then `feature show --project
   <project-id> <feature-id|index> --json` for the next ungroomed feature. Use
   the zero-based document index for an unassigned feature.
2. Ask focused clarifying questions when its scope, acceptance criteria, or
   boundaries are unclear. Do not invent requirements to avoid asking.
3. Propose one unique ID such as `FEAT-001` and the complete task set for that
   feature. Every task contract must include scope, acceptance criteria,
   dependencies, non-goals, constraints, and required validation. Also include
   its title, progress, and next action. Show the complete proposal to the
   human.
4. Wait for explicit human approval. Approval must cover the proposed ID and
   task set; a general request to plan work is not approval.
5. After approval, ask the app to persist the ID with `feature assign-id
   --project <project-id> <feature-index> --id <FEAT-001> --approved`. This is an
   app-mediated approved write, not a direct mutation of `FEATURES.md`.
6. Create every approved task with `task create --project <project-id> --feature
   <feature-id> ... --progress <text>`. CLI-created tasks are agent-owned and
   must always have progress and a next action.

Complete this grooming cycle for every existing feature before delegating any
development work. Never pause grooming to wait for implementation.

Cancellation requires an explicit human request or confirmation. The Tech Lead
records the reason and uses the supported app operation; for feature
cancellation, the browser moves all linked tasks. Do not recreate canceled work
or alter `FEATURES.md` directly.

## Resume work

1. Run `project list --json` and match the current working directory to a registered project's `repoPath`.
2. Run `task list --project <project-id> --json`.
3. Select the task the user named. If none was named, prefer the sole task in `in-progress`; when selection remains ambiguous, ask instead of guessing.
4. Run `task show <task-id> --json` and read the entire continuity record before changing code: task and acceptance criteria, progress and next action, decisions, validation notes/status, and Git checkpoint. When the task has a linked feature, read that feature through the CLI before interpreting the task scope.
5. Compare the written checkpoint and progress with the actual repository state before relying on them. Treat the board as a handoff record, not as proof that code or tests are current.

## Keep the record accurate

- Board column and written progress are independent. Moving a card never substitutes for updating progress.
- Preserve existing decisions unless a meaningful choice changed. Record the choice, reason, and rejected alternative concisely.
- Record commands or checks actually run and their outcomes. When validation was not run, retain an explicit reason and `not_run` status.
- Use `task update <task-id>` for continuity text and `task move <task-id> <column>` for workflow state.
- Moving to `verification` (the Validation column) requires a recorded
  validation result. Only the Tech Lead may perform a human-confirmed
  cancellation and must record its reason.
- An independently assigned Validator moves a card from Validation → Done with
  `task complete <task-id>` when the card contains passing validation evidence.
- If a transition is rejected, update the missing continuity evidence; do not bypass validation.

## Handoff work

Before ending a work session:

1. Update `--progress` with completed work, current state, blockers, and the immediate next action.
2. Update `--decisions` when an important choice was made; otherwise preserve the existing explicit entry.
3. Update `--verification-status` and `--verification-notes` with validation checks run, results, failures, or an explicit reason they were not run.
4. Run `task checkpoint <task-id> --json` after the final checks. This reads branch, commit SHA, and dirty state; it never commits or changes Git.
5. Move the task only as supported by its evidence and role, then run `task
   show <task-id> --json` and confirm the saved handoff. Implementors stop at
   Validation; Validators use `task complete <task-id>` after validation
   passes.
6. After a Done card's focused pull request is created, the Tech Lead records it
   with `task update <task-id> --pull-request-url <url>` and confirms the saved
   link with `task show <task-id> --json`.

Never commit, reset, clean, checkout, stage, or otherwise mutate Git merely to satisfy the board. An explicit dirty checkpoint is valid.
