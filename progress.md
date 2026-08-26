# Progress

- Contract defined in `contract.md`.
- Terra-high implementation completed across backend/domain/API/migrations,
  Board/Features UI, CLI/skill behavior, tests, and product documentation.
- New projects now use one local-directory import flow. The app creates a
  missing directory, detects FEATURES.md, and requires the user to confirm an
  existing file or create one before agent feature/task work can begin.
- Integration review fixed stale feature previews during project switching and
  made the confirmation migration atomic while preserving existing projects.
- Task cards are now read-only in the web app. Humans can inspect task details
  and move a card one step backward, while agents retain task creation,
  editing, forward transitions, validation completion, and deletion through
  the CLI/API.
- Tasks now store an optional HTTP(S) pull-request URL. Agents can set or clear
  it through `task update`; the task drawer displays it as an external link.
  Validators can complete independently validated cards through
  `task complete`.
- Projects can now be exported as one `.agent-kanban.jsonl` file and imported
  into a user-selected local directory. Migration preserves FEATURES.md,
  feature/task links, complete continuity records, validation, cancellation,
  checkpoints, and PR links while excluding source code, active local paths,
  credentials, agent sessions, and UI state. Differing destination requirements
  require an explicit compatible choice before an atomic import.
- Verified on Node 22.23.2: 9 test files / 34 tests, TypeScript, ESLint,
  production build, and the Impeccable detector all pass.
- Live HTTP and CLI verification covered both branches of the import flow:
  confirming an existing FEATURES.md and creating a missing one. It also
  verified that agent feature-ID assignment is blocked before confirmation and
  succeeds afterward.
- Browser screenshot QA could not run because no browser backend was available
  in the desktop session; responsive and accessibility behavior received a
  static code review instead. Live HTTP verification confirmed the app shell
  and a real project export with project, FEATURES.md, feature, and task JSONL
  records.
