import { buildAskCoreAssertion } from '@/server/services/askcoreAssertion';

const SCHOOL_SUBJECT_PATTERN = /^[\w.-]{8,40}$/;
const IDENTITY_LINK_VERSION_PATTERN = /^[a-f\d]{64}$/;
const CACHE_TTL_MS = 25_000;

export type SchoolIdentity = {
  identityLinkVersion: string;
  schoolSubject: string;
};

type CacheEntry = {
  expiresAt: number;
  value: Promise<SchoolIdentity>;
};

const identityCache = new Map<string, CacheEntry>();

const resolveUncached = async ({
  email,
  userId,
}: {
  email?: null | string;
  userId: string;
}): Promise<SchoolIdentity> => {
  const apiBaseUrl = process.env.AITUTOR_API_BASE_URL?.trim() || 'http://api:8000';
  const assertion = await buildAskCoreAssertion({
    email: email || undefined,
    scopes: ['school.identity.read'],
    sub: userId,
  });
  const endpoint = new URL('/api/lti/v1/identity-links/account-subject', apiBaseUrl);
  const response = await fetch(endpoint.toString(), {
    cache: 'no-store',
    headers: {
      'Accept': 'application/json',
      'X-AskCore-Billing-Assertion': assertion,
    },
    signal: AbortSignal.timeout(3000),
  });
  if (!response.ok) throw new Error(`school subject resolution failed (${response.status})`);
  const payload = (await response.json()) as {
    deployment_id?: number;
    identity_link_version?: string;
    school_subject?: string;
  };
  const schoolSubject = payload.school_subject?.trim() || '';
  const identityLinkVersion = payload.identity_link_version?.trim() || '';
  if (
    !Number.isSafeInteger(payload.deployment_id) ||
    Number(payload.deployment_id) < 1 ||
    !SCHOOL_SUBJECT_PATTERN.test(schoolSubject) ||
    !IDENTITY_LINK_VERSION_PATTERN.test(identityLinkVersion)
  ) {
    throw new Error('school subject resolution returned an invalid response');
  }
  return { identityLinkVersion, schoolSubject };
};

export const resolveSchoolIdentity = async (
  account: { email?: null | string; userId: string },
  nowMs = Date.now(),
) => {
  const existing = identityCache.get(account.userId);
  if (existing && existing.expiresAt > nowMs) return existing.value;

  const value = resolveUncached(account);
  identityCache.set(account.userId, { expiresAt: nowMs + CACHE_TTL_MS, value });
  try {
    return await value;
  } catch (error) {
    if (identityCache.get(account.userId)?.value === value) identityCache.delete(account.userId);
    throw error;
  }
};

export const clearSchoolIdentityCacheForTest = () => identityCache.clear();
