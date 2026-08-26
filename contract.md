# Feature-led Agent Kanban contract

## Observable outcomes

1. Every new project uses one **Import local directory** flow. The user enters
   a directory and the project name is inferred from its basename but remains
   editable. The server creates the directory when it does not exist and
   imports it when it already exists.
2. Import immediately checks `<repoPath>/FEATURES.md`. When the file exists,
   the app shows its read-only contents and detected features and requires
   explicit human confirmation before the project is ready. When it is absent,
   the existing setup experience is shown instead.
3. A newly selected project without `FEATURES.md` shows a setup experience.
   A human can paste Markdown and save it as `<repoPath>/FEATURES.md`, or place
   the file there externally and refresh. Saving a new file or confirming an
   existing one marks requirements as confirmed. Agents cannot assign feature
   IDs or create agent-owned tasks before confirmation, and never create, edit,
   cancel, delete, or directly write `FEATURES.md`.
4. `FEATURES.md` is the requirements source of truth. Level-two headings are
   features. Headings may initially have no ID. Approved IDs use
   `## [FEAT-001] Feature title`; machine state is stored in an adjacent
   `<!-- agent-kanban:feature {...} -->` JSON comment so external edits can be
   re-read without a second feature database becoming authoritative.
5. The human UI can create and edit features. A feature with linked tasks is
   canceled rather than hard-deleted; cancellation remains represented in
   `FEATURES.md`, records a reason, and moves every linked task to `canceled`
   with a task cancellation reason. A feature with no linked tasks may be
   permanently deleted after confirmation.
6. Agents groom one feature at a time in document order. They ask focused
   questions when scope is unclear, propose a unique feature ID and the full
   task set for that feature, wait for explicit human approval, then call the
   app to persist the approved ID and create linked tasks. They do not proceed
   to the next feature until the current feature is approved and persisted.
7. Tasks support an optional `featureId`, `createdBy` (`human` or `agent`),
   `cancellationReason`, and validated HTTP(S) `pullRequestUrl`.
8. The board has Backlog, Ready, In Progress, Validation, Done, and Canceled.
   Canceled is immediately after Done and hidden by default behind a control
   that exposes its count. Cancellation cannot be reached through ordinary
   agent task movement.
9. The browser exposes task details as read-only and removes task creation,
   editing, deletion, forward movement, completion, checkpoint capture, and
   drag-and-drop. Humans may explicitly revert a card one workflow state. The
   CLI owns forward movement and exposes validated completion for Validators.
10. A Board/Features workspace switch preserves the existing console visual
    system. The Features surface shows file setup, feature status/ID/content,
    linked tasks, edit/create/cancel/delete actions, empty/loading/error states,
    and responsive keyboard-accessible behavior.
11. A project can be exported as one versioned JSONL file containing its
    portable identity, exact `FEATURES.md`, parsed features, tasks, contracts,
    workflow state, continuity text, validation evidence, cancellation reasons,
    pull-request links, and Git checkpoints. Source code, credentials, active
    local paths, agent sessions, and UI state are excluded.
12. Import requires a destination local directory, previews project/feature/task
    counts, and never trusts the exported path. A differing destination
    `FEATURES.md` requires an explicit choice; a choice missing feature IDs used
    by tasks is rejected. If the destination file changes after preview, import
    requires a fresh review. Database records and any imported requirements
    file succeed together or are rolled back.

## HTTP and CLI contract

- `POST /api/projects` accepts `name` and a required local `repoPath`; it creates
  the directory recursively when absent and imports it when present. Newly
  imported projects start with unconfirmed requirements.
- `GET /api/projects/:projectId/features` returns file existence, path, raw
  Markdown, parsed features, and linked task summaries.
- `POST /api/projects/:projectId/features-file` confirms an existing file.
- `PUT /api/projects/:projectId/features-file` is a human UI action that saves
  initial raw Markdown and confirms it.
- Human feature create/update/cancel/delete actions live under the project
  features routes. Assigning an approved feature ID is exposed separately for
  the agent workflow and requires an explicit approval assertion in the
  request.
- `POST /api/tasks/:taskId/complete` is the only route that enters Done and is
  exposed to authorized Validators as `task complete`.
- `POST /api/tasks/:taskId/move` rejects Done and direct Canceled movement.
- `GET /api/projects/:projectId/export` downloads the project as JSONL.
- `POST /api/projects/import/preview` validates JSONL and reports destination
  `FEATURES.md` compatibility without changing project state.
- `POST /api/projects/import` imports the reviewed migration and returns the new
  local project.
- The CLI supports agent-owned task creation, continuity updates, HTTP(S)
  `--pull-request-url` links, movement through Validation, and validated task
  completion. Direct `task move` still rejects Done and Canceled.

## Verification

- Migration tests cover existing databases, existing task preservation, JSONL
  round trips, task-number conflicts, and differing `FEATURES.md` files.
- Unit tests cover Markdown parsing/writing, feature ID assignment, optional
  human progress, required agent progress, cancellation fan-out, and transition
  ownership.
- API tests cover project-directory creation, FEATURES.md save/read, feature
  mutation, and human completion.
- Full test, lint, type/build checks pass.
- Browser checks cover project creation defaults, FEATURES.md onboarding,
  feature browsing/editing, hidden Canceled behavior, and review-to-Done.
