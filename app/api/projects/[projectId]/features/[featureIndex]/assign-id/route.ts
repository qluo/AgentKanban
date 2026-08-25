import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/src/lib/db';
import { assignApprovedFeatureId } from '@/src/lib/features';
import { assertLocalRequest, handleApiError } from '@/src/lib/http';
import { getProject } from '@/src/lib/repository';
import { ValidationError } from '@/src/lib/validation';

export const runtime = 'nodejs';

type Context = { params: Promise<{ projectId: string; featureIndex: string }> };

export async function POST(request: NextRequest, context: Context) {
  try {
    assertLocalRequest(request);
    const { projectId, featureIndex: rawIndex } = await context.params;
    const featureIndex = Number(rawIndex);
    if (!Number.isInteger(featureIndex) || featureIndex < 0) {
      throw new ValidationError({ featureIndex: 'Feature index is invalid.' });
    }
    const db = getDatabase();
    const project = getProject(db, projectId);
    return NextResponse.json({
      feature: assignApprovedFeatureId(project.repoPath, featureIndex, await request.json()),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
