import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/src/lib/db';
import { assertLocalRequest, handleApiError } from '@/src/lib/http';
import { getPersonalTicket, updatePersonalTicket } from '@/src/lib/repository';

export const runtime = 'nodejs';

type Context = { params: Promise<{ ticketId: string }> };

export async function GET(request: NextRequest, context: Context) {
  try {
    assertLocalRequest(request);
    const { ticketId } = await context.params;
    return NextResponse.json({ ticket: getPersonalTicket(getDatabase(), ticketId) });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: NextRequest, context: Context) {
  try {
    assertLocalRequest(request);
    const { ticketId } = await context.params;
    return NextResponse.json({
      ticket: updatePersonalTicket(getDatabase(), ticketId, await request.json()),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
