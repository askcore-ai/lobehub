import { type NextRequest } from 'next/server';

import { proxyWorkbenchRequest } from '@/server/services/workbench/client';

export async function GET(request: NextRequest) {
  const { search } = new URL(request.url);
  return proxyWorkbenchRequest(request, `/workbench/artifacts${search}`, { method: 'GET' });
}

export const runtime = 'nodejs';
