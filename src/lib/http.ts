import { NextRequest, NextResponse } from 'next/server';
import { NotFoundError } from './repository';
import { ValidationError } from './validation';

export function assertLocalRequest(request: NextRequest) {
  const host = request.headers.get('host') ?? '';
  const hostname = host.replace(/^\[/, '').replace(/\].*$/, '').split(':')[0];
  if (!['127.0.0.1', 'localhost', '::1'].includes(hostname)) {
    throw new ValidationError({ request: 'Only local requests are allowed.' });
  }

  const origin = request.headers.get('origin');
  if (origin) {
    const originHost = new URL(origin).host;
    if (originHost !== host) {
      throw new ValidationError({ request: 'Cross-origin requests are not allowed.' });
    }
  }
}

export function handleApiError(error: unknown) {
  if (error instanceof ValidationError) {
    return NextResponse.json(
      { error: error.message, issues: error.issues },
      { status: 400 },
    );
  }
  if (error instanceof NotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  console.error(error);
  return NextResponse.json({ error: 'Unexpected server error.' }, { status: 500 });
}
