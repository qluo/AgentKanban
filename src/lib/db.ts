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
      features_confirmed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tasks (
      number INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      feature_id TEXT,
      created_by TEXT NOT NULL DEFAULT 'human' CHECK (created_by IN ('human', 'agent')),
      cancellation_reason TEXT,
      title TEXT NOT NULL,
      column_id TEXT NOT NULL CHECK (column_id IN ('backlog', 'ready', 'in-progress', 'verification', 'done', 'canceled')),
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

  migrateProjects(db);
  migrateTasks(db);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tasks_project_feature
    ON tasks(project_id, feature_id);
  `);
}

function projectColumns(db: Database.Database) {
  return new Set(
    (
      db.prepare('PRAGMA table_info(projects)').all() as Array<{ name: string }>
    ).map(({ name }) => name),
  );
}

function migrateProjects(db: Database.Database) {
  if (projectColumns(db).has('features_confirmed_at')) return;

  db.transaction(() => {
    db.exec('ALTER TABLE projects ADD COLUMN features_confirmed_at TEXT');
    db.exec(
      'UPDATE projects SET features_confirmed_at = created_at WHERE features_confirmed_at IS NULL',
    );
  })();
}

function taskColumns(db: Database.Database) {
  return new Set(
    (
      db.prepare('PRAGMA table_info(tasks)').all() as Array<{ name: string }>
    ).map(({ name }) => name),
  );
}

function migrateTasks(db: Database.Database) {
  const columns = taskColumns(db);
  const schema =
    (
      db
        .prepare(
          "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'tasks'",
        )
        .get() as { sql: string } | undefined
    )?.sql ?? '';
  const requiresRebuild =
    !columns.has('feature_id') ||
    !columns.has('created_by') ||
    !columns.has('cancellation_reason') ||
    !schema.includes("'canceled'");

  if (!requiresRebuild) return;

  db.exec('PRAGMA foreign_keys = OFF');
  try {
    const migrate = db.transaction(() => {
      db.exec(`
        CREATE TABLE tasks_migrating (
          number INTEGER PRIMARY KEY AUTOINCREMENT,
          id TEXT NOT NULL UNIQUE,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          feature_id TEXT,
          created_by TEXT NOT NULL DEFAULT 'human' CHECK (created_by IN ('human', 'agent')),
          cancellation_reason TEXT,
          title TEXT NOT NULL,
          column_id TEXT NOT NULL CHECK (column_id IN ('backlog', 'ready', 'in-progress', 'verification', 'done', 'canceled')),
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
      `);
      db.exec(`
        INSERT INTO tasks_migrating (
          number, id, project_id, feature_id, created_by, cancellation_reason,
          title, column_id, position, task, progress, decisions,
          verification_status, verification_notes, checkpoint_state, git_branch,
          git_sha, git_dirty, checkpoint_error, checkpoint_captured_at, created_at, updated_at
        ) SELECT
          number, id, project_id,
          ${columns.has('feature_id') ? 'feature_id' : 'NULL'},
          ${columns.has('created_by') ? 'created_by' : "'human'"},
          ${columns.has('cancellation_reason') ? 'cancellation_reason' : 'NULL'},
          title, column_id, position, task, progress, decisions,
          verification_status, verification_notes, checkpoint_state, git_branch,
          git_sha, git_dirty, checkpoint_error, checkpoint_captured_at, created_at, updated_at
        FROM tasks;
      `);
      db.exec('DROP TABLE tasks');
      db.exec('ALTER TABLE tasks_migrating RENAME TO tasks');
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_tasks_project_column_position
        ON tasks(project_id, column_id, position);
        CREATE INDEX IF NOT EXISTS idx_tasks_project_feature
        ON tasks(project_id, feature_id);
      `);
    });
    migrate();
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
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
