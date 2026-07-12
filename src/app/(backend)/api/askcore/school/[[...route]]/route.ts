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
const LAUNCH_TOKEN_PATTERN = /^[\w-]{40,4096}$/;

const jsonError = (status: number, detail: string) => NextResponse.json({ detail }, { status });

const isAllowedRoute = (method: string, route: string[]) => {
  if (method !== 'GET') return false;
  if (route.length === 1 && (route[0] === 'portal' || route[0] === 'operations')) return true;
  return route.length === 2 && route[0] === 'launch' && LAUNCH_TOKEN_PATTERN.test(route[1] || '');
};

const isFirstPartyRedirect = (value: string | null) => {
  if (!value) return false;
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    const isSchoolSourcePath =
      url.pathname.startsWith('/school/teaching/') || url.pathname.startsWith('/school/services/');
    const queryEntries = [...url.searchParams.entries()];
    const hasSafeQuery =
      queryEntries.length === 0 ||
      (queryEntries.length === 1 &&
        queryEntries[0][0] === 'destination' &&
        queryEntries[0][1] === '1');
    return (
      url.protocol === 'https:' &&
      (hostname === 'askcore.cn' || hostname.endsWith('.askcore.cn')) &&
      !url.username &&
      !url.password &&
      (!url.port || url.port === '443') &&
      isSchoolSourcePath &&
      hasSafeQuery &&
      !url.hash
    );
  } catch {
    return false;
  }
};

export const buildSchoolPortalAuthorityUrl = (route: string[]) => {
  const baseUrl =
    process.env.AITUTOR_API_BASE_URL?.trim() ||
    process.env.WORKBENCH_API_BASE_URL?.trim() ||
    DEFAULT_API_BASE_URL;
  return new URL(
    `/api/school/v1/${route.map((segment) => encodeURIComponent(segment)).join('/')}`,
    baseUrl,
  );
};

const forwardSchoolPortalRequest = async (request: NextRequest, context: RouteContext) => {
  const { route = [] } = await context.params;
  if (!isAllowedRoute(request.method, route) || !validateAskCoreRouteSegments(route.slice(0, 1))) {
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
  try {
    upstream = await fetch(buildSchoolPortalAuthorityUrl(route), {
      cache: 'no-store',
      headers: {
        accept: request.headers.get('accept') || 'application/json',
        [askCoreAssertionHeaderName()]: assertion,
      },
      method: 'GET',
      redirect: 'manual',
    });
  } catch {
    return jsonError(502, 'School portal is unavailable');
  }

  const location = upstream.headers.get('location');
  if (upstream.status >= 300 && upstream.status < 400 && !isFirstPartyRedirect(location)) {
    return jsonError(502, 'School destination is unavailable');
  }
  const headers = new Headers({ 'Cache-Control': 'private, no-store' });
  const contentType = upstream.headers.get('content-type');
  if (contentType) headers.set('content-type', contentType);
  if (location) headers.set('location', location);
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
