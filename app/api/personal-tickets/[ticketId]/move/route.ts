import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/src/lib/db';
import { assertLocalRequest, handleApiError } from '@/src/lib/http';
import { movePersonalTicket } from '@/src/lib/repository';
import {
  PERSONAL_TICKET_HORIZONS,
  type PersonalTicketHorizon,
} from '@/src/lib/types';
import { ValidationError } from '@/src/lib/validation';

export const runtime = 'nodejs';

type Context = { params: Promise<{ ticketId: string }> };

export async function POST(request: NextRequest, context: Context) {
  try {
    assertLocalRequest(request);
    const { ticketId } = await context.params;
    const body = (await request.json()) as { horizon?: PersonalTicketHorizon };
    if (!body.horizon || !PERSONAL_TICKET_HORIZONS.includes(body.horizon)) {
      throw new ValidationError({ horizon: 'Horizon is invalid.' });
    }
    return NextResponse.json({
      ticket: movePersonalTicket(getDatabase(), ticketId, body.horizon),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
