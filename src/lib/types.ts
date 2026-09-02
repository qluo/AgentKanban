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

export const PERSONAL_TICKET_HORIZONS = [
  'today',
  'this_week',
  'this_month',
] as const;

export type PersonalTicketHorizon = (typeof PERSONAL_TICKET_HORIZONS)[number];

export const PERSONAL_TICKET_CATEGORIES = ['work', 'personal'] as const;

export type PersonalTicketCategory = (typeof PERSONAL_TICKET_CATEGORIES)[number];

export const PERSONAL_TICKET_STATUSES = [
  'active',
  'completed',
  'canceled',
] as const;

export type PersonalTicketStatus = (typeof PERSONAL_TICKET_STATUSES)[number];

export interface PersonalTicket {
  id: string;
  title: string;
  notes: string;
  horizon: PersonalTicketHorizon;
  category: PersonalTicketCategory;
  status: PersonalTicketStatus;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  canceledAt: string | null;
}

export interface CreatePersonalTicketInput {
  title: string;
  notes?: string;
  horizon?: PersonalTicketHorizon;
  category?: PersonalTicketCategory;
}

export type UpdatePersonalTicketInput = Partial<
  Pick<CreatePersonalTicketInput, 'title' | 'notes' | 'horizon' | 'category'>
>;
