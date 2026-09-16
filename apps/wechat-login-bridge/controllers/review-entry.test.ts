import { createRequire } from 'node:module';

import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const pagePath = require.resolve('../pages/login/index.js');

interface LoginPage {
  data: {
    busy: boolean;
    detail: string;
    invalid: boolean;
    status: string;
    title: string;
  };
  onAuthorize: () => Promise<void>;
  onLoad: (options: Record<string, string>) => void;
  setData: (data: Partial<LoginPage['data']>) => void;
}

const loadPage = () => {
  let definition: LoginPage | undefined;
  const wxApi = { login: vi.fn(), request: vi.fn() };
  vi.stubGlobal('wx', wxApi);
  vi.stubGlobal('getApp', () => ({ globalData: { wechatLaunch: null } }));
  vi.stubGlobal('Page', (page: LoginPage) => {
    definition = page;
  });
  delete require.cache[pagePath];
  require(pagePath);
  const page = definition!;
  page.setData = (data) => Object.assign(page.data, data);
  return { page, wxApi };
};

afterEach(() => {
  delete require.cache[pagePath];
  vi.unstubAllGlobals();
});

describe('WeChat login bridge direct entry', () => {
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
});
