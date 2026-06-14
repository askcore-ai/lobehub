import { randomUUID } from 'node:crypto';

import { SignJWT } from 'jose';

export type AskCoreAssertionSessionRecord = Record<string, unknown>;
type GetFullOrganization = (input: {
  headers: Headers;
  query?: { membersLimit?: number; organizationId?: string };
}) => Promise<unknown>;
type ListOrganizations = (input: { headers: Headers }) => Promise<unknown>;
type GetSession = (input: { headers: Headers }) => Promise<AskCoreAssertionSessionRecord | null>;
type AskCoreAssertionAuthApi = {
  getFullOrganization?: GetFullOrganization;
  getSession: GetSession;
  listOrganizations?: ListOrganizations;
};
type AskCoreAssertionTestGlobal = typeof globalThis & {
  __ASKCORE_WORKBENCH_ROUTE_AUTH__?: {
    api: AskCoreAssertionAuthApi;
  };
  __ASKCORE_WORKBENCH_ROUTE_PERSISTED_ACTIVE_ORG_ID__?: (
    session: AskCoreAssertionSessionRecord,
  ) => Promise<string | undefined>;
};

const DEFAULT_ASSERTION_ISSUER = 'askcore-lobehub';
const DEFAULT_ASSERTION_AUDIENCE = 'aitutor-billing';
const DEFAULT_ASSERTION_HEADER = 'X-AskCore-Billing-Assertion';
const DEFAULT_ASSERTION_TTL_SECONDS = 120;
const FALLBACK_PUBLIC_ORIGIN = 'https://askcore.cn';
const ASKCORE_ROUTE_SEGMENT_PATTERN = /^[A-Z0-9][\w.:-]*$/i;
const LOCAL_BIND_HOSTS = new Set([
  '0.0.0.0',
  '::',
  '[::]',
  '127.0.0.1',
  'localhost',
  '::1',
  '[::1]',
]);

const stringValue = (value: unknown): string | undefined =>
  typeof value === 'string' && value ? value : undefined;

const recordValue = (value: unknown): AskCoreAssertionSessionRecord | undefined =>
  value && typeof value === 'object' ? (value as AskCoreAssertionSessionRecord) : undefined;

const arrayValue = (value: unknown): string[] | undefined =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && !!item)
    : undefined;

export const getAskCoreAssertionAuthApi = async (): Promise<AskCoreAssertionAuthApi> => {
  const testAuth = (globalThis as AskCoreAssertionTestGlobal).__ASKCORE_WORKBENCH_ROUTE_AUTH__;
  if (testAuth) return testAuth.api;

  const { auth } = await import('@/auth');
  return auth.api as typeof auth.api & AskCoreAssertionAuthApi;
};

const getPersistedActiveOrganizationId = async (session: AskCoreAssertionSessionRecord) => {
  const testResolver = (globalThis as AskCoreAssertionTestGlobal)
    .__ASKCORE_WORKBENCH_ROUTE_PERSISTED_ACTIVE_ORG_ID__;
  if (testResolver) return testResolver(session);

  const { persistedActiveOrganizationIdFromSession } =
    await import('@/server/services/askcoreOrganization');
  return persistedActiveOrganizationIdFromSession(session).catch(() => undefined);
};

const compactClaims = (claims: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(claims).filter(([, value]) => {
      if (value === undefined || value === null || value === '') return false;
      if (Array.isArray(value) && value.length === 0) return false;
      return true;
    }),
  );

export const askCoreAssertionHeaderName = () =>
  process.env.ASKCORE_BILLING_ASSERTION_HEADER || DEFAULT_ASSERTION_HEADER;

const firstHeaderValue = (value: string | null | undefined) => value?.split(',')[0]?.trim();

const hasControlCharacter = (value: string) =>
  [...value].some((char) => {
    const code = char.charCodeAt(0);
    return code < 32 || code === 127;
  });

const isValidAskCoreRouteSegment = (segment: string) => {
  if (!segment || segment.length > 128) return false;
  if (segment === '.' || segment === '..') return false;
  if (segment.includes('/') || segment.includes('\\')) return false;
  if (hasControlCharacter(segment)) return false;
  return ASKCORE_ROUTE_SEGMENT_PATTERN.test(segment);
};

export const validateAskCoreRouteSegments = (route: string[]) =>
  route.every((segment) => typeof segment === 'string' && isValidAskCoreRouteSegment(segment));

const isLocalBindHostname = (hostname: string) => {
  const normalized = hostname.toLowerCase();
  return LOCAL_BIND_HOSTS.has(normalized) || normalized.startsWith('127.');
};

export const normalizeAskCorePublicOrigin = (value: string | null | undefined) => {
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
  return normalizeAskCorePublicOrigin(`${protocol}://${forwardedHost}`);
};

type SameOriginRequest = {
  body?: ReadableStream<Uint8Array> | null;
  headers: Headers;
  method: string;
  nextUrl: {
    origin: string;
  };
};

type AskCoreProxyBodyInit = RequestInit & {
  duplex?: 'half';
};

export const askCorePublicRequestOrigin = (request: SameOriginRequest) =>
  normalizeAskCorePublicOrigin(process.env.APP_URL) ??
  originFromForwardedHost(
    request.headers.get('x-forwarded-host'),
    request.headers.get('x-forwarded-proto'),
  ) ??
  originFromForwardedHost(request.headers.get('host'), request.headers.get('x-forwarded-proto')) ??
  normalizeAskCorePublicOrigin(request.nextUrl.origin);

export const askCoreInvitePublicOrigin = (request: SameOriginRequest) =>
  askCorePublicRequestOrigin(request) ??
  normalizeAskCorePublicOrigin(request.headers.get('origin')) ??
  FALLBACK_PUBLIC_ORIGIN;

const trustedAskCoreWriteOrigins = (request: SameOriginRequest) => {
  const origins = new Set<string>([request.nextUrl.origin]);

  const appOrigin = normalizeAskCorePublicOrigin(process.env.APP_URL);
  if (appOrigin) origins.add(appOrigin);
  else origins.add(FALLBACK_PUBLIC_ORIGIN);

  return origins;
};

export const isAllowedAskCoreSameOriginWrite = (request: SameOriginRequest) => {
  if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS') {
    return true;
  }

  const origin = request.headers.get('origin');
  const fetchSite = request.headers.get('sec-fetch-site');
  if (!origin) return fetchSite !== 'cross-site';

  const requestOrigin = request.nextUrl.origin;
  const appOrigin = normalizeAskCorePublicOrigin(process.env.APP_URL) ?? requestOrigin;
  return (
    origin === requestOrigin ||
    origin === appOrigin ||
    trustedAskCoreWriteOrigins(request).has(origin)
  );
};

export const askCoreProxyBodyInit = (request: SameOriginRequest): AskCoreProxyBodyInit => {
  if (request.method === 'GET' || request.method === 'HEAD' || !request.body) return {};
  return {
    body: request.body,
    duplex: 'half',
  };
};

const activeOrganizationIdFromSession = (session: AskCoreAssertionSessionRecord) => {
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
  fullOrganization: AskCoreAssertionSessionRecord | undefined,
  userId: string,
) => {
  const members = Array.isArray(fullOrganization?.members) ? fullOrganization.members : [];
  return members.map(recordValue).find((member) => stringValue(member?.userId) === userId);
};

const getFullOrganization = async (
  headers: Headers,
  organizationId: string | undefined,
): Promise<AskCoreAssertionSessionRecord | undefined> => {
  if (!organizationId) return undefined;

  const api = await getAskCoreAssertionAuthApi();
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

const getSingleOrganization = async (
  headers: Headers,
): Promise<AskCoreAssertionSessionRecord | undefined> => {
  const api = await getAskCoreAssertionAuthApi();
  if (!api.listOrganizations) return undefined;

  try {
    const organizations = await api.listOrganizations({ headers });
    if (!Array.isArray(organizations) || organizations.length !== 1) return undefined;
    return recordValue(organizations[0]);
  } catch {
    return undefined;
  }
};

export const resolveFullOrganizationForHeaders = async (
  headers: Headers,
  session: AskCoreAssertionSessionRecord,
  options: { usePersistedActiveOrganization?: boolean } = {},
): Promise<AskCoreAssertionSessionRecord | undefined> => {
  const persistedActiveOrganizationId =
    options.usePersistedActiveOrganization === false
      ? undefined
      : await getPersistedActiveOrganizationId(session);
  const activeOrganizationId =
    persistedActiveOrganizationId ?? activeOrganizationIdFromSession(session);
  if (activeOrganizationId) {
    const fullOrganization = await getFullOrganization(headers, activeOrganizationId);
    if (fullOrganization) return fullOrganization;
  }

  const singleOrganization = await getSingleOrganization(headers);
  const singleOrganizationId = stringValue(singleOrganization?.id);
  if (!singleOrganizationId) return undefined;

  return (await getFullOrganization(headers, singleOrganizationId)) ?? singleOrganization;
};

export const resolveAskCorePrincipalClaims = (
  session: AskCoreAssertionSessionRecord,
  fullOrganization?: AskCoreAssertionSessionRecord,
  options: { scopes?: string[] } = {},
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
  const activeOrgId = stringValue(organization?.id) ?? activeOrganizationIdFromSession(session);

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
    scopes: options.scopes,
    sub: userId,
  });
};

export const resolveWorkbenchPrincipalClaims = (
  session: AskCoreAssertionSessionRecord,
  fullOrganization?: AskCoreAssertionSessionRecord,
) =>
  resolveAskCorePrincipalClaims(session, fullOrganization, {
    scopes: ['plugin.invoke', 'plugin.read'],
  });

export const buildAskCoreAssertion = async (claims: Record<string, unknown>) => {
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

export const buildWorkbenchAssertion = buildAskCoreAssertion;

export const buildAskCoreAssertionForHeaders = async (
  headers: Headers,
  options: { scopes?: string[]; usePersistedActiveOrganization?: boolean } = {},
) => {
  const authApi = await getAskCoreAssertionAuthApi();
  const session = await authApi.getSession({ headers });
  const fullOrganization = session
    ? await resolveFullOrganizationForHeaders(headers, session, {
        usePersistedActiveOrganization: options.usePersistedActiveOrganization,
      })
    : undefined;
  const claims = session ? resolveAskCorePrincipalClaims(session, fullOrganization, options) : null;
  if (!claims) return null;

  return {
    assertion: await buildAskCoreAssertion(claims),
    claims,
    headerName: askCoreAssertionHeaderName(),
  };
};

export const buildWorkbenchAssertionForHeaders = (headers: Headers) =>
  buildAskCoreAssertionForHeaders(headers, { scopes: ['plugin.invoke', 'plugin.read'] });
