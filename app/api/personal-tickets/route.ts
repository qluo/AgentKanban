import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/src/lib/db';
import { assertLocalRequest, handleApiError } from '@/src/lib/http';
import { createPersonalTicket, listPersonalTickets } from '@/src/lib/repository';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    assertLocalRequest(request);
    return NextResponse.json({ tickets: listPersonalTickets(getDatabase()) });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    assertLocalRequest(request);
    const ticket = createPersonalTicket(getDatabase(), await request.json());
    return NextResponse.json({ ticket }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
