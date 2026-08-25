#!/usr/bin/env -S npx tsx

import type { Project, Task, TaskColumn, VerificationStatus } from '../src/lib/types';

const baseUrl = process.env.KANBAN_URL ?? 'http://127.0.0.1:3210';

function parseArgs(values: string[]) {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith('--')) {
      positional.push(value);
      continue;
    }
    const key = value.slice(2);
    const next = values[index + 1];
    if (!next || next.startsWith('--')) {
      flags[key] = true;
    } else {
      flags[key] = next;
      index += 1;
    }
  }
  return { positional, flags };
}

function required(flags: Record<string, string | boolean>, key: string) {
  const value = flags[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Missing required flag --${key}.`);
  }
  return value;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    });
  } catch {
    throw new Error(`Agent Kanban is not reachable at ${baseUrl}. Start the local server first.`);
  }
  const body = response.status === 204 ? null : await response.json();
  if (!response.ok) {
    const detail = body as { error?: string; issues?: Record<string, string> } | null;
    throw new Error(detail?.error ?? `Request failed with status ${response.status}.`);
  }
  return body as T;
}

function print(value: unknown, json: boolean) {
  if (json) {
    console.log(JSON.stringify(value, null, 2));
    return;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      console.log('No records found.');
      return;
    }
    for (const item of value as Array<Project | Task>) {
      if ('repoPath' in item) {
        console.log(`${item.id}\t${item.name}\t${item.repoPath}`);
      } else {
        console.log(`${item.reference}\t${item.column}\t${item.title}\t${item.id}`);
      }
    }
    return;
  }
  console.log(JSON.stringify(value, null, 2));
}

function help() {
  console.log(`Agent Kanban CLI

Usage:
  kanban project list [--json]
  kanban project add --name <name> --path <directory> [--json]
  kanban task list --project <project-id> [--json]
  kanban task show <task-id> [--json]
  kanban task create --project <id> --title <text> --task <text> --progress <text> --decisions <text> --verification-notes <text> [--json]
  kanban task update <task-id> [--title <text>] [--task <text>] [--progress <text>] [--decisions <text>] [--verification-status <status>] [--verification-notes <text>] [--json]
  kanban task move <task-id> <backlog|ready|in-progress|verification|done> [--json]
  kanban task checkpoint <task-id> [--json]

Environment:
  KANBAN_URL defaults to http://127.0.0.1:3210`);
}

async function main() {
  const [entity, action, ...rest] = process.argv.slice(2);
  const { positional, flags } = parseArgs(rest);
  const json = flags.json === true;

  if (!entity || entity === 'help' || flags.help) {
    help();
    return;
  }

  if (entity === 'project' && action === 'list') {
    const { projects } = await request<{ projects: Project[] }>('/api/projects');
    print(projects, json);
    return;
  }

  if (entity === 'project' && action === 'add') {
    const { project } = await request<{ project: Project }>('/api/projects', {
      method: 'POST',
      body: JSON.stringify({ name: required(flags, 'name'), repoPath: required(flags, 'path') }),
    });
    print(project, json);
    return;
  }

  if (entity === 'task' && action === 'list') {
    const projectId = required(flags, 'project');
    const { tasks } = await request<{ tasks: Task[] }>(`/api/projects/${projectId}/tasks`);
    print(tasks, json);
    return;
  }

  if (entity === 'task' && action === 'show') {
    const taskId = positional[0];
    if (!taskId) throw new Error('Missing task id.');
    const { task } = await request<{ task: Task }>(`/api/tasks/${taskId}`);
    print(task, json);
    return;
  }

  if (entity === 'task' && action === 'create') {
    const payload = {
      title: required(flags, 'title'),
      task: required(flags, 'task'),
      progress: required(flags, 'progress'),
      decisions: required(flags, 'decisions'),
      verificationNotes: required(flags, 'verification-notes'),
      verificationStatus: (flags['verification-status'] ?? 'not_run') as VerificationStatus,
    };
    const projectId = required(flags, 'project');
    const { task } = await request<{ task: Task }>(`/api/projects/${projectId}/tasks`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    print(task, json);
    return;
  }

  if (entity === 'task' && action === 'update') {
    const taskId = positional[0];
    if (!taskId) throw new Error('Missing task id.');
    const mapping: Record<string, string> = {
      title: 'title',
      task: 'task',
      progress: 'progress',
      decisions: 'decisions',
      'verification-status': 'verificationStatus',
      'verification-notes': 'verificationNotes',
    };
    const payload: Record<string, string> = {};
    for (const [flag, field] of Object.entries(mapping)) {
      if (typeof flags[flag] === 'string') payload[field] = flags[flag] as string;
    }
    const { task } = await request<{ task: Task }>(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    print(task, json);
    return;
  }

  if (entity === 'task' && action === 'move') {
    const [taskId, column] = positional;
    if (!taskId || !column) throw new Error('Usage: kanban task move <task-id> <column>.');
    const { task } = await request<{ task: Task }>(`/api/tasks/${taskId}/move`, {
      method: 'POST',
      body: JSON.stringify({ column: column as TaskColumn }),
    });
    print(task, json);
    return;
  }

  if (entity === 'task' && action === 'checkpoint') {
    const taskId = positional[0];
    if (!taskId) throw new Error('Missing task id.');
    const { task } = await request<{ task: Task }>(`/api/tasks/${taskId}/checkpoint`, {
      method: 'POST',
    });
    print(task, json);
    return;
  }

  help();
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
