'use client';

import { OpenAI } from '@lobehub/icons';
import { Button, Flexbox, Tag, Text } from '@lobehub/ui';
import { Alert, Badge, Card, Empty, Progress, Skeleton, Statistic, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { createStaticStyles, cssVar } from 'antd-style';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';

import OrgSeats from './OrgSeats';

export const ASKCORE_BILLING_OPEN_URL_MESSAGE = 'askcore-billing:open-url';

export const ASKCORE_BILLING_PAGE_KEYS = [
  'billing',
  'credits',
  'plans',
  'referral',
  'usage',
] as const;

export type AskCoreBillingPageKey = (typeof ASKCORE_BILLING_PAGE_KEYS)[number];
type BillingProvider = 'alipay' | 'stripe' | 'wechat';

export interface AskCoreBillingPlan {
  display_name: string;
  features: string[];
  id: string;
  monthly_credits: number;
  monthly_price_usd: number;
}

export interface AskCoreCreditPack {
  credits: number;
  display_name: string;
  id: string;
  price_usd: number;
}

interface AskCorePlansPayload {
  billing_enabled: boolean;
  credit_packs: AskCoreCreditPack[];
  credit_unit: string;
  currency: string;
  mode: string;
  organization_seats?: {
    enabled: boolean;
    fallback_to_personal: boolean;
    min_paid_seats: number;
  };
  plans: AskCoreBillingPlan[];
  providers?: Partial<Record<BillingProvider, { enabled: boolean }>>;
}

interface AskCorePersonalAccount {
  account_id: number;
  balance_credits: number;
  plan_id: string;
  subscription_status: string;
}

export interface AskCoreOrganizationSeat {
  plan_id: string;
  quota_credits_remaining: number;
  quota_credits_total: number;
  quota_credits_used: number;
  seat_id: number;
  status: string;
  user_id: string;
}

export interface AskCoreBillingOrganization {
  account_id: number;
  auth_org_id: string;
  current_user_seat?: AskCoreOrganizationSeat | null;
  fallback_to_personal: boolean;
  min_paid_seats: number;
  seats: AskCoreOrganizationSeat[];
}

interface AskCoreAccountPayload {
  billing_enabled: boolean;
  credit_unit: string;
  currency: string;
  mode: string;
  organization?: AskCoreBillingOrganization | null;
  personal: AskCorePersonalAccount;
}

interface AskCoreUsageRow {
  amount_credits: number;
  created_at?: string | null;
  id: number;
  kind: string;
  model?: string | null;
  scope_type: string;
  source: string;
  tokens_total?: number | null;
}

interface AskCoreInvoiceRow {
  amount_due_usd: number;
  amount_paid_usd: number;
  hosted_invoice_url?: string | null;
  id: number;
  provider: string;
  provider_invoice_id?: string | null;
  status: string;
}

interface AskCoreReferralPayload {
  enabled: boolean;
  items: {
    invitee_user_id: string;
    reward_credits: number;
    status: string;
  }[];
  reward_credits: number;
  total_invites: number;
  total_rewarded: number;
}

interface CheckoutResponse {
  checkout_id: string;
  live_payment: boolean;
  mode: string;
  provider: BillingProvider;
  purpose: string;
  status: string;
  url: string;
}

interface ResourceState<T> {
  data?: T;
  error?: string;
  loading: boolean;
}

const currencyFormatter = new Intl.NumberFormat('en-US', {
  currency: 'USD',
  maximumFractionDigits: 2,
  style: 'currency',
});

const numberFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
});

const styles = createStaticStyles(({ css }) => ({
  cards: css`
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 12px;
  `,
  header: css`
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  `,
  metricGrid: css`
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 12px;
  `,
  page: css`
    overflow: auto;
    width: 100%;
    min-height: 100%;
    padding: 24px;
    background: ${cssVar.colorBgLayout};
  `,
  planCard: css`
    border-radius: 8px;
  `,
  planFeatures: css`
    margin: 0;
    padding-inline-start: 18px;
    color: ${cssVar.colorTextSecondary};
    line-height: 1.8;
  `,
  section: css`
    border-radius: 8px;
  `,
}));

export const isAskCoreBillingPageKey = (value: unknown): value is AskCoreBillingPageKey =>
  ASKCORE_BILLING_PAGE_KEYS.includes(value as AskCoreBillingPageKey);

export const normalizeBillingPath = (path: string, options: { publicEndpoint?: boolean } = {}) => {
  if (path.startsWith('/api/')) return path;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const prefix = options.publicEndpoint ? '/api/billing/v1' : '/api/askcore/billing';
  return `${prefix}${normalizedPath}`;
};

const billingFetch = async (
  path: string,
  init: RequestInit = {},
  options: { publicEndpoint?: boolean } = {},
) => {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  return fetch(normalizeBillingPath(path, options), {
    ...init,
    credentials: 'include',
    headers,
  });
};

const billingJson = async <T,>(
  path: string,
  init: RequestInit = {},
  options: { publicEndpoint?: boolean } = {},
): Promise<T> => {
  const response = await billingFetch(path, init, options);
  if (!response.ok) {
    if (response.status === 401 && !options.publicEndpoint) {
      throw new Error('LobeHub billing session is unavailable. Please sign in to AskCore again.');
    }
    const body = await response.text().catch(() => '');
    throw new Error(body || `Billing request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
};

const useBillingJson = <T,>(path: string | null, publicEndpoint = false) => {
  const [state, setState] = useState<ResourceState<T>>({ loading: Boolean(path) });

  useEffect(() => {
    if (!path) {
      setState({ loading: false });
      return;
    }

    let mounted = true;
    setState((previous) => ({ data: previous.data, loading: true }));
    billingJson<T>(path, {}, { publicEndpoint })
      .then((data) => {
        if (mounted) setState({ data, loading: false });
      })
      .catch((error: Error) => {
        if (mounted) setState({ error: error.message, loading: false });
      });

    return () => {
      mounted = false;
    };
  }, [path, publicEndpoint]);

  return state;
};

export const normalizePlansPayload = (payload: Partial<AskCorePlansPayload> | undefined) => ({
  creditPacks: Array.isArray(payload?.credit_packs) ? payload.credit_packs : [],
  plans: Array.isArray(payload?.plans) ? payload.plans : [],
});

export const resolveDefaultProvider = (
  providers?: AskCorePlansPayload['providers'],
): BillingProvider | null => {
  const candidates: BillingProvider[] = ['stripe', 'alipay', 'wechat'];
  return candidates.find((provider) => providers?.[provider]?.enabled) || null;
};

export const buildAskCoreBillingEmbedUrl = ({
  language,
  origin,
  page,
}: {
  language?: string;
  origin: string;
  page: AskCoreBillingPageKey;
}) => {
  const rawBase = process.env.NEXT_PUBLIC_ASKCORE_BILLING_EMBED_URL?.trim();
  const base = rawBase ? new URL(rawBase, origin) : new URL(origin);
  const basePath = base.pathname.replace(/\/+$/, '');
  const embedPath = basePath.endsWith('/embed/subscription')
    ? `${basePath}/${page}`
    : `/embed/subscription/${page}`;

  base.pathname = embedPath;
  base.search = '';
  base.hash = '';
  if (language) base.searchParams.set('hl', language);
  return base.toString();
};

const paymentHostSuffixes = [
  'alipay.com',
  'alipayobjects.com',
  'stripe.com',
  'tenpay.com',
  'wechat.com',
  'weixin.qq.com',
];

const hostMatchesSuffix = (host: string, suffix: string) =>
  host === suffix || host.endsWith(`.${suffix}`);

export const isAllowedBillingExternalUrl = (
  rawUrl: string,
  { appOrigin, embedOrigin }: { appOrigin: string; embedOrigin: string },
) => {
  try {
    const url = new URL(rawUrl, appOrigin);
    if (url.origin === appOrigin || url.origin === embedOrigin) return true;
    return paymentHostSuffixes.some((suffix) => hostMatchesSuffix(url.hostname, suffix));
  } catch {
    return false;
  }
};

const requestParentOpenUrl = (url: string) => {
  if (typeof window === 'undefined') return;
  if (window.parent && window.parent !== window) {
    window.parent.postMessage({ type: ASKCORE_BILLING_OPEN_URL_MESSAGE, url }, '*');
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
};

const PageHeader = memo<{
  account?: AskCoreAccountPayload;
  page: AskCoreBillingPageKey;
  plansPayload?: AskCorePlansPayload;
}>(({ account, page, plansPayload }) => {
  const { t } = useTranslation('subscription');
  const title = t(`askcore.${page}.title`, {
    defaultValue:
      page === 'plans'
        ? 'AskCore Plans'
        : page === 'credits'
          ? 'Credits'
          : page === 'usage'
            ? 'Usage'
            : page === 'referral'
              ? 'Referral'
              : 'Billing',
  });
  const mode = account?.mode || plansPayload?.mode;

  return (
    <Flexbox className={styles.header} horizontal>
      <Flexbox gap={8}>
        <Flexbox align={'center'} gap={10} horizontal>
          <OpenAI size={26} />
          <Text as={'h2'} style={{ fontSize: 22, fontWeight: 650, margin: 0 }}>
            {title}
          </Text>
        </Flexbox>
        <Text type={'secondary'}>
          {t('askcore.billing.subtitle', {
            defaultValue:
              'Local AskCore billing uses organization seats first, then personal credits.',
          })}
        </Text>
      </Flexbox>
      {mode && <Tag color={mode === 'enforce' ? 'green' : 'blue'}>{mode}</Tag>}
    </Flexbox>
  );
});

PageHeader.displayName = 'PageHeader';

const PlansView = memo<{
  account?: AskCoreAccountPayload;
  plansPayload?: AskCorePlansPayload;
  state: ResourceState<AskCorePlansPayload>;
}>(({ account, plansPayload, state }) => {
  const { t } = useTranslation('subscription');
  const [checkoutPlanId, setCheckoutPlanId] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const { plans } = normalizePlansPayload(plansPayload);
  const currentPlanId = account?.personal?.plan_id || 'free';
  const provider = resolveDefaultProvider(plansPayload?.providers);

  const handleCheckout = useCallback(
    async (plan: AskCoreBillingPlan) => {
      if (!provider) return;
      setCheckoutPlanId(plan.id);
      setCheckoutError(null);
      try {
        const checkout = await billingJson<CheckoutResponse>(
          '/checkout/subscription',
          {
            body: JSON.stringify({
              plan_id: plan.id,
              provider,
              purpose: 'subscription',
              scope_type: 'user',
            }),
            method: 'POST',
          },
          {},
        );
        requestParentOpenUrl(checkout.url);
      } catch (error) {
        setCheckoutError(error instanceof Error ? error.message : 'Checkout failed');
      } finally {
        setCheckoutPlanId(null);
      }
    },
    [provider],
  );

  if (state.loading) return <Skeleton active paragraph={{ rows: 6 }} />;
  if (state.error) return <Alert message={state.error} showIcon type="error" />;
  if (plans.length === 0) return <Empty />;

  return (
    <Flexbox gap={12}>
      {checkoutError && <Alert message={checkoutError} showIcon type="error" />}
      <div className={styles.cards}>
        {plans.map((plan) => {
          const current = plan.id === currentPlanId;
          return (
            <Card className={styles.planCard} key={plan.id}>
              <Flexbox gap={16}>
                <Flexbox align={'center'} horizontal justify={'space-between'}>
                  <Text style={{ fontSize: 18, fontWeight: 650 }}>{plan.display_name}</Text>
                  <Tag>{numberFormatter.format(plan.monthly_credits)} credits</Tag>
                </Flexbox>
                <Flexbox gap={4}>
                  <Text style={{ fontSize: 28, fontWeight: 700 }}>
                    {currencyFormatter.format(plan.monthly_price_usd)}
                  </Text>
                  <Text type={'secondary'}>
                    {t('askcore.plans.perMonth', { defaultValue: 'per month' })}
                  </Text>
                </Flexbox>
                {plan.features.length > 0 && (
                  <ul className={styles.planFeatures}>
                    {plan.features.map((feature) => (
                      <li key={feature}>{feature}</li>
                    ))}
                  </ul>
                )}
                <Button
                  block
                  disabled={current || !provider}
                  loading={checkoutPlanId === plan.id}
                  onClick={() => handleCheckout(plan)}
                  type={current ? 'default' : 'primary'}
                >
                  {current
                    ? t('askcore.plans.current', { defaultValue: 'Current plan' })
                    : t('askcore.plans.checkout', { defaultValue: 'Start checkout' })}
                </Button>
              </Flexbox>
            </Card>
          );
        })}
      </div>
    </Flexbox>
  );
});

PlansView.displayName = 'PlansView';

const CreditsView = memo<{
  accountState: ResourceState<AskCoreAccountPayload>;
  plansPayload?: AskCorePlansPayload;
}>(({ accountState, plansPayload }) => {
  const { t } = useTranslation('subscription');
  const [checkoutPackId, setCheckoutPackId] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const { creditPacks } = normalizePlansPayload(plansPayload);
  const provider = resolveDefaultProvider(plansPayload?.providers);
  const account = accountState.data;

  const handleTopUp = useCallback(
    async (pack: AskCoreCreditPack) => {
      if (!provider) return;
      setCheckoutPackId(pack.id);
      setCheckoutError(null);
      try {
        const checkout = await billingJson<CheckoutResponse>('/checkout/topup', {
          body: JSON.stringify({
            pack_id: pack.id,
            provider,
            purpose: 'topup',
            scope_type: 'user',
          }),
          method: 'POST',
        });
        requestParentOpenUrl(checkout.url);
      } catch (error) {
        setCheckoutError(error instanceof Error ? error.message : 'Checkout failed');
      } finally {
        setCheckoutPackId(null);
      }
    },
    [provider],
  );

  if (accountState.loading) return <Skeleton active paragraph={{ rows: 6 }} />;
  if (accountState.error) return <Alert message={accountState.error} showIcon type="error" />;

  return (
    <Flexbox gap={16}>
      {checkoutError && <Alert message={checkoutError} showIcon type="error" />}
      <div className={styles.metricGrid}>
        <Card>
          <Statistic
            title={t('askcore.credits.personal', { defaultValue: 'Personal credits' })}
            value={account?.personal?.balance_credits ?? 0}
          />
        </Card>
        <Card>
          <Statistic
            title={t('askcore.credits.plan', { defaultValue: 'Current plan' })}
            value={account?.personal?.plan_id || 'free'}
          />
        </Card>
        <Card>
          <Statistic
            title={t('askcore.credits.status', { defaultValue: 'Subscription status' })}
            value={account?.personal?.subscription_status || 'free'}
          />
        </Card>
      </div>
      {creditPacks.length === 0 ? (
        <Empty
          description={t('askcore.credits.emptyPacks', {
            defaultValue: 'No credit packs are currently available.',
          })}
        />
      ) : (
        <div className={styles.cards}>
          {creditPacks.map((pack) => (
            <Card className={styles.section} key={pack.id}>
              <Flexbox gap={12}>
                <Text style={{ fontSize: 17, fontWeight: 650 }}>{pack.display_name}</Text>
                <Text type={'secondary'}>{numberFormatter.format(pack.credits)} credits</Text>
                <Text style={{ fontSize: 22, fontWeight: 700 }}>
                  {currencyFormatter.format(pack.price_usd)}
                </Text>
                <Button
                  disabled={!provider}
                  loading={checkoutPackId === pack.id}
                  onClick={() => handleTopUp(pack)}
                >
                  {t('askcore.credits.buy', { defaultValue: 'Buy credits' })}
                </Button>
              </Flexbox>
            </Card>
          ))}
        </div>
      )}
    </Flexbox>
  );
});

CreditsView.displayName = 'CreditsView';

const UsageView = memo<{ state: ResourceState<{ items: AskCoreUsageRow[] }> }>(({ state }) => {
  const { t } = useTranslation('subscription');
  const columns: ColumnsType<AskCoreUsageRow> = useMemo(
    () => [
      { dataIndex: 'created_at', title: t('askcore.usage.time', { defaultValue: 'Time' }) },
      { dataIndex: 'scope_type', title: t('askcore.usage.scope', { defaultValue: 'Scope' }) },
      { dataIndex: 'model', title: t('askcore.usage.model', { defaultValue: 'Model' }) },
      {
        dataIndex: 'tokens_total',
        render: (value: number | null) => numberFormatter.format(Number(value || 0)),
        title: t('askcore.usage.tokens', { defaultValue: 'Tokens' }),
      },
      {
        dataIndex: 'amount_credits',
        render: (value: number) => `${Number(value || 0).toFixed(2)} credits`,
        title: t('askcore.usage.amount', { defaultValue: 'Credits' }),
      },
    ],
    [t],
  );

  if (state.loading) return <Skeleton active paragraph={{ rows: 6 }} />;
  if (state.error) return <Alert message={state.error} showIcon type="error" />;

  const rows = state.data?.items || [];
  return (
    <Card className={styles.section}>
      <Table
        columns={columns}
        dataSource={rows}
        locale={{ emptyText: <Empty /> }}
        pagination={false}
        rowKey={'id'}
      />
    </Card>
  );
});

UsageView.displayName = 'UsageView';

const BillingView = memo<{
  accountState: ResourceState<AskCoreAccountPayload>;
  historyState: ResourceState<{ items: AskCoreInvoiceRow[] }>;
  orgSeatsState: ResourceState<AskCoreBillingOrganization>;
  plansPayload?: AskCorePlansPayload;
}>(({ accountState, historyState, orgSeatsState, plansPayload }) => {
  const { t } = useTranslation('subscription');
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);
  const planNames = useMemo(
    () =>
      Object.fromEntries(
        (plansPayload?.plans || []).map((plan) => [plan.id, plan.display_name]),
      ) as Record<string, string>,
    [plansPayload?.plans],
  );
  const organization = orgSeatsState.data || accountState.data?.organization || null;
  const columns: ColumnsType<AskCoreInvoiceRow> = useMemo(
    () => [
      {
        dataIndex: 'provider_invoice_id',
        title: t('askcore.billing.invoice', { defaultValue: 'Invoice' }),
      },
      { dataIndex: 'provider', title: t('askcore.billing.provider', { defaultValue: 'Provider' }) },
      {
        dataIndex: 'amount_paid_usd',
        render: (value: number) => currencyFormatter.format(value || 0),
        title: t('askcore.billing.amount', { defaultValue: 'Amount' }),
      },
      {
        dataIndex: 'status',
        render: (value: string) => (
          <Badge color={value === 'paid' ? 'green' : 'blue'} text={value || 'pending'} />
        ),
        title: t('askcore.billing.status', { defaultValue: 'Status' }),
      },
    ],
    [t],
  );

  const handleCustomerPortal = useCallback(async () => {
    setPortalLoading(true);
    setPortalError(null);
    try {
      const portal = await billingJson<{ url: string }>('/customer-portal');
      requestParentOpenUrl(portal.url);
    } catch (error) {
      setPortalError(error instanceof Error ? error.message : 'Customer portal failed');
    } finally {
      setPortalLoading(false);
    }
  }, []);

  if (accountState.loading || historyState.loading)
    return <Skeleton active paragraph={{ rows: 6 }} />;
  if (accountState.error) return <Alert message={accountState.error} showIcon type="error" />;

  const rows = historyState.data?.items || [];

  return (
    <Flexbox gap={16}>
      <OrgSeats
        error={orgSeatsState.error}
        loading={orgSeatsState.loading}
        organization={organization}
        planNames={planNames}
      />
      <Card
        className={styles.section}
        title={t('askcore.billing.history', { defaultValue: 'Billing history' })}
      >
        <Flexbox gap={12}>
          <Flexbox horizontal justify={'flex-end'}>
            <Button loading={portalLoading} onClick={handleCustomerPortal}>
              {t('askcore.billing.portal', { defaultValue: 'Customer portal' })}
            </Button>
          </Flexbox>
          {portalError && <Alert message={portalError} showIcon type="error" />}
        </Flexbox>
        {historyState.error ? (
          <Alert message={historyState.error} showIcon type="warning" />
        ) : (
          <Table
            columns={columns}
            dataSource={rows}
            locale={{ emptyText: <Empty /> }}
            pagination={false}
            rowKey={'id'}
          />
        )}
      </Card>
    </Flexbox>
  );
});

BillingView.displayName = 'BillingView';

const ReferralView = memo<{ state: ResourceState<AskCoreReferralPayload> }>(({ state }) => {
  const { t } = useTranslation('subscription');

  if (state.loading) return <Skeleton active paragraph={{ rows: 4 }} />;
  if (state.error) return <Alert message={state.error} showIcon type="error" />;

  const data = state.data;
  if (!data?.enabled) {
    return (
      <Empty
        description={t('askcore.referral.disabled', {
          defaultValue: 'Referral rewards are not currently enabled.',
        })}
      />
    );
  }

  return (
    <div className={styles.metricGrid}>
      <Card>
        <Statistic
          title={t('askcore.referral.invites', { defaultValue: 'Invites' })}
          value={data.total_invites}
        />
      </Card>
      <Card>
        <Statistic
          title={t('askcore.referral.rewarded', { defaultValue: 'Rewarded' })}
          value={data.total_rewarded}
        />
      </Card>
      <Card>
        <Statistic
          suffix={'credits'}
          title={t('askcore.referral.credits', { defaultValue: 'Credits earned' })}
          value={data.items.reduce((sum, item) => sum + Number(item.reward_credits || 0), 0)}
        />
      </Card>
    </div>
  );
});

ReferralView.displayName = 'ReferralView';

const QuotaRule = memo<{ account?: AskCoreAccountPayload }>(({ account }) => {
  const seat = account?.organization?.current_user_seat;
  const total = Number(seat?.quota_credits_total || 0);
  const used = Number(seat?.quota_credits_used || 0);
  const percent = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;

  return (
    <Card className={styles.section}>
      <Flexbox gap={8}>
        <Progress percent={percent} showInfo={false} />
        <Text type={'secondary'}>
          Organization seat quota is charged first. When a user's seat is exhausted, AskCore falls
          back to the user's personal credits.
        </Text>
      </Flexbox>
    </Card>
  );
});

QuotaRule.displayName = 'QuotaRule';

const AskCoreBillingPage = memo<{ page: AskCoreBillingPageKey }>(({ page }) => {
  const plansState = useBillingJson<AskCorePlansPayload>('/plans', true);
  const accountState = useBillingJson<AskCoreAccountPayload>('/account');
  const usageState = useBillingJson<{ items: AskCoreUsageRow[] }>(
    page === 'usage' ? '/usage' : null,
  );
  const historyState = useBillingJson<{ items: AskCoreInvoiceRow[] }>(
    page === 'billing' ? '/billing-history' : null,
  );
  const referralState = useBillingJson<AskCoreReferralPayload>(
    page === 'referral' ? '/referrals' : null,
  );
  const orgId = accountState.data?.organization?.auth_org_id;
  const orgSeatsState = useBillingJson<AskCoreBillingOrganization>(
    page === 'billing' && orgId ? `/organizations/${encodeURIComponent(orgId)}/seats` : null,
  );

  return (
    <Flexbox className={styles.page} gap={20}>
      <PageHeader account={accountState.data} page={page} plansPayload={plansState.data} />
      {page === 'plans' && (
        <PlansView account={accountState.data} plansPayload={plansState.data} state={plansState} />
      )}
      {page === 'credits' && (
        <CreditsView accountState={accountState} plansPayload={plansState.data} />
      )}
      {page === 'usage' && <UsageView state={usageState} />}
      {page === 'billing' && (
        <BillingView
          accountState={accountState}
          historyState={historyState}
          orgSeatsState={orgSeatsState}
          plansPayload={plansState.data}
        />
      )}
      {page === 'referral' && <ReferralView state={referralState} />}
      {!isAskCoreBillingPageKey(page) && <Empty />}
      <QuotaRule account={accountState.data} />
    </Flexbox>
  );
});

AskCoreBillingPage.displayName = 'AskCoreBillingPage';

export const AskCoreBillingEmbedRoute = memo(() => {
  const params = useParams();
  const page = isAskCoreBillingPageKey(params.page) ? params.page : 'plans';
  return <AskCoreBillingPage page={page} />;
});

AskCoreBillingEmbedRoute.displayName = 'AskCoreBillingEmbedRoute';

export default AskCoreBillingPage;
