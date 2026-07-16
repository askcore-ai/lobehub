import { sha256 } from 'js-sha256';

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
const SCHOOL_BOOTSTRAP_SNAPSHOT_TTL_MS = 30_000;
const SCHOOL_BOOTSTRAP_STORAGE_KEY = 'askcore.school-bootstrap.v1';

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
  epoch: number;
  portalConsumed: boolean;
  portalPromise: Promise<PromiseSettledResult<SchoolPortalManifest>>;
  rejected: boolean;
  sourceConsumed: boolean;
  sourcePromise: Promise<PromiseSettledResult<SchoolSourceSession>>;
};

export type SchoolPortalBootstrapSnapshot = {
  generationHash: string;
  portal?: SchoolPortalManifest;
  portalCachedAt?: number;
  sourceSession?: SchoolSourceSession;
  sourceSessionCachedAt?: number;
};

const bootstrapEntries = new Map<string, SchoolPortalBootstrapEntry>();
const bootstrapSnapshots = new Map<string, SchoolPortalBootstrapSnapshot>();
let activeBootstrapGenerationHash: string | undefined;
let bootstrapEpoch = 0;

const currentTimestamp = () => Date.now();
const schoolSessionGenerationHash = (sessionGeneration: string) => sha256(sessionGeneration);

const freshTimestamp = (value: unknown, now: number): value is number =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value <= now &&
  now - value <= SCHOOL_BOOTSTRAP_SNAPSHOT_TTL_MS;

const SAFE_LAUNCH_URL_PATTERN = /^\/api\/askcore\/school\/launch\/[\w-]{40,4096}$/;

const safeLaunchUrl = (value: unknown): value is string =>
  typeof value === 'string' && SAFE_LAUNCH_URL_PATTERN.test(value);

const safeRoleSourceUrl = (value: unknown) => {
  if (typeof value !== 'string' || typeof window === 'undefined') return false;
  try {
    const target = new URL(value, window.location.origin);
    return (
      target.origin === window.location.origin &&
      target.pathname === SCHOOL_ROLE_SOURCE_URL &&
      !target.search &&
      !target.hash
    );
  } catch {
    return false;
  }
};

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
  if (
    portal.contract !== 'askcore.school-portal.v2' ||
    portal.state !== 'ready' ||
    !hasExactKeys(portal, [
      'can_manage_integrations',
      'contract',
      'schools',
      'selection_required',
      'show_school_entry',
      'state',
    ]) ||
    !Array.isArray(portal.schools) ||
    portal.schools.length !== 1 ||
    typeof portal.can_manage_integrations !== 'boolean' ||
    portal.selection_required !== false ||
    portal.show_school_entry !== true
  ) {
    return undefined;
  }
  const school = portal.schools[0] as Record<string, unknown> | undefined;
  if (
    !school ||
    !hasExactKeys(school, ['destinations', 'key', 'name', 'role_source_url']) ||
    !safeText(school.key, 63) ||
    !safeText(school.name, 100) ||
    !safeRoleSourceUrl(school.role_source_url) ||
    !Array.isArray(school.destinations) ||
    school.destinations.length !== 2
  ) {
    return undefined;
  }
  const destinations = [];
  for (const value of school.destinations) {
    if (!value || typeof value !== 'object') return undefined;
    const destination = value as Record<string, unknown>;
    if (
      !hasExactKeys(destination, [
        'description',
        'key',
        'label',
        'launch_url',
        'session_launch_url',
      ]) ||
      !['school-services', 'teaching'].includes(String(destination.key)) ||
      !safeText(destination.description, 120) ||
      !safeText(destination.label, 40) ||
      !safeLaunchUrl(destination.launch_url) ||
      !safeLaunchUrl(destination.session_launch_url)
    ) {
      return undefined;
    }
    destinations.push({
      description: destination.description,
      key: String(destination.key),
      label: destination.label,
      launch_url: destination.launch_url,
      session_launch_url: destination.session_launch_url,
    });
  }
  if (
    destinations
      .map(({ key }) => key)
      .sort()
      .join(',') !== 'school-services,teaching'
  ) {
    return undefined;
  }
  return {
    can_manage_integrations: portal.can_manage_integrations,
    contract: 'askcore.school-portal.v2',
    schools: [
      {
        destinations,
        key: school.key,
        name: school.name,
        role_source_url: String(school.role_source_url),
      },
    ],
    selection_required: false,
    show_school_entry: true,
    state: 'ready',
  };
};

const sanitizeSourceSession = (value: unknown): SchoolSourceSession | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const sourceSession = value as Record<string, unknown>;
  const role = String(sourceSession.role);
  if (
    !hasExactKeys(sourceSession, ['authenticated', 'role']) ||
    sourceSession.authenticated !== true ||
    !['administrator', 'guardian', 'student', 'teacher'].includes(role)
  ) {
    return undefined;
  }
  return { authenticated: true, role: role as SchoolSourceSession['role'] };
};

const persistSchoolPortalBootstrapSnapshot = (snapshot?: SchoolPortalBootstrapSnapshot) => {
  if (typeof window === 'undefined') return;
  try {
    if (!snapshot) {
      window.localStorage.removeItem(SCHOOL_BOOTSTRAP_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(SCHOOL_BOOTSTRAP_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Storage is an optional performance hint; live source reads remain authoritative.
  }
};

const removePersistedSchoolPortalBootstrapSnapshot = (generationHash?: string) => {
  if (typeof window === 'undefined') return;
  try {
    if (generationHash) {
      const serialized = window.localStorage.getItem(SCHOOL_BOOTSTRAP_STORAGE_KEY);
      if (serialized) {
        const parsed = JSON.parse(serialized) as Partial<SchoolPortalBootstrapSnapshot>;
        if (parsed.generationHash !== generationHash) return;
      }
    }
    window.localStorage.removeItem(SCHOOL_BOOTSTRAP_STORAGE_KEY);
  } catch {
    try {
      window.localStorage.removeItem(SCHOOL_BOOTSTRAP_STORAGE_KEY);
    } catch {
      // Storage is optional and may be disabled by the browser.
    }
  }
};

const normalizeSchoolPortalBootstrapSnapshot = (
  snapshot: SchoolPortalBootstrapSnapshot,
  now: number,
) => {
  if (
    !freshTimestamp(snapshot.portalCachedAt, now) ||
    !freshTimestamp(snapshot.sourceSessionCachedAt, now)
  ) {
    return undefined;
  }
  const portal = sanitizePortalManifest(snapshot.portal);
  const sourceSession = sanitizeSourceSession(snapshot.sourceSession);
  if (!portal || !sourceSession) return undefined;
  return {
    generationHash: snapshot.generationHash,
    portal,
    portalCachedAt: snapshot.portalCachedAt,
    sourceSession,
    sourceSessionCachedAt: snapshot.sourceSessionCachedAt,
  } satisfies SchoolPortalBootstrapSnapshot;
};

const partialSchoolPortalBootstrapIsFresh = (
  snapshot: SchoolPortalBootstrapSnapshot,
  now: number,
) => {
  const timestamps = [snapshot.portalCachedAt, snapshot.sourceSessionCachedAt].filter(
    (value): value is number => value !== undefined,
  );
  return timestamps.length === 1 && timestamps.every((value) => freshTimestamp(value, now));
};

export const schoolPortalBootstrapExpiresAt = (snapshot?: SchoolPortalBootstrapSnapshot) => {
  if (
    !snapshot ||
    typeof snapshot.portalCachedAt !== 'number' ||
    typeof snapshot.sourceSessionCachedAt !== 'number'
  ) {
    return undefined;
  }
  return (
    Math.min(snapshot.portalCachedAt, snapshot.sourceSessionCachedAt) +
    SCHOOL_BOOTSTRAP_SNAPSHOT_TTL_MS
  );
};

export const readSchoolPortalBootstrapSnapshot = (sessionGeneration: string) => {
  const now = currentTimestamp();
  const generationHash = schoolSessionGenerationHash(sessionGeneration);
  if (activeBootstrapGenerationHash && activeBootstrapGenerationHash !== generationHash) {
    bootstrapEpoch += 1;
    bootstrapEntries.clear();
    bootstrapSnapshots.clear();
    removePersistedSchoolPortalBootstrapSnapshot();
  }
  activeBootstrapGenerationHash = generationHash;
  const memorySnapshot = bootstrapSnapshots.get(generationHash);
  if (memorySnapshot) {
    if (
      memorySnapshot.portal &&
      memorySnapshot.sourceSession &&
      freshTimestamp(memorySnapshot.portalCachedAt, now) &&
      freshTimestamp(memorySnapshot.sourceSessionCachedAt, now)
    ) {
      return memorySnapshot;
    }
    if (partialSchoolPortalBootstrapIsFresh(memorySnapshot, now)) return undefined;
    bootstrapSnapshots.delete(generationHash);
  }
  if (typeof window === 'undefined') return undefined;
  try {
    const serialized = window.localStorage.getItem(SCHOOL_BOOTSTRAP_STORAGE_KEY);
    if (!serialized) return undefined;
    const parsed = JSON.parse(serialized) as Partial<SchoolPortalBootstrapSnapshot>;
    if (parsed.generationHash !== generationHash) {
      if (typeof parsed.generationHash === 'string') {
        bootstrapSnapshots.delete(parsed.generationHash);
      }
      removePersistedSchoolPortalBootstrapSnapshot();
      return undefined;
    }
    const fresh = normalizeSchoolPortalBootstrapSnapshot(
      parsed as SchoolPortalBootstrapSnapshot,
      now,
    );
    if (!fresh) {
      removePersistedSchoolPortalBootstrapSnapshot(generationHash);
      return undefined;
    }
    bootstrapSnapshots.set(generationHash, fresh);
    persistSchoolPortalBootstrapSnapshot(fresh);
    return fresh;
  } catch {
    removePersistedSchoolPortalBootstrapSnapshot();
    return undefined;
  }
};

const rememberSchoolPortalBootstrapPart = (
  sessionGeneration: string,
  part: { portal: SchoolPortalManifest } | { sourceSession: SchoolSourceSession },
  entry: SchoolPortalBootstrapEntry,
) => {
  if (entry.rejected || entry.epoch !== bootstrapEpoch) return;
  const generationHash = schoolSessionGenerationHash(sessionGeneration);
  const current = bootstrapSnapshots.get(generationHash) || { generationHash };
  const now = currentTimestamp();
  const next: SchoolPortalBootstrapSnapshot = {
    ...current,
    ...('portal' in part ? { portal: part.portal, portalCachedAt: now } : {}),
    ...('sourceSession' in part
      ? { sourceSession: part.sourceSession, sourceSessionCachedAt: now }
      : {}),
  };
  bootstrapSnapshots.set(generationHash, next);
  while (bootstrapSnapshots.size > 4) {
    const oldestGeneration = bootstrapSnapshots.keys().next().value;
    if (!oldestGeneration) break;
    bootstrapSnapshots.delete(oldestGeneration);
  }
  const complete = normalizeSchoolPortalBootstrapSnapshot(next, now);
  if (complete) {
    bootstrapSnapshots.set(generationHash, complete);
    persistSchoolPortalBootstrapSnapshot(complete);
  } else if (!partialSchoolPortalBootstrapIsFresh(next, now)) {
    entry.rejected = true;
    bootstrapSnapshots.delete(generationHash);
    removePersistedSchoolPortalBootstrapSnapshot(generationHash);
  }
};

const rejectSchoolPortalBootstrapGeneration = (
  sessionGeneration: string,
  entry: SchoolPortalBootstrapEntry,
) => {
  if (entry.epoch !== bootstrapEpoch) return;
  entry.rejected = true;
  const generationHash = schoolSessionGenerationHash(sessionGeneration);
  bootstrapSnapshots.delete(generationHash);
  removePersistedSchoolPortalBootstrapSnapshot(generationHash);
};

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
    epoch: bootstrapEpoch,
    portalConsumed: false,
    portalPromise: settled(fetchSchoolPortalManifest()),
    rejected: false,
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
  bootstrapEpoch += 1;
  bootstrapEntries.clear();
  bootstrapSnapshots.clear();
  activeBootstrapGenerationHash = undefined;
  removePersistedSchoolPortalBootstrapSnapshot();
};

export const fetchSchoolPortalManifestForGeneration = async (sessionGeneration: string) => {
  const bootstrap = schoolPortalBootstrapEntry(sessionGeneration);
  if (!bootstrap.portalConsumed) {
    const portal = await bootstrap.portalPromise;
    bootstrap.portalConsumed = true;
    if (portal.status === 'fulfilled') {
      const safePortal = sanitizePortalManifest(portal.value);
      if (safePortal) {
        rememberSchoolPortalBootstrapPart(sessionGeneration, { portal: safePortal }, bootstrap);
      } else {
        rejectSchoolPortalBootstrapGeneration(sessionGeneration, bootstrap);
      }
      return portal.value;
    }
    rejectSchoolPortalBootstrapGeneration(sessionGeneration, bootstrap);
    throw portal.reason;
  }
  try {
    const portal = await fetchSchoolPortalManifest();
    const safePortal = sanitizePortalManifest(portal);
    if (safePortal) {
      rememberSchoolPortalBootstrapPart(sessionGeneration, { portal: safePortal }, bootstrap);
    } else {
      rejectSchoolPortalBootstrapGeneration(sessionGeneration, bootstrap);
    }
    return portal;
  } catch (error) {
    rejectSchoolPortalBootstrapGeneration(sessionGeneration, bootstrap);
    throw error;
  }
};

export const fetchSchoolSourceSessionForGeneration = async (
  url: string,
  sessionGeneration: string,
) => {
  const bootstrap = schoolPortalBootstrapEntry(sessionGeneration);
  if (!bootstrap.sourceConsumed) {
    const sourceSession = await bootstrap.sourcePromise;
    bootstrap.sourceConsumed = true;
    if (sourceSession.status === 'fulfilled') {
      const safeSourceSession = sanitizeSourceSession(sourceSession.value);
      if (!safeSourceSession) {
        rejectSchoolPortalBootstrapGeneration(sessionGeneration, bootstrap);
        return sourceSession.value;
      }
      rememberSchoolPortalBootstrapPart(
        sessionGeneration,
        { sourceSession: safeSourceSession },
        bootstrap,
      );
      return sourceSession.value;
    }
    rejectSchoolPortalBootstrapGeneration(sessionGeneration, bootstrap);
    throw sourceSession.reason;
  }
  try {
    const sourceSession = await fetchSchoolSourceSession(url);
    const safeSourceSession = sanitizeSourceSession(sourceSession);
    if (!safeSourceSession) {
      rejectSchoolPortalBootstrapGeneration(sessionGeneration, bootstrap);
      return sourceSession;
    }
    rememberSchoolPortalBootstrapPart(
      sessionGeneration,
      { sourceSession: safeSourceSession },
      bootstrap,
    );
    return sourceSession;
  } catch (error) {
    rejectSchoolPortalBootstrapGeneration(sessionGeneration, bootstrap);
    throw error;
  }
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
