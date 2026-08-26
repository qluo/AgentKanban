import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/src/lib/db';
import { getFeaturesDocument, saveFeaturesFile } from '@/src/lib/features';
import { assertLocalRequest, handleApiError } from '@/src/lib/http';
import { confirmProjectFeatures, getProject } from '@/src/lib/repository';
import { ValidationError } from '@/src/lib/validation';

export const runtime = 'nodejs';

type Context = { params: Promise<{ projectId: string }> };

export async function POST(request: NextRequest, context: Context) {
  try {
    assertLocalRequest(request);
    const { projectId } = await context.params;
    const db = getDatabase();
    const project = getProject(db, projectId);
    const features = getFeaturesDocument(db, project.id, project.repoPath);
    if (!features.exists) {
      throw new ValidationError({
        features: 'FEATURES.md does not exist in this project.',
      });
    }
    return NextResponse.json({
      project: confirmProjectFeatures(db, project.id),
      features,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: NextRequest, context: Context) {
  try {
    assertLocalRequest(request);
    const { projectId } = await context.params;
    const db = getDatabase();
    const project = getProject(db, projectId);
    const body = (await request.json()) as { markdown?: unknown };
    saveFeaturesFile(project.repoPath, body.markdown);
    return NextResponse.json({
      project: confirmProjectFeatures(db, project.id),
      features: getFeaturesDocument(db, project.id, project.repoPath),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
