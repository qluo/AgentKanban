import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createDatabase } from '@/src/lib/db';
import { captureTaskCheckpoint } from '@/src/lib/git';
import { createProject, createTask } from '@/src/lib/repository';

const temporaryRoots: string[] = [];

function temporaryRoot() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'agent-kanban-git-'));
  temporaryRoots.push(root);
  return root;
}

function runGit(repoPath: string, args: string[]) {
  execFileSync('git', ['-C', repoPath, ...args], { stdio: 'ignore' });
}

function createTestTask(repoPath: string) {
  const db = createDatabase(':memory:');
  const project = createProject(db, { name: path.basename(repoPath), repoPath });
  const task = createTask(db, {
    projectId: project.id,
    title: 'Capture Git',
    task: 'Read repository state without changing it.',
    progress: 'Capture the checkpoint.',
    decisions: 'Use fixed git arguments.',
    verificationNotes: 'Not run yet: capture is pending.',
  });
  return { db, task };
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('Git checkpoints', () => {
  it('captures clean and dirty repository state without creating a commit', async () => {
    const repoPath = temporaryRoot();
    runGit(repoPath, ['init', '-b', 'main']);
    runGit(repoPath, ['config', 'user.name', 'Agent Kanban Test']);
    runGit(repoPath, ['config', 'user.email', 'test@example.invalid']);
    writeFileSync(path.join(repoPath, 'file.txt'), 'initial\n');
    runGit(repoPath, ['add', 'file.txt']);
    runGit(repoPath, ['commit', '-m', 'initial']);
    const commitBefore = execFileSync('git', ['-C', repoPath, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim();
    const { db, task } = createTestTask(repoPath);

    const clean = await captureTaskCheckpoint(db, task.id);
    expect(clean).toMatchObject({
      checkpointState: 'captured',
      gitBranch: 'main',
      gitDirty: false,
      gitSha: commitBefore,
    });

    writeFileSync(path.join(repoPath, 'file.txt'), 'changed\n');
    const dirty = await captureTaskCheckpoint(db, task.id);
    expect(dirty.gitDirty).toBe(true);
    expect(dirty.gitSha).toBe(commitBefore);
    expect(
      execFileSync('git', ['-C', repoPath, 'rev-parse', 'HEAD'], {
        encoding: 'utf8',
      }).trim(),
    ).toBe(commitBefore);
    db.close();
  });

  it('records an explicit non-Git state', async () => {
    const repoPath = temporaryRoot();
    mkdirSync(path.join(repoPath, 'folder'));
    const { db, task } = createTestTask(repoPath);
    const checkpoint = await captureTaskCheckpoint(db, task.id);
    expect(checkpoint.checkpointState).toBe('not_git');
    db.close();
  });
});
