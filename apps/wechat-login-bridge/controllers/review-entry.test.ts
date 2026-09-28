import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const pagePath = require.resolve('../pages/login/index.js');

interface LoginPage {
  data: {
    busy: boolean;
    actionText: string;
    detail: string;
    invalid: boolean;
    status: string;
    title: string;
  };
  onAuthorize: () => Promise<void>;
  onCopyWebsite: () => void;
  onLoad: (options: Record<string, string>) => void;
  onShow: () => void;
  setData: (data: Partial<LoginPage['data']>) => void;
}

const loadPage = () => {
  let definition: LoginPage | undefined;
  const wxApi = {
    login: vi.fn(),
    request: vi.fn(),
    setClipboardData: vi.fn(),
    showToast: vi.fn(),
  };
  const app: {
    globalData: {
      wechatLaunch: null | { options: Record<string, string | undefined>; version: number };
    };
  } = { globalData: { wechatLaunch: null } };
  vi.stubGlobal('wx', wxApi);
  vi.stubGlobal('getApp', () => app);
  vi.stubGlobal('Page', (page: LoginPage) => {
    definition = page;
  });
  delete require.cache[pagePath];
  require(pagePath);
  const page = definition!;
  page.setData = (data) => Object.assign(page.data, data);
  return { app, page, wxApi };
};

const launch = { c: 'a'.repeat(43), p: 'signin', t: `wxm_${'b'.repeat(24)}` };

afterEach(() => {
  delete require.cache[pagePath];
  vi.unstubAllGlobals();
});

describe('WeChat login bridge direct entry', () => {
  it('uses the App query and automatically confirms a cold sign-in launch', async () => {
    const { page, wxApi, app } = loadPage();
    wxApi.login.mockImplementation(({ success }) => success({ code: 'synthetic-code' }));
    wxApi.request.mockImplementation(({ success }) =>
      success({ data: { state: 'authorized' }, statusCode: 200 }),
    );
    app.globalData.wechatLaunch = { options: launch, version: 1 };

    page.onLoad({});

    await vi.waitFor(() => expect(page.data.status).toBe('authorized'));
    expect(page.data.title).toBe('AskCore 登录成功');
    expect(page.data.detail).toBe('请返回原浏览器，继续使用 AskCore。');
    expect(page.data.title).not.toContain('授权');
    expect(app.globalData.wechatLaunch.options).toBeNull();
    expect(wxApi.login).toHaveBeenCalledOnce();
    expect(wxApi.request).toHaveBeenCalledOnce();
  });

  it('shows welcome when App has only unrelated launch parameters', () => {
    const { page, wxApi, app } = loadPage();
    // App.onShow retains the p/t/c keys with undefined values for other query input.
    app.globalData.wechatLaunch = {
      options: { c: undefined, p: undefined, t: undefined },
      version: 1,
    };

    page.onLoad({});

    expect(page.data.status).toBe('welcome');
    expect(page.data.title).toBe('AskCore 微信登录');
    expect(wxApi.login).not.toHaveBeenCalled();
  });

  it('keeps a partial App transaction fail-closed', () => {
    const { page, wxApi, app } = loadPage();
    app.globalData.wechatLaunch = {
      options: { c: undefined, p: 'signin', t: undefined },
      version: 1,
    };

    page.onLoad({});

    expect(page.data.status).toBe('failed');
    expect(wxApi.login).not.toHaveBeenCalled();
  });

  it('does not replace malformed Page launch data with a valid App query', async () => {
    const { page, wxApi, app } = loadPage();
    app.globalData.wechatLaunch = { options: launch, version: 1 };

    page.onLoad({ p: 'signin', t: 'invalid' });

    expect(page.data.status).toBe('failed');
    expect(wxApi.login).not.toHaveBeenCalled();
  });

  it('opens without launch parameters as an actionable welcome, not an expired login', async () => {
    const { page, wxApi } = loadPage();

    page.onLoad({});

    expect(page.data.title).not.toBe('登录链接已失效');
    expect(page.data.status).toBe('welcome');
    expect(page.data.detail).toBe('请从手机浏览器的 AskCore 登录页发起微信登录。');
    await page.onAuthorize();
    expect(wxApi.login).not.toHaveBeenCalled();
    expect(wxApi.request).not.toHaveBeenCalled();
  });

  it('does not treat a malformed supplied transaction as a fresh entry', async () => {
    const { page, wxApi } = loadPage();

    page.onLoad({ p: 'signin', t: 'invalid' });

    expect(page.data.status).toBe('failed');
    expect(page.data.invalid).toBe(true);
    await page.onAuthorize();
    expect(wxApi.login).not.toHaveBeenCalled();
    expect(wxApi.request).not.toHaveBeenCalled();
  });

  it('copies only the public website address on an explicit action', () => {
    const { page, wxApi } = loadPage();
    page.onLoad({});
    expect(wxApi.setClipboardData).not.toHaveBeenCalled();

    page.onCopyWebsite();

    expect(wxApi.setClipboardData).toHaveBeenCalledWith(
      expect.objectContaining({ data: 'https://askcore.cn' }),
    );
    expect(wxApi.login).not.toHaveBeenCalled();
  });

  it('only confirms a valid request after a tap and distinguishes identity proof', async () => {
    const { page, wxApi } = loadPage();
    wxApi.login.mockImplementation(({ success }) => success({ code: 'synthetic-code' }));
    wxApi.request.mockImplementation(({ success }) =>
      success({ data: { state: 'authorized' }, statusCode: 200 }),
    );

    page.onLoad({ ...launch, p: 'rebind' });
    expect(page.data.actionText).toBe('确认验证');
    expect(wxApi.login).not.toHaveBeenCalled();
    await page.onAuthorize();

    expect(page.data.status).toBe('authorized');
    expect(page.data.title).toBe('身份验证已提交');
    expect(page.data.detail).toBe('请返回原浏览器查看结果。');
    await page.onAuthorize();
    expect(wxApi.login).toHaveBeenCalledOnce();
  });

  it('silently retries one temporary sign-in failure before exposing manual retry', async () => {
    const { page, wxApi } = loadPage();
    wxApi.login
      .mockImplementationOnce(({ success }) => success({ code: 'synthetic-code-1' }))
      .mockImplementationOnce(({ success }) => success({ code: 'synthetic-code-2' }))
      .mockImplementationOnce(({ success }) => success({ code: 'synthetic-code-3' }));
    wxApi.request.mockImplementationOnce(({ success }) => success({ statusCode: 503 }));
    wxApi.request.mockImplementationOnce(({ success }) => success({ statusCode: 503 }));
    wxApi.request.mockImplementationOnce(({ success }) => success({ statusCode: 409 }));

    page.onLoad(launch);
    await vi.waitFor(() => expect(page.data.status).toBe('ready'));
    expect(wxApi.login).toHaveBeenCalledTimes(2);
    expect(wxApi.request).toHaveBeenCalledTimes(2);
    expect(wxApi.request.mock.calls.map(([options]) => options.data.code)).toEqual([
      'synthetic-code-1',
      'synthetic-code-2',
    ]);
    expect(page.data.status).toBe('ready');
    expect(page.data.invalid).toBe(false);
    expect(page.data.title).toBe('AskCore 登录失败');
    expect(page.data.detail).toBe('请稍后重试；仍失败请返回原浏览器。');
    await page.onAuthorize();
    expect(page.data.status).toBe('failed');
    expect(page.data.invalid).toBe(true);
    expect(page.data.title).toBe('AskCore 登录失败');
    expect(page.data.detail).toBe('请返回原浏览器重新发起操作。');
    await page.onAuthorize();
    expect(wxApi.login).toHaveBeenCalledTimes(3);
  });

  it('silently retries one wx.login failure for sign-in but never for rebind', async () => {
    const signin = loadPage();
    signin.wxApi.login
      .mockImplementationOnce(({ fail }) => fail())
      .mockImplementationOnce(({ success }) => success({ code: 'fresh-code' }));
    signin.wxApi.request.mockImplementation(({ success }) =>
      success({ data: { state: 'authorized' }, statusCode: 200 }),
    );

    signin.page.onLoad(launch);
    await vi.waitFor(() => expect(signin.page.data.status).toBe('authorized'));
    expect(signin.wxApi.login).toHaveBeenCalledTimes(2);
    expect(signin.wxApi.request).toHaveBeenCalledOnce();

    const rebind = loadPage();
    rebind.wxApi.login.mockImplementation(({ fail }) => fail());
    rebind.page.onLoad({ ...launch, p: 'rebind' });
    await rebind.page.onAuthorize();
    expect(rebind.page.data.status).toBe('ready');
    expect(rebind.wxApi.login).toHaveBeenCalledOnce();
  });

  it('does not let a previous pending response replace a newer launch', async () => {
    const { app, page, wxApi } = loadPage();
    wxApi.login.mockImplementation(({ success }) => success({ code: 'synthetic-code' }));
    let completeRequest:
      ((result: { data: { state: string }; statusCode: number }) => void) | undefined;
    wxApi.request.mockImplementation(({ success }) => {
      completeRequest = success;
    });
    page.onLoad(launch);
    await vi.waitFor(() => expect(completeRequest).toBeDefined());
    app.globalData.wechatLaunch = {
      options: { ...launch, p: 'rebind', t: `wxm_${'c'.repeat(24)}` },
      version: 1,
    };
    page.onShow();
    completeRequest!({ data: { state: 'authorized' }, statusCode: 200 });
    await vi.waitFor(() => expect(page.data.title).toBe('确认微信身份'));

    expect(page.data.status).toBe('ready');
    expect(page.data.title).toBe('确认微信身份');
    expect(page.data.busy).toBe(false);
  });

  it('keeps the functional page concise and avoids ambiguous authorization copy', () => {
    const template = readFileSync(pagePath.replace(/\.js$/, '.wxml'), 'utf8');
    const pageSource = readFileSync(pagePath, 'utf8');

    expect(pageSource).not.toContain('微信授权已完成');
    expect(template).not.toContain('微信授权已完成');
    expect(template).not.toContain('class="steps"');
    expect(template).not.toContain('class="privacy"');
    expect(template).not.toContain('class="success"');
  });
});
