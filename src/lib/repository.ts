import type Database from 'better-sqlite3';
import { realpathSync, statSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type {
  CheckpointState,
  CreateProjectInput,
  CreateTaskInput,
  Project,
  Task,
  TaskColumn,
  UpdateTaskInput,
} from './types';
import {
  ValidationError,
  validateCreateTaskInput,
  validateProjectInput,
  validateTransition,
  validateUpdateTaskInput,
} from './validation';

type Row = Record<string, unknown>;

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

function now() {
  return new Date().toISOString();
}

function mapProject(row: Row): Project {
  return {
    id: row.id as string,
    name: row.name as string,
    repoPath: row.repo_path as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function mapTask(row: Row): Task {
  const number = row.number as number;
  return {
    id: row.id as string,
    number,
    reference: `KAN-${String(number).padStart(3, '0')}`,
    projectId: row.project_id as string,
    title: row.title as string,
    column: row.column_id as TaskColumn,
    position: row.position as number,
    task: row.task as string,
    progress: row.progress as string,
    decisions: row.decisions as string,
    verificationStatus: row.verification_status as Task['verificationStatus'],
    verificationNotes: row.verification_notes as string,
    checkpointState: row.checkpoint_state as CheckpointState,
    gitBranch: (row.git_branch as string | null) ?? null,
    gitSha: (row.git_sha as string | null) ?? null,
    gitDirty: row.git_dirty === null ? null : Boolean(row.git_dirty),
    checkpointError: (row.checkpoint_error as string | null) ?? null,
    checkpointCapturedAt:
      (row.checkpoint_captured_at as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export function listProjects(db: Database.Database) {
  return (db.prepare('SELECT * FROM projects ORDER BY name').all() as Row[]).map(
    mapProject,
  );
}

export function getProject(db: Database.Database, id: string) {
  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as
    | Row
    | undefined;
  if (!row) throw new NotFoundError('Project not found.');
  return mapProject(row);
}

export function createProject(db: Database.Database, rawInput: unknown) {
  const input: CreateProjectInput = validateProjectInput(rawInput);
  const resolvedPath = path.resolve(input.repoPath);
  let repoPath: string;
  try {
    if (!statSync(resolvedPath).isDirectory()) {
      throw new Error('not a directory');
    }
    repoPath = realpathSync(resolvedPath);
  } catch {
    throw new ValidationError({
      repoPath: 'Repository path must be an existing directory.',
    });
  }

  const timestamp = now();
  const project: Project = {
    id: randomUUID(),
    name: input.name,
    repoPath,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  try {
    db.prepare(
      `INSERT INTO projects (id, name, repo_path, created_at, updated_at)
       VALUES (@id, @name, @repoPath, @createdAt, @updatedAt)`,
    ).run(project);
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE')) {
      throw new ValidationError({
        repoPath: 'This repository is already registered.',
      });
    }
    throw error;
  }
  return project;
}

export function listTasks(db: Database.Database, projectId: string) {
  getProject(db, projectId);
  return (
    db
      .prepare(
        'SELECT * FROM tasks WHERE project_id = ? ORDER BY column_id, position, number',
      )
      .all(projectId) as Row[]
  ).map(mapTask);
}

export function getTask(db: Database.Database, id: string) {
  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as
    | Row
    | undefined;
  if (!row) throw new NotFoundError('Task not found.');
  return mapTask(row);
}

export function createTask(db: Database.Database, rawInput: unknown) {
  const input: CreateTaskInput = validateCreateTaskInput(rawInput);
  getProject(db, input.projectId);
  const timestamp = now();
  const id = randomUUID();
  const nextPosition = (
    db
      .prepare(
        `SELECT COALESCE(MAX(position), -1) + 1 AS position
         FROM tasks WHERE project_id = ? AND column_id = ?`,
      )
      .get(input.projectId, input.column) as { position: number }
  ).position;

  db.prepare(
    `INSERT INTO tasks (
      id, project_id, title, column_id, position, task, progress, decisions,
      verification_status, verification_notes, checkpoint_state, created_at, updated_at
    ) VALUES (
      @id, @projectId, @title, @column, @position, @task, @progress, @decisions,
      @verificationStatus, @verificationNotes, 'not_captured', @createdAt, @updatedAt
    )`,
  ).run({
    ...input,
    id,
    position: nextPosition,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  return getTask(db, id);
}

export function updateTask(
  db: Database.Database,
  id: string,
  rawInput: unknown,
) {
  const input: UpdateTaskInput = validateUpdateTaskInput(rawInput);
  getTask(db, id);
  const fields: string[] = [];
  const params: Record<string, unknown> = { id, updatedAt: now() };
  const columns: Record<keyof UpdateTaskInput, string> = {
    title: 'title',
    task: 'task',
    progress: 'progress',
    decisions: 'decisions',
    verificationStatus: 'verification_status',
    verificationNotes: 'verification_notes',
  };

  for (const [key, value] of Object.entries(input)) {
    const typedKey = key as keyof UpdateTaskInput;
    fields.push(`${columns[typedKey]} = @${key}`);
    params[key] = value;
  }

  fields.push('updated_at = @updatedAt');
  db.prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE id = @id`).run(params);
  return getTask(db, id);
}

export function moveTask(
  db: Database.Database,
  id: string,
  destination: TaskColumn,
) {
  const transaction = db.transaction(() => {
    const task = getTask(db, id);
    validateTransition(task, destination);
    const position = (
      db
        .prepare(
          `SELECT COALESCE(MAX(position), -1) + 1 AS position
           FROM tasks WHERE project_id = ? AND column_id = ?`,
        )
        .get(task.projectId, destination) as { position: number }
    ).position;
    db.prepare(
      'UPDATE tasks SET column_id = ?, position = ?, updated_at = ? WHERE id = ?',
    ).run(destination, position, now(), id);
    return getTask(db, id);
  });
  return transaction();
}

export function deleteTask(db: Database.Database, id: string) {
  getTask(db, id);
  db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
}

export function setTaskCheckpoint(
  db: Database.Database,
  id: string,
  checkpoint: {
    state: CheckpointState;
    branch?: string | null;
    sha?: string | null;
    dirty?: boolean | null;
    error?: string | null;
  },
) {
  getTask(db, id);
  db.prepare(
    `UPDATE tasks SET
      checkpoint_state = @state,
      git_branch = @branch,
      git_sha = @sha,
      git_dirty = @dirty,
      checkpoint_error = @error,
      checkpoint_captured_at = @capturedAt,
      updated_at = @capturedAt
     WHERE id = @id`,
  ).run({
    id,
    state: checkpoint.state,
    branch: checkpoint.branch ?? null,
    sha: checkpoint.sha ?? null,
    dirty:
      checkpoint.dirty === null || checkpoint.dirty === undefined
        ? null
        : Number(checkpoint.dirty),
    error: checkpoint.error ?? null,
    capturedAt: now(),
  });
  return getTask(db, id);
}
