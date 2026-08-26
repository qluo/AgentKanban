#!/usr/bin/env -S npx tsx

import type {
  Project,
  Task,
  TaskColumn,
  VerificationStatus,
} from '../src/lib/types';

const baseUrl = process.env.KANBAN_URL ?? 'http://127.0.0.1:3210';
const AGENT_MOVABLE_COLUMNS = [
  'backlog',
  'ready',
  'in-progress',
  'verification',
] as const satisfies readonly TaskColumn[];

type Feature = {
  index: number;
  id: string | null;
  title: string;
  status?: string;
  [key: string]: unknown;
};

type FeaturesDocument = {
  exists: boolean;
  path: string;
  markdown: string | null;
  features: Feature[];
};

type FeaturesResponse = {
  features: FeaturesDocument;
};

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
    throw new Error(
      `Agent Kanban is not reachable at ${baseUrl}. Start the local server first.`,
    );
  }
  const body = response.status === 204 ? null : await response.json();
  if (!response.ok) {
    const detail = body as {
      error?: string;
      issues?: Record<string, string>;
    } | null;
    throw new Error(
      detail?.error ?? `Request failed with status ${response.status}.`,
    );
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
        console.log(
          `${item.reference}\t${item.column}\t${item.title}\t${item.id}`,
        );
      }
    }
    return;
  }
  console.log(JSON.stringify(value, null, 2));
}

function printFeatures(value: FeaturesDocument, json: boolean) {
  if (json) {
    print(value, true);
    return;
  }
  if (value.features.length === 0) {
    console.log('No features found.');
    return;
  }
  for (const feature of value.features) {
    const identifier = feature.id ?? `unassigned@${feature.index}`;
    console.log(
      `${identifier}\t${feature.status ?? 'active'}\t${feature.title}`,
    );
  }
}

function featureMatches(feature: Feature, selector: string) {
  return feature.id === selector || String(feature.index) === selector;
}

function requiredFeatureIndex(value: string | undefined) {
  if (!value || !/^\d+$/.test(value)) {
    throw new Error(
      'Feature ID assignment requires a zero-based feature index.',
    );
  }
  return Number(value);
}

function help() {
  console.log(`Agent Kanban CLI

Usage:
  kanban project list [--json]
  kanban project add --name <name> --path <directory> [--json]
  kanban feature list --project <project-id> [--json]
  kanban feature show --project <project-id> <feature-id|index> [--json]
  kanban feature assign-id --project <project-id> <feature-index> --id <FEAT-001> --approved [--json]
  kanban task list --project <project-id> [--json]
  kanban task show <task-id> [--json]
  kanban task create --project <id> --feature <feature-id> --title <text> --task <text> --progress <text> --decisions <text> --verification-notes <text> [--json]
  kanban task update <task-id> [--title <text>] [--task <text>] [--progress <text>] [--decisions <text>] [--verification-status <status>] [--verification-notes <text>] [--json]
  kanban task move <task-id> <backlog|ready|in-progress|verification> [--json]
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
    const { projects } = await request<{ projects: Project[] }>(
      '/api/projects',
    );
    print(projects, json);
    return;
  }

  if (entity === 'project' && action === 'add') {
    const payload = {
      name: required(flags, 'name'),
      repoPath: required(flags, 'path'),
    };
    const { project } = await request<{ project: Project }>('/api/projects', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    print(project, json);
    return;
  }

  if (entity === 'feature' && action === 'list') {
    const projectId = required(flags, 'project');
    const { features } = await request<FeaturesResponse>(
      `/api/projects/${projectId}/features`,
    );
    printFeatures(features, json);
    return;
  }

  if (entity === 'feature' && action === 'show') {
    const projectId = required(flags, 'project');
    const selector = positional[0];
    if (!selector) throw new Error('Missing feature id or index.');
    const { features } = await request<FeaturesResponse>(
      `/api/projects/${projectId}/features`,
    );
    const feature = features.features.find((item) =>
      featureMatches(item, selector),
    );
    if (!feature)
      throw new Error(`Feature ${selector} was not found in this project.`);
    print(feature, json);
    return;
  }

  if (entity === 'feature' && action === 'assign-id') {
    const projectId = required(flags, 'project');
    const featureIndex = requiredFeatureIndex(positional[0]);
    if (flags.approved !== true) {
      throw new Error(
        'Feature ID assignment requires explicit human approval via --approved.',
      );
    }
    const { feature } = await request<{ feature: Feature }>(
      `/api/projects/${projectId}/features/${featureIndex}/assign-id`,
      {
        method: 'POST',
        body: JSON.stringify({ id: required(flags, 'id'), approved: true }),
      },
    );
    print(feature, json);
    return;
  }

  if (entity === 'task' && action === 'list') {
    const projectId = required(flags, 'project');
    const { tasks } = await request<{ tasks: Task[] }>(
      `/api/projects/${projectId}/tasks`,
    );
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
      verificationStatus: (flags['verification-status'] ??
        'not_run') as VerificationStatus,
      featureId: required(flags, 'feature'),
      createdBy: 'agent' as const,
    };
    const projectId = required(flags, 'project');
    const { task } = await request<{ task: Task }>(
      `/api/projects/${projectId}/tasks`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
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
      if (typeof flags[flag] === 'string')
        payload[field] = flags[flag] as string;
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
    if (!taskId || !column)
      throw new Error('Usage: kanban task move <task-id> <column>.');
    if (
      !AGENT_MOVABLE_COLUMNS.includes(
        column as (typeof AGENT_MOVABLE_COLUMNS)[number],
      )
    ) {
      if (column === 'done') {
        throw new Error('Only human browser review can move a task to Done.');
      }
      if (column === 'canceled') {
        throw new Error(
          'Only feature cancellation can move a task to Canceled.',
        );
      }
      throw new Error(
        `Task movement is limited to ${AGENT_MOVABLE_COLUMNS.join(', ')}.`,
      );
    }
    const { task } = await request<{ task: Task }>(
      `/api/tasks/${taskId}/move`,
      {
        method: 'POST',
        body: JSON.stringify({ column }),
      },
    );
    print(task, json);
    return;
  }

  if (entity === 'task' && action === 'checkpoint') {
    const taskId = positional[0];
    if (!taskId) throw new Error('Missing task id.');
    const { task } = await request<{ task: Task }>(
      `/api/tasks/${taskId}/checkpoint`,
      {
        method: 'POST',
      },
    );
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
