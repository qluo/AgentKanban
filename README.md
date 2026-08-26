# Agent Kanban

Agent Kanban is a local, feature-led task board for humans working with coding
agents. Humans manage requirements in `FEATURES.md` and review completed work in
the browser; agents use the bundled CLI and Codex skill to maintain task
handoffs.

The app stores its board data locally, binds only to `127.0.0.1`, and never
modifies Git state.

## Requirements

- Node.js 22.13 or newer
- npm
- Git, if you want task checkpoint capture for registered repositories

## Quick start

```bash
git clone https://github.com/qluo/AgentKanban.git
cd AgentKanban
npm ci
npm run dev
```

Open [http://127.0.0.1:3210](http://127.0.0.1:3210).

The development server reloads when source files change. Keep its terminal
running while using the web app or CLI.

## Shut down gracefully

If the server is running in the foreground, return to its terminal and press
`Ctrl+C` once. Wait for the shell prompt to return before closing the terminal.
This applies to both `npm run dev` and `npm run start`.

If you intentionally started the server in the background, send its process a
normal termination signal and wait for it to exit:

```bash
kill -TERM <process-id>
```

Avoid `kill -9` unless the process is unresponsive. Forced termination does not
give the web server and SQLite connection an opportunity to close normally.

## Set up your first project

1. Select **Add project** in the web app.
2. Enter a project name. Agent Kanban proposes
   `~/projects/<project-name>` and creates that directory if it does not exist.
3. To register an existing repository instead, enter its absolute directory
   path. A custom path must already exist.
4. Provide the project's `FEATURES.md` when prompted:
   - place the file in the registered project directory and select **Refresh**;
     or
   - paste its contents into the web app and save it locally.

Each level-two Markdown heading is treated as a feature:

```markdown
# Product requirements

## Invite teammates

Users can invite a teammate by email.

## Export reports

Users can export a project report as a PDF.
```

`FEATURES.md` is the source of truth for requirements. Humans edit it through
the Features workspace or externally; agents must not edit it directly.

## Install the Codex skill

The optional `kanban-manager` skill teaches Codex how to groom features and
keep task handoffs synchronized with the running app.

For a checkout you plan to update with Git, symlink the skill so updates are
picked up automatically:

```bash
mkdir -p "$HOME/.codex/skills"
ln -s "$(pwd)/skills/kanban-manager" "$HOME/.codex/skills/kanban-manager"
```

Run those commands from the Agent Kanban repository root. If a file or link
already exists at the destination, inspect it before replacing it. Restart
Codex after installing the skill.

## Use the CLI

The CLI talks to the same local API as the browser, so the web server must be
running.

```bash
npm run kanban -- project list --json
npm run kanban -- feature list --project <project-id> --json
npm run kanban -- task list --project <project-id> --json
```

Run the following command for the complete command reference:

```bash
npm run kanban -- help
```

If the app uses a different local URL, set `KANBAN_URL` for the CLI process:

```bash
KANBAN_URL=http://127.0.0.1:4000 npm run kanban -- project list
```

## Production mode

Build and run the optimized Next.js server:

```bash
npm run build
npm run start
```

The production server also listens only on
[http://127.0.0.1:3210](http://127.0.0.1:3210).

## Local data

By default, Agent Kanban stores its SQLite database at
`data/kanban.sqlite` inside the checkout. Set `KANBAN_DB_PATH` before starting
the server to use another location:

```bash
KANBAN_DB_PATH=/absolute/path/kanban.sqlite npm run dev
```

Feature requirements remain in each registered project's `FEATURES.md`. Back
up both the SQLite database and those feature files if you need to preserve the
complete workspace.

## Development checks

```bash
npm test
npm run lint
npm run build
```

## Troubleshooting

- **The CLI cannot connect:** start the web app and confirm that
  `http://127.0.0.1:3210` opens locally.
- **Port 3210 is already in use:** stop the other process before starting Agent
  Kanban. The bundled scripts intentionally use a fixed loopback address and
  port.
- **A native SQLite module fails after changing Node versions:** remove and
  reinstall dependencies with `npm ci` under a supported Node.js version.
- **A custom project path is rejected:** create the directory first or omit the
  path and let Agent Kanban create the suggested directory under `~/projects`.
