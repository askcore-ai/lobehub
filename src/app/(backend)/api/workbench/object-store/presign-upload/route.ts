import { type NextRequest } from 'next/server';

import { proxyWorkbenchRequest } from '@/server/services/workbench/client';

export async function POST(request: NextRequest) {
  const body = await request.json();
  return proxyWorkbenchRequest(request, '/workbench/object-store/presign-upload', {
    body,
    forwardHeaders: ['X-Request-Id'],
    method: 'POST',
  });
}

export const runtime = 'nodejs';
