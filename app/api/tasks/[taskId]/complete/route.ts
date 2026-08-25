import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/src/lib/db';
import { assertLocalRequest, handleApiError } from '@/src/lib/http';
import { completeTask } from '@/src/lib/repository';

export const runtime = 'nodejs';

type Context = { params: Promise<{ taskId: string }> };

export async function POST(request: NextRequest, context: Context) {
  try {
    assertLocalRequest(request);
    const { taskId } = await context.params;
    return NextResponse.json({ task: completeTask(getDatabase(), taskId) });
  } catch (error) {
    return handleApiError(error);
  }
}
