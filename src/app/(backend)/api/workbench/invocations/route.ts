import { type NextRequest } from 'next/server';

import { proxyWorkbenchRequest } from '@/server/services/workbench/client';

export async function POST(request: NextRequest) {
  const body = await request.json();
  return proxyWorkbenchRequest(request, '/workbench/invocations', {
    body,
    forwardHeaders: ['Idempotency-Key', 'X-Request-Id'],
    method: 'POST',
  });
}

export const runtime = 'nodejs';
