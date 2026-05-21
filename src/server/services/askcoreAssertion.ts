import { randomUUID } from 'node:crypto';

import { SignJWT } from 'jose';

type SessionRecord = Record<string, unknown>;
type GetFullOrganization = (input: {
  headers: Headers;
  query?: { membersLimit?: number; organizationId?: string };
}) => Promise<unknown>;
type ListOrganizations = (input: { headers: Headers }) => Promise<unknown>;
type GetSession = (input: { headers: Headers }) => Promise<SessionRecord | null>;
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
    session: SessionRecord,
  ) => Promise<string | undefined>;
};

const DEFAULT_ASSERTION_ISSUER = 'askcore-lobehub';
const DEFAULT_ASSERTION_AUDIENCE = 'aitutor-billing';
const DEFAULT_ASSERTION_HEADER = 'X-AskCore-Billing-Assertion';
const DEFAULT_ASSERTION_TTL_SECONDS = 120;

const stringValue = (value: unknown): string | undefined =>
  typeof value === 'string' && value ? value : undefined;

const recordValue = (value: unknown): SessionRecord | undefined =>
  value && typeof value === 'object' ? (value as SessionRecord) : undefined;

const arrayValue = (value: unknown): string[] | undefined =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && !!item)
    : undefined;

const getAuthApi = async (): Promise<AskCoreAssertionAuthApi> => {
  const testAuth = (globalThis as AskCoreAssertionTestGlobal).__ASKCORE_WORKBENCH_ROUTE_AUTH__;
  if (testAuth) return testAuth.api;

  const { auth } = await import('@/auth');
  return auth.api as typeof auth.api & AskCoreAssertionAuthApi;
};

const getPersistedActiveOrganizationId = async (session: SessionRecord) => {
  const testResolver = (globalThis as AskCoreAssertionTestGlobal)
    .__ASKCORE_WORKBENCH_ROUTE_PERSISTED_ACTIVE_ORG_ID__;
  if (testResolver) return testResolver(session);

  const { persistedActiveOrganizationIdFromSession } = await import(
    '@/server/services/askcoreOrganization'
  );
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

  const api = await getAuthApi();
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
  const api = await getAuthApi();
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
  const persistedActiveOrganizationId = await getPersistedActiveOrganizationId(session);
  const activeOrganizationId = persistedActiveOrganizationId ?? activeOrganizationIdFromSession(session);
  if (activeOrganizationId) {
    const fullOrganization = await getFullOrganization(headers, activeOrganizationId);
    if (fullOrganization) return fullOrganization;
  }

  const singleOrganization = await getSingleOrganization(headers);
  const singleOrganizationId = stringValue(singleOrganization?.id);
  if (!singleOrganizationId) return undefined;

  return (await getFullOrganization(headers, singleOrganizationId)) ?? singleOrganization;
};

export const resolveWorkbenchPrincipalClaims = (
  session: SessionRecord,
  fullOrganization?: SessionRecord,
) => {
  const user = recordValue(session.user);

  const userId = stringValue(user?.id);
  const email = stringValue(user?.email);
  if (!userId || !email) return null;

  const organization =
    fullOrganization ?? recordValue(session.organization) ?? recordValue(session.activeOrganization);
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
    scopes: ['plugin.invoke', 'plugin.read'],
    sub: userId,
  });
};

export const buildWorkbenchAssertion = async (claims: Record<string, unknown>) => {
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

export const buildWorkbenchAssertionForHeaders = async (headers: Headers) => {
  const authApi = await getAuthApi();
  const session = await authApi.getSession({ headers });
  const fullOrganization = session ? await resolveFullOrganization(headers, session) : undefined;
  const claims = session ? resolveWorkbenchPrincipalClaims(session, fullOrganization) : null;
  if (!claims) return null;

  return {
    assertion: await buildWorkbenchAssertion(claims),
    claims,
    headerName: process.env.ASKCORE_BILLING_ASSERTION_HEADER || DEFAULT_ASSERTION_HEADER,
  };
};
