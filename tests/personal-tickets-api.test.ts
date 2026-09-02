import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it } from 'vitest';
import { getDatabase } from '@/src/lib/db';
import * as ticketsRoute from '@/app/api/personal-tickets/route';
import * as ticketRoute from '@/app/api/personal-tickets/[ticketId]/route';
import * as moveRoute from '@/app/api/personal-tickets/[ticketId]/move/route';
import * as completeRoute from '@/app/api/personal-tickets/[ticketId]/complete/route';
import * as cancelRoute from '@/app/api/personal-tickets/[ticketId]/cancel/route';
import * as restoreRoute from '@/app/api/personal-tickets/[ticketId]/restore/route';

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

function context(ticketId: string) {
  return { params: Promise.resolve({ ticketId }) };
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

describe('personal tickets HTTP API', () => {
  it('creates, edits, moves, completes, cancels, restores, and lists tickets', async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'agent-kanban-personal-api-'));
    temporaryRoots.push(root);
    process.env.KANBAN_DB_PATH = path.join(root, 'kanban.sqlite');

    const created = await ticketsRoute.POST(
      localRequest('http://127.0.0.1:3210/api/personal-tickets', {
        method: 'POST',
        body: JSON.stringify({ title: 'Write release notes' }),
      }),
    );
    expect(created.status).toBe(201);
    const { ticket } = (await created.json()) as { ticket: { id: string } };
    expect(ticket).toEqual(
      expect.objectContaining({ horizon: 'today', category: 'work', status: 'active' }),
    );

    const edited = await ticketRoute.PATCH(
      localRequest(`http://127.0.0.1:3210/api/personal-tickets/${ticket.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: 'Write customer release notes',
          notes: 'Cover the personal tab.',
          category: 'personal',
        }),
      }),
      context(ticket.id),
    );
    expect(edited.status).toBe(200);
    expect(await edited.json()).toEqual({
      ticket: expect.objectContaining({
        title: 'Write customer release notes',
        notes: 'Cover the personal tab.',
        category: 'personal',
      }),
    });

    const moved = await moveRoute.POST(
      localRequest(`http://127.0.0.1:3210/api/personal-tickets/${ticket.id}/move`, {
        method: 'POST',
        body: JSON.stringify({ horizon: 'this_month' }),
      }),
      context(ticket.id),
    );
    expect(await moved.json()).toEqual({
      ticket: expect.objectContaining({ horizon: 'this_month', status: 'active' }),
    });

    const completed = await completeRoute.POST(
      localRequest(`http://127.0.0.1:3210/api/personal-tickets/${ticket.id}/complete`, {
        method: 'POST',
      }),
      context(ticket.id),
    );
    expect(await completed.json()).toEqual({
      ticket: expect.objectContaining({
        status: 'completed',
        horizon: 'this_month',
        completedAt: expect.any(String),
      }),
    });

    const restored = await restoreRoute.POST(
      localRequest(`http://127.0.0.1:3210/api/personal-tickets/${ticket.id}/restore`, {
        method: 'POST',
      }),
      context(ticket.id),
    );
    expect(await restored.json()).toEqual({
      ticket: expect.objectContaining({
        status: 'active',
        horizon: 'this_month',
        completedAt: null,
      }),
    });

    const canceled = await cancelRoute.POST(
      localRequest(`http://127.0.0.1:3210/api/personal-tickets/${ticket.id}/cancel`, {
        method: 'POST',
      }),
      context(ticket.id),
    );
    expect(await canceled.json()).toEqual({
      ticket: expect.objectContaining({
        status: 'canceled',
        horizon: 'this_month',
        canceledAt: expect.any(String),
      }),
    });

    const listed = await ticketsRoute.GET(
      localRequest('http://127.0.0.1:3210/api/personal-tickets'),
    );
    expect(await listed.json()).toEqual({
      tickets: [expect.objectContaining({ id: ticket.id, status: 'canceled' })],
    });
    expect(
      getDatabase().prepare('PRAGMA foreign_key_list(personal_tickets)').all(),
    ).toEqual([]);
  });

  it('uses the existing local-request guard and returns validation errors', async () => {
    const remote = await ticketsRoute.GET(
      new NextRequest('http://example.com/api/personal-tickets', {
        headers: { host: 'example.com' },
      }),
    );
    expect(remote.status).toBe(400);

    const invalid = await ticketsRoute.POST(
      localRequest('http://127.0.0.1:3210/api/personal-tickets', {
        method: 'POST',
        body: JSON.stringify({ title: '   ', horizon: 'later' }),
      }),
    );
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({
      error: 'title is required.',
      issues: expect.objectContaining({
        title: 'title is required.',
        horizon: 'Horizon is invalid.',
      }),
    });
  });
});
