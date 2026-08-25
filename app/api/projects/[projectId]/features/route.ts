import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/src/lib/db';
import { createFeature, getFeaturesDocument } from '@/src/lib/features';
import { assertLocalRequest, handleApiError } from '@/src/lib/http';
import { getProject } from '@/src/lib/repository';

export const runtime = 'nodejs';

type Context = { params: Promise<{ projectId: string }> };

export async function GET(request: NextRequest, context: Context) {
  try {
    assertLocalRequest(request);
    const { projectId } = await context.params;
    const db = getDatabase();
    const project = getProject(db, projectId);
    return NextResponse.json({ features: getFeaturesDocument(db, project.id, project.repoPath) });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest, context: Context) {
  try {
    assertLocalRequest(request);
    const { projectId } = await context.params;
    const db = getDatabase();
    const project = getProject(db, projectId);
    return NextResponse.json(
      { feature: createFeature(project.repoPath, await request.json()) },
      { status: 201 },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
