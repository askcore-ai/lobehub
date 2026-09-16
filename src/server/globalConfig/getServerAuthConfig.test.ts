import { describe, expect, it, vi } from 'vitest';

const compliance = {
  icpRecordText: '京ICP备00000000号-1',
  icpRecordUrl: 'https://beian.miit.gov.cn/',
};

vi.mock('@/envs/app', () => ({
  appEnv: {
    MARKET_TRUSTED_CLIENT_ID: 'aitutor-lobehub',
    MARKET_TRUSTED_CLIENT_SECRET: 'secret',
  },
}));

vi.mock('@/envs/auth', () => ({
  authEnv: {
    AUTH_DISABLE_EMAIL_PASSWORD: false,
    AUTH_EMAIL_VERIFICATION: true,
    AUTH_ENABLE_MAGIC_LINK: true,
    AUTH_SSO_PROVIDERS: 'feishu,wechat',
    AUTH_WECHAT_MOBILE_LOGIN_ENABLED: false,
  },
}));

vi.mock('@/libs/better-auth/utils/server', () => ({
  parseSSOProviders: vi.fn(() => ['feishu', 'wechat']),
}));

vi.mock('./compliance', () => ({
  getServerComplianceConfig: vi.fn(() => compliance),
}));

describe('getServerAuthConfig', () => {
  it('includes compliance config for the public auth shell', async () => {
    const { getServerAuthConfig } = await import('./getServerAuthConfig');

    expect(getServerAuthConfig()).toMatchObject({
      compliance,
      enableEmailVerification: true,
      enableMagicLink: true,
      enableMarketTrustedClient: true,
      enableWechatMobileLogin: false,
      oAuthSSOProviders: ['feishu', 'wechat'],
    });
  });
});
