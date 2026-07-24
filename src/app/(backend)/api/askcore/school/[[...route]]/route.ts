import { type NextRequest, NextResponse } from 'next/server';

import {
  askCoreAssertionHeaderName,
  buildAskCoreAssertion,
  getAskCoreAssertionAuthApi,
  resolveAskCorePrincipalClaims,
  validateAskCoreRouteSegments,
} from '@/server/services/askcoreAssertion';

type RouteContext = {
  params: Promise<{
    route?: string[];
  }>;
};

const DEFAULT_API_BASE_URL = 'http://api:8000';
const UPSTREAM_TIMEOUT_MS = 8_000;

const jsonError = (status: number, detail: string) => NextResponse.json({ detail }, { status });

const isAllowedRoute = (method: string, route: string[]) => {
  if (method !== 'GET') return false;
  return route.length === 1 && (route[0] === 'portal' || route[0] === 'operations');
};

export const buildSchoolPortalAuthorityUrl = (route: string[]) => {
  const baseUrl =
    process.env.AITUTOR_API_BASE_URL?.trim() ||
    process.env.WORKBENCH_API_BASE_URL?.trim() ||
    DEFAULT_API_BASE_URL;
  const url = new URL(
    `/api/school/v1/${route.map((segment) => encodeURIComponent(segment)).join('/')}`,
    baseUrl,
  );
  return url;
};

const forwardSchoolPortalRequest = async (request: NextRequest, context: RouteContext) => {
  const { route = [] } = await context.params;
  if (!isAllowedRoute(request.method, route) || !validateAskCoreRouteSegments(route.slice(0, 1))) {
    return jsonError(404, 'School portal route is unavailable');
  }
  const queryEntries = [...request.nextUrl.searchParams.entries()];
  if (queryEntries.length > 0) {
    return jsonError(404, 'School portal route is unavailable');
  }

  const authApi = await getAskCoreAssertionAuthApi();
  const session = await authApi.getSession({ headers: request.headers });
  if (!session) return jsonError(401, 'AskCore session is required');
  const claims = resolveAskCorePrincipalClaims(session, undefined, { scopes: ['school.portal'] });
  if (!claims) return jsonError(401, 'AskCore session is required');

  let assertion: string;
  try {
    assertion = await buildAskCoreAssertion(claims);
  } catch {
    return jsonError(503, 'School portal assertion is unavailable');
  }

  let upstream: Response;
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new DOMException('School portal upstream timed out', 'TimeoutError')),
    UPSTREAM_TIMEOUT_MS,
  );
  try {
    upstream = await fetch(
      buildSchoolPortalAuthorityUrl(route),
      {
        cache: 'no-store',
        headers: {
          accept: request.headers.get('accept') || 'application/json',
          [askCoreAssertionHeaderName()]: assertion,
        },
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
      },
    );
  } catch {
    return jsonError(502, 'School portal is unavailable');
  } finally {
    clearTimeout(timer);
  }

  const headers = new Headers({ 'Cache-Control': 'private, no-store' });
  const contentType = upstream.headers.get('content-type');
  if (contentType) headers.set('content-type', contentType);
  return new NextResponse(upstream.body, {
    headers,
    status: upstream.status,
    statusText: upstream.statusText,
  });
};

export const GET = (request: NextRequest, context: RouteContext) =>
  forwardSchoolPortalRequest(request, context);
export const POST = () => jsonError(405, 'Method not allowed');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
