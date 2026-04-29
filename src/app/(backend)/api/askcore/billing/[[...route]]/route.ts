import { randomUUID } from 'node:crypto';

import { SignJWT } from 'jose';
import { type NextRequest, NextResponse } from 'next/server';

import { auth } from '@/auth';

type RouteContext = {
  params: Promise<{
    route?: string[];
  }>;
};

type SessionRecord = Record<string, unknown>;
type GetFullOrganization = (input: {
  headers: Headers;
  query?: { membersLimit?: number; organizationId?: string };
}) => Promise<unknown>;
type ListOrganizations = (input: { headers: Headers }) => Promise<unknown>;

const DEFAULT_API_BASE_URL = 'http://api:8000';
const DEFAULT_ASSERTION_ISSUER = 'askcore-lobehub';
const DEFAULT_ASSERTION_AUDIENCE = 'aitutor-billing';
const DEFAULT_ASSERTION_HEADER = 'X-AskCore-Billing-Assertion';
const DEFAULT_ASSERTION_TTL_SECONDS = 120;
const ALLOWED_METHODS = ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'];

const jsonError = (status: number, detail: string) => NextResponse.json({ detail }, { status });

const stringValue = (value: unknown): string | undefined =>
  typeof value === 'string' && value ? value : undefined;

const recordValue = (value: unknown): SessionRecord | undefined =>
  value && typeof value === 'object' ? (value as SessionRecord) : undefined;

const arrayValue = (value: unknown): string[] | undefined =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && !!item)
    : undefined;

const compactClaims = (claims: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(claims).filter(([, value]) => {
      if (value === undefined || value === null || value === '') return false;
      if (Array.isArray(value) && value.length === 0) return false;
      return true;
    }),
  );

const activeOrganizationIdFromSession = (session: SessionRecord) => {
  const sessionData = recordValue(session.session);
  const organization = recordValue(session.organization) ?? recordValue(session.activeOrganization);

  return (
    stringValue(sessionData?.activeOrganizationId) ??
    stringValue(sessionData?.active_organization_id) ??
    stringValue(session.activeOrganizationId) ??
    stringValue(session.active_organization_id) ??
    stringValue(organization?.id)
  );
};

const findFullOrganizationMember = (
  fullOrganization: SessionRecord | undefined,
  userId: string,
) => {
  const members = Array.isArray(fullOrganization?.members) ? fullOrganization.members : [];
  return members.map(recordValue).find((member) => stringValue(member?.userId) === userId);
};

const getFullOrganization = async (
  headers: Headers,
  organizationId: string | undefined,
): Promise<SessionRecord | undefined> => {
  if (!organizationId) return undefined;

  const api = auth.api as typeof auth.api & { getFullOrganization?: GetFullOrganization };
  if (!api.getFullOrganization) return undefined;

  try {
    return recordValue(
      await api.getFullOrganization({
        headers,
        query: { membersLimit: 100, organizationId },
      }),
    );
  } catch {
    return undefined;
  }
};

const getSingleOrganization = async (headers: Headers): Promise<SessionRecord | undefined> => {
  const api = auth.api as typeof auth.api & { listOrganizations?: ListOrganizations };
  if (!api.listOrganizations) return undefined;

  try {
    const organizations = await api.listOrganizations({ headers });
    if (!Array.isArray(organizations) || organizations.length !== 1) return undefined;
    return recordValue(organizations[0]);
  } catch {
    return undefined;
  }
};

const resolveFullOrganization = async (
  headers: Headers,
  session: SessionRecord,
): Promise<SessionRecord | undefined> => {
  const activeOrganizationId = activeOrganizationIdFromSession(session);
  if (activeOrganizationId) {
    const fullOrganization = await getFullOrganization(headers, activeOrganizationId);
    if (fullOrganization) return fullOrganization;
  }

  const singleOrganization = await getSingleOrganization(headers);
  const singleOrganizationId = stringValue(singleOrganization?.id);
  if (!singleOrganizationId) return undefined;

  return (await getFullOrganization(headers, singleOrganizationId)) ?? singleOrganization;
};

export const resolveBillingPrincipalClaims = (
  session: SessionRecord,
  fullOrganization?: SessionRecord,
) => {
  const user = recordValue(session.user);

  const userId = stringValue(user?.id);
  const email = stringValue(user?.email);
  if (!userId || !email) return null;

  const organization =
    fullOrganization ??
    recordValue(session.organization) ??
    recordValue(session.activeOrganization);
  const member =
    recordValue(session.member) ??
    recordValue(session.activeMember) ??
    findFullOrganizationMember(fullOrganization, userId);
  const activeOrgId = activeOrganizationIdFromSession(session) ?? stringValue(organization?.id);

  return compactClaims({
    active_org_id: activeOrgId,
    active_org_name: stringValue(organization?.name),
    email,
    is_super_admin: stringValue(user?.role) === 'super_admin',
    org_id: activeOrgId,
    organization_role:
      stringValue(member?.role) ??
      stringValue(session.organizationRole) ??
      stringValue(session.organization_role),
    permissions: arrayValue(session.permissions) ?? arrayValue(member?.permissions),
    roles: arrayValue(session.roles) ?? [stringValue(user?.role) || 'workbench_user'],
    sub: userId,
  });
};

export const buildBillingAssertion = async (claims: Record<string, unknown>) => {
  const secret = process.env.BILLING_LOBEHUB_ASSERTION_SECRET?.trim();
  if (!secret) throw new Error('BILLING_LOBEHUB_ASSERTION_SECRET is not configured');

  const issuer = process.env.ASKCORE_BILLING_ASSERTION_ISSUER || DEFAULT_ASSERTION_ISSUER;
  const audience = process.env.ASKCORE_BILLING_ASSERTION_AUDIENCE || DEFAULT_ASSERTION_AUDIENCE;
  const ttlSeconds = Number(
    process.env.ASKCORE_BILLING_ASSERTION_TTL_SECONDS || DEFAULT_ASSERTION_TTL_SECONDS,
  );
  const now = Math.floor(Date.now() / 1000);

  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt(now)
    .setIssuer(issuer)
    .setAudience(audience)
    .setExpirationTime(now + Math.max(1, Math.floor(ttlSeconds)))
    .setJti(randomUUID())
    .sign(new TextEncoder().encode(secret));
};

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

const isAllowedSameOriginWrite = (request: NextRequest) => {
  if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS') {
    return true;
  }

  const origin = request.headers.get('origin');
  if (!origin) return true;

  const requestOrigin = request.nextUrl.origin;
  const appOrigin = process.env.APP_URL ? new URL(process.env.APP_URL).origin : requestOrigin;
  return origin === requestOrigin || origin === appOrigin;
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
  if (!isAllowedSameOriginWrite(request)) {
    return jsonError(403, 'Cross-origin billing writes are not allowed');
  }

  const session = (await auth.api.getSession({ headers: request.headers })) as SessionRecord | null;
  const fullOrganization = session
    ? await resolveFullOrganization(request.headers, session)
    : undefined;
  const claims = session ? resolveBillingPrincipalClaims(session, fullOrganization) : null;
  if (!claims) return jsonError(401, 'LobeHub session is required for billing');

  let assertion: string;
  try {
    assertion = await buildBillingAssertion(claims);
  } catch (error) {
    return jsonError(
      error instanceof Error && error.message ? 503 : 500,
      'Billing assertion is unavailable',
    );
  }

  const { route = [] } = await context.params;
  const target = buildBillingAuthorityUrl(request, route);
  const headers = new Headers();
  const assertionHeader = process.env.ASKCORE_BILLING_ASSERTION_HEADER || DEFAULT_ASSERTION_HEADER;
  headers.set(assertionHeader, assertion);

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
