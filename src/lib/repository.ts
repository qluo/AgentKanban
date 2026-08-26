import type Database from 'better-sqlite3';
import { mkdirSync, realpathSync, statSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import path from 'node:path';
import { getFeatureById } from './features';
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
    featuresConfirmedAt: (row.features_confirmed_at as string | null) ?? null,
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
    featureId: (row.feature_id as string | null) ?? null,
    createdBy: row.created_by as Task['createdBy'],
    cancellationReason: (row.cancellation_reason as string | null) ?? null,
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
    checkpointCapturedAt: (row.checkpoint_captured_at as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export function listProjects(db: Database.Database) {
  return (
    db.prepare('SELECT * FROM projects ORDER BY name').all() as Row[]
  ).map(mapProject);
}

export function getProject(db: Database.Database, id: string) {
  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as
    Row | undefined;
  if (!row) throw new NotFoundError('Project not found.');
  return mapProject(row);
}

export function createProject(db: Database.Database, rawInput: unknown) {
  const input: CreateProjectInput = validateProjectInput(rawInput);
  const expandedPath =
    input.repoPath === '~'
      ? homedir()
      : input.repoPath.startsWith('~/')
        ? path.join(homedir(), input.repoPath.slice(2))
        : input.repoPath;
  const resolvedPath = path.resolve(expandedPath);
  let repoPath: string;
  try {
    mkdirSync(resolvedPath, { recursive: true });
    if (!statSync(resolvedPath).isDirectory()) {
      throw new Error('not a directory');
    }
    repoPath = realpathSync(resolvedPath);
  } catch {
    throw new ValidationError({
      repoPath:
        'Repository path must be a local directory or a creatable directory path.',
    });
  }

  const timestamp = now();
  const project: Project = {
    id: randomUUID(),
    name: input.name,
    repoPath,
    featuresConfirmedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  try {
    db.prepare(
      `INSERT INTO projects (
        id, name, repo_path, features_confirmed_at, created_at, updated_at
      ) VALUES (
        @id, @name, @repoPath, @featuresConfirmedAt, @createdAt, @updatedAt
      )`,
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

export function confirmProjectFeatures(db: Database.Database, id: string) {
  getProject(db, id);
  const timestamp = now();
  db.prepare(
    'UPDATE projects SET features_confirmed_at = ?, updated_at = ? WHERE id = ?',
  ).run(timestamp, timestamp, id);
  return getProject(db, id);
}

export function assertRequirementsConfirmed(project: Project) {
  if (!project.featuresConfirmedAt) {
    throw new ValidationError({
      features: 'Confirm FEATURES.md before starting the agent workflow.',
    });
  }
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
    Row | undefined;
  if (!row) throw new NotFoundError('Task not found.');
  return mapTask(row);
}

export function createTask(db: Database.Database, rawInput: unknown) {
  const input: CreateTaskInput = validateCreateTaskInput(rawInput);
  const project = getProject(db, input.projectId);
  if (input.createdBy === 'agent') assertRequirementsConfirmed(project);
  if (input.featureId) {
    const feature = getFeatureById(project.repoPath, input.featureId);
    if (feature.status !== 'active') {
      throw new ValidationError({
        featureId: 'Tasks can only link to active features.',
      });
    }
  }
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
      id, project_id, feature_id, created_by, title, column_id, position, task, progress, decisions,
      verification_status, verification_notes, checkpoint_state, created_at, updated_at
    ) VALUES (
      @id, @projectId, @featureId, @createdBy, @title, @column, @position, @task, @progress, @decisions,
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
  const existingTask = getTask(db, id);
  const input: UpdateTaskInput = validateUpdateTaskInput(
    rawInput,
    existingTask.createdBy,
  );
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
  db.prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE id = @id`).run(
    params,
  );
  return getTask(db, id);
}

export function moveTask(
  db: Database.Database,
  id: string,
  destination: TaskColumn,
) {
  if (destination === 'done' || destination === 'canceled') {
    throw new ValidationError({
      column:
        'Done and Canceled require their dedicated human or feature workflow.',
    });
  }
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

export function completeTask(db: Database.Database, id: string) {
  const task = getTask(db, id);
  if (task.column !== 'verification') {
    throw new ValidationError({
      column: 'Only tasks in Validation can be completed.',
    });
  }
  validateTransition(task, 'done');
  const position = (
    db
      .prepare(
        `SELECT COALESCE(MAX(position), -1) + 1 AS position
         FROM tasks WHERE project_id = ? AND column_id = 'done'`,
      )
      .get(task.projectId) as { position: number }
  ).position;
  db.prepare(
    'UPDATE tasks SET column_id = ?, position = ?, updated_at = ? WHERE id = ?',
  ).run('done', position, now(), id);
  return getTask(db, id);
}

export function listTaskSummariesForFeature(
  db: Database.Database,
  projectId: string,
  featureId: string,
) {
  return (
    db
      .prepare(
        `SELECT id, number, title, column_id, feature_id
         FROM tasks WHERE project_id = ? AND feature_id = ? ORDER BY number`,
      )
      .all(projectId, featureId) as Row[]
  ).map((row) => ({
    id: row.id as string,
    reference: `KAN-${String(row.number).padStart(3, '0')}`,
    title: row.title as string,
    column: row.column_id as TaskColumn,
    featureId: (row.feature_id as string | null) ?? null,
  }));
}

export function cancelTasksForFeature(
  db: Database.Database,
  projectId: string,
  featureId: string,
  reason: string,
) {
  const tasks = db
    .prepare(
      `SELECT id, column_id FROM tasks WHERE project_id = ? AND feature_id = ? ORDER BY number`,
    )
    .all(projectId, featureId) as Array<{ id: string; column_id: TaskColumn }>;
  let position = (
    db
      .prepare(
        `SELECT COALESCE(MAX(position), -1) + 1 AS position
         FROM tasks WHERE project_id = ? AND column_id = 'canceled'`,
      )
      .get(projectId) as { position: number }
  ).position;
  const cancel = db.prepare(
    `UPDATE tasks SET column_id = 'canceled', position = ?, cancellation_reason = ?, updated_at = ? WHERE id = ?`,
  );
  const recordReason = db.prepare(
    'UPDATE tasks SET cancellation_reason = ?, updated_at = ? WHERE id = ?',
  );
  for (const task of tasks) {
    if (task.column_id === 'canceled') {
      recordReason.run(reason, now(), task.id);
    } else {
      cancel.run(position++, reason, now(), task.id);
    }
  }
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
