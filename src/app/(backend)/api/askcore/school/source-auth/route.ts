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
const SOURCE_COOKIE_HEADER = 'X-AskCore-Source-Cookie';
const INTERNAL_HEADER = 'X-AskCore-Internal-Request';
const VERIFY_TIMEOUT_MS = 3000;

const sourceFromRequest = (request: NextRequest): SchoolSourceAudience | undefined => {
  if (request.nextUrl.search || request.headers.get(INTERNAL_HEADER) !== '1') return undefined;
  const source = request.headers.get(SOURCE_HEADER);
  return source === 'moodle' || source === 'gibbon' ? source : undefined;
};

const sourceCookie = (request: NextRequest, source: SchoolSourceAudience) => {
  const value = request.headers.get(SOURCE_COOKIE_HEADER)?.trim() || '';
  const pattern =
    source === 'moodle'
      ? /^MoodleSession=[^;\r\n]{1,512}$/
      : /^G[0-9a-f]{16}=[^;\r\n]{1,512}$/i;
  return pattern.test(value) ? value : undefined;
};

const verificationTarget = (source: SchoolSourceAudience) => {
  const raw =
    source === 'moodle'
      ? process.env.ASKCORE_MOODLE_SESSION_VERIFY_URL
      : process.env.ASKCORE_GIBBON_SESSION_VERIFY_URL;
  if (!raw) return undefined;
  try {
    const target = new URL(raw);
    if (
      !['http:', 'https:'].includes(target.protocol) ||
      target.username ||
      target.password ||
      target.hash
    ) {
      return undefined;
    }
    return target;
  } catch {
    return undefined;
  }
};

export const GET = async (request: NextRequest) => {
  const source = sourceFromRequest(request);
  if (!source) return new NextResponse(null, { headers: noStoreHeaders, status: 404 });

  const cookie = sourceCookie(request, source);
  const target = verificationTarget(source);
  if (!cookie) {
    return new NextResponse(null, { headers: noStoreHeaders, status: 401 });
  }
  if (!target) {
    return new NextResponse(null, { headers: noStoreHeaders, status: 503 });
  }

  try {
    const { proof } = await createSourceAccessProof(request.headers, source);
    const response = await fetch(target, {
      cache: 'no-store',
      headers: {
        Cookie: cookie,
        'X-AskCore-Source-Proof': proof,
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    });
    const status = [204, 401, 403].includes(response.status) ? response.status : 503;
    return new NextResponse(null, { headers: noStoreHeaders, status });
  } catch (error) {
    return new NextResponse(null, {
      headers: noStoreHeaders,
      status: error instanceof SchoolSessionRequiredError ? 401 : 503,
    });
  }
};

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
