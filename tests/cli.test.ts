import { spawn } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';

type RecordedRequest = {
  method: string | undefined;
  path: string | undefined;
  body: unknown;
};

const servers: Server[] = [];

async function startServer(handler: (request: RecordedRequest) => unknown) {
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      const text = Buffer.concat(chunks).toString();
      const body = text.length > 0 ? JSON.parse(text) : undefined;
      const result = handler({
        method: request.method,
        path: request.url,
        body,
      });
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(result));
    });
  });
  servers.push(server);

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Test server failed to bind.');
  return `http://127.0.0.1:${address.port}`;
}

function runCli(args: string[], url?: string) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>(
    (resolve) => {
      const child = spawn(
        process.execPath,
        ['--import', 'tsx', 'bin/kanban.ts', ...args],
        {
          cwd: process.cwd(),
          env: { ...process.env, ...(url ? { KANBAN_URL: url } : {}) },
        },
      );
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk) => {
        stdout += chunk;
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk;
      });
      child.on('close', (code) => resolve({ code, stdout, stderr }));
    },
  );
}

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve())),
          ),
      ),
  );
});

describe('kanban CLI', () => {
  it('requires an explicit local directory when adding a project', async () => {
    const requests: RecordedRequest[] = [];
    const url = await startServer((request) => {
      requests.push(request);
      return {
        project: {
          id: `project-${requests.length}`,
          name: 'Demo project',
          repoPath: '/projects/demo-project',
        },
      };
    });

    const missingPath = await runCli(
      ['project', 'add', '--name', 'Demo project'],
      url,
    );
    expect(missingPath.code).toBe(1);
    expect(missingPath.stderr).toContain('Missing required flag --path.');
    expect(requests).toHaveLength(0);

    const explicitPath = await runCli(
      [
        'project',
        'add',
        '--name',
        'Demo project',
        '--path',
        '/custom/demo',
        '--json',
      ],
      url,
    );
    expect(explicitPath).toMatchObject({ code: 0, stderr: '' });
    expect(requests[0]).toEqual({
      method: 'POST',
      path: '/api/projects',
      body: { name: 'Demo project', repoPath: '/custom/demo' },
    });

    const help = await runCli(['help']);
    expect(help.stdout).toContain(
      'kanban project add --name <name> --path <directory> [--json]',
    );
  });

  it('lists and shows the feature data returned by the project features endpoint', async () => {
    const document = {
      exists: true,
      path: '/projects/demo/FEATURES.md',
      markdown: '## First feature',
      features: [
        {
          index: 0,
          id: null,
          title: 'First feature',
          status: 'active',
          tasks: [],
        },
      ],
    };
    const url = await startServer((request) => {
      expect(request.method).toBe('GET');
      expect(request.path).toBe('/api/projects/project-1/features');
      return { features: document };
    });

    const listed = await runCli(
      ['feature', 'list', '--project', 'project-1', '--json'],
      url,
    );
    expect(listed).toMatchObject({ code: 0, stderr: '' });
    expect(JSON.parse(listed.stdout)).toEqual(document);

    const shown = await runCli(
      ['feature', 'show', '--project', 'project-1', '0', '--json'],
      url,
    );
    expect(shown).toMatchObject({ code: 0, stderr: '' });
    expect(JSON.parse(shown.stdout)).toEqual(document.features[0]);
  });

  it('requires approval for assigning IDs and marks CLI-created tasks as agent-owned', async () => {
    const requests: RecordedRequest[] = [];
    const url = await startServer((request) => {
      requests.push(request);
      if (request.path === '/api/projects/project-1/features/0/assign-id') {
        return {
          feature: { index: 0, id: 'FEAT-001', title: 'First feature' },
        };
      }
      if (request.path === '/api/projects/project-1/tasks') {
        return { task: { id: 'task-1', title: 'Implement first feature' } };
      }
      throw new Error(`Unexpected request: ${request.path}`);
    });

    const missingApproval = await runCli(
      [
        'feature',
        'assign-id',
        '--project',
        'project-1',
        '0',
        '--id',
        'FEAT-001',
      ],
      url,
    );
    expect(missingApproval.code).toBe(1);
    expect(missingApproval.stderr).toContain(
      'requires explicit human approval',
    );
    expect(requests).toHaveLength(0);

    const assigned = await runCli(
      [
        'feature',
        'assign-id',
        '--project',
        'project-1',
        '0',
        '--id',
        'FEAT-001',
        '--approved',
        '--json',
      ],
      url,
    );
    expect(assigned).toMatchObject({ code: 0, stderr: '' });
    expect(requests[0]).toEqual({
      method: 'POST',
      path: '/api/projects/project-1/features/0/assign-id',
      body: { id: 'FEAT-001', approved: true },
    });

    const task = await runCli(
      [
        'task',
        'create',
        '--project',
        'project-1',
        '--feature',
        'FEAT-001',
        '--title',
        'Implement first feature',
        '--task',
        'Deliver the feature behavior.',
        '--progress',
        'Implement the first endpoint next.',
        '--decisions',
        'No decisions yet.',
        '--verification-notes',
        'Not run yet.',
      ],
      url,
    );
    expect(task).toMatchObject({ code: 0, stderr: '' });
    expect(requests[1]).toEqual({
      method: 'POST',
      path: '/api/projects/project-1/tasks',
      body: {
        title: 'Implement first feature',
        task: 'Deliver the feature behavior.',
        progress: 'Implement the first endpoint next.',
        decisions: 'No decisions yet.',
        verificationNotes: 'Not run yet.',
        verificationStatus: 'not_run',
        featureId: 'FEAT-001',
        createdBy: 'agent',
      },
    });
  });

  it('requires agent progress and blocks Done and Canceled movement locally', async () => {
    const missingProgress = await runCli([
      'task',
      'create',
      '--project',
      'project-1',
      '--feature',
      'FEAT-001',
      '--title',
      'Implement first feature',
      '--task',
      'Deliver the feature behavior.',
      '--decisions',
      'No decisions yet.',
      '--verification-notes',
      'Not run yet.',
    ]);
    expect(missingProgress.code).toBe(1);
    expect(missingProgress.stderr).toContain(
      'Missing required flag --progress.',
    );

    const done = await runCli(['task', 'move', 'task-1', 'done']);
    expect(done.code).toBe(1);
    expect(done.stderr).toContain(
      'Use task complete after independent validation.',
    );

    const canceled = await runCli(['task', 'move', 'task-1', 'canceled']);
    expect(canceled.code).toBe(1);
    expect(canceled.stderr).toContain(
      'Only feature cancellation can move a task to Canceled.',
    );
  });

  it('links a pull request and completes a validated task', async () => {
    const requests: RecordedRequest[] = [];
    const url = await startServer((request) => {
      requests.push(request);
      const body = request.body as { pullRequestUrl?: string } | undefined;
      return { task: { id: 'task-1', pullRequestUrl: body?.pullRequestUrl } };
    });

    const linked = await runCli(
      [
        'task',
        'update',
        'task-1',
        '--pull-request-url',
        'https://github.com/example/repo/pull/42',
        '--json',
      ],
      url,
    );
    expect(linked).toMatchObject({ code: 0, stderr: '' });
    expect(requests[0]).toEqual({
      method: 'PATCH',
      path: '/api/tasks/task-1',
      body: { pullRequestUrl: 'https://github.com/example/repo/pull/42' },
    });

    const completed = await runCli(
      ['task', 'complete', 'task-1', '--json'],
      url,
    );
    expect(completed).toMatchObject({ code: 0, stderr: '' });
    expect(requests[1]).toEqual({
      method: 'POST',
      path: '/api/tasks/task-1/complete',
      body: undefined,
    });
  });
});
