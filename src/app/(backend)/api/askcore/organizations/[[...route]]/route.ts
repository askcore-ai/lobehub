import { type NextRequest, NextResponse } from 'next/server';

import {
  askCoreInvitePublicOrigin,
  isAllowedAskCoreSameOriginWrite,
  validateAskCoreRouteSegments,
} from '@/server/services/askcoreAssertion';
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
  createDirectoryInvite: (
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
    | ((
        origin: string,
      ) => AskCoreOrganizationRouteService | Promise<AskCoreOrganizationRouteService>);
};

const ALLOWED_METHODS = ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'];
const MAX_ORGANIZATION_JSON_BODY_BYTES = 64 * 1024;

const jsonError = (status: number, detail: string) => NextResponse.json({ detail }, { status });

class AskCoreOrganizationBodyError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'AskCoreOrganizationBodyError';
    this.status = status;
  }
}

const oversizedBodyError = () =>
  new AskCoreOrganizationBodyError(
    413,
    `Organization request body exceeds ${MAX_ORGANIZATION_JSON_BODY_BYTES} bytes`,
  );

const readRequestText = async (request: NextRequest) => {
  const contentLength = Number(request.headers.get('content-length') || '');
  if (Number.isFinite(contentLength) && contentLength > MAX_ORGANIZATION_JSON_BODY_BYTES) {
    throw oversizedBodyError();
  }
  if (!request.body) return '';

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_ORGANIZATION_JSON_BODY_BYTES) {
      throw oversizedBodyError();
    }
    text += decoder.decode(value, { stream: true });
  }

  return text + decoder.decode();
};

const readJsonBody = async (request: NextRequest): Promise<Record<string, unknown>> => {
  try {
    const rawBody = await readRequestText(request);
    if (!rawBody.trim()) return {};
    const payload = JSON.parse(rawBody);
    return payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  } catch (error) {
    if (error instanceof AskCoreOrganizationBodyError) throw error;
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
  if (
    !['AskCoreOrganizationBodyError', 'AskCoreOrganizationError'].includes(String(maybe.name)) ||
    typeof maybe.status !== 'number'
  )
    return undefined;
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
  const { route = [] } = await context.params;
  if (!validateAskCoreRouteSegments(route)) {
    return jsonError(400, 'Invalid AskCore route segment');
  }
  if (!isAllowedAskCoreSameOriginWrite(request)) {
    return jsonError(403, 'Cross-origin organization writes are not allowed');
  }

  const session = await getSession(request);
  if (!session) return jsonError(401, 'LobeHub session is required');

  const service = await getOrganizationService(askCoreInvitePublicOrigin(request));

  try {
    if (route.length === 0) {
      if (request.method === 'GET') return NextResponse.json(await service.list(session));
      if (request.method === 'POST') {
        return NextResponse.json(
          await service.createOrganization(session, await readJsonBody(request)),
        );
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
      return NextResponse.json(
        await service.updateOrganization(session, segment, await readJsonBody(request)),
      );
    }

    if (route.length === 2 && subresource === 'members' && request.method === 'GET') {
      return NextResponse.json({ members: await service.listMembers(session, segment) });
    }

    if (route.length === 2 && subresource === 'invites' && request.method === 'POST') {
      return NextResponse.json(
        await service.createInvite(session, segment, await readJsonBody(request)),
      );
    }

    if (route.length === 2 && subresource === 'directory-invites' && request.method === 'POST') {
      return NextResponse.json(
        await service.createDirectoryInvite(session, segment, await readJsonBody(request)),
      );
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
