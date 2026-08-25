import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/src/lib/db';
import { assertLocalRequest, handleApiError } from '@/src/lib/http';
import { moveTask } from '@/src/lib/repository';
import { TASK_COLUMNS, type TaskColumn } from '@/src/lib/types';
import { ValidationError } from '@/src/lib/validation';

export const runtime = 'nodejs';

type Context = { params: Promise<{ taskId: string }> };

export async function POST(request: NextRequest, context: Context) {
  try {
    assertLocalRequest(request);
    const { taskId } = await context.params;
    const body = (await request.json()) as { column?: TaskColumn };
    if (!body.column || !TASK_COLUMNS.includes(body.column)) {
      throw new ValidationError({ column: 'Column is invalid.' });
    }
    return NextResponse.json({
      task: moveTask(getDatabase(), taskId, body.column),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
