import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/src/lib/db';
import { cancelFeature, deleteFeature, updateFeature } from '@/src/lib/features';
import { assertLocalRequest, handleApiError } from '@/src/lib/http';
import { getProject } from '@/src/lib/repository';
import { ValidationError } from '@/src/lib/validation';

export const runtime = 'nodejs';

type Context = { params: Promise<{ projectId: string; featureIndex: string }> };

async function projectAndIndex(context: Context) {
  const { projectId, featureIndex: rawIndex } = await context.params;
  const featureIndex = Number(rawIndex);
  if (!Number.isInteger(featureIndex) || featureIndex < 0) {
    throw new ValidationError({ featureIndex: 'Feature index is invalid.' });
  }
  const db = getDatabase();
  return { db, project: getProject(db, projectId), featureIndex };
}

export async function PATCH(request: NextRequest, context: Context) {
  try {
    assertLocalRequest(request);
    const { project, featureIndex } = await projectAndIndex(context);
    return NextResponse.json({
      feature: updateFeature(project.repoPath, featureIndex, await request.json()),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  try {
    assertLocalRequest(request);
    const { db, project, featureIndex } = await projectAndIndex(context);
    deleteFeature(db, project.id, project.repoPath, featureIndex);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest, context: Context) {
  try {
    assertLocalRequest(request);
    const { db, project, featureIndex } = await projectAndIndex(context);
    const body = (await request.json()) as { action?: string };
    if (body.action !== 'cancel') {
      throw new ValidationError({ action: 'Only feature cancellation is supported here.' });
    }
    return NextResponse.json({
      feature: cancelFeature(db, project.id, project.repoPath, featureIndex, body),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
