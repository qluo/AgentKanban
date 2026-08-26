import { NextRequest, NextResponse } from 'next/server';
import { assertLocalRequest, handleApiError } from '@/src/lib/http';
import { previewProjectImport } from '@/src/lib/migration';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    assertLocalRequest(request);
    return NextResponse.json({ preview: previewProjectImport(await request.json()) });
  } catch (error) {
    return handleApiError(error);
  }
}
