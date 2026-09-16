// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@lobechat/database', () => ({ serverDB: {} }));
vi.mock('@/envs/app', () => ({ appEnv: { APP_URL: 'https://school.example' } }));
vi.mock('@/server/services/schoolIdentity', () => ({ resolveSchoolIdentity: vi.fn() }));

import {
  forwardRegistrationRequest,
  registrationPrepareSchema,
  registrationProvisioningPlugin,
  registrationRecoverSchema,
  registrationReturnPath,
} from './registrationProvisioning';

const plugin = registrationProvisioningPlugin({} as never);
const guard = (request: Request) => plugin.onRequest!(request, {} as never);
const post = (body: BodyInit, headers: HeadersInit = {}, path = 'prepare') => new Request(
  `https://school.example/api/auth/askcore-registration/${path}`, {
    method: 'POST', body,
    headers: { origin: 'https://school.example', 'content-type': 'application/json', ...headers },
    duplex: 'half',
  } as RequestInit,
);
const responseOf = (result: Awaited<ReturnType<typeof guard>>) => result && 'response' in result ? result.response : undefined;

afterEach(() => vi.useRealTimers());

describe('registration HTTP boundary', () => {
  it.each(['//evil.example', '/\\evil', '/school?token=secret', '/school?intentHandle=secret', '/school#secret'])('rejects unsafe return target %s', (path) => {
    expect(() => registrationReturnPath(path)).toThrow();
  });
  it('preserves safe destinations and breaks self-redirect loops', () => {
    expect(registrationReturnPath('/school?tab=courses')).toBe('/school?tab=courses');
    expect(registrationReturnPath('/askcore/workbench?protocol=registration')).toBe('/school');
  });
  it('rejects extra identity selectors and non-boolean acknowledgement', () => {
    expect(registrationPrepareSchema.safeParse({ kind: 'ordinary', returnPath: '/', userId: 'other' }).success).toBe(false);
    expect(registrationRecoverSchema.safeParse({ acknowledgeCurrentIdentity: 'true' }).success).toBe(false);
    expect(registrationRecoverSchema.safeParse({ userId: 'other' }).success).toBe(false);
  });
  it.each([
    [{ origin: 'https://evil.example' }, 403],
    [{ origin: '' }, 403],
    [{ 'sec-fetch-site': 'cross-site' }, 403],
    [{ 'content-type': 'text/plain' }, 415],
  ] as const)('refuses invalid origin or media type', async (headers, status) => {
    expect(responseOf(await guard(post('{}', headers)))?.status).toBe(status);
  });
  it('rejects oversized, malformed UTF-8, and interrupted bodies', async () => {
    for (const body of ['x'.repeat(16385), new Uint8Array([0xff]), new ReadableStream({ start(controller) { controller.error(new Error('closed')); } })]) {
      const result = responseOf(await guard(post(body)));
      expect(result?.status).toBe(typeof body === 'string' ? 413 : 400);
    }
  });
  it('bounds a stalled body and cancels its stream', async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const pending = guard(post(new ReadableStream({ cancel })));
    await vi.advanceTimersByTimeAsync(3001);
    expect(responseOf(await pending)?.status).toBe(408);
    expect(cancel).toHaveBeenCalledOnce();
  });
  it.each(['%70repare', 'prepare?userId=other', 'prepare/', '../askcore-registration//prepare'])('rejects noncanonical endpoint %s', async (path) => {
    expect(responseOf(await guard(post('{}', {}, path)))?.status).toBeGreaterThanOrEqual(400);
  });
  it('keeps valid bytes for the library parser without touching unrelated auth paths', async () => {
    const result = await guard(post('{"kind":"ordinary","returnPath":"/"}'));
    expect(result && 'request' in result && await result.request.text()).toBe('{"kind":"ordinary","returnPath":"/"}');
    expect(await guard(new Request('https://school.example/api/auth/get-session'))).toBeUndefined();
  });
  it('preserves other plugins response processing', async () => {
    const response = Response.redirect('https://school.example/');
    expect(await plugin.onResponse!(response, {} as never)).toBeUndefined();
    const limited = new Response('{}', { status: 429 });
    expect(await plugin.onResponse!(limited, {} as never)).toBeUndefined();
    expect(limited.headers.get('cache-control')).toBe('private, no-store');
  });
  it('forwards the original body, cookies, and query to the guarded alias', async () => {
    const handler = vi.fn(async (request: Request) => {
      expect(request.url).toBe('https://school.example/api/auth/askcore-registration/recover?userId=bad');
      expect(request.headers.get('cookie')).toBe('synthetic=opaque');
      expect(await request.json()).toEqual({});
      return new Response(null, { status: 400 });
    });
    const request = new Request('https://school.example/api/askcore/registration/recover?userId=bad', {
      method: 'POST', headers: { cookie: 'synthetic=opaque' }, body: '{}',
    });
    expect((await forwardRegistrationRequest(request, 'recover', handler)).status).toBe(400);
    expect(handler).toHaveBeenCalledOnce();
  });
});
