import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createDatabase } from '@/src/lib/db';
import { listTasks } from '@/src/lib/repository';

const temporaryRoots: string[] = [];

function temporaryRoot() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'agent-kanban-migration-'));
  temporaryRoots.push(root);
  return root;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('task schema migration', () => {
  it('preserves existing projects and tasks while adding feature and cancellation fields', () => {
    const databasePath = path.join(temporaryRoot(), 'legacy.sqlite');
    const legacy = new Database(databasePath);
    legacy.exec(`
      CREATE TABLE projects (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, repo_path TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE tasks (
        number INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        column_id TEXT NOT NULL CHECK (column_id IN ('backlog', 'ready', 'in-progress', 'verification', 'done')),
        position INTEGER NOT NULL DEFAULT 0, task TEXT NOT NULL, progress TEXT NOT NULL,
        decisions TEXT NOT NULL,
        verification_status TEXT NOT NULL CHECK (verification_status IN ('not_run', 'passed', 'failed', 'partial')),
        verification_notes TEXT NOT NULL, checkpoint_state TEXT NOT NULL DEFAULT 'not_captured',
        git_branch TEXT, git_sha TEXT, git_dirty INTEGER, checkpoint_error TEXT,
        checkpoint_captured_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
    `);
    legacy.prepare(
      `INSERT INTO projects VALUES ('project-1', 'Legacy', '/tmp/legacy', '2026-01-01', '2026-01-01')`,
    ).run();
    legacy.prepare(
      `INSERT INTO tasks (
        id, project_id, title, column_id, position, task, progress, decisions,
        verification_status, verification_notes, checkpoint_state, created_at, updated_at
      ) VALUES ('task-1', 'project-1', 'Keep me', 'done', 7, 'Old task', 'Done', 'SQLite', 'passed', 'Passed', 'captured', '2026-01-01', '2026-01-01')`,
    ).run();
    legacy.close();

    const migrated = createDatabase(databasePath);
    const task = listTasks(migrated, 'project-1')[0];
    expect(task).toMatchObject({
      id: 'task-1',
      title: 'Keep me',
      column: 'done',
      position: 7,
      featureId: null,
      createdBy: 'human',
      cancellationReason: null,
    });
    const sql = (migrated.prepare("SELECT sql FROM sqlite_master WHERE name = 'tasks'").get() as { sql: string }).sql;
    expect(sql).toContain("'canceled'");
    migrated.close();
  });
});
