import { describe, expect, it } from 'vitest';
import type { Task } from '@/src/lib/types';
import {
  ValidationError,
  validateCreateTaskInput,
  validateProjectInput,
  validateUpdateTaskInput,
  validateTransition,
} from '@/src/lib/validation';

const baseTask: Task = {
  id: 'task-1',
  number: 1,
  reference: 'KAN-001',
  projectId: 'project-1',
  featureId: null,
  createdBy: 'human',
  cancellationReason: null,
  title: 'Test task',
  column: 'backlog',
  position: 0,
  task: 'Deliver the requested behavior.',
  progress: 'Run the first check.',
  decisions: 'No decisions yet.',
  verificationStatus: 'not_run',
  verificationNotes: 'Not run yet: implementation is incomplete.',
  checkpointState: 'not_captured',
  gitBranch: null,
  gitSha: null,
  gitDirty: null,
  checkpointError: null,
  checkpointCapturedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('task validation', () => {
  it('requires a human project name and local directory path', () => {
    expect(() => validateProjectInput({ name: 'Imported project' })).toThrow(
      'repoPath is required',
    );
    expect(
      validateProjectInput({
        name: ' Imported project ',
        repoPath: ' ~/work/app ',
      }),
    ).toEqual({
      name: 'Imported project',
      repoPath: '~/work/app',
    });
  });

  it('requires every written continuity field', () => {
    expect(() =>
      validateCreateTaskInput({
        projectId: 'project-1',
        title: '',
        task: ' ',
        progress: '',
        decisions: '',
        verificationNotes: '',
      }),
    ).toThrow(ValidationError);
  });

  it('accepts explicit placeholder continuity states', () => {
    expect(
      validateCreateTaskInput({
        projectId: 'project-1',
        title: 'Implement storage',
        task: 'Persist tasks after restart.',
        progress: 'Create the schema next.',
        decisions: 'No decisions yet.',
        verificationNotes: 'Not run yet: implementation is incomplete.',
      }),
    ).toMatchObject({ verificationStatus: 'not_run', column: 'backlog' });
  });

  it('normalizes omitted, empty, and whitespace human progress to empty text', () => {
    expect(
      validateCreateTaskInput({
        projectId: 'project-1',
        title: 'Human scratch task',
        task: 'Capture an idea.',
        decisions: 'No decisions yet.',
        verificationNotes: 'Not run yet.',
      }),
    ).toMatchObject({ createdBy: 'human', progress: '' });

    for (const progress of ['', '   \n\t']) {
      expect(
        validateCreateTaskInput({
          projectId: 'project-1',
          title: 'Human scratch task',
          task: 'Capture an idea.',
          progress,
          decisions: 'No decisions yet.',
          verificationNotes: 'Not run yet.',
        }),
      ).toMatchObject({ createdBy: 'human', progress: '' });
    }
  });

  it('requires non-empty progress for an agent-created task', () => {
    expect(() =>
      validateCreateTaskInput({
        projectId: 'project-1',
        createdBy: 'agent',
        title: 'Agent task',
        task: 'Implement the requirement.',
        decisions: 'No decisions yet.',
        verificationNotes: 'Not run yet.',
      }),
    ).toThrow('progress is required');
  });

  it('allows only human-created tasks to clear progress on update', () => {
    expect(validateUpdateTaskInput({ progress: '   ' }, 'human')).toEqual({
      progress: '',
    });
    expect(() => validateUpdateTaskInput({ progress: '' }, 'agent')).toThrow(
      'progress is required',
    );
  });

  it('blocks Verification until a result is recorded', () => {
    expect(() => validateTransition(baseTask, 'verification')).toThrow(
      'Record a verification result',
    );
  });

  it('blocks Done until verification and a checkpoint are recorded', () => {
    expect(() =>
      validateTransition({ ...baseTask, verificationStatus: 'passed' }, 'done'),
    ).toThrow('Capture a Git checkpoint');
  });

  it('allows Done with a result and explicit non-Git checkpoint', () => {
    expect(() =>
      validateTransition(
        {
          ...baseTask,
          verificationStatus: 'partial',
          checkpointState: 'not_git',
        },
        'done',
      ),
    ).not.toThrow();
  });
});
