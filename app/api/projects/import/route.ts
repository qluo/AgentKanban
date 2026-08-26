import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/src/lib/db';
import { assertLocalRequest, handleApiError } from '@/src/lib/http';
import { importProjectJsonl } from '@/src/lib/migration';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    assertLocalRequest(request);
    const project = importProjectJsonl(getDatabase(), await request.json());
    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
