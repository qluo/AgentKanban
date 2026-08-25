import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it } from 'vitest';
import { getDatabase } from '@/src/lib/db';
import { getTask, setTaskCheckpoint, updateTask } from '@/src/lib/repository';
import * as projectsRoute from '@/app/api/projects/route';
import * as featuresFileRoute from '@/app/api/projects/[projectId]/features-file/route';
import * as featuresRoute from '@/app/api/projects/[projectId]/features/route';
import * as featureRoute from '@/app/api/projects/[projectId]/features/[featureIndex]/route';
import * as completeRoute from '@/app/api/tasks/[taskId]/complete/route';
import * as suggestPathRoute from '@/app/api/projects/suggest-path/route';

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
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('feature-led HTTP API', () => {
  it('suggests a safe project directory from a project name', async () => {
    const response = await suggestPathRoute.GET(
      localRequest('http://127.0.0.1:3210/api/projects/suggest-path?name=My%20Project%20%26%20Plan'),
    );
    expect(response.status).toBe(200);
    expect((await response.json()) as { path: string }).toMatchObject({
      path: expect.stringMatching(/projects\/my-project-plan$/),
    });
  });

  it('creates a project, onboards FEATURES.md, and exposes linked feature data', async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'agent-kanban-api-'));
    temporaryRoots.push(root);
    const repoPath = path.join(root, 'repo');
    mkdirSync(repoPath);
    process.env.KANBAN_DB_PATH = path.join(root, 'kanban.sqlite');

    const projectResponse = await projectsRoute.POST(
      localRequest('http://127.0.0.1:3210/api/projects', {
        method: 'POST',
        body: JSON.stringify({ name: 'API test', repoPath }),
      }),
    );
    expect(projectResponse.status).toBe(201);
    const { project } = (await projectResponse.json()) as { project: { id: string } };

    const fileResponse = await featuresFileRoute.PUT(
      localRequest(`http://127.0.0.1:3210/api/projects/${project.id}/features-file`, {
        method: 'PUT',
        body: JSON.stringify({ markdown: '# Requirements\n\n## Search\n\nFind items.\n' }),
      }),
      { params: Promise.resolve({ projectId: project.id }) },
    );
    expect(fileResponse.status).toBe(200);
    expect(readFileSync(path.join(repoPath, 'FEATURES.md'), 'utf8')).toContain('## Search');

    const assignResponse = await featureRoute.POST(
      localRequest(`http://127.0.0.1:3210/api/projects/${project.id}/features/0`, {
        method: 'POST',
        body: JSON.stringify({ action: 'cancel', reason: 'Not ready' }),
      }),
      { params: Promise.resolve({ projectId: project.id, featureIndex: '0' }) },
    );
    expect(assignResponse.status).toBe(400);

    const listResponse = await featuresRoute.GET(
      localRequest(`http://127.0.0.1:3210/api/projects/${project.id}/features`),
      { params: Promise.resolve({ projectId: project.id }) },
    );
    const document = (await listResponse.json()) as { features: { features: Array<{ title: string }> } };
    expect(document.features.features).toEqual([expect.objectContaining({ title: 'Search' })]);
  });

  it('only completes a verified task from Verification with a checkpoint', async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'agent-kanban-complete-api-'));
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
    const { project } = (await projectResponse.json()) as { project: { id: string } };
    const { createTask, moveTask } = await import('@/src/lib/repository');
    const db = getDatabase();
    const task = createTask(db, {
      projectId: project.id,
      title: 'Verify task',
      task: 'Verify completion routing.',
      decisions: 'Use human endpoint.',
      verificationNotes: 'Pending.',
    });
    updateTask(db, task.id, { verificationStatus: 'passed', verificationNotes: 'Passed.' });
    moveTask(db, task.id, 'verification');
    setTaskCheckpoint(db, task.id, { state: 'not_git' });

    const response = await completeRoute.POST(
      localRequest(`http://127.0.0.1:3210/api/tasks/${task.id}/complete`, { method: 'POST' }),
      { params: Promise.resolve({ taskId: task.id }) },
    );
    expect(response.status).toBe(200);
    expect(getTask(db, task.id).column).toBe('done');
  });
});
