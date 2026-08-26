import type Database from 'better-sqlite3';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import {
  existsSync,
  readFileSync,
  realpathSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import {
  getFeaturesDocument,
  parseFeaturesDocument,
  saveFeaturesFile,
} from './features';
import {
  confirmProjectFeatures,
  createProject,
  getProject,
  listTasks,
} from './repository';
import {
  TASK_COLUMNS,
  VERIFICATION_STATUSES,
  type CheckpointState,
  type Feature,
  type Project,
  type Task,
} from './types';
import { ValidationError } from './validation';

const execFileAsync = promisify(execFile);
const FORMAT = 'agent-kanban-project';
const VERSION = 1;
const MAX_EXPORT_BYTES = 10 * 1024 * 1024;
const MAX_RECORDS = 10_000;
const CHECKPOINT_STATES: CheckpointState[] = [
  'not_captured',
  'captured',
  'not_git',
  'error',
];

type ProjectRecord = {
  type: 'project';
  format: typeof FORMAT;
  version: typeof VERSION;
  name: string;
  repoRemote: string | null;
  defaultBranch: string | null;
};

type FeaturesRecord = {
  type: 'features_document';
  content: string | null;
};

type FeatureRecord = {
  type: 'feature';
  index: number;
  id: string | null;
  title: string;
  body: string;
  status: Feature['status'];
  cancellationReason: string | null;
};

type TaskRecord = Omit<Task, 'reference' | 'projectId'> & {
  type: 'task';
  reference: string;
};

type MigrationData = {
  project: ProjectRecord;
  featuresDocument: FeaturesRecord;
  features: FeatureRecord[];
  tasks: TaskRecord[];
};

export type FeaturesChoice = 'existing' | 'imported';

export type MigrationPreview = {
  project: Pick<ProjectRecord, 'name' | 'repoRemote' | 'defaultBranch'>;
  featureCount: number;
  taskCount: number;
  destinationPath: string;
  existingFeatures: boolean;
  importedFeatures: boolean;
  featuresConflict: boolean;
  canUseExistingFeatures: boolean;
  destinationFeaturesVersion: string;
  existingFeaturesContent: string | null;
  importedFeaturesContent: string | null;
};

function migrationError(message: string): never {
  throw new ValidationError({ migration: message });
}

function requiredString(value: unknown, label: string) {
  if (typeof value !== 'string' || value.trim() === '')
    migrationError(`${label} is missing or invalid.`);
  return value;
}

function nullableString(value: unknown, label: string) {
  if (value === null) return null;
  if (typeof value !== 'string') migrationError(`${label} must be text or null.`);
  return value;
}

function timestamp(value: unknown, label: string) {
  const result = requiredString(value, label);
  if (!Number.isFinite(Date.parse(result)))
    migrationError(`${label} must be a valid timestamp.`);
  return result;
}

function nullableTimestamp(value: unknown, label: string) {
  const result = nullableString(value, label);
  if (result !== null && !Number.isFinite(Date.parse(result)))
    migrationError(`${label} must be a valid timestamp or null.`);
  return result;
}

function resolveDestination(rawPath: unknown) {
  const input = requiredString(rawPath, 'Destination path');
  const expanded =
    input === '~'
      ? homedir()
      : input.startsWith('~/')
        ? path.join(homedir(), input.slice(2))
        : input;
  const resolved = path.resolve(expanded);
  if (existsSync(resolved)) {
    if (!statSync(resolved).isDirectory())
      migrationError('Destination path must be a directory.');
    return realpathSync(resolved);
  }
  return resolved;
}

function parseTask(record: Record<string, unknown>, line: number): TaskRecord {
  const prefix = `Task record on line ${line}`;
  const column = record.column;
  const verificationStatus = record.verificationStatus;
  const checkpointState = record.checkpointState;
  const createdBy = record.createdBy;
  if (!TASK_COLUMNS.includes(column as Task['column']))
    migrationError(`${prefix} has an invalid column.`);
  if (!VERIFICATION_STATUSES.includes(verificationStatus as Task['verificationStatus']))
    migrationError(`${prefix} has an invalid validation status.`);
  if (!CHECKPOINT_STATES.includes(checkpointState as CheckpointState))
    migrationError(`${prefix} has an invalid checkpoint state.`);
  if (createdBy !== 'human' && createdBy !== 'agent')
    migrationError(`${prefix} has an invalid creator.`);
  if (!Number.isInteger(record.number) || Number(record.number) < 1)
    migrationError(`${prefix} has an invalid task number.`);
  const reference = requiredString(record.reference, `${prefix} reference`);
  if (reference !== `KAN-${String(record.number).padStart(3, '0')}`)
    migrationError(`${prefix} reference does not match its task number.`);
  if (!Number.isInteger(record.position) || Number(record.position) < 0)
    migrationError(`${prefix} has an invalid position.`);
  const pullRequestUrl = nullableString(
    record.pullRequestUrl,
    `${prefix} pull-request URL`,
  );
  if (pullRequestUrl) {
    try {
      const url = new URL(pullRequestUrl);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
    } catch {
      migrationError(`${prefix} has an invalid pull-request URL.`);
    }
  }
  const gitDirty = record.gitDirty;
  if (gitDirty !== null && typeof gitDirty !== 'boolean')
    migrationError(`${prefix} has an invalid Git dirty state.`);

  const task: TaskRecord = {
    type: 'task',
    id: requiredString(record.id, `${prefix} ID`),
    number: Number(record.number),
    reference,
    featureId: nullableString(record.featureId, `${prefix} feature ID`),
    createdBy,
    cancellationReason: nullableString(
      record.cancellationReason,
      `${prefix} cancellation reason`,
    ),
    pullRequestUrl,
    title: requiredString(record.title, `${prefix} title`),
    column: column as Task['column'],
    position: Number(record.position),
    task: requiredString(record.task, `${prefix} contract`),
    progress:
      typeof record.progress === 'string'
        ? record.progress
        : migrationError(`${prefix} progress must be text.`),
    decisions: requiredString(record.decisions, `${prefix} decisions`),
    verificationStatus: verificationStatus as Task['verificationStatus'],
    verificationNotes: requiredString(
      record.verificationNotes,
      `${prefix} validation notes`,
    ),
    checkpointState: checkpointState as CheckpointState,
    gitBranch: nullableString(record.gitBranch, `${prefix} Git branch`),
    gitSha: nullableString(record.gitSha, `${prefix} Git SHA`),
    gitDirty,
    checkpointError: nullableString(
      record.checkpointError,
      `${prefix} checkpoint error`,
    ),
    checkpointCapturedAt: nullableTimestamp(
      record.checkpointCapturedAt,
      `${prefix} checkpoint timestamp`,
    ),
    createdAt: timestamp(record.createdAt, `${prefix} creation timestamp`),
    updatedAt: timestamp(record.updatedAt, `${prefix} update timestamp`),
  };
  if (
    (task.column === 'verification' || task.column === 'done') &&
    task.verificationStatus === 'not_run'
  ) {
    migrationError(`${prefix} is missing required validation evidence.`);
  }
  if (
    task.column === 'done' &&
    !['captured', 'not_git'].includes(task.checkpointState)
  ) {
    migrationError(`${prefix} is missing its required Git checkpoint.`);
  }
  if (task.column === 'canceled' && !task.cancellationReason?.trim())
    migrationError(`${prefix} is missing its cancellation reason.`);
  if (
    task.checkpointState === 'captured' &&
    (!task.gitBranch || !task.gitSha || task.gitDirty === null ||
      !task.checkpointCapturedAt)
  ) {
    migrationError(`${prefix} has an incomplete captured Git checkpoint.`);
  }
  return task;
}

export function parseMigrationJsonl(jsonl: unknown): MigrationData {
  if (typeof jsonl !== 'string' || jsonl.trim() === '')
    migrationError('Choose a non-empty Agent Kanban JSONL file.');
  if (Buffer.byteLength(jsonl, 'utf8') > MAX_EXPORT_BYTES)
    migrationError('Migration file must be 10 MB or smaller.');
  const lines = jsonl.split(/\r?\n/).filter((line) => line.trim() !== '');
  if (lines.length > MAX_RECORDS)
    migrationError('Migration file contains too many records.');

  let project: ProjectRecord | null = null;
  let featuresDocument: FeaturesRecord | null = null;
  const features: FeatureRecord[] = [];
  const tasks: TaskRecord[] = [];
  for (const [index, line] of lines.entries()) {
    let record: Record<string, unknown>;
    try {
      record = JSON.parse(line) as Record<string, unknown>;
    } catch {
      migrationError(`Line ${index + 1} is not valid JSON.`);
    }
    if (!record || typeof record !== 'object' || Array.isArray(record))
      migrationError(`Line ${index + 1} must contain a JSON object.`);
    if (record.type === 'project') {
      if (project) migrationError('Migration file has more than one project record.');
      if (record.format !== FORMAT || record.version !== VERSION)
        migrationError('Migration format or version is not supported.');
      project = {
        type: 'project',
        format: FORMAT,
        version: VERSION,
        name: requiredString(record.name, 'Project name'),
        repoRemote: nullableString(record.repoRemote, 'Repository remote'),
        defaultBranch: nullableString(record.defaultBranch, 'Default branch'),
      };
    } else if (record.type === 'features_document') {
      if (featuresDocument)
        migrationError('Migration file has more than one FEATURES.md record.');
      featuresDocument = {
        type: 'features_document',
        content: nullableString(record.content, 'FEATURES.md content'),
      };
    } else if (record.type === 'feature') {
      if (!Number.isInteger(record.index) || Number(record.index) < 0)
        migrationError(`Feature record on line ${index + 1} has an invalid index.`);
      if (record.status !== 'active' && record.status !== 'canceled')
        migrationError(`Feature record on line ${index + 1} has an invalid status.`);
      features.push({
        type: 'feature',
        index: Number(record.index),
        id: nullableString(record.id, 'Feature ID'),
        title: requiredString(record.title, 'Feature title'),
        body: typeof record.body === 'string' ? record.body : migrationError('Feature body must be text.'),
        status: record.status,
        cancellationReason: nullableString(
          record.cancellationReason,
          'Feature cancellation reason',
        ),
      });
    } else if (record.type === 'task') {
      tasks.push(parseTask(record, index + 1));
    } else {
      migrationError(`Line ${index + 1} has an unknown record type.`);
    }
  }
  if (!project) migrationError('Migration file is missing its project record.');
  if (!featuresDocument)
    migrationError('Migration file is missing its FEATURES.md record.');
  if (new Set(tasks.map((task) => task.id)).size !== tasks.length)
    migrationError('Migration file contains duplicate task IDs.');
  if (new Set(tasks.map((task) => task.number)).size !== tasks.length)
    migrationError('Migration file contains duplicate task numbers.');

  const parsedFeatures = featuresDocument.content
    ? parseFeaturesDocument(featuresDocument.content)
    : [];
  if (
    features.length !== parsedFeatures.length ||
    features.some((feature, index) => {
      const parsed = parsedFeatures[index];
      return (
        !parsed ||
        feature.index !== parsed.index ||
        feature.id !== parsed.id ||
        feature.title !== parsed.title ||
        feature.body !== parsed.body ||
        feature.status !== parsed.status ||
        feature.cancellationReason !==
          (parsed.metadata.cancellationReason ?? null)
      );
    })
  ) {
    migrationError('Feature records do not match the exported FEATURES.md.');
  }
  return { project, featuresDocument, features, tasks };
}

async function gitValue(repoPath: string, args: string[]) {
  try {
    const { stdout } = await execFileAsync('git', ['-C', repoPath, ...args], {
      encoding: 'utf8',
      timeout: 5000,
      maxBuffer: 1024 * 1024,
    });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

function portableRemote(remote: string | null) {
  if (
    !remote ||
    remote.startsWith('/') ||
    remote.startsWith('./') ||
    remote.startsWith('../') ||
    remote.startsWith('~') ||
    remote.startsWith('file:')
  ) {
    return null;
  }
  try {
    const url = new URL(remote);
    if (!['http:', 'https:', 'ssh:', 'git:', 'git+ssh:'].includes(url.protocol))
      return null;
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    const scp = remote.match(/^(?:[^@\s]+@)?([a-zA-Z0-9.-]+):(.+)$/);
    return scp ? `${scp[1]}:${scp[2]}` : null;
  }
}

export async function exportProjectJsonl(
  db: Database.Database,
  projectId: string,
) {
  const project = getProject(db, projectId);
  const document = getFeaturesDocument(db, project.id, project.repoPath);
  const [repoRemote, remoteHead, currentBranch] = await Promise.all([
    gitValue(project.repoPath, ['remote', 'get-url', 'origin']),
    gitValue(project.repoPath, [
      'symbolic-ref',
      '--short',
      'refs/remotes/origin/HEAD',
    ]),
    gitValue(project.repoPath, ['rev-parse', '--abbrev-ref', 'HEAD']),
  ]);
  const records: Array<ProjectRecord | FeaturesRecord | FeatureRecord | TaskRecord> = [
    {
      type: 'project',
      format: FORMAT,
      version: VERSION,
      name: project.name,
      repoRemote: portableRemote(repoRemote),
      defaultBranch:
        remoteHead?.replace(/^origin\//, '') ??
        (currentBranch === 'HEAD' ? null : currentBranch),
    },
    { type: 'features_document', content: document.markdown },
    ...document.features.map((feature) => ({
      type: 'feature' as const,
      index: feature.index,
      id: feature.id,
      title: feature.title,
      body: feature.body,
      status: feature.status,
      cancellationReason: feature.metadata.cancellationReason ?? null,
    })),
    ...listTasks(db, project.id).map((task) => {
      const { projectId, ...portableTask } = task;
      void projectId;
      return { ...portableTask, type: 'task' as const };
    }),
  ];
  const jsonl = `${records.map((record) => JSON.stringify(record)).join('\n')}\n`;
  if (Buffer.byteLength(jsonl, 'utf8') > MAX_EXPORT_BYTES)
    migrationError('This project is too large for the 10 MB migration format.');
  return jsonl;
}

function readExistingFeatures(destinationPath: string) {
  const filePath = path.join(destinationPath, 'FEATURES.md');
  if (!existsSync(filePath)) return null;
  if (statSync(filePath).size > MAX_EXPORT_BYTES)
    migrationError('The destination FEATURES.md must be 10 MB or smaller.');
  return readFileSync(filePath, 'utf8');
}

function featuresVersion(markdown: string | null) {
  return markdown === null
    ? 'missing'
    : createHash('sha256').update(markdown).digest('hex');
}

function featureIds(markdown: string | null) {
  return new Set(
    markdown
      ? parseFeaturesDocument(markdown).flatMap((feature) =>
          feature.id ? [feature.id] : [],
        )
      : [],
  );
}

export function previewProjectImport(rawInput: unknown): MigrationPreview {
  const input = (rawInput ?? {}) as Record<string, unknown>;
  const data = parseMigrationJsonl(input.jsonl);
  const destinationPath = resolveDestination(input.repoPath);
  const existing = readExistingFeatures(destinationPath);
  const imported = data.featuresDocument.content;
  const existingIds = featureIds(existing);
  return {
    project: {
      name: data.project.name,
      repoRemote: data.project.repoRemote,
      defaultBranch: data.project.defaultBranch,
    },
    featureCount: data.features.length,
    taskCount: data.tasks.length,
    destinationPath,
    existingFeatures: existing !== null,
    importedFeatures: imported !== null,
    featuresConflict:
      existing !== null && imported !== null && existing !== imported,
    canUseExistingFeatures: data.tasks.every(
      (task) => !task.featureId || existingIds.has(task.featureId),
    ),
    destinationFeaturesVersion: featuresVersion(existing),
    existingFeaturesContent: existing,
    importedFeaturesContent: imported,
  };
}

function insertImportedTask(
  db: Database.Database,
  projectId: string,
  task: TaskRecord,
) {
  const numberInUse = db
    .prepare('SELECT 1 FROM tasks WHERE number = ?')
    .get(task.number);
  const columns = [
    ...(numberInUse ? [] : ['number']),
    'id',
    'project_id',
    'feature_id',
    'created_by',
    'cancellation_reason',
    'pull_request_url',
    'title',
    'column_id',
    'position',
    'task',
    'progress',
    'decisions',
    'verification_status',
    'verification_notes',
    'checkpoint_state',
    'git_branch',
    'git_sha',
    'git_dirty',
    'checkpoint_error',
    'checkpoint_captured_at',
    'created_at',
    'updated_at',
  ];
  const values = columns.map((column) => `@${column}`).join(', ');
  db.prepare(
    `INSERT INTO tasks (${columns.join(', ')}) VALUES (${values})`,
  ).run({
    number: task.number,
    id: task.id,
    project_id: projectId,
    feature_id: task.featureId,
    created_by: task.createdBy,
    cancellation_reason: task.cancellationReason,
    pull_request_url: task.pullRequestUrl,
    title: task.title,
    column_id: task.column,
    position: task.position,
    task: task.task,
    progress: task.progress,
    decisions: task.decisions,
    verification_status: task.verificationStatus,
    verification_notes: task.verificationNotes,
    checkpoint_state: task.checkpointState,
    git_branch: task.gitBranch,
    git_sha: task.gitSha,
    git_dirty: task.gitDirty === null ? null : Number(task.gitDirty),
    checkpoint_error: task.checkpointError,
    checkpoint_captured_at: task.checkpointCapturedAt,
    created_at: task.createdAt,
    updated_at: task.updatedAt,
  });
}

export function importProjectJsonl(
  db: Database.Database,
  rawInput: unknown,
): Project {
  const input = (rawInput ?? {}) as Record<string, unknown>;
  const data = parseMigrationJsonl(input.jsonl);
  const destinationPath = resolveDestination(input.repoPath);
  const existing = readExistingFeatures(destinationPath);
  const expectedFeaturesVersion = requiredString(
    input.destinationFeaturesVersion,
    'Destination FEATURES.md version',
  );
  if (featuresVersion(existing) !== expectedFeaturesVersion)
    migrationError('Destination FEATURES.md changed after review. Review the migration again.');
  const imported = data.featuresDocument.content;
  const conflict = existing !== null && imported !== null && existing !== imported;
  const choice = input.featuresChoice as FeaturesChoice | undefined;
  if (conflict && choice !== 'existing' && choice !== 'imported')
    migrationError('Choose which FEATURES.md to use before importing.');
  const selectedMarkdown =
    choice === 'existing'
      ? existing ?? migrationError('No existing FEATURES.md is available.')
      : choice === 'imported'
        ? imported ?? migrationError('The migration has no FEATURES.md to restore.')
        : existing ?? imported;
  const selectedIds = featureIds(selectedMarkdown);
  const featureStatuses = new Map(
    (selectedMarkdown ? parseFeaturesDocument(selectedMarkdown) : []).flatMap(
      (feature) => (feature.id ? [[feature.id, feature.status] as const] : []),
    ),
  );
  if (
    data.tasks.some(
      (task) => task.featureId && !selectedIds.has(task.featureId),
    )
  ) {
    migrationError('The selected FEATURES.md is missing IDs used by imported tasks.');
  }
  if (
    data.tasks.some(
      (task) =>
        task.featureId &&
        featureStatuses.get(task.featureId) === 'canceled' &&
        task.column !== 'canceled',
    )
  ) {
    migrationError('Tasks linked to canceled features must also be canceled.');
  }
  if (
    data.tasks.some((task) =>
      db.prepare('SELECT 1 FROM tasks WHERE id = ?').get(task.id),
    )
  ) {
    migrationError('A task from this migration already exists locally.');
  }

  const filePath = path.join(destinationPath, 'FEATURES.md');
  let wroteFeatures = false;
  try {
    return db.transaction(() => {
      const project = createProject(db, {
        name: data.project.name,
        repoPath: destinationPath,
      });
      if (
        featuresVersion(readExistingFeatures(project.repoPath)) !==
        expectedFeaturesVersion
      ) {
        migrationError(
          'Destination FEATURES.md changed after review. Review the migration again.',
        );
      }
      if (selectedMarkdown !== null && selectedMarkdown !== existing) {
        saveFeaturesFile(project.repoPath, selectedMarkdown);
        wroteFeatures = true;
      }
      const confirmed =
        selectedMarkdown === null
          ? project
          : confirmProjectFeatures(db, project.id);
      for (const task of data.tasks) insertImportedTask(db, project.id, task);
      return confirmed;
    })();
  } catch (error) {
    if (wroteFeatures) {
      if (existing === null && existsSync(filePath)) unlinkSync(filePath);
      else if (existing !== null) writeFileSync(filePath, existing, 'utf8');
    }
    throw error;
  }
}

export function migrationFilename(project: Project) {
  const slug =
    project.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'project';
  return `${slug}.agent-kanban.jsonl`;
}
