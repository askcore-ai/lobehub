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
const ALLOWED_METHODS = ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'];

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
  headers.set(askCoreAssertionHeaderName(), assertionResult.assertion);

  const contentType = request.headers.get('content-type');
  const accept = request.headers.get('accept');
  const acceptLanguage = request.headers.get('accept-language');
  if (contentType) headers.set('content-type', contentType);
  if (accept) headers.set('accept', accept);
  if (acceptLanguage) headers.set('accept-language', acceptLanguage);

  const bodyInit = askCoreProxyBodyInit(request);

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
export const PATCH = (request: NextRequest, context: RouteContext) =>
  forwardBillingRequest(request, context);
export const DELETE = (request: NextRequest, context: RouteContext) =>
  forwardBillingRequest(request, context);
export const OPTIONS = (request: NextRequest, context: RouteContext) =>
  forwardBillingRequest(request, context);

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
