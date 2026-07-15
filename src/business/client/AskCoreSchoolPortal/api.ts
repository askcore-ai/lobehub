import {
  type SchoolIntegrationOperations,
  type SchoolPortalManifest,
  type SchoolSourceSession,
} from './types';

export const SCHOOL_PORTAL_API = '/api/askcore/school/portal';
export const SCHOOL_OPERATIONS_API = '/api/askcore/school/operations';
export const SCHOOL_ROLE_SOURCE_URL = '/school/services/askcore/session.php';
const SCHOOL_REQUEST_TIMEOUT_MS = 8_000;

type BetterAuthSchoolSession = {
  session?: { id?: string | null } | null;
  user?: { id?: string | null } | null;
};

export const schoolSessionGeneration = (session?: BetterAuthSchoolSession | null) => {
  const userId = session?.user?.id?.trim();
  const sessionId = session?.session?.id?.trim();
  return userId && sessionId ? `${userId}:${sessionId}` : undefined;
};

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

export class SchoolPortalApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'SchoolPortalApiError';
    this.status = status;
  }
}

export const fetchSchoolPortalManifest = async (): Promise<SchoolPortalManifest> => {
  const response = await fetchSchoolResource(SCHOOL_PORTAL_API, {
    cache: 'no-store',
    credentials: 'same-origin',
    headers: { accept: 'application/json' },
  });
  if (!response.ok) {
    throw new SchoolPortalApiError(response.status, '学校连接暂不可用');
  }
  return response.json() as Promise<SchoolPortalManifest>;
};

export const fetchSchoolSourceSession = async (url: string): Promise<SchoolSourceSession> => {
  const target = new URL(url, window.location.origin);
  if (target.origin !== window.location.origin) {
    throw new SchoolPortalApiError(400, '学校身份地址无效');
  }
  const response = await fetchSchoolResource(target, {
    cache: 'no-store',
    credentials: 'include',
    headers: { accept: 'application/json' },
    redirect: 'manual',
  });
  if (!response.ok) {
    throw new SchoolPortalApiError(response.status, '学校身份暂不可用');
  }
  const payload = (await response.json()) as Partial<SchoolSourceSession>;
  if (
    payload.authenticated !== true ||
    !['administrator', 'guardian', 'student', 'teacher'].includes(String(payload.role))
  ) {
    throw new SchoolPortalApiError(502, '学校身份响应无效');
  }
  return payload as SchoolSourceSession;
};

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
