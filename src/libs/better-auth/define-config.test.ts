import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  betterAuth: vi.fn((options) => options),
  businessEmailHarmonyOptions: { allowNormalizedSignin: false },
  drizzleAdapter: vi.fn(() => ({ id: 'drizzle-adapter' })),
  emailHarmony: vi.fn((options) => ({ id: 'email-harmony', options })),
  wechatMobileLogin: vi.fn((options) => ({ id: 'wechat-mobile-login', options })),
}));

vi.mock('@better-auth/expo', () => ({
  expo: vi.fn(() => ({ id: 'expo' })),
}));

vi.mock('@better-auth/passkey', () => ({
  passkey: vi.fn(() => ({ id: 'passkey' })),
}));

vi.mock('@lobechat/database', () => ({
  createNanoId: vi.fn(() => vi.fn(() => 'generated-id')),
  idGenerator: vi.fn(() => 'generated-user-id'),
  serverDB: {},
}));

vi.mock('@lobechat/database/schemas', () => ({}));

vi.mock('bcryptjs', () => ({
  default: {
    compare: vi.fn(),
  },
}));

vi.mock('better-auth/adapters/drizzle', () => ({
  drizzleAdapter: mocks.drizzleAdapter,
}));

vi.mock('better-auth/crypto', () => ({
  verifyPassword: vi.fn(),
}));

vi.mock('better-auth/minimal', () => ({
  betterAuth: mocks.betterAuth,
}));

vi.mock('better-auth/plugins', () => ({
  admin: vi.fn(() => ({ id: 'admin' })),
  emailOTP: vi.fn(() => ({ id: 'email-otp' })),
  genericOAuth: vi.fn(() => ({ id: 'generic-oauth' })),
  magicLink: vi.fn(() => ({ id: 'magic-link' })),
  organization: vi.fn(() => ({ id: 'organization' })),
}));

vi.mock('better-auth-harmony', () => ({
  emailHarmony: mocks.emailHarmony,
}));

vi.mock('undici', () => ({
  ProxyAgent: vi.fn(),
  setGlobalDispatcher: vi.fn(),
}));

vi.mock('@/business/server/better-auth', () => ({
  businessEmailHarmonyOptions: mocks.businessEmailHarmonyOptions,
}));

vi.mock('@/envs/app', () => ({
  appEnv: {
    APP_URL: 'https://example.com',
  },
}));

vi.mock('@/envs/auth', () => ({
  authEnv: {
    AUTH_DISABLE_EMAIL_PASSWORD: false,
    AUTH_EMAIL_VERIFICATION: true,
    AUTH_ENABLE_MAGIC_LINK: false,
    AUTH_SECRET: 'test-secret',
    AUTH_SSO_PROVIDERS: '',
    AUTH_WECHAT_ID: 'wx-open-platform-app',
    AUTH_WECHAT_IDENTITY_MODE: 'legacy',
    AUTH_WECHAT_MINI_PROGRAM_APP_ID: '',
    AUTH_WECHAT_MINI_PROGRAM_SECRET: '',
    AUTH_WECHAT_MOBILE_LOGIN_ENABLED: false,
    AUTH_WECHAT_REBIND_ENABLED: false,
    AUTH_WECHAT_SCHEME_PATH: 'pages/login/index',
    AUTH_WECHAT_SECRET: 'wx-website-secret',
    AUTH_WECHAT_SESSION_RECOVERY_SECONDS: 60,
    AUTH_WECHAT_TRANSACTION_TTL_SECONDS: 300,
  },
}));

vi.mock('@/libs/better-auth/email-templates', () => ({
  getChangeEmailVerificationTemplate: vi.fn(() => ({})),
  getMagicLinkEmailTemplate: vi.fn(() => ({})),
  getResetPasswordEmailTemplate: vi.fn(() => ({})),
  getVerificationEmailTemplate: vi.fn(() => ({})),
  getVerificationOTPEmailTemplate: vi.fn(() => ({})),
}));

vi.mock('@/libs/better-auth/plugins/email-whitelist', () => ({
  emailWhitelist: vi.fn(() => ({ id: 'email-whitelist' })),
}));

vi.mock('@/libs/better-auth/plugins/wechat-mobile-login', () => ({
  wechatMobileLogin: mocks.wechatMobileLogin,
}));

vi.mock('@/libs/better-auth/sso', () => ({
  initBetterAuthSSOProviders: vi.fn(() => ({
    genericOAuthProviders: [],
    socialProviders: {},
  })),
}));

vi.mock('@/libs/better-auth/utils/config', () => ({
  createSecondaryStorage: vi.fn(() => ({ id: 'secondary-storage' })),
  getTrustedOrigins: vi.fn(() => ['https://example.com']),
}));

vi.mock('@/libs/better-auth/utils/server', () => ({
  parseSSOProviders: vi.fn(() => []),
}));

vi.mock('@/server/services/email', () => ({
  EmailService: vi.fn(),
}));

vi.mock('@/server/services/user', () => ({
  UserService: vi.fn(),
}));

describe('defineConfig', () => {
  it('keeps native login methods linked to one Better Auth user', async () => {
    const { defineConfig } = await import('./define-config');

    defineConfig({ plugins: [] });

    expect(mocks.betterAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        account: {
          accountLinking: {
            allowDifferentEmails: true,
            enabled: true,
            trustedProviders: [],
          },
        },
      }),
    );
  });

  it('should revoke existing sessions after password reset by default', async () => {
    const { defineConfig } = await import('./define-config');

    defineConfig({ plugins: [] });

    expect(mocks.betterAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        emailAndPassword: expect.objectContaining({
          revokeSessionsOnPasswordReset: true,
        }),
      }),
    );
  });

  it('should delegate emailHarmony options to the business slot', async () => {
    const { defineConfig } = await import('./define-config');

    defineConfig({ plugins: [] });

    expect(mocks.emailHarmony).toHaveBeenCalledWith(mocks.businessEmailHarmonyOptions);
  });

  it('keeps session discovery available behind a shared school NAT', async () => {
    const { defineConfig } = await import('./define-config');

    defineConfig({ plugins: [] });

    expect(mocks.betterAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        rateLimit: {
          customRules: {
            '/get-session': { max: 1000, window: 1 },
            '/request-password-reset': { max: 3, window: 60 },
            '/send-verification-email': { max: 3, window: 60 },
          },
        },
      }),
    );
  });

  it('registers the disabled Release A WeChat bridge inside Better Auth', async () => {
    const { defineConfig } = await import('./define-config');

    defineConfig({ plugins: [] });

    expect(mocks.wechatMobileLogin).toHaveBeenCalledWith({
      appId: 'wx-open-platform-app',
      appSecret: '',
      appURL: 'https://example.com',
      identityMode: 'legacy',
      miniProgramAppId: '',
      mobileLoginEnabled: false,
      rebindEnabled: false,
      recoverySeconds: 60,
      schemePath: 'pages/login/index',
      transactionTtlSeconds: 300,
      websiteAppSecret: 'wx-website-secret',
    });
    expect(mocks.drizzleAdapter).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ provider: 'pg', transaction: true }),
    );
  });
});
