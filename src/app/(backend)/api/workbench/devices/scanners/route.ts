import { type NextRequest } from 'next/server';

import { proxyWorkbenchRequest } from '@/server/services/workbench/client';

export async function GET(request: NextRequest): Promise<Response> {
  return proxyWorkbenchRequest(request, '/workbench/devices/scanners', { method: 'GET' });
}

export const runtime = 'nodejs';
