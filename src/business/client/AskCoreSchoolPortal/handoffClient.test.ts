// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const grant = 'header.payload.signature';
const gibbonAction = '/school/services/askcore/handoff.php';
const moodleAction = '/school/teaching/local/askcore/handoff.php';

class TestBroadcastChannel {
  static instances: TestBroadcastChannel[] = [];

  listeners = new Set<(event: MessageEvent) => void>();

  constructor(public name: string) {
    TestBroadcastChannel.instances.push(this);
  }

  addEventListener(_type: string, listener: (event: MessageEvent) => void) {
    this.listeners.add(listener);
  }

  close() {}

  emit(data: unknown) {
    for (const listener of this.listeners) listener(new MessageEvent('message', { data }));
  }
}

const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
    status,
  });

const deferredResponse = () => {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

describe('invisible school source handoff client', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('BroadcastChannel', TestBroadcastChannel);
    TestBroadcastChannel.instances = [];
    document.body.replaceChildren();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('fails closed instead of waiting forever when Better Auth never initializes', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn());
    const { enterSchoolSource } = await import('./handoffClient');

    const handoff = enterSchoolSource('moodle');
    const assertion = expect(handoff).rejects.toMatchObject({ status: 503 });
    await vi.advanceTimersByTimeAsync(8_000);

    await assertion;
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not prepare a source form while Better Auth is signed out', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { enterSchoolSource, setSchoolHandoffSessionState } = await import('./handoffClient');
    setSchoolHandoffSessionState('signed-out', null);

    await expect(enterSchoolSource('moodle')).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('prepares once, submits one transient fixed source form, and stores no grant', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ action: moodleAction, grant }));
    vi.stubGlobal('fetch', fetchMock);
    let submittedGrant = '';
    const submit = vi
      .spyOn(HTMLFormElement.prototype, 'submit')
      .mockImplementation(function (this: HTMLFormElement) {
        submittedGrant = new FormData(this).get('grant')?.toString() || '';
      });
    const { enterSchoolSource, setSchoolHandoffSessionState } = await import('./handoffClient');
    setSchoolHandoffSessionState('stable', 'generation-a');

    await expect(enterSchoolSource('moodle')).resolves.toBe('navigating');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/askcore/school/handoff',
      expect.objectContaining({
        body: new URLSearchParams({ source: 'moodle' }),
        cache: 'no-store',
        credentials: 'include',
        method: 'POST',
      }),
    );
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submittedGrant).toBe(grant);
    expect(document.querySelector('form')).toBeNull();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(location.href).not.toContain(grant);
  });

  it('serializes repeated activation into one preparation and one source POST', async () => {
    const deferred = deferredResponse();
    const fetchMock = vi.fn().mockReturnValue(deferred.promise);
    vi.stubGlobal('fetch', fetchMock);
    const submit = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => {});
    const { enterSchoolSource, setSchoolHandoffSessionState } = await import('./handoffClient');
    setSchoolHandoffSessionState('stable', 'generation-a');

    const first = enterSchoolSource('moodle');
    const second = enterSchoolSource('moodle');
    expect(second).toBe(first);
    deferred.resolve(jsonResponse({ action: moodleAction, grant }));

    await expect(first).resolves.toBe('navigating');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('aligns Gibbon invisibly without creating a form or document navigation', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ action: gibbonAction, grant }))
      .mockResolvedValueOnce({ status: 0, type: 'opaqueredirect' });
    vi.stubGlobal('fetch', fetchMock);
    const submit = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => {});
    const { alignSchoolSourceSession, setSchoolHandoffSessionState } =
      await import('./handoffClient');
    setSchoolHandoffSessionState('stable', 'generation-a');

    await expect(alignSchoolSourceSession('gibbon')).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      gibbonAction,
      expect.objectContaining({
        body: new URLSearchParams({ grant }),
        cache: 'no-store',
        credentials: 'include',
        method: 'POST',
        redirect: 'manual',
      }),
    );
    expect(submit).not.toHaveBeenCalled();
    expect(document.querySelector('form')).toBeNull();
    expect(location.href).not.toContain(grant);
  });

  it('aborts invisible alignment when the account generation changes', async () => {
    let sourceSignal: AbortSignal | undefined;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ action: gibbonAction, grant }))
      .mockImplementationOnce((_input, init?: RequestInit) => {
        sourceSignal = init?.signal || undefined;
        return new Promise<Response>((_resolve, reject) => {
          sourceSignal?.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          );
        });
      });
    vi.stubGlobal('fetch', fetchMock);
    const { alignSchoolSourceSession, setSchoolHandoffSessionState } =
      await import('./handoffClient');
    setSchoolHandoffSessionState('stable', 'generation-a');

    const alignment = alignSchoolSourceSession('gibbon');
    await vi.waitFor(() => expect(sourceSignal).toBeDefined());
    setSchoolHandoffSessionState('unstable', null);

    await expect(alignment).rejects.toMatchObject({ name: 'AbortError' });
    expect(sourceSignal?.aborted).toBe(true);
  });

  it('aborts the old preparation when the local account generation changes', async () => {
    let requestSignal: AbortSignal | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn((_input, init?: RequestInit) => {
        requestSignal = init?.signal || undefined;
        return new Promise<Response>((_resolve, reject) => {
          requestSignal?.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          );
        });
      }),
    );
    const submit = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => {});
    const { enterSchoolSource, setSchoolHandoffSessionState } = await import('./handoffClient');
    setSchoolHandoffSessionState('stable', 'generation-a');
    const handoff = enterSchoolSource('moodle');
    await vi.waitFor(() => expect(requestSignal).toBeDefined());

    setSchoolHandoffSessionState('unstable', null);

    await expect(handoff).rejects.toMatchObject({ name: 'AbortError' });
    expect(requestSignal?.aborted).toBe(true);
    expect(submit).not.toHaveBeenCalled();
  });

  it('aborts when another tab publishes a different stable generation', async () => {
    let requestSignal: AbortSignal | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn((_input, init?: RequestInit) => {
        requestSignal = init?.signal || undefined;
        return new Promise<Response>((_resolve, reject) => {
          requestSignal?.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          );
        });
      }),
    );
    const submit = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => {});
    const { enterSchoolSource, setSchoolHandoffSessionState } = await import('./handoffClient');
    setSchoolHandoffSessionState('stable', 'generation-a');
    const handoff = enterSchoolSource('moodle');
    await vi.waitFor(() => expect(requestSignal).toBeDefined());

    TestBroadcastChannel.instances[0]?.emit({
      generationHash: 'generation-b',
      sessionState: 'stable',
      type: 'generation-changed',
    });

    await expect(handoff).rejects.toMatchObject({ name: 'AbortError' });
    expect(submit).not.toHaveBeenCalled();
  });

  it('rejects a non-fixed action or malformed grant before creating a form', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ action: '/attacker', grant }))
      .mockResolvedValueOnce(jsonResponse({ action: moodleAction, grant: 'not-a-jwt' }));
    vi.stubGlobal('fetch', fetchMock);
    const submit = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => {});
    const { enterSchoolSource, setSchoolHandoffSessionState } = await import('./handoffClient');
    setSchoolHandoffSessionState('stable', 'generation-a');

    await expect(enterSchoolSource('moodle')).rejects.toMatchObject({ status: 502 });
    await expect(enterSchoolSource('moodle')).rejects.toMatchObject({ status: 502 });
    expect(submit).not.toHaveBeenCalled();
    expect(document.querySelector('form')).toBeNull();
  });
});
