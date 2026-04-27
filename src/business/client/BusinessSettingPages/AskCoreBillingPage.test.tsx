import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ASKCORE_BILLING_OPEN_URL_MESSAGE,
  buildAskCoreBillingEmbedUrl,
  isAllowedBillingExternalUrl,
  isAskCoreBillingPageKey,
  normalizeBillingPath,
  normalizePlansPayload,
  resolveDefaultProvider,
} from './AskCoreBillingPage';

describe('AskCore billing embed helpers', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('builds same-origin AskCore embed URLs by default', () => {
    const url = buildAskCoreBillingEmbedUrl({
      language: 'zh-CN',
      origin: 'https://askcore.cn',
      page: 'plans',
    });

    expect(url).toBe('https://askcore.cn/embed/subscription/plans?hl=zh-CN');
  });

  it('supports an explicit AskCore embed base URL', () => {
    vi.stubEnv(
      'NEXT_PUBLIC_ASKCORE_BILLING_EMBED_URL',
      'https://billing.askcore.cn/embed/subscription',
    );

    const url = buildAskCoreBillingEmbedUrl({
      origin: 'https://askcore.cn',
      page: 'billing',
    });

    expect(url).toBe('https://billing.askcore.cn/embed/subscription/billing');
  });

  it('keeps plan data backend-driven and resolves enabled providers', () => {
    const payload = normalizePlansPayload({
      credit_packs: [{ credits: 100, display_name: 'Pack', id: 'pack', price_usd: 1 }],
      plans: [
        {
          display_name: 'Hobby',
          features: [],
          id: 'hobby',
          monthly_credits: 1000,
          monthly_price_usd: 9,
        },
      ],
    });

    expect(payload.plans.map((plan) => plan.id)).toEqual(['hobby']);
    expect(payload.creditPacks).toHaveLength(1);
    expect(resolveDefaultProvider({ alipay: { enabled: true }, stripe: { enabled: false } })).toBe(
      'alipay',
    );
  });

  it('routes public plans directly and protected billing through the LobeHub proxy', () => {
    expect(normalizeBillingPath('/plans', { publicEndpoint: true })).toBe('/api/billing/v1/plans');
    expect(normalizeBillingPath('/account')).toBe('/api/askcore/billing/account');
    expect(normalizeBillingPath('usage')).toBe('/api/askcore/billing/usage');
  });

  it('validates billing page keys and external payment URLs', () => {
    expect(ASKCORE_BILLING_OPEN_URL_MESSAGE).toBe('askcore-billing:open-url');
    expect(isAskCoreBillingPageKey('referral')).toBe(true);
    expect(isAskCoreBillingPageKey('funds')).toBe(false);
    expect(
      isAllowedBillingExternalUrl('https://checkout.stripe.com/pay/cs_test', {
        appOrigin: 'https://askcore.cn',
        embedOrigin: 'https://askcore.cn',
      }),
    ).toBe(true);
    expect(
      isAllowedBillingExternalUrl('https://billing.example.com/embed/subscription/plans', {
        appOrigin: 'https://askcore.cn',
        embedOrigin: 'https://askcore.cn',
      }),
    ).toBe(false);
  });
});
