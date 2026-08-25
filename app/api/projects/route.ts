import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/src/lib/db';
import { assertLocalRequest, handleApiError } from '@/src/lib/http';
import { createProject, listProjects } from '@/src/lib/repository';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    assertLocalRequest(request);
    return NextResponse.json({ projects: listProjects(getDatabase()) });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    assertLocalRequest(request);
    const project = createProject(getDatabase(), await request.json());
    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
