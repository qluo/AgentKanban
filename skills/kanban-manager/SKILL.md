---
name: kanban-manager
description: Install, start, and manage coding-task continuity through the local Agent Kanban app. Use when the user invokes kanban-manager init or kanban-manager start, or when Codex resumes, updates, moves, validates, completes, or hands off work recorded on the user's local board. Do not use for unrelated task lists.
---

# Kanban Manager

Treat `kanban-manager init` and `$kanban-manager init` as the init command.
Treat `kanban-manager start` and `$kanban-manager start` as the start command.
These are skill commands, not commands provided by the Agent Kanban CLI.

## Init and start commands

Both `kanban-manager init` and `kanban-manager start` ensure the shared web
app is running. Importing a new project reuses that app; it does not require
another clone of Agent Kanban.

1. First check `http://127.0.0.1:3210` (or the configured loopback `KANBAN_URL`).
   Verify Agent Kanban identity using its page and `/api/projects` response;
   an HTTP 200 alone is not sufficient. If it is already running, reuse it and
   report the URL. Do not clone, install, or launch a duplicate process.
2. If it is not running, ask the human where their local Agent Kanban checkout
   is. Reuse a location already supplied in the conversation without asking
   again. Inspect that location and verify the package and Git remote identify
   `qluo/AgentKanban`; the project being imported is not the app checkout.
3. If the human does not know the location or the supplied path is missing,
   look for an existing checkout in the suggested parent directory,
   `AGENT_KANBAN_DIR`, and common locations such as `$HOME/AgentKanban`,
   `$HOME/Documents/AgentKanban`, and `$HOME/Documents/Codex/AgentKanban`.
   Verify candidates; if several valid checkouts remain, ask which to use.
   A missing default directory alone never justifies cloning.
4. Only when no local checkout can be found, clone
   `https://github.com/qluo/AgentKanban.git` into an unused destination:
   use the human's chosen path or `AGENT_KANBAN_DIR`, otherwise
   `$HOME/Documents/AgentKanban`. Never overwrite, reset, clean, or replace
   an existing directory. Do not pull an existing checkout during startup.
5. In the resolved checkout, verify Node.js 22.13 or newer and npm. Install
   dependencies with `npm ci` only when absent or inconsistent with the lockfile.
   Run `npm run build` when the production build is missing or stale, then
   `npm start`. Keep the server process available and wait for readiness.
   Use `npm run dev` only when development mode is explicitly requested.
6. Confirm the page and `/api/projects` respond as Agent Kanban, then report
   the URL and resolved checkout. If the port belongs to another app, report
   the conflict rather than killing it or starting a duplicate. Always bind
   to loopback. Preserve the existing database and environment configuration.

## Use the CLI

For board operations, reuse the running app and the checkout resolved above.
If only the server location is known, use its supported API or locate its
checkout before using the CLI; never clone merely to obtain a CLI.

```bash
npm --prefix "/resolved/path/to/AgentKanban" run kanban -- <command>
```

Use the verified checkout path, not an assumed default or the new project's
path. Set `KANBAN_URL` only for a non-default loopback URL.

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

## Pause for human review after each ticket

After a Validator moves a ticket to Done, the Tech Lead finishes that ticket's
focused commit/PR handoff, records the PR or any publishing blocker, and reports
the changes, validation evidence, and review location to the human. Record
“Awaiting human review; do not start the next ticket” as the next action and
end the work session. Do not start or delegate another ticket until the human
explicitly asks to continue after this handoff. Earlier blanket authorization
and elapsed time do not satisfy this pause. Keep development sequential across
tickets so no next ticket is already underway when one reaches Done.
Implementors stop at Validation handoff; Validators stop after their review.
This pause does not require a merge or permit reopening Done without a human
request.

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
