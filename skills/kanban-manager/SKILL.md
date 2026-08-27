---
name: kanban-manager
description: Install, start, and manage coding-task continuity through the local Agent Kanban app. Use when the user invokes kanban-manager init or kanban-manager start, or when Codex resumes, updates, moves, validates, completes, or hands off work recorded on the user's local board. Do not use for unrelated task lists.
---

# Kanban Manager

Treat `kanban-manager init` and `$kanban-manager init` as the init command.
Treat `kanban-manager start` and `$kanban-manager start` as the start command.
These are skill commands, not commands provided by the Agent Kanban CLI.

## Init command

When the user invokes `kanban-manager init`:

1. Resolve the installation directory from `AGENT_KANBAN_DIR` when it is set;
   otherwise use `$HOME/Documents/AgentKanban`.
2. If the directory does not exist, clone
   `https://github.com/qluo/AgentKanban.git` into it. If it already exists,
   verify that it is an Agent Kanban checkout; never overwrite, reset, clean,
   or replace an existing directory.
3. Verify Node.js 22.13 or newer and npm are available. Stop with the observed
   versions and a concise remediation when the requirement is not met.
4. Run `npm ci` in the checkout. Do not start the web app as part of init.
5. Report the resolved installation directory and tell the user to invoke
   `kanban-manager start` when they are ready to launch it.

Do not pull or otherwise change an existing checkout during init. If its
remote does not identify `qluo/AgentKanban`, stop and ask the user to choose a
different installation directory.

## Start command

When the user invokes `kanban-manager start`:

1. Resolve the checkout using the same rule as init and verify its
   `package.json` exists.
2. Check whether `http://127.0.0.1:3210` already serves Agent Kanban. If it
   does, do not launch a duplicate process; report that the app is running.
3. Otherwise run `npm run dev` from the checkout, keep the process available
   for the session, and wait for the ready signal.
4. Confirm that `http://127.0.0.1:3210` responds, then report the local URL.
   Never bind the app to a non-loopback address.

If the checkout is missing or dependencies are not installed, stop and direct
the user to run `kanban-manager init`; do not silently perform init from the
start command.

## Use the CLI

For board operations, the local server must be running. Resolve the Agent
Kanban checkout with the same directory rule used by init and start.

```bash
npm --prefix "$AGENT_KANBAN_DIR" run kanban -- <command>
```

When `AGENT_KANBAN_DIR` is unset, substitute
`$HOME/Documents/AgentKanban` directly in the command rather than setting a
persistent environment variable.

Set `KANBAN_URL` only when the user runs the server at a non-default local URL. Never expose the app beyond a loopback address.

## Follow the project workflow

Before planning, changing code, or changing board state, read the registered
project's `AGENTS.md`. It is authoritative for roles, task ownership,
transitions, feature grooming, approvals, cancellation, validation, and
post-Done Git and pull-request handling. If it is absent, ask the human for
workflow direction rather than inventing one.

Use the app or CLI to obtain the current feature data; do not write
`FEATURES.md` directly. Do not assign feature IDs or create agent tasks until
the app records that the project's feature file has been confirmed. Treat a
confirmation error as a request for human action, not something to bypass.

The CLI and database name the Validation column `verification`; the web app
displays it as **Validation**. Use the CLI's internal name in commands.

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
  validation result. `task complete` requires passing validation evidence and a
  checkpoint; use either operation only as authorized by `AGENTS.md`.
- If a transition is rejected, update the missing continuity evidence; do not bypass validation.

## Handoff work

Before ending a work session:

1. Update `--progress` with completed work, current state, blockers, and the immediate next action.
2. Update `--decisions` when an important choice was made; otherwise preserve the existing explicit entry.
3. Update `--verification-status` and `--verification-notes` with validation checks run, results, failures, or an explicit reason they were not run.
4. Run `task checkpoint <task-id> --json` after the final checks. This reads branch, commit SHA, and dirty state; it never commits or changes Git.
5. Make only the board transition authorized by `AGENTS.md`, then run `task
   show <task-id> --json` and confirm the saved handoff.
6. Follow `AGENTS.md` for Git and pull-request work. When a pull request exists,
   record it with `task update <task-id> --pull-request-url <url>` and confirm
   it with `task show <task-id> --json`.
