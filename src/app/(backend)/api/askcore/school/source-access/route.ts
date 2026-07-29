import { type NextRequest, NextResponse } from 'next/server';

import {
  createSourceAccessProof,
  SchoolSessionRequiredError,
  type SchoolSourceAudience,
} from '@/server/services/schoolSessionBroker';

const noStoreHeaders = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
};
const SOURCE_HEADER = 'X-AskCore-School-Source';
const INTERNAL_HEADER = 'X-AskCore-Internal-Request';
const PROOF_HEADER = 'X-AskCore-Source-Proof';

const sourceFromRequest = (request: NextRequest): SchoolSourceAudience | undefined => {
  if (
    request.nextUrl.search ||
    request.headers.get(INTERNAL_HEADER) !== '1'
  ) {
    return undefined;
  }
  const source = request.headers.get(SOURCE_HEADER);
  return source === 'moodle' || source === 'gibbon' ? source : undefined;
};

export const GET = async (request: NextRequest) => {
  const source = sourceFromRequest(request);
  if (!source) return new NextResponse(null, { headers: noStoreHeaders, status: 404 });

  try {
    const { proof } = await createSourceAccessProof(request.headers, source);
    return new NextResponse(null, {
      headers: { ...noStoreHeaders, [PROOF_HEADER]: proof },
      status: 204,
    });
  } catch (error) {
    return new NextResponse(null, {
      headers: noStoreHeaders,
      status: error instanceof SchoolSessionRequiredError ? 401 : 503,
    });
  }
};

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
