import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/src/lib/db';
import { getFeaturesDocument, saveFeaturesFile } from '@/src/lib/features';
import { assertLocalRequest, handleApiError } from '@/src/lib/http';
import { getProject } from '@/src/lib/repository';

export const runtime = 'nodejs';

type Context = { params: Promise<{ projectId: string }> };

export async function PUT(request: NextRequest, context: Context) {
  try {
    assertLocalRequest(request);
    const { projectId } = await context.params;
    const db = getDatabase();
    const project = getProject(db, projectId);
    const body = (await request.json()) as { markdown?: unknown };
    saveFeaturesFile(project.repoPath, body.markdown);
    return NextResponse.json({ features: getFeaturesDocument(db, project.id, project.repoPath) });
  } catch (error) {
    return handleApiError(error);
  }
}
