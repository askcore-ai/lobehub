import { type NextRequest } from 'next/server';

import { proxyWorkbenchRequest } from '@/server/services/workbench/client';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ artifactId: string }> },
): Promise<Response> {
  const { artifactId } = await params;
  const encodedArtifactId = encodeURIComponent(artifactId);
  return proxyWorkbenchRequest(request, `/workbench/artifacts/${encodedArtifactId}`, {
    method: 'GET',
  });
}

export const runtime = 'nodejs';
