import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ASKCORE_BILLING_OPEN_URL_MESSAGE,
  buildAskCoreBillingEmbedUrl,
  formatBillingInterval,
  formatBillingStatus,
  formatPlanTopupUnitPrice,
  getBillingCopy,
  isAllowedBillingExternalUrl,
  isAskCoreBillingPageKey,
  isWechatQrCheckout,
  localizeReferralRules,
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

  it('carries returned payment checkout ids into the embed URL', () => {
    const url = buildAskCoreBillingEmbedUrl({
      checkoutId: 'p33a_checkout',
      language: 'zh-CN',
      origin: 'https://askcore.cn',
      page: 'billing',
    });

    expect(url).toBe(
      'https://askcore.cn/embed/subscription/billing?hl=zh-CN&p33_checkout=p33a_checkout',
    );
  });

  it('keeps plan data backend-driven and resolves enabled providers', () => {
    const payload = normalizePlansPayload({
      billing_periods: [{ id: 'yearly', label: 'Yearly' }],
      credit_packs: [{ credits: 100, display_name: 'Pack', id: 'pack', price_usd: 1 }],
      plans: [
        {
          description: 'Local plan',
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
    expect(payload.billingPeriods).toEqual([{ id: 'yearly', label: 'Yearly' }]);
    expect(
      resolveDefaultProvider({ alipay: { enabled: true }, stripe: { enabled: false } }),
    ).toBeNull();
    expect(
      resolveDefaultProvider(
        { alipay: { enabled: true }, stripe: { enabled: true }, wechat: { enabled: true } },
        { isChinese: true },
      ),
    ).toBe('alipay');
    expect(
      resolveDefaultProvider(
        {
          alipay: { checkout_available: false, enabled: true },
          stripe: { enabled: true },
          wechat: { enabled: true },
        },
        { isChinese: true },
      ),
    ).toBe('wechat');
    expect(
      resolveDefaultProvider(
        { alipay: { enabled: true }, stripe: { enabled: true }, wechat: { enabled: true } },
        { isChinese: false },
      ),
    ).toBe('stripe');
    expect(
      resolveDefaultProvider(
        { stripe: { enabled: true }, wechat: { enabled: true } },
        { isChinese: false },
      ),
    ).toBe('stripe');
    expect(resolveDefaultProvider({ wechat: { enabled: true } }, { isChinese: false })).toBeNull();
  });

  it('labels plan top-up prices per credit rather than per million credits', () => {
    expect(
      formatPlanTopupUnitPrice(
        { topup_unit_price_cny: 0.09, topup_unit_price_usd: 0.01 },
        true,
        getBillingCopy('zh-CN'),
      ),
    ).toBe('¥0.09 / 积分');
  });

  it('detects WeChat Native QR checkout responses', () => {
    expect(
      isWechatQrCheckout({
        checkout_id: 'p33w_checkout',
        checkout_type: 'qrcode',
        code_url: 'weixin://wxpay/bizpayurl?pr=test',
        live_payment: true,
        mode: 'enforce',
        provider: 'wechat',
        purpose: 'subscription',
        status: 'pending',
        url: 'https://askcore.cn/settings/billing?p33_checkout=p33w_checkout',
      }),
    ).toBe(true);
    expect(
      isWechatQrCheckout({
        checkout_id: 'p33s_checkout',
        checkout_type: 'redirect',
        live_payment: true,
        mode: 'enforce',
        provider: 'stripe',
        purpose: 'subscription',
        status: 'pending',
        url: 'https://checkout.stripe.com/pay/cs_test',
      }),
    ).toBe(false);
  });

  it('routes public plans directly and protected billing through the LobeHub proxy', () => {
    expect(normalizeBillingPath('/plans', { publicEndpoint: true })).toBe('/api/billing/v1/plans');
    expect(normalizeBillingPath('/account')).toBe('/api/askcore/billing/account');
    expect(normalizeBillingPath('usage')).toBe('/api/askcore/billing/usage');
    expect(normalizeBillingPath('/credits/auto-topup')).toBe(
      '/api/askcore/billing/credits/auto-topup',
    );
    expect(normalizeBillingPath('/referrals/backfill')).toBe(
      '/api/askcore/billing/referrals/backfill',
    );
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
      isAllowedBillingExternalUrl(
        'https://openapi.alipay.com/gateway.do?method=alipay.trade.page.pay',
        {
          appOrigin: 'https://askcore.cn',
          embedOrigin: 'https://askcore.cn',
        },
      ),
    ).toBe(true);
    expect(
      isAllowedBillingExternalUrl('https://billing.example.com/embed/subscription/plans', {
        appOrigin: 'https://askcore.cn',
        embedOrigin: 'https://askcore.cn',
      }),
    ).toBe(false);
  });

  it('localizes billing intervals, statuses, and referral rule keys', () => {
    const zhCopy = getBillingCopy('zh-CN');
    const enCopy = getBillingCopy('en-US');

    expect(formatBillingInterval('month', zhCopy)).toBe('每月');
    expect(formatBillingInterval('yearly', zhCopy)).toBe('每年');
    expect(formatBillingInterval('payonce', enCopy)).toBe('One-time');
    expect(formatBillingStatus('free', zhCopy)).toBe('免费版');
    expect(formatBillingStatus('pending_reward', zhCopy)).toBe('审核中');

    const rules = localizeReferralRules(
      { registration: 'registration', reward: 'reward', rewardDelay: 'rewardDelay' },
      1_000_000,
      zhCopy,
    );

    expect(rules.map((item) => item.text).join('\n')).toContain('注册方式');
    expect(rules.map((item) => item.text).join('\n')).toContain('奖励');
    expect(rules.map((item) => item.text).join('\n')).not.toContain('registration');
    expect(rules.map((item) => item.text).join('\n')).not.toContain('rewardDelay');
  });
});
