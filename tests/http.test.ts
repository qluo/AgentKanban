import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { assertLocalRequest } from '@/src/lib/http';

describe('local request boundary', () => {
  it('accepts local requests and rejects remote hosts', () => {
    expect(() =>
      assertLocalRequest(
        new NextRequest('http://127.0.0.1:3210/api/projects', {
          headers: { host: '127.0.0.1:3210' },
        }),
      ),
    ).not.toThrow();

    expect(() =>
      assertLocalRequest(
        new NextRequest('http://example.com/api/projects', {
          headers: { host: 'example.com' },
        }),
      ),
    ).toThrow('Only local requests');
  });

  it('rejects a cross-origin browser request', () => {
    expect(() =>
      assertLocalRequest(
        new NextRequest('http://127.0.0.1:3210/api/projects', {
          headers: {
            host: '127.0.0.1:3210',
            origin: 'http://evil.example',
          },
        }),
      ),
    ).toThrow('Cross-origin');
  });
});
