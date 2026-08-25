import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createDatabase } from '@/src/lib/db';
import {
  assignApprovedFeatureId,
  cancelFeature,
  getFeaturesDocument,
  saveFeaturesFile,
} from '@/src/lib/features';
import { createProject, createTask, listTasks } from '@/src/lib/repository';

const temporaryRoots: string[] = [];

function setup() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'agent-kanban-features-'));
  temporaryRoots.push(root);
  const repoPath = path.join(root, 'repo');
  mkdirSync(repoPath);
  const db = createDatabase(':memory:');
  const project = createProject(db, { name: 'Feature tests', repoPath });
  return { db, project, repoPath };
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('FEATURES.md domain model', () => {
  it('preserves a preamble and feature bodies while assigning an explicitly approved ID', () => {
    const { db, project, repoPath } = setup();
    const markdown = '# Product requirements\n\nKeep this preamble.\n\n## Sign in\n\nUsers can sign in.\n\n## Reports\n\nShow reports.\n';
    saveFeaturesFile(repoPath, markdown);
    expect(() => assignApprovedFeatureId(repoPath, 0, { id: 'FEAT-001' })).toThrow(
      'approval assertion',
    );
    const assigned = assignApprovedFeatureId(repoPath, 0, { id: 'FEAT-001', approved: true });
    expect(assigned.id).toBe('FEAT-001');
    const document = getFeaturesDocument(db, project.id, repoPath);
    expect(document.features[0]).toMatchObject({
      id: 'FEAT-001',
      title: 'Sign in',
      body: 'Users can sign in.',
    });
    expect(readFileSync(path.join(repoPath, 'FEATURES.md'), 'utf8')).toContain(
      '# Product requirements\n\nKeep this preamble.',
    );
    db.close();
  });

  it('cancels all linked tasks and writes cancellation metadata', () => {
    const { db, project, repoPath } = setup();
    writeFileSync(path.join(repoPath, 'FEATURES.md'), '## [FEAT-001] Search\n\nSearch the catalog.\n');
    const task = createTask(db, {
      projectId: project.id,
      featureId: 'FEAT-001',
      createdBy: 'agent',
      title: 'Build search',
      task: 'Implement catalog search.',
      progress: 'Implement the endpoint next.',
      decisions: 'Use indexed queries.',
      verificationNotes: 'Not run yet.',
    });
    cancelFeature(db, project.id, repoPath, 0, { reason: 'No longer in scope' });
    expect(listTasks(db, project.id).find((item) => item.id === task.id)).toMatchObject({
      column: 'canceled',
      cancellationReason: 'Parent feature FEAT-001 was canceled: No longer in scope',
    });
    const markdown = readFileSync(path.join(repoPath, 'FEATURES.md'), 'utf8');
    expect(markdown).toContain('"status":"canceled"');
    expect(markdown).toContain('"cancellationReason":"No longer in scope"');
    db.close();
  });
});
