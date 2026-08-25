import { NextRequest, NextResponse } from 'next/server';
import { assertLocalRequest, handleApiError } from '@/src/lib/http';
import { suggestProjectPath } from '@/src/lib/repository';
import { ValidationError } from '@/src/lib/validation';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    assertLocalRequest(request);
    const name = request.nextUrl.searchParams.get('name')?.trim();
    if (!name) throw new ValidationError({ name: 'name is required.' });
    return NextResponse.json({ path: suggestProjectPath(name) });
  } catch (error) {
    return handleApiError(error);
  }
}
