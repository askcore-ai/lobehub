import { type NextRequest } from 'next/server';

import { proxyWorkbenchRequest } from '@/server/services/workbench/client';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
): Promise<Response> {
  const { runId } = await params;
  const encodedRunId = encodeURIComponent(runId);
  return proxyWorkbenchRequest(request, `/workbench/runs/${encodedRunId}`, { method: 'GET' });
}

export const runtime = 'nodejs';
