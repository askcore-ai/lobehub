import { type NextRequest } from 'next/server';

import { proxyWorkbenchRequest } from '@/server/services/workbench/client';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
): Promise<Response> {
  const { runId } = await params;
  const encodedRunId = encodeURIComponent(runId);
  return proxyWorkbenchRequest(request, `/workbench/runs/${encodedRunId}/retry`, {
    forwardHeaders: ['X-Request-Id'],
    method: 'POST',
  });
}

export const runtime = 'nodejs';
