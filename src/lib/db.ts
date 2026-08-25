import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const defaultDatabasePath = path.join(process.cwd(), 'data', 'kanban.sqlite');

function initialize(db: Database.Database) {
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      repo_path TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tasks (
      number INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      column_id TEXT NOT NULL CHECK (column_id IN ('backlog', 'ready', 'in-progress', 'verification', 'done')),
      position INTEGER NOT NULL DEFAULT 0,
      task TEXT NOT NULL,
      progress TEXT NOT NULL,
      decisions TEXT NOT NULL,
      verification_status TEXT NOT NULL CHECK (verification_status IN ('not_run', 'passed', 'failed', 'partial')),
      verification_notes TEXT NOT NULL,
      checkpoint_state TEXT NOT NULL DEFAULT 'not_captured' CHECK (checkpoint_state IN ('not_captured', 'captured', 'not_git', 'error')),
      git_branch TEXT,
      git_sha TEXT,
      git_dirty INTEGER,
      checkpoint_error TEXT,
      checkpoint_captured_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_project_column_position
    ON tasks(project_id, column_id, position);
  `);
}

export function createDatabase(databasePath = defaultDatabasePath) {
  if (databasePath !== ':memory:') {
    mkdirSync(path.dirname(databasePath), { recursive: true });
  }
  const db = new Database(databasePath);
  initialize(db);
  return db;
}

const globalDatabase = globalThis as typeof globalThis & {
  __agentKanbanDb?: Database.Database;
};

export function getDatabase() {
  if (!globalDatabase.__agentKanbanDb) {
    globalDatabase.__agentKanbanDb = createDatabase(
      process.env.KANBAN_DB_PATH || defaultDatabasePath,
    );
  }
  return globalDatabase.__agentKanbanDb;
}
