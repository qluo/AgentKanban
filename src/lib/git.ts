import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type Database from 'better-sqlite3';
import { getProject, getTask, setTaskCheckpoint } from './repository';

const execFileAsync = promisify(execFile);

async function git(repoPath: string, args: string[]) {
  const { stdout } = await execFileAsync('git', ['-C', repoPath, ...args], {
    encoding: 'utf8',
    timeout: 5000,
    maxBuffer: 1024 * 1024,
  });
  return stdout.trim();
}

export async function captureTaskCheckpoint(
  db: Database.Database,
  taskId: string,
) {
  const task = getTask(db, taskId);
  const project = getProject(db, task.projectId);

  try {
    const insideWorkTree = await git(project.repoPath, [
      'rev-parse',
      '--is-inside-work-tree',
    ]);
    if (insideWorkTree !== 'true') {
      return setTaskCheckpoint(db, taskId, { state: 'not_git' });
    }
  } catch {
    return setTaskCheckpoint(db, taskId, { state: 'not_git' });
  }

  try {
    const [branch, sha, status] = await Promise.all([
      git(project.repoPath, ['rev-parse', '--abbrev-ref', 'HEAD']),
      git(project.repoPath, ['rev-parse', 'HEAD']),
      git(project.repoPath, ['status', '--porcelain']),
    ]);
    return setTaskCheckpoint(db, taskId, {
      state: 'captured',
      branch,
      sha,
      dirty: status.length > 0,
    });
  } catch (error) {
    return setTaskCheckpoint(db, taskId, {
      state: 'error',
      error: error instanceof Error ? error.message : 'Git inspection failed.',
    });
  }
}
