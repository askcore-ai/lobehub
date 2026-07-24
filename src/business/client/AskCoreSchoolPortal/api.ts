import {
  type SchoolBillingAdminSummary,
  type SchoolEligibleMember,
  type SchoolIntegrationOperations,
  type SchoolPortalManifest,
  type SchoolSourceProof,
  type SchoolSponsoredSeat,
  type SchoolSponsorshipSummary,
  type SchoolUsageSummary,
} from './types';

export const SCHOOL_PORTAL_API = '/api/askcore/school/portal';
export const SCHOOL_OPERATIONS_API = '/api/askcore/school/operations';
export const SCHOOL_BILLING_SOURCE_URL = '/school/services/askcore/billing.php';
export const SCHOOL_BILLING_SOURCE_PROOF_HEADER = 'X-AskCore-School-Source-Proof';
const SCHOOL_REQUEST_TIMEOUT_MS = 8_000;

type BetterAuthSchoolSession = {
  session?: { id?: string | null } | null;
  user?: { id?: string | null } | null;
};

type BetterAuthSchoolSessionState = {
  isPending?: boolean;
  isRefetching?: boolean;
};

export const schoolSessionGeneration = (session?: BetterAuthSchoolSession | null) => {
  const userId = session?.user?.id?.trim();
  const sessionId = session?.session?.id?.trim();
  return userId && sessionId ? `${userId}:${sessionId}` : undefined;
};

export const stableSchoolSessionGeneration = (
  session: BetterAuthSchoolSession | null | undefined,
  state: BetterAuthSchoolSessionState,
) => (state.isPending || state.isRefetching ? undefined : schoolSessionGeneration(session));

export const schoolPortalManifestCacheKey = (
  sessionGeneration: string | undefined,
  scope: string,
) => (sessionGeneration ? ([SCHOOL_PORTAL_API, sessionGeneration, scope] as const) : null);

const fetchSchoolResource = async (input: RequestInfo | URL, init: RequestInit) => {
  const controller = new AbortController();
  const timer = window.setTimeout(
    () => controller.abort(new DOMException('School request timed out', 'TimeoutError')),
    SCHOOL_REQUEST_TIMEOUT_MS,
  );
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
};

export type SchoolBillingTranslationKey =
  | 'schoolBilling.error.invalidSourceProof'
  | 'schoolBilling.error.serviceUnavailable'
  | 'schoolBilling.error.sourceProofUnavailable';

export class SchoolPortalApiError extends Error {
  status: number;
  translationKey?: SchoolBillingTranslationKey;

  constructor(status: number, message: string, translationKey?: SchoolBillingTranslationKey) {
    super(message);
    this.name = 'SchoolPortalApiError';
    this.status = status;
    this.translationKey = translationKey;
  }
}

const safeText = (value: unknown, maxLength: number): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= maxLength;

const hasExactKeys = (value: Record<string, unknown>, keys: string[]) => {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
};

const sanitizePortalManifest = (value: unknown): SchoolPortalManifest | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const portal = value as Record<string, unknown>;
  const state =
    portal.state === 'ready' || portal.state === 'unavailable' || portal.state === 'conflict'
      ? portal.state
      : undefined;
  if (
    portal.contract !== 'askcore.native-school-shell.v1' ||
    !state ||
    !hasExactKeys(portal, [
      'can_manage_integrations',
      'contract',
      'schools',
      'selection_required',
      'show_school_entry',
      'state',
    ]) ||
    !Array.isArray(portal.schools) ||
    typeof portal.can_manage_integrations !== 'boolean' ||
    portal.selection_required !== false ||
    portal.show_school_entry !== true
  ) {
    return undefined;
  }
  if (state !== 'ready') {
    if (portal.schools.length !== 0) return undefined;
    return {
      can_manage_integrations: portal.can_manage_integrations,
      contract: 'askcore.native-school-shell.v1',
      schools: [],
      selection_required: false,
      show_school_entry: true,
      state,
    };
  }
  if (portal.schools.length !== 1) return undefined;
  const school = portal.schools[0] as Record<string, unknown> | undefined;
  if (
    !school ||
    !hasExactKeys(school, ['key', 'name']) ||
    !safeText(school.key, 63) ||
    !safeText(school.name, 100)
  ) {
    return undefined;
  }
  return {
    can_manage_integrations: portal.can_manage_integrations,
    contract: 'askcore.native-school-shell.v1',
    schools: [{ key: school.key, name: school.name }],
    selection_required: false,
    show_school_entry: true,
    state: 'ready',
  };
};

export const fetchSchoolPortalManifest = async (): Promise<SchoolPortalManifest> => {
  const response = await fetchSchoolResource(SCHOOL_PORTAL_API, {
    cache: 'no-store',
    credentials: 'same-origin',
    headers: { accept: 'application/json' },
  });
  if (!response.ok) {
    throw new SchoolPortalApiError(response.status, '学校连接暂不可用');
  }
  const manifest = sanitizePortalManifest(await response.json());
  if (!manifest) {
    throw new SchoolPortalApiError(502, '学校连接响应无效');
  }
  return manifest;
};

export const fetchSchoolPortalManifestForGeneration = async (_sessionGeneration: string) =>
  fetchSchoolPortalManifest();

export const fetchSchoolIntegrationOperations = async (): Promise<SchoolIntegrationOperations> => {
  const response = await fetchSchoolResource(SCHOOL_OPERATIONS_API, {
    cache: 'no-store',
    credentials: 'same-origin',
    headers: { accept: 'application/json' },
  });
  if (!response.ok) {
    throw new SchoolPortalApiError(response.status, '集成状态暂不可用');
  }
  return response.json() as Promise<SchoolIntegrationOperations>;
};

const SCHOOL_SOURCE_PROOF_PATTERN = /^[\w-]+\.[\w-]+\.[\w-]+$/;

export const fetchSchoolBillingSourceProof = async ({
  schoolKey,
}: {
  schoolKey: string;
}): Promise<SchoolSourceProof> => {
  const response = await fetchSchoolResource(SCHOOL_BILLING_SOURCE_URL, {
    body: JSON.stringify({
      action: 'session_proof',
      school_key: schoolKey,
    }),
    cache: 'no-store',
    credentials: 'include',
    headers: { 'accept': 'application/json', 'content-type': 'application/json' },
    method: 'POST',
  });
  if (!response.ok) {
    throw new SchoolPortalApiError(
      response.status,
      'School billing identity is unavailable',
      'schoolBilling.error.sourceProofUnavailable',
    );
  }
  const payload = (await response.json()) as Partial<SchoolSourceProof>;
  if (
    payload.status !== 'succeeded' ||
    typeof payload.source_proof !== 'string' ||
    payload.source_proof.length > 4096 ||
    !SCHOOL_SOURCE_PROOF_PATTERN.test(payload.source_proof) ||
    typeof payload.expires_at !== 'number' ||
    payload.expires_at * 1000 <= Date.now()
  ) {
    throw new SchoolPortalApiError(
      502,
      'School billing identity response is invalid',
      'schoolBilling.error.invalidSourceProof',
    );
  }
  return payload as SchoolSourceProof;
};

const fetchSchoolBillingResource = async <T>(
  schoolKey: string,
  sourceProof: string,
  suffix = '',
  init: RequestInit = {},
): Promise<T> => {
  const response = await fetchSchoolResource(
    `/api/askcore/billing/schools/${encodeURIComponent(schoolKey)}${suffix}`,
    {
      cache: 'no-store',
      credentials: 'same-origin',
      ...init,
      headers: {
        accept: 'application/json',
        [SCHOOL_BILLING_SOURCE_PROOF_HEADER]: sourceProof,
        ...init.headers,
      },
    },
  );
  if (!response.ok) {
    throw new SchoolPortalApiError(
      response.status,
      'School billing service is unavailable',
      'schoolBilling.error.serviceUnavailable',
    );
  }
  return response.json() as Promise<T>;
};

export const fetchSchoolSponsorshipSummary = (schoolKey: string, sourceProof: string) =>
  fetchSchoolBillingResource<SchoolSponsorshipSummary>(schoolKey, sourceProof);

export const fetchSchoolBillingAdminSummary = (schoolKey: string, sourceProof: string) =>
  fetchSchoolBillingResource<SchoolBillingAdminSummary>(schoolKey, sourceProof, '/admin');

export const fetchSchoolSponsoredSeats = async (schoolKey: string, sourceProof: string) => {
  const result = await fetchSchoolBillingResource<{
    items: SchoolSponsoredSeat[];
    next_cursor: null;
  }>(schoolKey, sourceProof, '/seats');
  return result.items;
};

export const fetchSchoolUsageSummary = (schoolKey: string, sourceProof: string) =>
  fetchSchoolBillingResource<SchoolUsageSummary>(schoolKey, sourceProof, '/usage');

export const searchSchoolEligibleMembers = async (
  schoolKey: string,
  sourceProof: string,
  query: string,
) => {
  const result = await fetchSchoolBillingResource<{
    expires_at: string;
    items: SchoolEligibleMember[];
  }>(schoolKey, sourceProof, `/eligible-members?query=${encodeURIComponent(query)}`);
  return result.items;
};

export const assignSchoolSponsoredSeat = (
  schoolKey: string,
  sourceProof: string,
  seat: Pick<SchoolSponsoredSeat, 'assignment_version' | 'seat_id'>,
  eligibilityToken: string,
) =>
  fetchSchoolBillingResource<SchoolSponsoredSeat>(
    schoolKey,
    sourceProof,
    `/seats/${seat.seat_id}/assignment`,
    {
      body: JSON.stringify({
        eligibility_token: eligibilityToken,
        expected_assignment_version: seat.assignment_version,
      }),
      headers: {
        'content-type': 'application/json',
        'Idempotency-Key': crypto.randomUUID(),
      },
      method: 'PUT',
    },
  );

export const releaseSchoolSponsoredSeat = (
  schoolKey: string,
  sourceProof: string,
  seatId: number,
) =>
  fetchSchoolBillingResource<SchoolSponsoredSeat>(
    schoolKey,
    sourceProof,
    `/seats/${seatId}/assignment`,
    {
      body: JSON.stringify({ reason: 'admin_release' }),
      headers: {
        'content-type': 'application/json',
        'Idempotency-Key': crypto.randomUUID(),
      },
      method: 'DELETE',
    },
  );
