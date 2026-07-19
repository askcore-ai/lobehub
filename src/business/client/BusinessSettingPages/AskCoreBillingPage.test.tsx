import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import jaSubscription from '../../../../locales/ja-JP/subscription.json';
import {
  ASKCORE_BILLING_OPEN_URL_MESSAGE,
  BillingView,
  buildAskCoreBillingEmbedUrl,
  createLocalizedBillingCopy,
  formatBillingInterval,
  formatBillingStatus,
  formatPersonalRenewalMode,
  formatPlanTopupUnitPrice,
  getBillingCopy,
  isAllowedBillingExternalUrl,
  isAskCoreBillingPageKey,
  isWechatQrCheckout,
  localizeReferralRules,
  normalizeBillingPath,
  normalizePlansPayload,
  PlansView,
  resolveDefaultProvider,
} from './AskCoreBillingPage';

describe('AskCore billing embed helpers', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
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
    expect(formatPersonalRenewalMode('manual', zhCopy)).toBe('到期后手动续费，不会自动扣款');
    expect(formatPersonalRenewalMode('manual', enCopy)).toBe(
      'Manual renewal — no automatic charge',
    );

    const rules = localizeReferralRules(
      {
        expiry_days: 100,
        registration: 'registration',
        reward: 'reward',
        reward_delay_hours: 6,
        valid_action: 'first_billable_usage',
      },
      100,
      zhCopy,
    );

    const text = rules.map((item) => item.text).join('\n');

    expect(text).toContain('注册方式');
    expect(text).toContain('100 积分');
    expect(text).toContain('6 小时');
    expect(text).toContain('100 天');
    expect(text).toContain('首次产生可计费用量');
    expect(text).not.toContain('0M');
    expect(text).not.toContain('registration');
    expect(text).not.toContain('first_billable_usage');
  });

  it('renders fixed prepaid terms without automatic-payment claims', async () => {
    const personal = {
      account_id: 137,
      balance_credits: 320,
      current_term: {
        id: 1,
        interval: 'month' as const,
        plan_id: 'professional',
        status: 'active' as const,
        term_end: '2026-08-19T12:00:00+00:00',
        term_start: '2026-07-19T12:00:00+00:00',
      },
      next_payment: null,
      plan_id: 'professional',
      renewal_mode: 'manual' as const,
      scheduled_terms: [
        {
          id: 2,
          interval: 'month' as const,
          plan_id: 'professional',
          status: 'scheduled' as const,
          term_end: '2026-09-19T12:00:00+00:00',
          term_start: '2026-08-19T12:00:00+00:00',
        },
      ],
      subscription_status: 'active',
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ items: [], summary: personal }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(
      <BillingView
        copy={getBillingCopy('en-US')}
        isChinese={false}
        moneyFormatter={new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })}
        accountState={{
          data: {
            billing_enabled: true,
            credit_unit: 'credits',
            currency: 'CNY',
            mode: 'enforce',
            personal,
          },
          loading: false,
        }}
        plansPayload={{
          billing_enabled: true,
          credit_packs: [],
          credit_unit: 'credits',
          currency: 'CNY',
          mode: 'enforce',
          plans: [
            {
              description: 'Professional prepaid access',
              display_name: 'Professional',
              features: [],
              id: 'professional',
              monthly_credits: 350,
              monthly_price_usd: 6.99,
            },
          ],
        }}
      />,
    );

    expect(await screen.findByText('Manual renewal — no automatic charge')).toBeInTheDocument();
    expect(screen.getByText('Paid Access Starts')).toBeInTheDocument();
    expect(screen.getByText('Paid Access Ends')).toBeInTheDocument();
    expect(screen.getByText('Scheduled Terms')).toBeInTheDocument();
    expect(screen.getAllByText(/Professional/).length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText('Next Payment')).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/askcore/billing/billing-history',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('renders the derived free state without a current or scheduled prepaid term', async () => {
    const personal = {
      account_id: 138,
      balance_credits: 20,
      current_term: null,
      next_payment: null,
      plan_id: 'free',
      renewal_mode: 'manual' as const,
      scheduled_terms: [],
      subscription_status: 'free',
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ items: [], summary: personal }), {
          headers: { 'Content-Type': 'application/json' },
          status: 200,
        }),
      ),
    );

    render(
      <BillingView
        copy={getBillingCopy('en-US')}
        isChinese={false}
        moneyFormatter={new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })}
        accountState={{
          data: {
            billing_enabled: true,
            credit_unit: 'credits',
            currency: 'CNY',
            mode: 'enforce',
            personal,
          },
          loading: false,
        }}
        plansPayload={{
          billing_enabled: true,
          credit_packs: [],
          credit_unit: 'credits',
          currency: 'CNY',
          mode: 'enforce',
          plans: [],
        }}
      />,
    );

    expect(await screen.findAllByText('Free')).not.toHaveLength(0);
    expect(screen.getByText('No prepaid terms are queued')).toBeInTheDocument();
    expect(screen.getByText('Paid Access Starts')).toBeInTheDocument();
    expect(screen.getByText('Paid Access Ends')).toBeInTheDocument();
    expect(screen.getAllByText('-').length).toBeGreaterThanOrEqual(3);
    expect(screen.queryByText('Next Payment')).not.toBeInTheDocument();
  });

  it('renders the backend renewal FAQ through a non-English locale key', () => {
    const translate = (key: string, options?: Record<string, unknown>) =>
      String((jaSubscription as Record<string, string>)[key] ?? options?.defaultValue ?? key);
    const copy = createLocalizedBillingCopy('ja-JP', translate);
    const plansPayload = {
      billing_enabled: true,
      billing_periods: [],
      credit_packs: [],
      credit_unit: 'credits',
      currency: 'CNY',
      faq: [
        {
          answer:
            'Each purchase is a fixed prepaid term. Renew manually before or after expiry; AskCore will not charge automatically.',
          question: 'How do I renew my prepaid term?',
        },
      ],
      mode: 'enforce',
      plans: [
        {
          description: 'Free access',
          display_name: 'Free',
          features: [],
          id: 'free',
          monthly_credits: 20,
          monthly_price_usd: 0,
        },
      ],
    };

    render(
      <PlansView
        copy={copy}
        isChinese={false}
        moneyFormatter={new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' })}
        plansPayload={plansPayload}
        state={{ data: plansPayload, loading: false }}
        onCheckoutSuccess={vi.fn()}
      />,
    );

    expect(screen.getByText('有料期間を更新するにはどうすればよいですか？')).toBeInTheDocument();
    expect(screen.queryByText('How do I renew my prepaid term?')).not.toBeInTheDocument();
  });
});
