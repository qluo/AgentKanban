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
