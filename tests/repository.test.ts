import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createDatabase } from '@/src/lib/db';
import {
  createProject,
  createTask,
  listProjects,
  listTasks,
  moveTask,
  setTaskCheckpoint,
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
    });
    first.close();

    const second = createDatabase(dbPath);
    expect(listProjects(second).map((project) => project.name)).toEqual([
      'Alpha',
      'Beta',
    ]);
    expect(listTasks(second, projectA.id)).toHaveLength(1);
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
      progress: 'Record verification next.',
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
    expect(moveTask(db, task.id, 'done').column).toBe('done');
    db.close();
  });
});
