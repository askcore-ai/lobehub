// @vitest-environment node

import { afterEach, describe, expect, it } from 'vitest';

import { getAuthConfig } from './auth';

const originalEnvironment = process.env.AUTH_WECHAT_MINI_PROGRAM_ENV_VERSION;
const originalTrialDeadline = process.env.AUTH_WECHAT_MINI_PROGRAM_TRIAL_EXPIRES_AT;

afterEach(() => {
  if (originalEnvironment === undefined) {
    delete process.env.AUTH_WECHAT_MINI_PROGRAM_ENV_VERSION;
  } else {
    process.env.AUTH_WECHAT_MINI_PROGRAM_ENV_VERSION = originalEnvironment;
  }
  if (originalTrialDeadline === undefined) {
    delete process.env.AUTH_WECHAT_MINI_PROGRAM_TRIAL_EXPIRES_AT;
  } else {
    process.env.AUTH_WECHAT_MINI_PROGRAM_TRIAL_EXPIRES_AT = originalTrialDeadline;
  }
});

describe('WeChat mini-program URL Link environment', () => {
  it('reads the bounded trial deadline from the server process environment', () => {
    process.env.AUTH_WECHAT_MINI_PROGRAM_ENV_VERSION = 'trial';
    process.env.AUTH_WECHAT_MINI_PROGRAM_TRIAL_EXPIRES_AT = '2026-09-28T09:30:00Z';

    const config = getAuthConfig();

    expect(config.AUTH_WECHAT_MINI_PROGRAM_ENV_VERSION).toBe('trial');
    expect(config.AUTH_WECHAT_MINI_PROGRAM_TRIAL_EXPIRES_AT).toBe('2026-09-28T09:30:00Z');
  });
});
