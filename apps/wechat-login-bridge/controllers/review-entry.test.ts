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
    manualCode: string;
    manualValid: boolean;
    status: string;
    title: string;
  };
  onAuthorize: () => Promise<void>;
  onManualInput: (event: { detail: { value: string } }) => void;
  onManualProof: () => Promise<void>;
  onHide: () => void;
  onUnload: () => void;
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
    globalData: { wechatLaunch: null | { options: Record<string, string>; version: number } };
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
  it('requires explicit valid manual input and describes only an authorization check', async () => {
    const { page, wxApi } = loadPage();
    page.onLoad({});
    page.onManualInput({ detail: { value: 'short' } });
    await page.onManualProof();
    expect(wxApi.login).not.toHaveBeenCalled();
    page.onManualInput({ detail: { value: 'abcde f0123 abcde f0123' } });
    expect(page.data.manualValid).toBe(true);
    expect(wxApi.login).not.toHaveBeenCalled();
    wxApi.login.mockImplementation(({ success }) => success({ code: 'synthetic' }));
    wxApi.request.mockImplementation(({ success }) => success({ statusCode: 200, data: { state: 'proof_ready' } }));
    await page.onManualProof();
    expect(page.data.status).toBe('proof_ready');
    expect(page.data.detail).toContain('未创建登录会话');
    expect(page.data.manualCode).toBe('');
    expect(wxApi.setClipboardData).not.toHaveBeenCalled();
    await page.onManualProof();
    expect(wxApi.login).toHaveBeenCalledOnce();
  });

  it.each(['onHide', 'onUnload'] as const)('clears manual input on %s and ignores delayed completion', async (event) => {
    const { page, wxApi } = loadPage();
    page.onLoad({});
    page.onManualInput({ detail: { value: 'a'.repeat(20) } });
    let complete: (value: { code: string }) => void = () => {};
    wxApi.login.mockImplementation(({ success }) => { complete = success; });
    const pending = page.onManualProof();
    page[event]();
    complete({ code: 'synthetic' });
    await pending;
    expect(page.data.manualCode).toBe('');
    expect(page.data.status).toBe('welcome');
    expect(wxApi.request).not.toHaveBeenCalled();
  });

  it('rejects a delayed manual response after a new Scheme launch', async () => {
    const { page, wxApi, app } = loadPage();
    page.onLoad({});
    page.onManualInput({ detail: { value: 'a'.repeat(20) } });
    wxApi.login.mockImplementation(({ success }) => success({ code: 'synthetic' }));
    let complete: (value: unknown) => void = () => {};
    wxApi.request.mockImplementation(({ success }) => { complete = success; });
    const pending = page.onManualProof();
    await vi.waitFor(() => expect(wxApi.request).toHaveBeenCalled());
    app.globalData.wechatLaunch = { options: launch, version: 1 };
    page.onShow();
    complete({ statusCode: 200, data: { state: 'proof_ready' } });
    await pending;
    expect(page.data.status).toBe('ready');
    expect(page.data.title).toBe('登录 AskCore');
    expect(page.data.manualCode).toBe('');
  });

  it('opens without launch parameters as an actionable welcome, not an expired login', async () => {
    const { page, wxApi } = loadPage();

    page.onLoad({});

    expect(page.data.title).not.toBe('链接已失效');
    expect(page.data.status).toBe('welcome');
    expect(page.data.detail).toContain('askcore.cn');
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
    expect(page.data.detail).toContain('返回原浏览器继续确认');
    await page.onAuthorize();
    expect(wxApi.login).toHaveBeenCalledOnce();
  });

  it('allows temporary failure retry but makes a rejected transaction terminal', async () => {
    const { page, wxApi } = loadPage();
    wxApi.login.mockImplementation(({ success }) => success({ code: 'synthetic-code' }));
    wxApi.request.mockImplementationOnce(({ success }) => success({ statusCode: 503 }));
    wxApi.request.mockImplementationOnce(({ success }) => success({ statusCode: 409 }));

    page.onLoad(launch);
    await page.onAuthorize();
    expect(page.data.status).toBe('ready');
    expect(page.data.invalid).toBe(false);
    await page.onAuthorize();
    expect(page.data.status).toBe('failed');
    expect(page.data.invalid).toBe(true);
    await page.onAuthorize();
    expect(wxApi.login).toHaveBeenCalledTimes(2);
  });

  it('does not let a previous pending response replace a newer launch', async () => {
    const { app, page, wxApi } = loadPage();
    wxApi.login.mockImplementation(({ success }) => success({ code: 'synthetic-code' }));
    let completeRequest: ((result: { data: { state: string }; statusCode: number }) => void) | undefined;
    wxApi.request.mockImplementation(({ success }) => {
      completeRequest = success;
    });
    page.onLoad(launch);
    const completion = page.onAuthorize();
    await vi.waitFor(() => expect(completeRequest).toBeDefined());
    app.globalData.wechatLaunch = {
      options: { ...launch, p: 'rebind', t: `wxm_${'c'.repeat(24)}` },
      version: 1,
    };
    page.onShow();
    completeRequest!({ data: { state: 'authorized' }, statusCode: 200 });
    await completion;

    expect(page.data.status).toBe('ready');
    expect(page.data.title).toBe('验证 AskCore 微信身份');
    expect(page.data.busy).toBe(false);
  });
});
