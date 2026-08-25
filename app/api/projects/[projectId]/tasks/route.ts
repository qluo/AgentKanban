import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/src/lib/db';
import { assertLocalRequest, handleApiError } from '@/src/lib/http';
import { createTask, listTasks } from '@/src/lib/repository';

export const runtime = 'nodejs';

type Context = { params: Promise<{ projectId: string }> };

export async function GET(request: NextRequest, context: Context) {
  try {
    assertLocalRequest(request);
    const { projectId } = await context.params;
    return NextResponse.json({ tasks: listTasks(getDatabase(), projectId) });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest, context: Context) {
  try {
    assertLocalRequest(request);
    const { projectId } = await context.params;
    const task = createTask(getDatabase(), {
      ...(await request.json()),
      projectId,
    });
    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
