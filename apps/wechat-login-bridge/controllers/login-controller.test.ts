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
