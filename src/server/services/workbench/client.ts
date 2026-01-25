import { SignJWT } from 'jose';

import { enableBetterAuth } from '@/envs/auth';

const WORKBENCH_ADMIN_TENANT_COOKIE = 'workbench_admin_tenant_id';

type WorkbenchIdentity = {
  orgId: string;
  orgName?: string;
  roles: string[];
  userId: string;
};

const DEFAULT_BACKEND_BASE_URL = 'http://127.0.0.1:18000';
const DEFAULT_TOKEN_TTL_SECONDS = 5 * 60;

const getBackendBaseUrl = (): string =>
  (
    process.env.AITUTOR_API_BASE_URL ||
    process.env.WORKBENCH_API_BASE_URL ||
    DEFAULT_BACKEND_BASE_URL
  ).replace(/\/$/, '');

const requireTokenSecret = (): string => {
  const secret = (process.env.WORKBENCH_IDENTITY_TOKEN_SECRET || '').trim();
  if (!secret) throw new Error('Workbench identity token is not configured');
  return secret;
};

const firstNonEmptyString = (...values: unknown[]): string | undefined => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
};

const resolveWorkbenchIdentity = (session: any): WorkbenchIdentity => {
  const userId = firstNonEmptyString(session?.user?.id);
  if (!userId) throw new Error('Not authenticated');

  // Prefer a true org/team identifier if Better Auth provides one; fallback to user-scoped tenancy.
  const orgId =
    firstNonEmptyString(
      session?.organization?.id,
      session?.organizationId,
      session?.session?.organizationId,
      session?.session?.activeOrganizationId,
      session?.user?.organizationId,
      session?.user?.orgId,
      session?.user?.organization?.id,
    ) || userId;

  const orgName = firstNonEmptyString(
    session?.organization?.name,
    session?.session?.organizationName,
    session?.user?.organizationName,
    session?.user?.organization?.name,
  );

  const rolesFromSession = Array.isArray(session?.user?.roles)
    ? session.user.roles.filter((r: unknown) => typeof r === 'string' && r.trim())
    : [];
  const roleFromSession = typeof session?.user?.role === 'string' ? session.user.role.trim() : '';

  const roles = Array.from(
    new Set(
      [...rolesFromSession, roleFromSession].some(Boolean)
        ? [...rolesFromSession, roleFromSession].filter(Boolean)
        : ['workbench_user'],
    ),
  );
  if (!roles.includes('workbench_user')) roles.push('workbench_user');

  return { orgId, orgName, roles, userId };
};

export const mintWorkbenchIdentityToken = async (requestHeaders: Headers): Promise<string> => {
  if (!enableBetterAuth) throw new Error('Better Auth is disabled');

  const { auth } = await import('@/auth');
  const session = await auth.api.getSession({ headers: requestHeaders });

  const { orgId, orgName, roles, userId } = resolveWorkbenchIdentity(session);
  const secret = new TextEncoder().encode(requireTokenSecret());
  const now = Math.floor(Date.now() / 1000);

  return new SignJWT({
    org_id: orgId,
    ...(orgName ? { org_name: orgName } : {}),
    roles,
    user_id: userId,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt(now)
    .setExpirationTime(now + DEFAULT_TOKEN_TTL_SECONDS)
    .setSubject(userId)
    .sign(secret);
};

const getWorkbenchAuthContext = async (
  requestHeaders: Headers,
): Promise<{ identity: WorkbenchIdentity; token: string }> => {
  if (!enableBetterAuth) throw new Error('Better Auth is disabled');

  const { auth } = await import('@/auth');
  const session = await auth.api.getSession({ headers: requestHeaders });

  const identity = resolveWorkbenchIdentity(session);
  const secret = new TextEncoder().encode(requireTokenSecret());
  const now = Math.floor(Date.now() / 1000);

  const token = await new SignJWT({
    org_id: identity.orgId,
    ...(identity.orgName ? { org_name: identity.orgName } : {}),
    roles: identity.roles,
    user_id: identity.userId,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt(now)
    .setExpirationTime(now + DEFAULT_TOKEN_TTL_SECONDS)
    .setSubject(identity.userId)
    .sign(secret);

  return { identity, token };
};

const parseCookieValue = (cookieHeader: string | null, name: string): string | undefined => {
  if (!cookieHeader) return;

  const parts = cookieHeader.split(';').map((part) => part.trim());
  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const key = part.slice(0, eq);
    if (key !== name) continue;
    return decodeURIComponent(part.slice(eq + 1));
  }
};

const maybeApplySystemAdminTenantFilter = (
  url: URL,
  identity: WorkbenchIdentity,
  request: Request,
  method: string,
): void => {
  if (method.toUpperCase() !== 'GET') return;
  if (!identity.roles.includes('system_admin')) return;
  if (url.pathname !== '/workbench/runs') return;
  if (url.searchParams.has('tenant_id')) return;

  const raw = parseCookieValue(request.headers.get('cookie'), WORKBENCH_ADMIN_TENANT_COOKIE);
  const parsed = raw ? Number(raw) : Number.NaN;
  if (!Number.isFinite(parsed)) return;

  url.searchParams.set('tenant_id', String(parsed));
};

export const proxyWorkbenchRequest = async (
  request: Request,
  backendPathWithSearch: string,
  options: {
    body?: unknown;
    forwardHeaders?: string[];
    method: string;
  },
): Promise<Response> => {
  const baseUrl = getBackendBaseUrl();
  const url = new URL(backendPathWithSearch, baseUrl);

  let token: string;
  let identity: WorkbenchIdentity | undefined;
  try {
    const ctx = await getWorkbenchAuthContext(request.headers);
    token = ctx.token;
    identity = ctx.identity;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unauthorized';
    const status = message === 'Not authenticated' ? 401 : 503;
    return new Response(JSON.stringify({ error: message }), {
      headers: { 'Content-Type': 'application/json' },
      status,
    });
  }

  if (identity) maybeApplySystemAdminTenantFilter(url, identity, request, options.method);

  const headers = new Headers();
  headers.set('Authorization', `Bearer ${token}`);

  // Forward selected request headers for idempotency + SSE resume.
  for (const headerName of options.forwardHeaders || []) {
    const value = request.headers.get(headerName);
    if (value) headers.set(headerName, value);
  }

  const accept = request.headers.get('Accept');
  if (accept) headers.set('Accept', accept);

  // eslint-disable-next-line no-undef
  const init: RequestInit = {
    cache: 'no-store',
    headers,
    method: options.method,
  };

  if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
    init.body = JSON.stringify(options.body);
  }

  try {
    return await fetch(url, init);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Workbench backend request failed';
    return new Response(JSON.stringify({ error: message }), {
      headers: { 'Content-Type': 'application/json' },
      status: 502,
    });
  }
};
