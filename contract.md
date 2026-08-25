# Feature-led Agent Kanban contract

## Observable outcomes

1. Creating a project from a name proposes `~/projects/<slug>` in the UI. If
   the proposed directory does not exist, the server creates it. Explicit
   custom paths remain supported and must already be directories.
2. A newly selected project without `FEATURES.md` shows a setup experience.
   A human can paste Markdown and save it as `<repoPath>/FEATURES.md`, or place
   the file there externally and refresh. Agents never create, edit, cancel,
   or delete features or `FEATURES.md` directly.
3. `FEATURES.md` is the requirements source of truth. Level-two headings are
   features. Headings may initially have no ID. Approved IDs use
   `## [FEAT-001] Feature title`; machine state is stored in an adjacent
   `<!-- agent-kanban:feature {...} -->` JSON comment so external edits can be
   re-read without a second feature database becoming authoritative.
4. The human UI can create and edit features. A feature with linked tasks is
   canceled rather than hard-deleted; cancellation remains represented in
   `FEATURES.md`, records a reason, and moves every linked task to `canceled`
   with a task cancellation reason. A feature with no linked tasks may be
   permanently deleted after confirmation.
5. Agents groom one feature at a time in document order. They ask focused
   questions when scope is unclear, propose a unique feature ID and the full
   task set for that feature, wait for explicit human approval, then call the
   app to persist the approved ID and create linked tasks. They do not proceed
   to the next feature until the current feature is approved and persisted.
6. Tasks support an optional `featureId`, `createdBy` (`human` or `agent`), and
   `cancellationReason`. Progress/next action may be empty only when a human
   creates a task. Agent-created tasks must supply progress.
7. The board has Backlog, Ready, In Progress, Verification, Done, and Canceled.
   Canceled is immediately after Done and hidden by default behind a control
   that exposes its count. Cancellation cannot be reached through ordinary
   agent task movement.
8. Ordinary task movement rejects `done`. The browser exposes an explicit
   review-and-complete action for tasks in Verification; its human completion
   endpoint enforces the existing verification-result and Git-checkpoint
   gates. The CLI and agent skill can move completed work only to Verification.
9. A Board/Features workspace switch preserves the existing console visual
   system. The Features surface shows file setup, feature status/ID/content,
   linked tasks, edit/create/cancel/delete actions, empty/loading/error states,
   and responsive keyboard-accessible behavior.

## HTTP and CLI contract

- `GET /api/projects/suggest-path?name=...` returns the proposed absolute path.
- `POST /api/projects` accepts `name` and an optional `repoPath`; omission uses
  the proposed path and creates it recursively.
- `GET /api/projects/:projectId/features` returns file existence, path, raw
  Markdown, parsed features, and linked task summaries.
- `PUT /api/projects/:projectId/features-file` is a human UI action that saves
  initial raw Markdown.
- Human feature create/update/cancel/delete actions live under the project
  features routes. Assigning an approved feature ID is exposed separately for
  the agent workflow and requires an explicit approval assertion in the
  request.
- `POST /api/tasks/:taskId/complete` is the only route that enters Done.
- `POST /api/tasks/:taskId/move` rejects Done and direct Canceled movement.
- The CLI adds feature list/show/assign-id operations needed for grooming,
  supports `--feature`, identifies task creation as agent-owned, and never
  offers Done or Canceled as task-move destinations.

## Verification

- Migration tests cover existing databases and existing task preservation.
- Unit tests cover Markdown parsing/writing, feature ID assignment, optional
  human progress, required agent progress, cancellation fan-out, and transition
  ownership.
- API tests cover project-directory creation, FEATURES.md save/read, feature
  mutation, and human completion.
- Full test, lint, type/build checks pass.
- Browser checks cover project creation defaults, FEATURES.md onboarding,
  feature browsing/editing, hidden Canceled behavior, and review-to-Done.
