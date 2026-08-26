import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { createDatabase } from '@/src/lib/db';
import { saveFeaturesFile } from '@/src/lib/features';
import {
  exportProjectJsonl,
  importProjectJsonl,
  parseMigrationJsonl,
  previewProjectImport,
} from '@/src/lib/migration';
import {
  completeTask,
  confirmProjectFeatures,
  createProject,
  createTask,
  listTasks,
  moveTask,
  setTaskCheckpoint,
} from '@/src/lib/repository';

const temporaryRoots: string[] = [];

function temporaryRoot() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'agent-kanban-migration-'));
  temporaryRoots.push(root);
  return root;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

describe('project JSONL migration', () => {
  it('exports and imports complete project continuity with FEATURES.md conflict handling', async () => {
    const root = temporaryRoot();
    const sourcePath = path.join(root, 'source');
    const destinationPath = path.join(root, 'destination');
    mkdirSync(sourcePath);
    mkdirSync(destinationPath);
    const source = createDatabase(':memory:');
    const project = createProject(source, {
      name: 'Portable project',
      repoPath: sourcePath,
    });
    const markdown =
      '# Requirements\n\n## [FEAT-001] Migration\n\nMove project context.\n';
    saveFeaturesFile(sourcePath, markdown);
    confirmProjectFeatures(source, project.id);
    let task = createTask(source, {
      projectId: project.id,
      featureId: 'FEAT-001',
      createdBy: 'agent',
      title: 'Export project',
      task: 'Scope: export the board. Acceptance: restore it elsewhere.',
      progress: 'Implementation and validation are complete.',
      decisions: 'Use JSONL.',
      verificationStatus: 'passed',
      verificationNotes: 'Migration round trip passed.',
      pullRequestUrl: 'https://github.com/example/project/pull/12',
    });
    task = moveTask(source, task.id, 'verification');
    task = setTaskCheckpoint(source, task.id, {
      state: 'captured',
      branch: 'codex/migration',
      sha: 'abc123',
      dirty: false,
    });
    completeTask(source, task.id);

    const jsonl = await exportProjectJsonl(source, project.id);
    const parsed = parseMigrationJsonl(jsonl);
    const rawRecords = jsonl.trim().split(/\r?\n/).map((line) => JSON.parse(line));
    expect(rawRecords[0]).not.toHaveProperty('repoPath');
    expect(rawRecords.find((record) => record.type === 'task')).not.toHaveProperty(
      'projectId',
    );
    expect(parsed.project.name).toBe('Portable project');
    expect(parsed.features).toHaveLength(1);
    expect(parsed.tasks).toEqual([
      expect.objectContaining({
        id: task.id,
        column: 'done',
        featureId: 'FEAT-001',
        gitSha: 'abc123',
        pullRequestUrl: 'https://github.com/example/project/pull/12',
      }),
    ]);
    const invalidTaskRecords = rawRecords.map((record) =>
      record.type === 'task'
        ? {
            ...record,
            column: 'done',
            verificationStatus: 'not_run',
            checkpointState: 'not_captured',
          }
        : record,
    );
    expect(() =>
      parseMigrationJsonl(
        `${invalidTaskRecords.map((record) => JSON.stringify(record)).join('\n')}\n`,
      ),
    ).toThrow('missing required validation evidence');

    writeFileSync(
      path.join(destinationPath, 'FEATURES.md'),
      '## [FEAT-999] Different requirements\n',
    );
    const firstPreview = previewProjectImport({
      jsonl,
      repoPath: destinationPath,
    });
    expect(firstPreview).toMatchObject({
      featureCount: 1,
      taskCount: 1,
      existingFeatures: true,
      featuresConflict: true,
      canUseExistingFeatures: false,
    });

    const target = createDatabase(':memory:');
    const existingProjectPath = path.join(root, 'existing-project');
    mkdirSync(existingProjectPath);
    const existingProject = createProject(target, {
      name: 'Existing project',
      repoPath: existingProjectPath,
    });
    createTask(target, {
      projectId: existingProject.id,
      title: 'Existing local task',
      task: 'Reserve the first local task number.',
      progress: '',
      decisions: 'Keep local task references unique.',
      verificationNotes: 'Not run yet.',
    });
    expect(() =>
      importProjectJsonl(target, {
        jsonl,
        repoPath: destinationPath,
        destinationFeaturesVersion: firstPreview.destinationFeaturesVersion,
      }),
    ).toThrow('Choose which FEATURES.md');
    writeFileSync(
      path.join(destinationPath, 'FEATURES.md'),
      '## [FEAT-999] Requirements changed after review\n',
    );
    expect(() =>
      importProjectJsonl(target, {
        jsonl,
        repoPath: destinationPath,
        featuresChoice: 'imported',
        destinationFeaturesVersion: firstPreview.destinationFeaturesVersion,
      }),
    ).toThrow('changed after review');
    expect(readFileSync(path.join(destinationPath, 'FEATURES.md'), 'utf8')).toContain(
      'changed after review',
    );
    const finalPreview = previewProjectImport({
      jsonl,
      repoPath: destinationPath,
    });
    const importedProject = importProjectJsonl(target, {
      jsonl,
      repoPath: realpathSync(destinationPath),
      featuresChoice: 'imported',
      destinationFeaturesVersion: finalPreview.destinationFeaturesVersion,
    });
    expect(importedProject).toMatchObject({
      name: 'Portable project',
      repoPath: realpathSync(destinationPath),
      featuresConfirmedAt: expect.any(String),
    });
    expect(readFileSync(path.join(destinationPath, 'FEATURES.md'), 'utf8')).toBe(
      markdown,
    );
    expect(listTasks(target, importedProject.id)).toEqual([
      expect.objectContaining({
        id: task.id,
        reference: 'KAN-002',
        column: 'done',
        checkpointState: 'captured',
        pullRequestUrl: 'https://github.com/example/project/pull/12',
      }),
    ]);

    const canceledDestination = path.join(root, 'canceled-destination');
    const canceledMarkdown =
      '## [FEAT-001] Migration\n<!-- agent-kanban:feature {"status":"canceled","cancellationReason":"Removed"} -->\n\nMove project context.\n';
    const canceledRecords = rawRecords.map((record) => {
      if (record.type === 'features_document')
        return { ...record, content: canceledMarkdown };
      if (record.type === 'feature')
        return { ...record, status: 'canceled', cancellationReason: 'Removed' };
      return record;
    });
    const canceledJsonl = `${canceledRecords
      .map((record) => JSON.stringify(record))
      .join('\n')}\n`;
    const canceledPreview = previewProjectImport({
      jsonl: canceledJsonl,
      repoPath: canceledDestination,
    });
    expect(() =>
      importProjectJsonl(target, {
        jsonl: canceledJsonl,
        repoPath: canceledDestination,
        featuresChoice: 'imported',
        destinationFeaturesVersion:
          canceledPreview.destinationFeaturesVersion,
      }),
    ).toThrow('Tasks linked to canceled features must also be canceled');
    source.close();
    target.close();
  });

  it('removes credentials from Git remotes and refuses oversized exports', async () => {
    const root = temporaryRoot();
    const repoPath = path.join(root, 'credentialed-repo');
    mkdirSync(repoPath);
    execFileSync('git', ['init'], { cwd: repoPath, stdio: 'ignore' });
    execFileSync(
      'git',
      ['remote', 'add', 'origin', 'TOKEN@github.com:owner/repo.git'],
      { cwd: repoPath },
    );
    const db = createDatabase(':memory:');
    const project = createProject(db, { name: 'Safe export', repoPath });
    const safeJsonl = await exportProjectJsonl(db, project.id);
    expect(safeJsonl).not.toContain('TOKEN@');
    expect(parseMigrationJsonl(safeJsonl).project.repoRemote).toBe(
      'github.com:owner/repo.git',
    );

    execFileSync('git', ['remote', 'set-url', 'origin', 'user:password@host/path'], {
      cwd: repoPath,
    });
    const unsupportedRemoteJsonl = await exportProjectJsonl(db, project.id);
    expect(parseMigrationJsonl(unsupportedRemoteJsonl).project.repoRemote).toBeNull();
    expect(unsupportedRemoteJsonl).not.toContain('password');

    createTask(db, {
      projectId: project.id,
      title: 'Oversized continuity',
      task: 'x'.repeat(10 * 1024 * 1024),
      progress: '',
      decisions: 'Reject an export that cannot be imported.',
      verificationNotes: 'Not run yet.',
    });
    await expect(exportProjectJsonl(db, project.id)).rejects.toThrow(
      'too large for the 10 MB migration format',
    );
    db.close();
  });

  it('rejects malformed or unsupported migration files', () => {
    expect(() => parseMigrationJsonl('{not json}\n')).toThrow(
      'Line 1 is not valid JSON',
    );
    expect(() =>
      parseMigrationJsonl(
        `${JSON.stringify({ type: 'project', format: 'agent-kanban-project', version: 2, name: 'Future', repoRemote: null, defaultBranch: null })}\n`,
      ),
    ).toThrow('format or version is not supported');
  });
});
