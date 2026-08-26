import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it } from 'vitest';
import { getDatabase } from '@/src/lib/db';
import { getTask, setTaskCheckpoint, updateTask } from '@/src/lib/repository';
import * as projectsRoute from '@/app/api/projects/route';
import * as projectExportRoute from '@/app/api/projects/[projectId]/export/route';
import * as projectImportRoute from '@/app/api/projects/import/route';
import * as projectImportPreviewRoute from '@/app/api/projects/import/preview/route';
import * as featuresFileRoute from '@/app/api/projects/[projectId]/features-file/route';
import * as featuresRoute from '@/app/api/projects/[projectId]/features/route';
import * as featureRoute from '@/app/api/projects/[projectId]/features/[featureIndex]/route';
import * as assignIdRoute from '@/app/api/projects/[projectId]/features/[featureIndex]/assign-id/route';
import * as tasksRoute from '@/app/api/projects/[projectId]/tasks/route';
import * as completeRoute from '@/app/api/tasks/[taskId]/complete/route';

const temporaryRoots: string[] = [];

function localRequest(
  url: string,
  init?: { method?: string; body?: string; headers?: HeadersInit },
) {
  const headers = new Headers(init?.headers);
  headers.set('host', '127.0.0.1:3210');
  headers.set('content-type', 'application/json');
  return new NextRequest(url, {
    method: init?.method,
    body: init?.body,
    headers,
  });
}

function resetDatabase() {
  const global = globalThis as typeof globalThis & {
    __agentKanbanDb?: { close(): void };
  };
  global.__agentKanbanDb?.close();
  delete global.__agentKanbanDb;
}

afterEach(() => {
  resetDatabase();
  delete process.env.KANBAN_DB_PATH;
  for (const root of temporaryRoots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

describe('feature-led HTTP API', () => {
  it('exports, previews, and imports a project migration', async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'agent-kanban-api-migrate-'));
    temporaryRoots.push(root);
    const sourcePath = path.join(root, 'source');
    const destinationPath = path.join(root, 'destination');
    process.env.KANBAN_DB_PATH = path.join(root, 'kanban.sqlite');

    const createdResponse = await projectsRoute.POST(
      localRequest('http://127.0.0.1:3210/api/projects', {
        method: 'POST',
        body: JSON.stringify({ name: 'Migrating API', repoPath: sourcePath }),
      }),
    );
    const { project } = (await createdResponse.json()) as {
      project: { id: string };
    };
    await featuresFileRoute.PUT(
      localRequest(
        `http://127.0.0.1:3210/api/projects/${project.id}/features-file`,
        {
          method: 'PUT',
          body: JSON.stringify({
            markdown: '## [FEAT-001] Portable feature\n\nMove it.\n',
          }),
        },
      ),
      { params: Promise.resolve({ projectId: project.id }) },
    );

    const exported = await projectExportRoute.GET(
      localRequest(
        `http://127.0.0.1:3210/api/projects/${project.id}/export`,
      ),
      { params: Promise.resolve({ projectId: project.id }) },
    );
    expect(exported.status).toBe(200);
    expect(exported.headers.get('content-type')).toContain(
      'application/x-ndjson',
    );
    const jsonl = await exported.text();

    const previewed = await projectImportPreviewRoute.POST(
      localRequest('http://127.0.0.1:3210/api/projects/import/preview', {
        method: 'POST',
        body: JSON.stringify({ jsonl, repoPath: destinationPath }),
      }),
    );
    expect(previewed.status).toBe(200);
    const previewBody = (await previewed.json()) as {
      preview: { destinationFeaturesVersion: string };
    };
    expect(previewBody).toEqual({
      preview: expect.objectContaining({
        featureCount: 1,
        taskCount: 0,
        featuresConflict: false,
      }),
    });

    const imported = await projectImportRoute.POST(
      localRequest('http://127.0.0.1:3210/api/projects/import', {
        method: 'POST',
        body: JSON.stringify({
          jsonl,
          repoPath: destinationPath,
          featuresChoice: 'imported',
          destinationFeaturesVersion:
            previewBody.preview.destinationFeaturesVersion,
        }),
      }),
    );
    expect(imported.status).toBe(201);
    expect(readFileSync(path.join(destinationPath, 'FEATURES.md'), 'utf8')).toContain(
      'Portable feature',
    );
  });

  it('requires both a human project name and local directory path', async () => {
    const response = await projectsRoute.POST(
      localRequest('http://127.0.0.1:3210/api/projects', {
        method: 'POST',
        body: JSON.stringify({ name: 'Missing path' }),
      }),
    );
    expect(response.status).toBe(400);
  });

  it('imports a directory, saves FEATURES.md, and confirms the project', async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'agent-kanban-api-'));
    temporaryRoots.push(root);
    const repoPath = path.join(root, 'repo');
    process.env.KANBAN_DB_PATH = path.join(root, 'kanban.sqlite');

    const projectResponse = await projectsRoute.POST(
      localRequest('http://127.0.0.1:3210/api/projects', {
        method: 'POST',
        body: JSON.stringify({ name: 'API test', repoPath }),
      }),
    );
    expect(projectResponse.status).toBe(201);
    const { project } = (await projectResponse.json()) as {
      project: { id: string; featuresConfirmedAt: string | null };
    };
    expect(existsSync(repoPath)).toBe(true);
    expect(project.featuresConfirmedAt).toBeNull();

    const unconfirmedFeatures = await featuresRoute.GET(
      localRequest(`http://127.0.0.1:3210/api/projects/${project.id}/features`),
      { params: Promise.resolve({ projectId: project.id }) },
    );
    expect(unconfirmedFeatures.status).toBe(200);
    expect(
      (await unconfirmedFeatures.json()) as { features: { exists: boolean } },
    ).toEqual({
      features: expect.objectContaining({ exists: false }),
    });

    const missingConfirmation = await featuresFileRoute.POST(
      localRequest(
        `http://127.0.0.1:3210/api/projects/${project.id}/features-file`,
        {
          method: 'POST',
        },
      ),
      { params: Promise.resolve({ projectId: project.id }) },
    );
    expect(missingConfirmation.status).toBe(400);

    writeFileSync(
      path.join(repoPath, 'FEATURES.md'),
      '## [not-an-id] Invalid\n',
    );
    const invalidConfirmation = await featuresFileRoute.POST(
      localRequest(
        `http://127.0.0.1:3210/api/projects/${project.id}/features-file`,
        {
          method: 'POST',
        },
      ),
      { params: Promise.resolve({ projectId: project.id }) },
    );
    expect(invalidConfirmation.status).toBe(400);

    const fileResponse = await featuresFileRoute.PUT(
      localRequest(
        `http://127.0.0.1:3210/api/projects/${project.id}/features-file`,
        {
          method: 'PUT',
          body: JSON.stringify({
            markdown: '# Requirements\n\n## Search\n\nFind items.\n',
          }),
        },
      ),
      { params: Promise.resolve({ projectId: project.id }) },
    );
    expect(fileResponse.status).toBe(200);
    expect(
      (await fileResponse.json()) as {
        project: { featuresConfirmedAt: string | null };
      },
    ).toEqual({
      project: expect.objectContaining({
        featuresConfirmedAt: expect.any(String),
      }),
      features: expect.any(Object),
    });
    expect(readFileSync(path.join(repoPath, 'FEATURES.md'), 'utf8')).toContain(
      '## Search',
    );

    const assignResponse = await featureRoute.POST(
      localRequest(
        `http://127.0.0.1:3210/api/projects/${project.id}/features/0`,
        {
          method: 'POST',
          body: JSON.stringify({ action: 'cancel', reason: 'Not ready' }),
        },
      ),
      { params: Promise.resolve({ projectId: project.id, featureIndex: '0' }) },
    );
    expect(assignResponse.status).toBe(400);

    const listResponse = await featuresRoute.GET(
      localRequest(`http://127.0.0.1:3210/api/projects/${project.id}/features`),
      {
        params: Promise.resolve({ projectId: project.id }),
      },
    );
    const document = (await listResponse.json()) as {
      features: { features: Array<{ title: string }> };
    };
    expect(document.features.features).toEqual([
      expect.objectContaining({ title: 'Search' }),
    ]);
  });

  it('requires confirmation of an existing FEATURES.md before agent workflows begin', async () => {
    const root = mkdtempSync(
      path.join(os.tmpdir(), 'agent-kanban-confirm-api-'),
    );
    temporaryRoots.push(root);
    const repoPath = path.join(root, 'repo');
    mkdirSync(repoPath);
    writeFileSync(
      path.join(repoPath, 'FEATURES.md'),
      '## Search\n\nSearch the catalog.\n',
    );
    process.env.KANBAN_DB_PATH = path.join(root, 'kanban.sqlite');

    const projectResponse = await projectsRoute.POST(
      localRequest('http://127.0.0.1:3210/api/projects', {
        method: 'POST',
        body: JSON.stringify({ name: 'Existing requirements', repoPath }),
      }),
    );
    const { project } = (await projectResponse.json()) as {
      project: { id: string };
    };

    const readable = await featuresRoute.GET(
      localRequest(`http://127.0.0.1:3210/api/projects/${project.id}/features`),
      { params: Promise.resolve({ projectId: project.id }) },
    );
    expect(
      (await readable.json()) as {
        features: { features: Array<{ title: string }> };
      },
    ).toEqual({
      features: expect.objectContaining({
        features: [expect.objectContaining({ title: 'Search' })],
      }),
    });

    const blockedAssignment = await assignIdRoute.POST(
      localRequest(
        `http://127.0.0.1:3210/api/projects/${project.id}/features/0/assign-id`,
        {
          method: 'POST',
          body: JSON.stringify({ id: 'FEAT-001', approved: true }),
        },
      ),
      { params: Promise.resolve({ projectId: project.id, featureIndex: '0' }) },
    );
    expect(blockedAssignment.status).toBe(400);

    const blockedTask = await tasksRoute.POST(
      localRequest(`http://127.0.0.1:3210/api/projects/${project.id}/tasks`, {
        method: 'POST',
        body: JSON.stringify({
          createdBy: 'agent',
          title: 'Implement search',
          task: 'Build the search endpoint.',
          progress: 'Implement the route next.',
          decisions: 'Use the existing API layout.',
          verificationNotes: 'Not run yet.',
        }),
      }),
      { params: Promise.resolve({ projectId: project.id }) },
    );
    expect(blockedTask.status).toBe(400);

    const confirmed = await featuresFileRoute.POST(
      localRequest(
        `http://127.0.0.1:3210/api/projects/${project.id}/features-file`,
        {
          method: 'POST',
        },
      ),
      { params: Promise.resolve({ projectId: project.id }) },
    );
    expect(confirmed.status).toBe(200);

    const assigned = await assignIdRoute.POST(
      localRequest(
        `http://127.0.0.1:3210/api/projects/${project.id}/features/0/assign-id`,
        {
          method: 'POST',
          body: JSON.stringify({ id: 'FEAT-001', approved: true }),
        },
      ),
      { params: Promise.resolve({ projectId: project.id, featureIndex: '0' }) },
    );
    expect(assigned.status).toBe(200);

    const createdTask = await tasksRoute.POST(
      localRequest(`http://127.0.0.1:3210/api/projects/${project.id}/tasks`, {
        method: 'POST',
        body: JSON.stringify({
          createdBy: 'agent',
          featureId: 'FEAT-001',
          title: 'Implement search',
          task: 'Build the search endpoint.',
          progress: 'Implement the route next.',
          decisions: 'Use the existing API layout.',
          verificationNotes: 'Not run yet.',
        }),
      }),
      { params: Promise.resolve({ projectId: project.id }) },
    );
    expect(createdTask.status).toBe(201);
  });

  it('only completes a validated task from Validation with a checkpoint', async () => {
    const root = mkdtempSync(
      path.join(os.tmpdir(), 'agent-kanban-complete-api-'),
    );
    temporaryRoots.push(root);
    const repoPath = path.join(root, 'repo');
    mkdirSync(repoPath);
    process.env.KANBAN_DB_PATH = path.join(root, 'kanban.sqlite');
    const projectResponse = await projectsRoute.POST(
      localRequest('http://127.0.0.1:3210/api/projects', {
        method: 'POST',
        body: JSON.stringify({ name: 'Completion API', repoPath }),
      }),
    );
    const { project } = (await projectResponse.json()) as {
      project: { id: string };
    };
    const { createTask, moveTask } = await import('@/src/lib/repository');
    const db = getDatabase();
    const task = createTask(db, {
      projectId: project.id,
      title: 'Verify task',
      task: 'Verify completion routing.',
      decisions: 'Use human endpoint.',
      verificationNotes: 'Pending.',
    });
    updateTask(db, task.id, {
      verificationStatus: 'passed',
      verificationNotes: 'Passed.',
    });
    moveTask(db, task.id, 'verification');
    setTaskCheckpoint(db, task.id, { state: 'not_git' });

    const response = await completeRoute.POST(
      localRequest(`http://127.0.0.1:3210/api/tasks/${task.id}/complete`, {
        method: 'POST',
      }),
      { params: Promise.resolve({ taskId: task.id }) },
    );
    expect(response.status).toBe(200);
    expect(getTask(db, task.id).column).toBe('done');
  });
});
