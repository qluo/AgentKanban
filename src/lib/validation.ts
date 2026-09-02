import {
  PERSONAL_TICKET_CATEGORIES,
  PERSONAL_TICKET_HORIZONS,
  TASK_COLUMNS,
  VERIFICATION_STATUSES,
  type CreatePersonalTicketInput,
  type CreateProjectInput,
  type CreateTaskInput,
  type PersonalTicketCategory,
  type PersonalTicketHorizon,
  type Task,
  type TaskColumn,
  type UpdatePersonalTicketInput,
  type UpdateTaskInput,
  type VerificationStatus,
} from './types';

export class ValidationError extends Error {
  readonly issues: Record<string, string>;

  constructor(issues: Record<string, string>) {
    super(Object.values(issues)[0] ?? 'Validation failed');
    this.name = 'ValidationError';
    this.issues = issues;
  }
}

function requiredText(
  value: unknown,
  label: string,
  issues: Record<string, string>,
) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    issues[label] = `${label} is required.`;
    return '';
  }
  return value.trim();
}

function humanOptionalText(
  value: unknown,
  label: string,
  issues: Record<string, string>,
) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') {
    issues[label] = `${label} must be text.`;
    return '';
  }
  return value.trim();
}

function optionalHttpUrl(
  value: unknown,
  label: string,
  issues: Record<string, string>,
) {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') {
    issues[label] = `${label} must be a URL.`;
    return undefined;
  }
  const normalized = value.trim();
  try {
    const url = new URL(normalized);
    if (url.protocol !== 'http:' && url.protocol !== 'https:')
      throw new Error();
    return normalized;
  } catch {
    issues[label] = `${label} must be an http or https URL.`;
    return undefined;
  }
}

export function validateProjectInput(input: unknown): CreateProjectInput {
  const value = (input ?? {}) as Record<string, unknown>;
  const issues: Record<string, string> = {};
  const name = requiredText(value.name, 'name', issues);
  const repoPath = requiredText(value.repoPath, 'repoPath', issues);
  if (Object.keys(issues).length > 0) throw new ValidationError(issues);
  return { name, repoPath };
}

export function validateCreatePersonalTicketInput(
  input: unknown,
): CreatePersonalTicketInput {
  const value = (input ?? {}) as Record<string, unknown>;
  const issues: Record<string, string> = {};
  const title = requiredText(value.title, 'title', issues);
  const notes = humanOptionalText(value.notes, 'notes', issues);
  const horizon = (value.horizon ?? 'today') as PersonalTicketHorizon;
  const category = (value.category ?? 'work') as PersonalTicketCategory;

  if (!PERSONAL_TICKET_HORIZONS.includes(horizon)) {
    issues.horizon = 'Horizon is invalid.';
  }
  if (!PERSONAL_TICKET_CATEGORIES.includes(category)) {
    issues.category = 'Category is invalid.';
  }
  if (Object.keys(issues).length > 0) throw new ValidationError(issues);
  return { title, notes, horizon, category };
}

export function validateUpdatePersonalTicketInput(
  input: unknown,
): UpdatePersonalTicketInput {
  const value = (input ?? {}) as Record<string, unknown>;
  const result: UpdatePersonalTicketInput = {};
  const issues: Record<string, string> = {};

  if ('title' in value) result.title = requiredText(value.title, 'title', issues);
  if ('notes' in value) result.notes = humanOptionalText(value.notes, 'notes', issues);
  if ('horizon' in value) {
    const horizon = value.horizon as PersonalTicketHorizon;
    if (!PERSONAL_TICKET_HORIZONS.includes(horizon)) {
      issues.horizon = 'Horizon is invalid.';
    } else {
      result.horizon = horizon;
    }
  }
  if ('category' in value) {
    const category = value.category as PersonalTicketCategory;
    if (!PERSONAL_TICKET_CATEGORIES.includes(category)) {
      issues.category = 'Category is invalid.';
    } else {
      result.category = category;
    }
  }

  if (Object.keys(result).length === 0 && Object.keys(issues).length === 0) {
    issues.ticket = 'At least one editable field is required.';
  }
  if (Object.keys(issues).length > 0) throw new ValidationError(issues);
  return result;
}

export function validateCreateTaskInput(input: unknown): CreateTaskInput {
  const value = (input ?? {}) as Record<string, unknown>;
  const issues: Record<string, string> = {};
  const projectId = requiredText(value.projectId, 'projectId', issues);
  const title = requiredText(value.title, 'title', issues);
  const task = requiredText(value.task, 'task', issues);
  const createdBy = (value.createdBy ??
    'human') as CreateTaskInput['createdBy'];
  if (createdBy !== 'human' && createdBy !== 'agent') {
    issues.createdBy = 'createdBy must be human or agent.';
  }
  const progress =
    createdBy === 'human'
      ? humanOptionalText(value.progress, 'progress', issues)
      : requiredText(value.progress, 'progress', issues);
  const decisions = requiredText(value.decisions, 'decisions', issues);
  const verificationNotes = requiredText(
    value.verificationNotes,
    'verificationNotes',
    issues,
  );
  const column = (value.column ?? 'backlog') as TaskColumn;
  const verificationStatus = (value.verificationStatus ??
    'not_run') as VerificationStatus;
  const featureId =
    value.featureId === undefined ||
    value.featureId === null ||
    value.featureId === ''
      ? undefined
      : requiredText(value.featureId, 'featureId', issues);
  const pullRequestUrl = optionalHttpUrl(
    value.pullRequestUrl,
    'pullRequestUrl',
    issues,
  );

  if (!TASK_COLUMNS.includes(column)) issues.column = 'Column is invalid.';
  if (column === 'done' || column === 'canceled') {
    issues.column = 'Tasks cannot be created directly in Done or Canceled.';
  }
  if (!VERIFICATION_STATUSES.includes(verificationStatus)) {
    issues.verificationStatus = 'Validation status is invalid.';
  }
  if (Object.keys(issues).length > 0) throw new ValidationError(issues);

  return {
    projectId,
    featureId,
    createdBy,
    title,
    column,
    task,
    progress,
    decisions,
    verificationStatus,
    verificationNotes,
    pullRequestUrl,
  };
}

export function validateUpdateTaskInput(
  input: unknown,
  createdBy: Task['createdBy'],
): UpdateTaskInput {
  const value = (input ?? {}) as Record<string, unknown>;
  const allowed = [
    'title',
    'task',
    'progress',
    'decisions',
    'verificationStatus',
    'verificationNotes',
    'pullRequestUrl',
  ] as const;
  const result: UpdateTaskInput = {};
  const issues: Record<string, string> = {};

  for (const field of allowed) {
    if (!(field in value)) continue;
    if (field === 'pullRequestUrl') {
      result[field] =
        value[field] === null || value[field] === ''
          ? null
          : optionalHttpUrl(value[field], field, issues);
    } else if (field === 'verificationStatus') {
      const status = value[field] as VerificationStatus;
      if (!VERIFICATION_STATUSES.includes(status)) {
        issues[field] = 'Validation status is invalid.';
      } else {
        result[field] = status;
      }
    } else if (field === 'progress' && createdBy === 'human') {
      result[field] = humanOptionalText(value[field], field, issues);
    } else {
      result[field] = requiredText(value[field], field, issues);
    }
  }

  if (Object.keys(result).length === 0 && Object.keys(issues).length === 0) {
    issues.task = 'At least one editable field is required.';
  }
  if (Object.keys(issues).length > 0) throw new ValidationError(issues);
  return result;
}

export function validateTransition(task: Task, destination: TaskColumn) {
  const issues: Record<string, string> = {};
  if (!TASK_COLUMNS.includes(destination)) issues.column = 'Column is invalid.';

  if (
    (destination === 'verification' || destination === 'done') &&
    task.verificationStatus === 'not_run'
  ) {
    issues.verificationStatus =
      'Record a validation result before moving this task to Validation or Done.';
  }

  if (
    destination === 'done' &&
    !['captured', 'not_git'].includes(task.checkpointState)
  ) {
    issues.checkpoint =
      'Capture a Git checkpoint before moving this task to Done.';
  }

  if (Object.keys(issues).length > 0) throw new ValidationError(issues);
}
