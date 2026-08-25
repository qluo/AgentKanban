import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/src/lib/db';
import { captureTaskCheckpoint } from '@/src/lib/git';
import { assertLocalRequest, handleApiError } from '@/src/lib/http';

export const runtime = 'nodejs';

type Context = { params: Promise<{ taskId: string }> };

export async function POST(request: NextRequest, context: Context) {
  try {
    assertLocalRequest(request);
    const { taskId } = await context.params;
    const task = await captureTaskCheckpoint(getDatabase(), taskId);
    return NextResponse.json({ task });
  } catch (error) {
    return handleApiError(error);
  }
}
