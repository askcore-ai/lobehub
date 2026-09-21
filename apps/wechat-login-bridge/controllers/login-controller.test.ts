import { afterEach, describe, expect, it, vi } from 'vitest';

// The mini-program runtime consumes CommonJS directly.
const controller = require('./login-controller');

const launch = {
  c: 'a'.repeat(43),
  p: 'signin',
  t: `wxm_${'b'.repeat(24)}`,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('WeChat login bridge controller', () => {
  it('normalizes only the bounded manual alphabet and sends only to the proof endpoint', async () => {
    expect(controller.normalizeManualCode('abcde f0123-abcde\tf0123')).toBe('ABCDEF0123ABCDEF0123');
    expect(controller.normalizeManualCode('Ａ'.repeat(20))).toBe('');
    expect(controller.normalizeManualCode('a'.repeat(41))).toBe('');
    const wxApi = {
      login: vi.fn(({ success }) => success({ code: 'synthetic' })),
      request: vi.fn(({ success }) => success({ statusCode: 200, data: { state: 'proof_ready' } })),
    };
    await expect(controller.provePrepublication(wxApi, 'short')).rejects.toThrow('invalid_manual_code');
    expect(wxApi.login).not.toHaveBeenCalled();
    await controller.provePrepublication(wxApi, 'a'.repeat(20));
    expect(wxApi.request.mock.calls[0][0]).toMatchObject({
      data: { code: 'synthetic', manualCode: 'A'.repeat(20) },
      url: 'https://askcore.cn/api/auth/wechat-prepublication/prove',
    });
  });

  it('does not dispatch a manual proof when wx.login resolves after leaving the page', async () => {
    let complete: (value: { code: string }) => void = () => {};
    let active = true;
    const wxApi = { login: ({ success }: { success: typeof complete }) => { complete = success; }, request: vi.fn() };
    const promise = controller.provePrepublication(wxApi, 'a'.repeat(20), () => active);
    active = false;
    complete({ code: 'synthetic' });
    await expect(promise).rejects.toThrow('abandoned_proof');
    expect(wxApi.request).not.toHaveBeenCalled();
  });

  it.each(['authorized', 'verified', 'completed', 'pending'])('rejects unrelated manual success %s', async (state) => {
    const wxApi = {
      login: ({ success }: { success: (value: { code: string }) => void }) => success({ code: 'synthetic' }),
      request: ({ success }: { success: (value: unknown) => void }) => success({ statusCode: 200, data: { state } }),
    };
    await expect(controller.provePrepublication(wxApi, 'a'.repeat(20))).rejects.toThrow('authorization_failed');
  });

  it('routes only server-issued purpose values', () => {
    expect(controller.endpointForPurpose('signin')).toBe('/api/auth/wechat-mobile/confirm');
    expect(controller.endpointForPurpose('rebind')).toBe('/api/auth/wechat-rebind/prove');
    expect(() => controller.endpointForPurpose('profile')).toThrow('invalid_purpose');
  });

  it('rejects malformed launch data before calling wx.login', () => {
    expect(() => controller.parseLaunchOptions({ ...launch, c: 'short' })).toThrow(
      'invalid_launch',
    );
    expect(() => controller.parseLaunchOptions({ ...launch, p: 'profile' })).toThrow(
      'invalid_launch',
    );
  });

  it('sends only code and transient server capabilities', async () => {
    const request = vi.fn(({ success }) =>
      success({ data: { state: 'authorized' }, statusCode: 200 }),
    );
    const wxApi = {
      login: ({ success }: { success: (value: { code: string }) => void }) =>
        success({ code: 'one-time-code' }),
      request,
    };
    const parsed = controller.parseLaunchOptions(launch);

    await controller.authorize(wxApi, parsed);

    expect(request).toHaveBeenCalledOnce();
    const options = request.mock.calls[0][0];
    expect(options.data).toEqual({
      code: 'one-time-code',
      completionCapability: launch.c,
      transactionId: launch.t,
    });
    expect(JSON.stringify(options.data)).not.toMatch(
      /appsecret|unionid|openid|session_key|access_token/i,
    );
  });

  it('keeps throttled and malformed upstream responses retryable', async () => {
    const wxApi = {
      login: ({ success }: { success: (value: { code: string }) => void }) =>
        success({ code: 'one-time-code' }),
      request: ({ success }: { success: (value: { statusCode: number }) => void }) =>
        success({ statusCode: 502 }),
    };

    await expect(
      controller.authorize(wxApi, controller.parseLaunchOptions(launch)),
    ).rejects.toThrow('askcore_unavailable');
  });

  it.each([undefined, {}, { state: 'pending' }, { state: 'verified' }, 'unexpected HTML'])(
    'does not display successful authorization for an unrelated HTTP 200 body: %j',
    async (data) => {
      const wxApi = {
        login: ({ success }: { success: (value: { code: string }) => void }) =>
          success({ code: 'one-time-code' }),
        request: ({ success }: { success: (value: unknown) => void }) =>
          success({ data, statusCode: 200 }),
      };
      await expect(
        controller.authorize(wxApi, controller.parseLaunchOptions(launch)),
      ).rejects.toThrow('authorization_failed');
    },
  );

  it('captures a new Scheme transaction when an existing mini-program is shown again', () => {
    let app:
      | {
          globalData: {
            wechatLaunch: null | {
              key: string;
              options: Record<string, string>;
              version: number;
            };
          };
          onShow: (options: { query: Record<string, string> }) => void;
        }
      | undefined;
    vi.stubGlobal('App', (definition: typeof app) => {
      app = definition;
    });
    vi.resetModules();
    require('../app');

    app!.onShow({ query: launch });
    expect(app!.globalData.wechatLaunch).toMatchObject({
      options: launch,
      version: 1,
    });

    app!.onShow({ query: launch });
    expect(app!.globalData.wechatLaunch?.version).toBe(1);

    const nextLaunch = { ...launch, t: `wxm_${'c'.repeat(24)}` };
    app!.onShow({ query: nextLaunch });
    expect(app!.globalData.wechatLaunch).toMatchObject({
      options: nextLaunch,
      version: 2,
    });
  });
});
