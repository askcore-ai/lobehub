import { type NextRequest, NextResponse } from 'next/server';

import {
  askCoreAssertionHeaderName,
  askCoreProxyBodyInit,
  buildWorkbenchAssertion,
  getAskCoreAssertionAuthApi,
  isAllowedAskCoreSameOriginWrite,
  resolveAccountPrincipalClaims,
  resolveFullOrganizationForHeaders,
  resolveWorkbenchPrincipalClaims,
  validateAskCoreRouteSegments,
} from '@/server/services/askcoreAssertion';

type RouteContext = {
  params: Promise<{
    route?: string[];
  }>;
};

const DEFAULT_API_BASE_URL = 'http://api:8000';
const ALLOWED_METHODS = ['GET', 'POST', 'PATCH', 'OPTIONS'];
const PROTOCOL_COOKIE_NAMES = new Set(['askcore_lti_handoff', 'askcore_lti_processing']);

const isAllowedPublicProtocolRoute = (method: string, route: string[]) => {
  const path = route.join('/');
  if (method === 'GET') return path === 'jwks' || path === 'launch/login';
  if (method === 'POST') return path === 'launch/login' || path === 'launch';
  return false;
};

const isAllowedProcessingRoute = (method: string, route: string[]) => {
  const path = route.join('/');
  if (method === 'OPTIONS') return path.startsWith('processing/');
  if (method === 'GET') {
    return (
      path === 'processing/context' ||
      path === 'processing/current' ||
      path === 'processing/current/report/preview' ||
      path === 'processing/capture/scanners' ||
      /^processing\/capture\/jobs\/[\w.~-]+$/.test(path) ||
      /^processing\/current\/inputs\/[\w.~-]+\/preview$/.test(path)
    );
  }
  if (method === 'PATCH') return path === 'processing/current/result';
  if (method === 'POST') {
    return (
      path === 'processing/current/report' ||
      path === 'processing/capture/jobs' ||
      /^processing\/capture\/jobs\/[\w.~-]+\/(?:continue|cancel)$/.test(path)
    );
  }
  return false;
};

const isAllowedIdentityLinkReadRoute = (method: string, route: string[]) =>
  method === 'GET' && route.join('/') === 'identity-links/account-subject';

const isAllowedIdentityLinkWriteRoute = (method: string, route: string[]) =>
  method === 'POST' && route.join('/') === 'identity-links/accept';

const jsonError = (status: number, detail: string) => NextResponse.json({ detail }, { status });

const protocolCookies = (request: NextRequest) =>
  request.cookies
    .getAll()
    .filter((cookie) => PROTOCOL_COOKIE_NAMES.has(cookie.name))
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join('; ');

const upstreamSetCookies = (headers: Headers) => {
  const values =
    'getSetCookie' in headers && typeof headers.getSetCookie === 'function'
      ? headers.getSetCookie()
      : [headers.get('set-cookie') || ''];
  return values.filter((value) => {
    const name = value.split('=', 1)[0]?.trim();
    return Boolean(name && PROTOCOL_COOKIE_NAMES.has(name));
  });
};

export const buildProtocolAuthorityUrl = (request: NextRequest, route: string[]) => {
  const baseUrl =
    process.env.AITUTOR_API_BASE_URL?.trim() ||
    process.env.WORKBENCH_API_BASE_URL?.trim() ||
    DEFAULT_API_BASE_URL;
  const path = route.map((segment) => encodeURIComponent(segment)).join('/');
  const target = new URL(`/api/lti/v1/${path}`, baseUrl);
  target.search = request.nextUrl.search;
  return target;
};

const forwardProtocolRequest = async (request: NextRequest, context: RouteContext) => {
  if (!ALLOWED_METHODS.includes(request.method)) {
    return new NextResponse(null, {
      headers: { Allow: ALLOWED_METHODS.join(', ') },
      status: 405,
    });
  }
  const { route = [] } = await context.params;
  const processingRoute = isAllowedProcessingRoute(request.method, route);
  const identityLinkReadRoute = isAllowedIdentityLinkReadRoute(request.method, route);
  const identityLinkWriteRoute = isAllowedIdentityLinkWriteRoute(request.method, route);
  const identityLinkRoute = identityLinkReadRoute || identityLinkWriteRoute;
  const publicRoute = isAllowedPublicProtocolRoute(request.method, route);
  if (
    !route.length ||
    !validateAskCoreRouteSegments(route) ||
    (!processingRoute && !identityLinkRoute && !publicRoute)
  ) {
    return jsonError(404, 'AskCore protocol route is unavailable');
  }
  if (request.method === 'OPTIONS') {
    return new NextResponse(null, {
      headers: { Allow: ALLOWED_METHODS.join(', ') },
      status: 204,
    });
  }
  const privateRoute = processingRoute || identityLinkRoute;
  if ((processingRoute || identityLinkWriteRoute) && !isAllowedAskCoreSameOriginWrite(request)) {
    return jsonError(403, 'Cross-origin protocol writes are not allowed');
  }

  const headers = new Headers();
  for (const name of ['accept', 'accept-language', 'content-type']) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (privateRoute) {
    const authApi = await getAskCoreAssertionAuthApi();
    const session = await authApi.getSession({ headers: request.headers });
    if (!session) return jsonError(401, 'AskCore session is required');
    const fullOrganization = identityLinkWriteRoute
      ? await resolveFullOrganizationForHeaders(request.headers, session)
      : undefined;
    const claims =
      processingRoute || identityLinkReadRoute
        ? resolveAccountPrincipalClaims(session)
        : resolveWorkbenchPrincipalClaims(session, fullOrganization);
    if (!claims) return jsonError(401, 'AskCore session is required');

    let assertion: string;
    try {
      assertion = await buildWorkbenchAssertion(claims);
    } catch {
      return jsonError(503, 'AskCore assertion is unavailable');
    }
    headers.set(askCoreAssertionHeaderName(), assertion);
    if (processingRoute) {
      const cookie = protocolCookies(request);
      if (cookie) headers.set('cookie', cookie);
    }
  }

  let upstream: Response;
  try {
    upstream = await fetch(buildProtocolAuthorityUrl(request, route), {
      ...askCoreProxyBodyInit(request),
      cache: 'no-store',
      headers,
      method: request.method,
      redirect: 'manual',
    });
  } catch {
    return jsonError(502, 'Protocol authority is unavailable');
  }

  const responseHeaders = new Headers();
  for (const name of ['content-disposition', 'content-type', 'location']) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  for (const value of upstreamSetCookies(upstream.headers)) {
    responseHeaders.append('set-cookie', value);
  }
  return new NextResponse(upstream.body, {
    headers: responseHeaders,
    status: upstream.status,
    statusText: upstream.statusText,
  });
};

export const GET = (request: NextRequest, context: RouteContext) =>
  forwardProtocolRequest(request, context);
export const POST = (request: NextRequest, context: RouteContext) =>
  forwardProtocolRequest(request, context);
export const PATCH = (request: NextRequest, context: RouteContext) =>
  forwardProtocolRequest(request, context);
export const OPTIONS = (request: NextRequest, context: RouteContext) =>
  forwardProtocolRequest(request, context);

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
