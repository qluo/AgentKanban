import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/src/lib/db';
import { assertLocalRequest, handleApiError } from '@/src/lib/http';
import { deleteTask, getTask, updateTask } from '@/src/lib/repository';

export const runtime = 'nodejs';

type Context = { params: Promise<{ taskId: string }> };

export async function GET(request: NextRequest, context: Context) {
  try {
    assertLocalRequest(request);
    const { taskId } = await context.params;
    return NextResponse.json({ task: getTask(getDatabase(), taskId) });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: NextRequest, context: Context) {
  try {
    assertLocalRequest(request);
    const { taskId } = await context.params;
    const task = updateTask(getDatabase(), taskId, await request.json());
    return NextResponse.json({ task });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  try {
    assertLocalRequest(request);
    const { taskId } = await context.params;
    deleteTask(getDatabase(), taskId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}
