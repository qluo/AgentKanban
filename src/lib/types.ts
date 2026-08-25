export const TASK_COLUMNS = [
  'backlog',
  'ready',
  'in-progress',
  'verification',
  'done',
] as const;

export type TaskColumn = (typeof TASK_COLUMNS)[number];

export const VERIFICATION_STATUSES = [
  'not_run',
  'passed',
  'failed',
  'partial',
] as const;

export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export type CheckpointState =
  | 'not_captured'
  | 'captured'
  | 'not_git'
  | 'error';

export interface Project {
  id: string;
  name: string;
  repoPath: string;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  number: number;
  reference: string;
  projectId: string;
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
  title: string;
  column?: TaskColumn;
  task: string;
  progress: string;
  decisions: string;
  verificationStatus?: VerificationStatus;
  verificationNotes: string;
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
>;
