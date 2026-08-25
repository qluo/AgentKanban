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

## Resume work

1. Run `project list --json` and match the current working directory to a registered project's `repoPath`.
2. Run `task list --project <project-id> --json`.
3. Select the task the user named. If none was named, prefer the sole task in `in-progress`; when selection remains ambiguous, ask instead of guessing.
4. Run `task show <task-id> --json` and read the entire continuity record before changing code: task and acceptance criteria, progress and next action, decisions, verification notes/status, and Git checkpoint.
5. Compare the written checkpoint and progress with the actual repository state before relying on them. Treat the board as a handoff record, not as proof that code or tests are current.

## Keep the record accurate

- Board column and written progress are independent. Moving a card never substitutes for updating progress.
- Preserve existing decisions unless a meaningful choice changed. Record the choice, reason, and rejected alternative concisely.
- Record commands or checks actually run and their outcomes. When verification was not run, retain an explicit reason and `not_run` status.
- Use `task update <task-id>` for continuity text and `task move <task-id> <column>` for workflow state.
- Moving to `verification` requires a recorded verification result. Moving to `done` requires a result plus a captured checkpoint.
- If a transition is rejected, update the missing continuity evidence; do not bypass validation.

## Handoff work

Before ending a work session:

1. Update `--progress` with completed work, current state, blockers, and the immediate next action.
2. Update `--decisions` when an important choice was made; otherwise preserve the existing explicit entry.
3. Update `--verification-status` and `--verification-notes` with checks run, results, failures, or an explicit reason they were not run.
4. Run `task checkpoint <task-id> --json` after the final checks. This reads branch, commit SHA, and dirty state; it never commits or changes Git.
5. Move the task only to the column supported by that evidence, then run `task show <task-id> --json` and confirm the saved handoff.

Never commit, reset, clean, checkout, stage, or otherwise mutate Git merely to satisfy the board. An explicit dirty checkpoint is valid.
