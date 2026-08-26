export const TASK_COLUMNS = [
  'backlog',
  'ready',
  'in-progress',
  'verification',
  'done',
  'canceled',
] as const;

export type TaskColumn = (typeof TASK_COLUMNS)[number];

export const VERIFICATION_STATUSES = [
  'not_run',
  'passed',
  'failed',
  'partial',
] as const;

export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export type CheckpointState = 'not_captured' | 'captured' | 'not_git' | 'error';

export interface Project {
  id: string;
  name: string;
  repoPath: string;
  featuresConfirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  number: number;
  reference: string;
  projectId: string;
  featureId: string | null;
  createdBy: 'human' | 'agent';
  cancellationReason: string | null;
  pullRequestUrl: string | null;
  title: string;
  column: TaskColumn;
  position: number;
  task: string;
  progress: string;
  decisions: string;
  verificationStatus: VerificationStatus;
  verificationNotes: string;
  checkpointState: CheckpointState;
  gitBranch: string | null;
  gitSha: string | null;
  gitDirty: boolean | null;
  checkpointError: string | null;
  checkpointCapturedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectInput {
  name: string;
  repoPath: string;
}

export interface CreateTaskInput {
  projectId: string;
  featureId?: string;
  createdBy?: 'human' | 'agent';
  title: string;
  column?: TaskColumn;
  task: string;
  progress?: string;
  decisions: string;
  verificationStatus?: VerificationStatus;
  verificationNotes: string;
  pullRequestUrl?: string;
}

export type UpdateTaskInput = Partial<
  Pick<
    CreateTaskInput,
    | 'title'
    | 'task'
    | 'progress'
    | 'decisions'
    | 'verificationStatus'
    | 'verificationNotes'
  >
> & { pullRequestUrl?: string | null };

export interface TaskSummary {
  id: string;
  reference: string;
  title: string;
  column: TaskColumn;
  featureId: string | null;
}

export interface FeatureMetadata {
  status?: 'active' | 'canceled';
  cancellationReason?: string;
  canceledAt?: string;
}

export interface Feature {
  index: number;
  id: string | null;
  title: string;
  body: string;
  metadata: FeatureMetadata;
  status: 'active' | 'canceled';
  tasks: TaskSummary[];
}
