'use client';

export type SchoolSourceAudience = 'gibbon' | 'moodle';
export type SchoolHandoffSessionState = 'signed-out' | 'stable' | 'unstable';

interface PreparedSourceHandoff {
  action: string;
  grant: string;
}

const HANDOFF_ENDPOINT = '/api/askcore/school/handoff';
const SESSION_INITIALIZATION_TIMEOUT_MS = 8_000;
const MAX_GRANT_LENGTH = 8192;
const GRANT_PATTERN = /^[\w-]+\.[\w-]+\.[\w-]+$/;
const SOURCE_ACTIONS: Record<SchoolSourceAudience, string> = {
  gibbon: '/school/services/askcore/handoff.php',
  moodle: '/school/teaching/local/askcore/handoff.php',
};

export class SchoolHandoffError extends Error {
  status: number;

  constructor(status: number) {
    super('school handoff unavailable');
    this.name = 'SchoolHandoffError';
    this.status = status;
  }
}

let activePreparation:
  | {
      controller: AbortController;
      generationHash: string | null;
      promise: Promise<'navigating'>;
      requestController?: AbortController;
    }
  | undefined;
let activeSessionAlignment:
  | {
      controller: AbortController;
      promise: Promise<void>;
      source: SchoolSourceAudience;
    }
  | undefined;
let sessionEpoch = 0;
let sessionGenerationHash: string | null = null;
let lastStableGenerationHash: string | null = null;
let sessionState: SchoolHandoffSessionState | 'initializing' = 'initializing';
let sessionChannel: BroadcastChannel | undefined;
const sessionWaiters = new Set<() => void>();

const abortActivePreparation = () => {
  sessionEpoch += 1;
  const previous = activePreparation;
  activePreparation = undefined;
  previous?.controller.abort();
  previous?.requestController?.abort();
  const previousAlignment = activeSessionAlignment;
  activeSessionAlignment = undefined;
  previousAlignment?.controller.abort();
};

const resolveSessionWaiters = () => {
  for (const resolve of sessionWaiters) resolve();
  sessionWaiters.clear();
};

const normalizedGenerationHash = (
  nextState: SchoolHandoffSessionState,
  generationHash: string | null,
) => (nextState === 'stable' && generationHash ? generationHash : null);

export const setSchoolHandoffSessionState = (
  nextState: SchoolHandoffSessionState,
  generationHash: string | null,
) => {
  const nextGenerationHash = normalizedGenerationHash(nextState, generationHash);
  if (sessionState === nextState && sessionGenerationHash === nextGenerationHash) return;

  const wasInitializing = sessionState === 'initializing';
  sessionState = nextState;
  sessionGenerationHash = nextGenerationHash;
  if (nextGenerationHash) lastStableGenerationHash = nextGenerationHash;
  if (nextState === 'signed-out') lastStableGenerationHash = null;
  sessionEpoch += 1;
  if (activePreparation) {
    if (
      nextState === 'signed-out' ||
      (nextGenerationHash &&
        activePreparation.generationHash &&
        nextGenerationHash !== activePreparation.generationHash)
    ) {
      activePreparation.controller.abort();
    }
    activePreparation.requestController?.abort();
  }
  if (!wasInitializing) activeSessionAlignment?.controller.abort();
  resolveSessionWaiters();
};

const ensureSessionChannel = () => {
  if (sessionChannel || typeof BroadcastChannel === 'undefined') return;
  sessionChannel = new BroadcastChannel('askcore-school-session-v1');
  sessionChannel.addEventListener('message', (event) => {
    const message = event.data;
    if (!message || message.type !== 'generation-changed') return;
    if (
      message.sessionState === 'stable' &&
      typeof message.generationHash === 'string' &&
      message.generationHash === sessionGenerationHash
    ) {
      return;
    }
    // Cross-tab changes invalidate the intent even if local state is already unstable.
    abortActivePreparation();
    setSchoolHandoffSessionState(
      message.sessionState === 'signed-out' ? 'signed-out' : 'unstable',
      null,
    );
  });
};

const waitForStableSession = async (signal: AbortSignal) => {
  while (sessionState === 'initializing' || sessionState === 'unstable') {
    if (signal.aborted) throw signal.reason;
    await new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        sessionWaiters.delete(onReady);
        reject(signal.reason);
      };
      const onReady = () => {
        signal.removeEventListener('abort', onAbort);
        resolve();
      };
      sessionWaiters.add(onReady);
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }
  if (signal.aborted) throw signal.reason;
};

// Fetch/body completion can race cancellation; never wait for a cancelled transport.
const withAbort = <T>(promise: Promise<T>, signal: AbortSignal): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
    if (signal.aborted) {
      signal.removeEventListener('abort', onAbort);
      reject(signal.reason);
    }
  });

const isPreparedSourceHandoff = (
  value: unknown,
  source: SchoolSourceAudience,
): value is PreparedSourceHandoff => {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return (
    keys.length === 2 &&
    keys[0] === 'action' &&
    keys[1] === 'grant' &&
    record.action === SOURCE_ACTIONS[source] &&
    typeof record.grant === 'string' &&
    record.grant.length > 0 &&
    record.grant.length <= MAX_GRANT_LENGTH &&
    GRANT_PATTERN.test(record.grant)
  );
};

export const requestSourceHandoff = async (
  source: SchoolSourceAudience,
  signal: AbortSignal,
): Promise<PreparedSourceHandoff> => {
  const response = await fetch(HANDOFF_ENDPOINT, {
    body: new URLSearchParams({ source }),
    cache: 'no-store',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    method: 'POST',
    signal,
  });
  if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) {
    throw new SchoolHandoffError(response.status || 503);
  }

  const payload: unknown = await response.json().catch(() => undefined);
  if (!isPreparedSourceHandoff(payload, source)) throw new SchoolHandoffError(502);
  return payload;
};

export const submitSourceHandoff = (
  source: SchoolSourceAudience,
  handoff: PreparedSourceHandoff,
  resume = false,
) => {
  if (handoff.action !== SOURCE_ACTIONS[source] || !document.body) {
    throw new SchoolHandoffError(502);
  }

  const form = document.createElement('form');
  const grant = document.createElement('input');
  form.action = handoff.action;
  form.method = 'post';
  form.style.display = 'none';
  grant.name = 'grant';
  grant.type = 'hidden';
  grant.value = handoff.grant;
  form.append(grant);
  if (source === 'moodle' && resume) {
    const continuation = document.createElement('input');
    continuation.name = 'resume';
    continuation.type = 'hidden';
    continuation.value = '1';
    form.append(continuation);
  }
  document.body.append(form);
  try {
    form.submit();
  } finally {
    grant.value = '';
    form.remove();
  }
};

export const cancelSchoolSourceHandoff = () => {
  abortActivePreparation();
};

export const enterSchoolSource = (
  source: SchoolSourceAudience,
  resume = false,
): Promise<'navigating'> => {
  ensureSessionChannel();
  if (activePreparation) return activePreparation.promise;
  if (activeSessionAlignment) abortActivePreparation();

  const controller = new AbortController();
  const timer = window.setTimeout(
    () => controller.abort(new DOMException('School handoff timed out', 'TimeoutError')),
    SESSION_INITIALIZATION_TIMEOUT_MS,
  );
  let generationHash = lastStableGenerationHash;
  const promise = (async () => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      // A refetch can begin in the microtask after the barrier resolved.
      do {
        await waitForStableSession(controller.signal);
      } while (sessionState === 'initializing' || sessionState === 'unstable');
      if (sessionState !== 'stable' || !sessionGenerationHash) {
        throw new SchoolHandoffError(401);
      }
      if (generationHash && generationHash !== sessionGenerationHash) {
        throw new DOMException('Aborted', 'AbortError');
      }
      generationHash = sessionGenerationHash;
      if (activePreparation) activePreparation.generationHash = generationHash;
      const requestEpoch = sessionEpoch;
      const requestController = new AbortController();
      if (activePreparation) activePreparation.requestController = requestController;
      const onAbort = () => requestController.abort(controller.signal.reason);
      controller.signal.addEventListener('abort', onAbort, { once: true });
      try {
        const handoff = await withAbort(
          requestSourceHandoff(source, requestController.signal),
          requestController.signal,
        );
        if (controller.signal.aborted) throw controller.signal.reason;
        if (requestController.signal.aborted || requestEpoch !== sessionEpoch) {
          continue;
        }
        submitSourceHandoff(source, handoff, resume);
        return 'navigating' as const;
      } catch (error) {
        if (controller.signal.aborted) throw controller.signal.reason;
        if (!requestController.signal.aborted) throw error;
      } finally {
        controller.signal.removeEventListener('abort', onAbort);
        if (activePreparation?.requestController === requestController) {
          activePreparation.requestController = undefined;
        }
      }
    }
    throw new SchoolHandoffError(503);
  })()
    .catch((error: unknown) => {
      if (
        controller.signal.aborted &&
        controller.signal.reason instanceof DOMException &&
        controller.signal.reason.name === 'TimeoutError'
      ) {
        throw new SchoolHandoffError(503);
      }
      throw error;
    })
    .finally(() => {
      window.clearTimeout(timer);
      if (activePreparation?.promise === promise) activePreparation = undefined;
    });

  activePreparation = { controller, generationHash, promise };
  return promise;
};

export const alignSchoolSourceSession = (source: SchoolSourceAudience): Promise<void> => {
  ensureSessionChannel();
  if (activeSessionAlignment?.source === source) return activeSessionAlignment.promise;
  if (activePreparation) throw new SchoolHandoffError(409);
  if (activeSessionAlignment) abortActivePreparation();

  const controller = new AbortController();
  const timer = window.setTimeout(
    () =>
      controller.abort(
        new DOMException('School source session alignment timed out', 'TimeoutError'),
      ),
    SESSION_INITIALIZATION_TIMEOUT_MS,
  );
  const promise = (async () => {
    await waitForStableSession(controller.signal);
    if (sessionState !== 'stable' || !sessionGenerationHash) {
      throw new SchoolHandoffError(401);
    }
    const requestEpoch = sessionEpoch;
    const handoff = await requestSourceHandoff(source, controller.signal);
    if (
      controller.signal.aborted ||
      requestEpoch !== sessionEpoch ||
      sessionState !== 'stable'
    ) {
      throw new DOMException('Aborted', 'AbortError');
    }

    const response = await fetch(handoff.action, {
      body: new URLSearchParams({ grant: handoff.grant }),
      cache: 'no-store',
      credentials: 'include',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      method: 'POST',
      redirect: 'manual',
      signal: controller.signal,
    });
    if (response.status !== 303 && response.type !== 'opaqueredirect') {
      throw new SchoolHandoffError(response.status || 503);
    }
    if (
      controller.signal.aborted ||
      requestEpoch !== sessionEpoch ||
      sessionState !== 'stable'
    ) {
      throw new DOMException('Aborted', 'AbortError');
    }
  })()
    .catch((error: unknown) => {
      if (
        controller.signal.aborted &&
        controller.signal.reason instanceof DOMException &&
        controller.signal.reason.name === 'TimeoutError'
      ) {
        throw new SchoolHandoffError(503);
      }
      throw error;
    })
    .finally(() => {
      window.clearTimeout(timer);
      if (activeSessionAlignment?.promise === promise) activeSessionAlignment = undefined;
    });

  activeSessionAlignment = { controller, promise, source };
  return promise;
};
