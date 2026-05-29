import { type NextRequest, NextResponse } from 'next/server';

import type {
  AskCoreOrganizationRole,
  AskCoreSessionRecord,
} from '@/server/services/askcoreOrganization';

type RouteContext = {
  params: Promise<{
    route?: string[];
  }>;
};

type AskCoreOrganizationRouteAuth = {
  api: {
    getSession: (input: { headers: Headers }) => Promise<AskCoreSessionRecord | null>;
  };
};

type AskCoreOrganizationRouteService = {
  bootstrap: (session: AskCoreSessionRecord, inviteToken?: string) => Promise<unknown>;
  createInvite: (
    session: AskCoreSessionRecord,
    organizationId: string,
    payload: Record<string, unknown>,
  ) => Promise<unknown>;
  createOrganization: (
    session: AskCoreSessionRecord,
    payload: Record<string, unknown>,
  ) => Promise<unknown>;
  list: (session: AskCoreSessionRecord) => Promise<unknown>;
  listMembers: (session: AskCoreSessionRecord, organizationId: string) => Promise<unknown>;
  removeMember: (
    session: AskCoreSessionRecord,
    organizationId: string,
    memberId: string,
  ) => Promise<unknown>;
  setActive: (session: AskCoreSessionRecord, organizationId: string) => Promise<unknown>;
  updateMemberRole: (
    session: AskCoreSessionRecord,
    organizationId: string,
    memberId: string,
    role: AskCoreOrganizationRole,
  ) => Promise<unknown>;
  updateOrganization: (
    session: AskCoreSessionRecord,
    organizationId: string,
    payload: Record<string, unknown>,
  ) => Promise<unknown>;
};

type AskCoreOrganizationRouteTestGlobal = typeof globalThis & {
  __ASKCORE_ORGANIZATION_ROUTE_AUTH__?: AskCoreOrganizationRouteAuth;
  __ASKCORE_ORGANIZATION_ROUTE_SERVICE__?:
    | AskCoreOrganizationRouteService
    | ((origin: string) => AskCoreOrganizationRouteService | Promise<AskCoreOrganizationRouteService>);
};

const ALLOWED_METHODS = ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'];
const FALLBACK_PUBLIC_ORIGIN = 'https://askcore.cn';
const LOCAL_BIND_HOSTS = new Set([
  '0.0.0.0',
  '::',
  '[::]',
  '127.0.0.1',
  'localhost',
  '::1',
  '[::1]',
]);

const jsonError = (status: number, detail: string) => NextResponse.json({ detail }, { status });

const firstHeaderValue = (value: string | null | undefined) => value?.split(',')[0]?.trim();

const isLocalBindHostname = (hostname: string) => {
  const normalized = hostname.toLowerCase();
  return LOCAL_BIND_HOSTS.has(normalized) || normalized.startsWith('127.');
};

const normalizePublicOrigin = (value: string | null | undefined) => {
  const candidate = firstHeaderValue(value);
  if (!candidate) return undefined;

  try {
    const url = new URL(candidate);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
    if (isLocalBindHostname(url.hostname)) return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
};

const originFromForwardedHost = (
  host: string | null | undefined,
  proto: string | null | undefined,
) => {
  const forwardedHost = firstHeaderValue(host);
  if (!forwardedHost) return undefined;
  const protocol = firstHeaderValue(proto) || 'https';
  return normalizePublicOrigin(`${protocol}://${forwardedHost}`);
};

const publicRequestOrigin = (request: NextRequest) =>
  normalizePublicOrigin(process.env.APP_URL) ??
  originFromForwardedHost(
    request.headers.get('x-forwarded-host'),
    request.headers.get('x-forwarded-proto'),
  ) ??
  originFromForwardedHost(request.headers.get('host'), request.headers.get('x-forwarded-proto')) ??
  normalizePublicOrigin(request.nextUrl.origin);

const invitePublicOrigin = (request: NextRequest) =>
  publicRequestOrigin(request) ??
  normalizePublicOrigin(request.headers.get('origin')) ??
  FALLBACK_PUBLIC_ORIGIN;

const isAllowedSameOriginWrite = (request: NextRequest) => {
  if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS') {
    return true;
  }

  const origin = request.headers.get('origin');
  if (!origin) return true;

  const requestOrigin = request.nextUrl.origin;
  const appOrigin = process.env.APP_URL ? new URL(process.env.APP_URL).origin : requestOrigin;
  const publicOrigin = publicRequestOrigin(request) ?? FALLBACK_PUBLIC_ORIGIN;
  return origin === requestOrigin || origin === appOrigin || origin === publicOrigin;
};

const readJsonBody = async (request: NextRequest): Promise<Record<string, unknown>> => {
  try {
    const payload = await request.json();
    return payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

const toString = (value: unknown) => (typeof value === 'string' ? value : undefined);

const getSession = async (request: NextRequest) => {
  const testAuth = (globalThis as AskCoreOrganizationRouteTestGlobal)
    .__ASKCORE_ORGANIZATION_ROUTE_AUTH__;
  if (testAuth) return testAuth.api.getSession({ headers: request.headers });

  const { auth } = await import('@/auth');
  return auth.api.getSession({ headers: request.headers }) as Promise<AskCoreSessionRecord | null>;
};

const getOrganizationService = async (origin: string) => {
  const testService = (globalThis as AskCoreOrganizationRouteTestGlobal)
    .__ASKCORE_ORGANIZATION_ROUTE_SERVICE__;
  if (typeof testService === 'function') return testService(origin);
  if (testService) return testService;

  const { AskCoreOrganizationService } = await import('@/server/services/askcoreOrganization');
  return new AskCoreOrganizationService({ origin });
};

const organizationError = (error: unknown): { message: string; status: number } | undefined => {
  if (!error || typeof error !== 'object') return undefined;
  const maybe = error as { message?: unknown; name?: unknown; status?: unknown };
  if (maybe.name !== 'AskCoreOrganizationError' || typeof maybe.status !== 'number') return undefined;
  return {
    message: typeof maybe.message === 'string' ? maybe.message : 'Organization service failed',
    status: maybe.status,
  };
};

const handleOrganizationRequest = async (request: NextRequest, context: RouteContext) => {
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
  if (!isAllowedSameOriginWrite(request)) {
    return jsonError(403, 'Cross-origin organization writes are not allowed');
  }

  const session = await getSession(request);
  if (!session) return jsonError(401, 'LobeHub session is required');

  const { route = [] } = await context.params;
  const service = await getOrganizationService(invitePublicOrigin(request));

  try {
    if (route.length === 0) {
      if (request.method === 'GET') return NextResponse.json(await service.list(session));
      if (request.method === 'POST') {
        return NextResponse.json(await service.createOrganization(session, await readJsonBody(request)));
      }
    }

    const [segment, subresource, entityId] = route;

    if (segment === 'bootstrap' && request.method === 'POST') {
      const body = await readJsonBody(request);
      return NextResponse.json(await service.bootstrap(session, toString(body.invite_token)));
    }

    if (segment === 'active' && request.method === 'POST') {
      const body = await readJsonBody(request);
      const id = toString(body.organization_id);
      if (!id) return jsonError(400, 'organization_id is required');
      return NextResponse.json(await service.setActive(session, id));
    }

    if (!segment) return jsonError(404, 'Organization route not found');

    if (route.length === 1 && request.method === 'PATCH') {
      return NextResponse.json(await service.updateOrganization(session, segment, await readJsonBody(request)));
    }

    if (route.length === 2 && subresource === 'members' && request.method === 'GET') {
      return NextResponse.json({ members: await service.listMembers(session, segment) });
    }

    if (route.length === 2 && subresource === 'invites' && request.method === 'POST') {
      return NextResponse.json(await service.createInvite(session, segment, await readJsonBody(request)));
    }

    if (segment && subresource === 'members' && entityId) {
      if (request.method === 'PATCH') {
        const body = await readJsonBody(request);
        return NextResponse.json({
          members: await service.updateMemberRole(
            session,
            segment,
            entityId,
            toString(body.role) as AskCoreOrganizationRole,
          ),
        });
      }
      if (request.method === 'DELETE') {
        return NextResponse.json({
          members: await service.removeMember(session, segment, entityId),
        });
      }
    }

    return jsonError(404, 'Organization route not found');
  } catch (error) {
    const known = organizationError(error);
    if (known) {
      return jsonError(known.status, known.message);
    }
    return jsonError(500, 'Organization service failed');
  }
};

export const GET = (request: NextRequest, context: RouteContext) =>
  handleOrganizationRequest(request, context);
export const POST = (request: NextRequest, context: RouteContext) =>
  handleOrganizationRequest(request, context);
export const PATCH = (request: NextRequest, context: RouteContext) =>
  handleOrganizationRequest(request, context);
export const DELETE = (request: NextRequest, context: RouteContext) =>
  handleOrganizationRequest(request, context);
export const OPTIONS = (request: NextRequest, context: RouteContext) =>
  handleOrganizationRequest(request, context);

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
