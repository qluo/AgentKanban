import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/src/lib/db';
import { assertLocalRequest, handleApiError } from '@/src/lib/http';
import { cancelPersonalTicket } from '@/src/lib/repository';

export const runtime = 'nodejs';

type Context = { params: Promise<{ ticketId: string }> };

export async function POST(request: NextRequest, context: Context) {
  try {
    assertLocalRequest(request);
    const { ticketId } = await context.params;
    return NextResponse.json({
      ticket: cancelPersonalTicket(getDatabase(), ticketId),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
