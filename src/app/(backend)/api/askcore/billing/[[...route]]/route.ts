import { createHash, randomUUID } from 'node:crypto';

import { SignJWT } from 'jose';
import { type NextRequest, NextResponse } from 'next/server';

import {
  askCoreAssertionHeaderName,
  askCoreProxyBodyInit,
  buildAskCoreAssertionForHeaders,
  isAllowedAskCoreSameOriginWrite,
  validateAskCoreRouteSegments,
} from '@/server/services/askcoreAssertion';

type RouteContext = {
  params: Promise<{
    route?: string[];
  }>;
};

const DEFAULT_API_BASE_URL = 'http://api:8000';
const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
const SCHOOL_SOURCE_PROOF_HEADER = 'X-AskCore-School-Source-Proof';
const SCHOOL_ASSERTION_HEADER = 'X-AskCore-School-Billing-Assertion';
const SCHOOL_ASSERTION_AUDIENCE = 'aitutor-school-billing';
const SCHOOL_ASSERTION_TTL_SECONDS = 120;

const jsonError = (status: number, detail: string) => NextResponse.json({ detail }, { status });

export const buildBillingAuthorityUrl = (request: NextRequest, route: string[]) => {
  const baseUrl =
    process.env.AITUTOR_API_BASE_URL?.trim() ||
    process.env.WORKBENCH_API_BASE_URL?.trim() ||
    DEFAULT_API_BASE_URL;
  const safePath = route.map((segment) => encodeURIComponent(segment)).join('/');
  const target = new URL(`/api/billing/v1/${safePath}`, baseUrl);
  target.search = request.nextUrl.search;
  return target;
};

const decodeSourceProof = (token: string) => {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[1]) return undefined;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >;
    return payload && typeof payload === 'object' ? payload : undefined;
  } catch {
    return undefined;
  }
};

const schoolRouteKey = (route: string[]) =>
  route.length >= 2 && route[0] === 'schools' ? route[1] : undefined;

const buildSchoolBillingAssertion = async ({
  body,
  claims,
  method,
  path,
  schoolKey,
  sourceProof,
}: {
  body: Uint8Array;
  claims: Record<string, unknown>;
  method: string;
  path: string;
  schoolKey: string;
  sourceProof: string;
}) => {
  const source = decodeSourceProof(sourceProof);
  const accountUserId = typeof claims.sub === 'string' ? claims.sub : '';
  const sourceSubject = typeof source?.sub === 'string' ? source.sub : '';
  const sourceSchoolKey = typeof source?.school_key === 'string' ? source.school_key : '';
  const sourceCellKey =
    typeof source?.source_cell_key === 'string' ? source.source_cell_key.trim() : '';
  if (
    source?.typ !== 'askcore-school-source-proof' ||
    !accountUserId ||
    sourceSubject !== accountUserId ||
    sourceSchoolKey !== schoolKey ||
    !sourceCellKey ||
    sourceCellKey.length > 120
  ) {
    throw new Error('School source proof binding is invalid');
  }
  const secret = process.env.BILLING_LOBEHUB_ASSERTION_SECRET?.trim();
  if (!secret) throw new Error('BILLING_LOBEHUB_ASSERTION_SECRET is not configured');
  const now = Math.floor(Date.now() / 1000);
  const configuredTtl = Number(
    process.env.ASKCORE_SCHOOL_BILLING_ASSERTION_TTL_SECONDS || SCHOOL_ASSERTION_TTL_SECONDS,
  );
  const ttl = Math.max(1, Math.min(SCHOOL_ASSERTION_TTL_SECONDS, Math.floor(configuredTtl)));
  return new SignJWT({
    body_sha256: createHash('sha256').update(body).digest('hex'),
    method,
    path,
    school_key: schoolKey,
    source_cell_key: sourceCellKey,
    source_proof: sourceProof,
    sub: accountUserId,
    typ: 'askcore-school-billing-request',
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt(now)
    .setIssuer(process.env.ASKCORE_BILLING_ASSERTION_ISSUER || 'askcore-lobehub')
    .setAudience(process.env.ASKCORE_SCHOOL_BILLING_ASSERTION_AUDIENCE || SCHOOL_ASSERTION_AUDIENCE)
    .setExpirationTime(now + ttl)
    .setJti(randomUUID())
    .sign(new TextEncoder().encode(secret));
};

const forwardBillingRequest = async (request: NextRequest, context: RouteContext) => {
  if (!ALLOWED_METHODS.includes(request.method)) {
    return new NextResponse(null, {
      headers: { Allow: ALLOWED_METHODS.join(', ') },
      status: 405,
    });
  }
  if (request.method === 'OPTIONS') {
    return new NextResponse(null, {
      headers: { Allow: ALLOWED_METHODS.join(', ') },
      status: 204,
    });
  }
  const { route = [] } = await context.params;
  if (!validateAskCoreRouteSegments(route)) {
    return jsonError(400, 'Invalid AskCore route segment');
  }
  if (!isAllowedAskCoreSameOriginWrite(request)) {
    return jsonError(403, 'Cross-origin billing writes are not allowed');
  }

  let assertionResult: Awaited<ReturnType<typeof buildAskCoreAssertionForHeaders>>;
  try {
    assertionResult = await buildAskCoreAssertionForHeaders(request.headers, {
      usePersistedActiveOrganization: false,
    });
  } catch (error) {
    return jsonError(
      error instanceof Error && error.message ? 503 : 500,
      'Billing assertion is unavailable',
    );
  }
  if (!assertionResult) return jsonError(401, 'LobeHub session is required for billing');

  const target = buildBillingAuthorityUrl(request, route);
  const headers = new Headers();
  const schoolKey = schoolRouteKey(route);
  let bodyInit: RequestInit & { duplex?: 'half' };
  if (schoolKey) {
    const sourceProof = request.headers.get(SCHOOL_SOURCE_PROOF_HEADER)?.trim() || '';
    if (!sourceProof) return jsonError(401, 'Current school source proof is required');
    const body =
      request.method === 'GET' || request.method === 'HEAD' || !request.body
        ? new Uint8Array()
        : new Uint8Array(await request.arrayBuffer());
    let schoolAssertion: string;
    try {
      schoolAssertion = await buildSchoolBillingAssertion({
        body,
        claims: assertionResult.claims,
        method: request.method,
        path: target.pathname,
        schoolKey,
        sourceProof,
      });
    } catch {
      return jsonError(403, 'School source proof does not match the current session');
    }
    headers.set(SCHOOL_ASSERTION_HEADER, schoolAssertion);
    bodyInit = body.length > 0 ? { body } : {};
  } else {
    headers.set(askCoreAssertionHeaderName(), assertionResult.assertion);
    bodyInit = askCoreProxyBodyInit(request);
  }

  const contentType = request.headers.get('content-type');
  const accept = request.headers.get('accept');
  const acceptLanguage = request.headers.get('accept-language');
  if (contentType) headers.set('content-type', contentType);
  if (accept) headers.set('accept', accept);
  if (acceptLanguage) headers.set('accept-language', acceptLanguage);
  const idempotencyKey = request.headers.get('idempotency-key');
  if (idempotencyKey) headers.set('Idempotency-Key', idempotencyKey);

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      ...bodyInit,
      cache: 'no-store',
      headers,
      method: request.method,
    });
  } catch {
    return jsonError(502, 'Billing authority is unavailable');
  }

  const responseHeaders = new Headers();
  const responseContentType = upstream.headers.get('content-type');
  if (responseContentType) responseHeaders.set('content-type', responseContentType);

  return new NextResponse(upstream.body, {
    headers: responseHeaders,
    status: upstream.status,
    statusText: upstream.statusText,
  });
};

export const GET = (request: NextRequest, context: RouteContext) =>
  forwardBillingRequest(request, context);
export const POST = (request: NextRequest, context: RouteContext) =>
  forwardBillingRequest(request, context);
export const PUT = (request: NextRequest, context: RouteContext) =>
  forwardBillingRequest(request, context);
export const PATCH = (request: NextRequest, context: RouteContext) =>
  forwardBillingRequest(request, context);
export const DELETE = (request: NextRequest, context: RouteContext) =>
  forwardBillingRequest(request, context);
export const OPTIONS = (request: NextRequest, context: RouteContext) =>
  forwardBillingRequest(request, context);

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
