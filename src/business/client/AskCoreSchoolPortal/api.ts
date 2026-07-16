import {
  type SchoolIntegrationOperations,
  type SchoolPortalManifest,
  type SchoolSourceSession,
} from './types';

export const SCHOOL_PORTAL_API = '/api/askcore/school/portal';
export const SCHOOL_OPERATIONS_API = '/api/askcore/school/operations';
export const SCHOOL_ROLE_SOURCE_URL = '/school/services/askcore/session.php';
const BETTER_AUTH_SESSION_API = '/api/auth/get-session';
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

export const schoolSourceSessionCacheKey = (sessionGeneration?: string) =>
  sessionGeneration ? ([SCHOOL_ROLE_SOURCE_URL, sessionGeneration] as const) : null;

export const schoolPortalManifestScope = (pathname: string) => {
  if (pathname === '/school') return 'school-services';
  if (pathname === '/school/learning-space' || pathname === '/school/teaching-center') {
    return 'teaching';
  }
  return 'navigation';
};

export const schoolPortalManifestCacheKey = (
  sessionGeneration: string | undefined,
  scope: string,
) => (sessionGeneration ? ([SCHOOL_PORTAL_API, sessionGeneration, scope] as const) : null);

export const sourceSessionReady = (frame: HTMLIFrameElement) => {
  try {
    return !!frame.contentDocument?.querySelector('meta[name="askcore-session"][content="ready"]');
  } catch {
    return false;
  }
};

export const isGibbonSessionProbeSurface = (pathname: string, sessionReady: boolean) => {
  if (sessionReady) return true;
  const normalized = pathname.toLowerCase();
  return (
    normalized.startsWith('/school/services/') &&
    !normalized.startsWith('/school/services/askcore/') &&
    !normalized.endsWith('/login.php')
  );
};

export const gibbonSessionProbeReady = (frame: HTMLIFrameElement) => {
  if (sourceSessionReady(frame)) return true;
  try {
    return isGibbonSessionProbeSurface(frame.contentWindow?.location.pathname || '', false);
  } catch {
    return false;
  }
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

type SchoolPortalBootstrap = {
  generation?: string;
  portal?: SchoolPortalManifest;
  portalError?: unknown;
  sourceError?: unknown;
  sourceSession?: SchoolSourceSession;
};

let bootstrapPromise: Promise<SchoolPortalBootstrap | undefined> | undefined;
let portalBootstrapClaimed = false;
let sourceBootstrapClaimed = false;

const fetchSchoolAccountSession = async (): Promise<BetterAuthSchoolSession | null> => {
  const response = await fetchSchoolResource(BETTER_AUTH_SESSION_API, {
    cache: 'no-store',
    credentials: 'same-origin',
    headers: { accept: 'application/json' },
  });
  if (!response.ok) throw new SchoolPortalApiError(response.status, '账号会话暂不可用');
  const payload = (await response.json()) as
    | BetterAuthSchoolSession
    | { data?: BetterAuthSchoolSession | null }
    | null;
  if (!payload) return null;
  if ('data' in payload) return payload.data ?? null;
  return payload as BetterAuthSchoolSession;
};

export const primeSchoolPortalBootstrap = () => {
  if (typeof window === 'undefined') return undefined;
  if (!bootstrapPromise) {
    bootstrapPromise = Promise.allSettled([
      fetchSchoolAccountSession(),
      fetchSchoolPortalManifest(),
      fetchSchoolSourceSession(SCHOOL_ROLE_SOURCE_URL),
    ]).then(([account, portal, sourceSession]) => {
      if (account.status !== 'fulfilled') return undefined;
      const generation = schoolSessionGeneration(account.value);
      if (!generation) return undefined;
      return {
        generation,
        portal: portal.status === 'fulfilled' ? portal.value : undefined,
        portalError: portal.status === 'rejected' ? portal.reason : undefined,
        sourceError: sourceSession.status === 'rejected' ? sourceSession.reason : undefined,
        sourceSession: sourceSession.status === 'fulfilled' ? sourceSession.value : undefined,
      };
    });
  }
  return bootstrapPromise;
};

export const invalidateSchoolPortalBootstrap = () => {
  bootstrapPromise = undefined;
  portalBootstrapClaimed = false;
  sourceBootstrapClaimed = false;
};

export const fetchSchoolPortalManifestForGeneration = async (sessionGeneration: string) => {
  if (!portalBootstrapClaimed && bootstrapPromise) {
    portalBootstrapClaimed = true;
    const bootstrap = await bootstrapPromise;
    if (bootstrap?.generation === sessionGeneration) {
      if (bootstrap.portal) return bootstrap.portal;
      if (bootstrap.portalError) throw bootstrap.portalError;
    }
  }
  return fetchSchoolPortalManifest();
};

export const fetchSchoolSourceSessionForGeneration = async (
  url: string,
  sessionGeneration: string,
) => {
  if (!sourceBootstrapClaimed && bootstrapPromise) {
    sourceBootstrapClaimed = true;
    const bootstrap = await bootstrapPromise;
    if (bootstrap?.generation === sessionGeneration) {
      if (bootstrap.sourceSession) return bootstrap.sourceSession;
      if (bootstrap.sourceError) throw bootstrap.sourceError;
    }
  }
  return fetchSchoolSourceSession(url);
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
