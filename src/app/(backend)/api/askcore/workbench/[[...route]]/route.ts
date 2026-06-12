import { type NextRequest, NextResponse } from 'next/server';

import {
  type AskCoreAssertionSessionRecord,
  askCoreAssertionHeaderName,
  buildWorkbenchAssertion,
  getAskCoreAssertionAuthApi,
  isAllowedAskCoreSameOriginWrite,
  resolveFullOrganizationForHeaders,
  resolveWorkbenchPrincipalClaims,
} from '@/server/services/askcoreAssertion';

type RouteContext = {
  params: Promise<{
    route?: string[];
  }>;
};

type AskCoreWorkbenchRouteTestGlobal = typeof globalThis & {
  __ASKCORE_WORKBENCH_ROUTE_BOOTSTRAP_ORGANIZATION__?: (
    session: AskCoreAssertionSessionRecord,
  ) => Promise<AskCoreAssertionSessionRecord | undefined>;
};

const DEFAULT_API_BASE_URL = 'http://api:8000';
const ASKCORE_WORKBENCH_PLUGIN_ID = 'aitutor-suite';
const ALLOWED_METHODS = ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'];

const jsonError = (status: number, detail: string) => NextResponse.json({ detail }, { status });

const htmlError = (status: number, title: string, detail: string) =>
  new NextResponse(`<html><body><h1>${title}</h1><p>${detail}</p></body></html>`, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
    status,
  });

const recordValue = (value: unknown): AskCoreAssertionSessionRecord | undefined =>
  value && typeof value === 'object' ? (value as AskCoreAssertionSessionRecord) : undefined;

const bootstrapOrganizationForSession = async (session: AskCoreAssertionSessionRecord) => {
  const testBootstrap = (globalThis as AskCoreWorkbenchRouteTestGlobal)
    .__ASKCORE_WORKBENCH_ROUTE_BOOTSTRAP_ORGANIZATION__;
  if (testBootstrap) return testBootstrap(session);

  const { AskCoreOrganizationService } = await import('@/server/services/askcoreOrganization');
  const payload = await new AskCoreOrganizationService().bootstrap(session);
  const current = recordValue(payload.current);
  if (!current) return undefined;
  return {
    ...current,
    members: Array.isArray(payload.members) ? payload.members : [],
  };
};

export const buildWorkbenchAuthorityUrl = (request: NextRequest, route: string[]) => {
  const baseUrl =
    process.env.AITUTOR_API_BASE_URL?.trim() ||
    process.env.WORKBENCH_API_BASE_URL?.trim() ||
    DEFAULT_API_BASE_URL;
  const [surface, ...rest] = route;
  const safeRestPath = rest.map((segment) => encodeURIComponent(segment)).join('/');
  const safeUiPath = route.map((segment) => encodeURIComponent(segment)).join('/');

  let pathname: string;
  if (surface === 'actions' && rest.length > 0) {
    pathname = `/api/lobe/plugins/v1/${ASKCORE_WORKBENCH_PLUGIN_ID}/actions/${safeRestPath}`;
  } else if (surface === 'invocations' && rest.length > 0) {
    pathname = `/api/lobe/plugins/v1/invocations/${safeRestPath}`;
  } else if (surface === 'artifacts' && rest.length > 0) {
    pathname = `/api/lobe/plugins/v1/artifacts/${safeRestPath}`;
  } else {
    pathname = `/api/lobe/plugins/v1/${ASKCORE_WORKBENCH_PLUGIN_ID}/ui/${safeUiPath}`;
  }

  const target = new URL(pathname, baseUrl);
  target.search = request.nextUrl.search;
  return target;
};

const isDeviceAgentLinkRoute = (route: string[]) =>
  route[0] === 'device-agent' && route[1] === 'link' && route[2] === 'start';

const forwardWorkbenchRequest = async (request: NextRequest, context: RouteContext) => {
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
  if (!isAllowedAskCoreSameOriginWrite(request)) {
    return jsonError(403, 'Cross-origin workbench writes are not allowed');
  }

  const authApi = await getAskCoreAssertionAuthApi();
  const session = await authApi.getSession({ headers: request.headers });
  const { route = [] } = await context.params;
  let fullOrganization = session
    ? await resolveFullOrganizationForHeaders(request.headers, session)
    : undefined;
  if (!fullOrganization && session && isDeviceAgentLinkRoute(route)) {
    fullOrganization = await bootstrapOrganizationForSession(session).catch(() => undefined);
  }
  const claims = session ? resolveWorkbenchPrincipalClaims(session, fullOrganization) : null;
  if (!claims) return jsonError(401, 'LobeHub session is required for workbench');
  if (isDeviceAgentLinkRoute(route) && !claims.active_org_id) {
    return htmlError(
      409,
      'AskCore device binding needs an active organization',
      'Open AskCore organization settings once, then return to the device assistant and retry binding.',
    );
  }

  let assertion: string;
  try {
    assertion = await buildWorkbenchAssertion(claims);
  } catch (error) {
    return jsonError(
      error instanceof Error && error.message ? 503 : 500,
      'Workbench assertion is unavailable',
    );
  }

  const target = buildWorkbenchAuthorityUrl(request, route);
  const headers = new Headers();
  headers.set(askCoreAssertionHeaderName(), assertion);

  const contentType = request.headers.get('content-type');
  const accept = request.headers.get('accept');
  const acceptLanguage = request.headers.get('accept-language');
  if (contentType) headers.set('content-type', contentType);
  if (accept) headers.set('accept', accept);
  if (acceptLanguage) headers.set('accept-language', acceptLanguage);

  const body =
    request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.arrayBuffer();

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      body,
      cache: 'no-store',
      headers,
      method: request.method,
    });
  } catch {
    return jsonError(502, 'Workbench authority is unavailable');
  }

  const responseHeaders = new Headers();
  const responseContentType = upstream.headers.get('content-type');
  const contentDisposition = upstream.headers.get('content-disposition');
  if (responseContentType) responseHeaders.set('content-type', responseContentType);
  if (contentDisposition) responseHeaders.set('content-disposition', contentDisposition);

  return new NextResponse(upstream.body, {
    headers: responseHeaders,
    status: upstream.status,
    statusText: upstream.statusText,
  });
};

export const GET = (request: NextRequest, context: RouteContext) =>
  forwardWorkbenchRequest(request, context);
export const POST = (request: NextRequest, context: RouteContext) =>
  forwardWorkbenchRequest(request, context);
export const PATCH = (request: NextRequest, context: RouteContext) =>
  forwardWorkbenchRequest(request, context);
export const DELETE = (request: NextRequest, context: RouteContext) =>
  forwardWorkbenchRequest(request, context);
export const OPTIONS = (request: NextRequest, context: RouteContext) =>
  forwardWorkbenchRequest(request, context);

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
