import {
  mkdtempSync,
  mkdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createDatabase } from '@/src/lib/db';
import {
  cancelPersonalTicket,
  completePersonalTicket,
  confirmProjectFeatures,
  createPersonalTicket,
  createProject,
  createTask,
  completeTask,
  getPersonalTicket,
  listPersonalTickets,
  listProjects,
  listTasks,
  movePersonalTicket,
  restorePersonalTicket,
  moveTask,
  setTaskCheckpoint,
  updatePersonalTicket,
  updateTask,
} from '@/src/lib/repository';

const temporaryRoots: string[] = [];

function temporaryRoot() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'agent-kanban-test-'));
  temporaryRoots.push(root);
  return root;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('repository', () => {
  it('keeps personal tickets independent and persists their lifecycle', () => {
    const root = temporaryRoot();
    const dbPath = path.join(root, 'kanban.sqlite');
    const first = createDatabase(dbPath);
    const workTicket = createPersonalTicket(first, { title: 'Default ticket' });
    const personalTicket = createPersonalTicket(first, {
      title: 'Plan trip',
      notes: 'Book the train.',
      horizon: 'this_week',
      category: 'personal',
    });

    expect(workTicket).toMatchObject({
      horizon: 'today',
      category: 'work',
      status: 'active',
      notes: '',
      completedAt: null,
      canceledAt: null,
    });
    expect(
      updatePersonalTicket(first, personalTicket.id, {
        title: 'Plan autumn trip',
        notes: 'Book the sleeper train.',
        category: 'work',
      }),
    ).toMatchObject({
      title: 'Plan autumn trip',
      notes: 'Book the sleeper train.',
      horizon: 'this_week',
      category: 'work',
    });
    expect(movePersonalTicket(first, personalTicket.id, 'this_month').horizon).toBe(
      'this_month',
    );
    expect(completePersonalTicket(first, personalTicket.id)).toMatchObject({
      status: 'completed',
      horizon: 'this_month',
      completedAt: expect.any(String),
      canceledAt: null,
    });
    expect(() => movePersonalTicket(first, personalTicket.id, 'today')).toThrow(
      'Only active tickets',
    );
    expect(() =>
      updatePersonalTicket(first, personalTicket.id, { title: 'Move me back' }),
    ).toThrow('Only active tickets');
    expect(restorePersonalTicket(first, personalTicket.id)).toMatchObject({
      status: 'active',
      horizon: 'this_month',
      completedAt: null,
      canceledAt: null,
    });
    expect(cancelPersonalTicket(first, personalTicket.id)).toMatchObject({
      status: 'canceled',
      horizon: 'this_month',
      completedAt: null,
      canceledAt: expect.any(String),
    });
    first.close();

    const second = createDatabase(dbPath);
    expect(listPersonalTickets(second)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: workTicket.id, status: 'active' }),
        expect.objectContaining({
          id: personalTicket.id,
          status: 'canceled',
          horizon: 'this_month',
        }),
      ]),
    );
    expect(getPersonalTicket(second, personalTicket.id).canceledAt).toEqual(
      expect.any(String),
    );
    second.close();
  });

  it('imports local directories, creating a missing directory with unconfirmed requirements', () => {
    const root = temporaryRoot();
    const repoPath = path.join(root, 'new-project');
    const db = createDatabase(':memory:');

    const project = createProject(db, { name: 'New project', repoPath });

    expect(project).toMatchObject({
      name: 'New project',
      repoPath: realpathSync(repoPath),
      featuresConfirmedAt: null,
    });
    expect(() => mkdirSync(repoPath)).toThrow();
    expect(() => createProject(db, { name: 'Duplicate', repoPath })).toThrow(
      'already registered',
    );

    const filePath = path.join(root, 'not-a-directory');
    writeFileSync(filePath, 'not a directory');
    expect(() =>
      createProject(db, { name: 'File path', repoPath: filePath }),
    ).toThrow('Repository path must be a local directory');
    db.close();
  });

  it('persists multiple projects and tasks across a database restart', () => {
    const root = temporaryRoot();
    const dbPath = path.join(root, 'kanban.sqlite');
    const repoA = path.join(root, 'repo-a');
    const repoB = path.join(root, 'repo-b');
    mkdirSync(repoA);
    mkdirSync(repoB);

    const first = createDatabase(dbPath);
    const projectA = createProject(first, { name: 'Alpha', repoPath: repoA });
    createProject(first, { name: 'Beta', repoPath: repoB });
    createTask(first, {
      projectId: projectA.id,
      title: 'Persist me',
      task: 'Remain after the database reopens.',
      progress: 'Restart the connection next.',
      decisions: 'Use SQLite.',
      verificationNotes: 'Not run yet: restart is pending.',
      pullRequestUrl: 'https://github.com/example/alpha/pull/7',
    });
    first.close();

    const second = createDatabase(dbPath);
    expect(listProjects(second).map((project) => project.name)).toEqual([
      'Alpha',
      'Beta',
    ]);
    expect(listTasks(second, projectA.id)).toEqual([
      expect.objectContaining({
        pullRequestUrl: 'https://github.com/example/alpha/pull/7',
      }),
    ]);
    second.close();
  });

  it('enforces transition rules through the repository', () => {
    const root = temporaryRoot();
    const repoPath = path.join(root, 'repo');
    mkdirSync(repoPath);
    const db = createDatabase(':memory:');
    const project = createProject(db, { name: 'Project', repoPath });
    let task = createTask(db, {
      projectId: project.id,
      title: 'Verify transitions',
      task: 'Reject incomplete moves.',
      progress: 'Record validation next.',
      decisions: 'Use server validation.',
      verificationNotes: 'Not run yet: implementation is incomplete.',
    });

    expect(() => moveTask(db, task.id, 'verification')).toThrow();
    task = updateTask(db, task.id, {
      verificationStatus: 'passed',
      verificationNotes: 'Unit checks passed.',
    });
    expect(moveTask(db, task.id, 'verification').column).toBe('verification');
    expect(() => moveTask(db, task.id, 'done')).toThrow();
    setTaskCheckpoint(db, task.id, { state: 'not_git' });
    expect(completeTask(db, task.id).column).toBe('done');
    expect(moveTask(db, task.id, 'verification').column).toBe('verification');
    db.close();
  });

  it('uses persisted task ownership when clearing progress', () => {
    const root = temporaryRoot();
    const repoPath = path.join(root, 'repo');
    mkdirSync(repoPath);
    const db = createDatabase(':memory:');
    const project = createProject(db, { name: 'Ownership', repoPath });
    const humanTask = createTask(db, {
      projectId: project.id,
      title: 'Human task',
      task: 'Allow progress to be cleared.',
      progress: 'A temporary next action.',
      decisions: 'Human-owned.',
      verificationNotes: 'Not run yet.',
    });
    expect(() =>
      createTask(db, {
        projectId: project.id,
        createdBy: 'agent',
        title: 'Agent task',
        task: 'Keep a concrete next action.',
        progress: 'Run the next check.',
        decisions: 'Agent-owned.',
        verificationNotes: 'Not run yet.',
      }),
    ).toThrow('Confirm FEATURES.md');

    writeFileSync(path.join(repoPath, 'FEATURES.md'), '## Ownership\n');
    const confirmed = confirmProjectFeatures(db, project.id);
    const agentTask = createTask(db, {
      projectId: confirmed.id,
      createdBy: 'agent',
      title: 'Agent task',
      task: 'Keep a concrete next action.',
      progress: 'Run the next check.',
      decisions: 'Agent-owned.',
      verificationNotes: 'Not run yet.',
    });

    expect(updateTask(db, humanTask.id, { progress: ' \n ' }).progress).toBe(
      '',
    );
    expect(() => updateTask(db, agentTask.id, { progress: '' })).toThrow(
      'progress is required',
    );
    expect(
      listTasks(db, project.id).find((task) => task.id === agentTask.id)
        ?.progress,
    ).toBe('Run the next check.');
    db.close();
  });
});
