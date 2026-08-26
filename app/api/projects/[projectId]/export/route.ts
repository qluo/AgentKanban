import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/src/lib/db';
import { assertLocalRequest, handleApiError } from '@/src/lib/http';
import {
  exportProjectJsonl,
  migrationFilename,
} from '@/src/lib/migration';
import { getProject } from '@/src/lib/repository';

export const runtime = 'nodejs';

type Context = { params: Promise<{ projectId: string }> };

export async function GET(request: NextRequest, context: Context) {
  try {
    assertLocalRequest(request);
    const { projectId } = await context.params;
    const db = getDatabase();
    const project = getProject(db, projectId);
    const jsonl = await exportProjectJsonl(db, project.id);
    return new NextResponse(jsonl, {
      headers: {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Content-Disposition': `attachment; filename="${migrationFilename(project)}"`,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
