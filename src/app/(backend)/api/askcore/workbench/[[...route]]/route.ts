import { type NextRequest, NextResponse } from 'next/server';

import {
  askCoreAssertionHeaderName,
  type AskCoreAssertionSessionRecord,
  askCoreProxyBodyInit,
  buildWorkbenchAssertion,
  getAskCoreAssertionAuthApi,
  isAllowedAskCoreSameOriginWrite,
  resolveFullOrganizationForHeaders,
  resolveWorkbenchPrincipalClaims,
  validateAskCoreRouteSegments,
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

const recordObject = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;

const stringFrom = (value: unknown) => {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || undefined;
};

const directoryMemberSummaries = (
  fullOrganization: AskCoreAssertionSessionRecord | undefined,
) => {
  const members = Array.isArray(fullOrganization?.members) ? fullOrganization.members : [];
  const summaries: Record<
    string,
    {
      email?: string | null;
      member_id: string;
      name?: string | null;
      organization_role?: string | null;
    }
  > = {};

  for (const rawMember of members) {
    const member = recordObject(rawMember);
    if (!member) continue;
    const user = recordObject(member.user);
    const userId = stringFrom(member.userId) ?? stringFrom(user?.id);
    const memberId = stringFrom(member.id) ?? stringFrom(member.memberId) ?? stringFrom(member.member_id);
    if (!userId || !memberId) continue;
    summaries[userId] = {
      email: stringFrom(member.email) ?? stringFrom(user?.email) ?? null,
      member_id: memberId,
      name: stringFrom(member.name) ?? stringFrom(user?.name) ?? null,
      organization_role: stringFrom(member.role) ?? null,
    };
  }

  return summaries;
};

const shouldDecorateDirectoryResponse = (request: NextRequest, route: string[]) =>
  request.method === 'GET' && route.length === 2 && route[0] === 'organization' && route[1] === 'directory';

const decorateDirectoryResponse = async (
  upstream: Response,
  fullOrganization: AskCoreAssertionSessionRecord | undefined,
) => {
  const contentType = upstream.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) return undefined;
  const payload = await upstream.clone().json().catch(() => undefined);
  if (!payload || typeof payload !== 'object') return undefined;
  return NextResponse.json(
    {
      ...(payload as Record<string, unknown>),
      member_summaries: {
        ...(payload as { member_summaries?: Record<string, unknown> }).member_summaries,
        ...directoryMemberSummaries(fullOrganization),
      },
    },
    { status: upstream.status, statusText: upstream.statusText },
  );
};

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
  const { route = [] } = await context.params;
  if (!validateAskCoreRouteSegments(route)) {
    return jsonError(400, 'Invalid AskCore route segment');
  }
  if (!isAllowedAskCoreSameOriginWrite(request)) {
    return jsonError(403, 'Cross-origin workbench writes are not allowed');
  }

  const authApi = await getAskCoreAssertionAuthApi();
  const session = await authApi.getSession({ headers: request.headers });
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
    return jsonError(502, 'Workbench authority is unavailable');
  }

  const responseHeaders = new Headers();
  const responseContentType = upstream.headers.get('content-type');
  const contentDisposition = upstream.headers.get('content-disposition');
  if (responseContentType) responseHeaders.set('content-type', responseContentType);
  if (contentDisposition) responseHeaders.set('content-disposition', contentDisposition);

  if (shouldDecorateDirectoryResponse(request, route)) {
    const decorated = await decorateDirectoryResponse(upstream, fullOrganization);
    if (decorated) {
      if (contentDisposition) decorated.headers.set('content-disposition', contentDisposition);
      return decorated;
    }
  }

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
