import {
  type SchoolIntegrationOperations,
  type SchoolPortalManifest,
  type SchoolSourceSession,
} from './types';

export const SCHOOL_PORTAL_API = '/api/askcore/school/portal';
export const SCHOOL_OPERATIONS_API = '/api/askcore/school/operations';
export const SCHOOL_ROLE_SOURCE_URL = '/school/services/askcore/session.php';
const SCHOOL_REQUEST_TIMEOUT_MS = 8_000;
const SCHOOL_SOURCE_RECOVERY_ATTEMPTS = 3;
const SCHOOL_SOURCE_RECOVERY_DELAY_MS = 250;

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

type SchoolPortalBootstrapEntry = {
  portalConsumed: boolean;
  portalPromise: Promise<PromiseSettledResult<SchoolPortalManifest>>;
  sourceConsumed: boolean;
  sourcePromise: Promise<PromiseSettledResult<SchoolSourceSession>>;
};

const bootstrapEntries = new Map<string, SchoolPortalBootstrapEntry>();

const settled = async <T>(promise: Promise<T>): Promise<PromiseSettledResult<T>> => {
  try {
    return { status: 'fulfilled', value: await promise };
  } catch (reason) {
    return { reason, status: 'rejected' };
  }
};

const schoolPortalBootstrapEntry = (sessionGeneration: string) => {
  const current = bootstrapEntries.get(sessionGeneration);
  if (current) return current;
  const entry: SchoolPortalBootstrapEntry = {
    portalConsumed: false,
    portalPromise: settled(fetchSchoolPortalManifest()),
    sourceConsumed: false,
    sourcePromise: settled(fetchSchoolSourceSession(SCHOOL_ROLE_SOURCE_URL)),
  };
  bootstrapEntries.set(sessionGeneration, entry);
  while (bootstrapEntries.size > 4) {
    const oldestGeneration = bootstrapEntries.keys().next().value;
    if (!oldestGeneration) break;
    bootstrapEntries.delete(oldestGeneration);
  }
  return entry;
};

export const invalidateSchoolPortalBootstrap = () => {
  bootstrapEntries.clear();
};

export const fetchSchoolPortalManifestForGeneration = async (sessionGeneration: string) => {
  const bootstrap = schoolPortalBootstrapEntry(sessionGeneration);
  if (!bootstrap.portalConsumed) {
    const portal = await bootstrap.portalPromise;
    bootstrap.portalConsumed = true;
    if (portal.status === 'fulfilled') return portal.value;
    throw portal.reason;
  }
  return fetchSchoolPortalManifest();
};

export const fetchSchoolSourceSessionForGeneration = async (
  url: string,
  sessionGeneration: string,
) => {
  const bootstrap = schoolPortalBootstrapEntry(sessionGeneration);
  if (!bootstrap.sourceConsumed) {
    const sourceSession = await bootstrap.sourcePromise;
    bootstrap.sourceConsumed = true;
    if (sourceSession.status === 'fulfilled') return sourceSession.value;
    throw sourceSession.reason;
  }
  return fetchSchoolSourceSession(url);
};

export const recoverSchoolSourceSession = async (
  refresh: () => Promise<SchoolSourceSession | undefined>,
  options: {
    attempts?: number;
    isCurrent?: () => boolean;
    retryDelayMs?: number;
  } = {},
) => {
  const attempts = Math.max(1, options.attempts ?? SCHOOL_SOURCE_RECOVERY_ATTEMPTS);
  const isCurrent = options.isCurrent ?? (() => true);
  const retryDelayMs = Math.max(0, options.retryDelayMs ?? SCHOOL_SOURCE_RECOVERY_DELAY_MS);
  let lastError: unknown = new Error('学校身份会话未就绪');
  for (let attempt = 0; attempt < attempts && isCurrent(); attempt += 1) {
    try {
      const sourceSession = await refresh();
      if (sourceSession?.authenticated) return sourceSession;
      lastError = new Error('学校身份会话未就绪');
    } catch (error) {
      lastError = error;
    }
    if (attempt + 1 < attempts && isCurrent()) {
      await new Promise((resolve) => window.setTimeout(resolve, retryDelayMs));
    }
  }
  throw lastError;
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
