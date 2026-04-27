'use client';

import { OpenAI } from '@lobehub/icons';
import { Button, Flexbox, Icon, Tag, Text } from '@lobehub/ui';
import {
  Alert,
  Badge,
  Card,
  Collapse,
  Descriptions,
  Empty,
  Form,
  Input,
  InputNumber,
  List,
  Progress,
  Segmented,
  Skeleton,
  Space,
  Statistic,
  Switch,
  Table,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { createStaticStyles, cssVar } from 'antd-style';
import {
  Check,
  CircleDollarSign,
  Copy,
  Database,
  FileText,
  Gift,
  Link,
  Receipt,
  ShieldCheck,
  Sparkles,
  Users,
  WalletCards,
} from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
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
type BillingPeriodId = 'monthly' | 'payonce' | 'yearly';

export interface AskCoreBillingPlan {
  badge?: string;
  benefits?: {
    advanced?: Record<string, boolean>;
    cloud?: Record<string, boolean>;
    credits?: { examples?: { messages?: number; model: string }[]; monthly_credits?: number };
    knowledge_base?: {
      enabled?: boolean;
      file_storage_gb?: number;
      vector_storage_entries?: number;
    };
    providers?: Record<string, boolean>;
    support?: string;
  };
  credit_examples?: { messages?: number; model: string }[];
  description?: string;
  display_name: string;
  features: string[];
  file_storage_gb?: number;
  id: string;
  monthly_credits: number;
  monthly_price_usd: number;
  one_time_price_usd?: number | null;
  support?: string;
  topup_unit_price_usd?: number;
  vector_storage_entries?: number;
  yearly_discount_percent?: number;
  yearly_monthly_price_usd?: number | null;
  yearly_price_usd?: number | null;
}

export interface AskCoreCreditPack {
  credits: number;
  display_name: string;
  id: string;
  price_usd: number;
  source?: string;
  unit_price_usd_per_million?: number;
  validity_months?: number;
}

interface BillingPeriod {
  description?: string;
  id: BillingPeriodId;
  label: string;
}

interface ModelPricingRow {
  input_credits_per_1m: number;
  model: string;
  output_credits_per_1m: number;
  provider?: string;
}

interface PlanComparisonGroup {
  key: string;
  rows: {
    label: string;
    unit?: string;
    values: Record<string, number | string | null>;
  }[];
  title: string;
}

interface AskCorePlansPayload {
  billing_enabled: boolean;
  billing_periods?: BillingPeriod[];
  credit_packs: AskCoreCreditPack[];
  credit_unit: string;
  currency: string;
  faq?: { answer: string; question: string }[];
  mode: string;
  model_pricing?: {
    description?: string;
    text?: ModelPricingRow[];
  };
  organization_seats?: {
    enabled: boolean;
    fallback_to_personal: boolean;
    min_paid_seats: number;
  };
  plan_comparison?: PlanComparisonGroup[];
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
  cost_usd?: number | null;
  created_at?: string | null;
  id: number;
  kind: string;
  model?: string | null;
  scope_type: string;
  source: string;
  tokens_completion?: number | null;
  tokens_prompt?: number | null;
  tokens_total?: number | null;
  trigger?: string | null;
  type?: string | null;
}

interface AskCoreUsagePayload {
  items: AskCoreUsageRow[];
  summary?: {
    by_scope?: Record<string, number>;
    by_source?: Record<string, number>;
    period?: string;
    total_credits_used?: number;
    total_tokens?: number;
  };
}

interface AskCoreCreditPackageRow {
  amount_usd?: number | null;
  expires_at?: string | null;
  id: number;
  initial_credits: number;
  purchased_at?: string | null;
  remaining_credits: number;
  source: string;
  status: string;
}

interface AskCoreCreditPackagesPayload {
  available_packs: AskCoreCreditPack[];
  balance_credits: number;
  items: AskCoreCreditPackageRow[];
}

interface AskCoreAutoTopupPayload {
  enabled: boolean;
  has_payment_method?: boolean;
  monthly_limit_usd: number;
  monthly_topup_amount_usd?: number;
  target_credits: number;
  threshold_credits: number;
}

interface AskCoreInvoiceRow {
  amount_due_usd: number;
  amount_paid_usd: number;
  created_at?: string | null;
  hosted_invoice_url?: string | null;
  id: number;
  provider: string;
  provider_invoice_id?: string | null;
  status: string;
}

interface AskCoreBillingHistoryPayload {
  items: AskCoreInvoiceRow[];
  summary?: {
    cancel_at_period_end?: boolean;
    current_period_end?: string | null;
    current_period_start?: string | null;
    interval?: string;
    next_payment?: { amount_due_usd?: number; due_at?: string | null };
    plan_id?: string;
    status?: string;
    subscription_id?: string | null;
  };
}

interface AskCoreReferralPayload {
  available_balance?: number;
  enabled: boolean;
  items: {
    created_at?: string | null;
    invitee_email?: string | null;
    invitee_user_id: string;
    rewarded_at?: string | null;
    reward_credits: number;
    status: string;
  }[];
  referral_code?: string;
  referral_link?: string;
  reward_credits: number;
  rules?: Record<string, string | number>;
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

const compactNumberFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 1,
  notation: 'compact',
});

const styles = createStaticStyles(({ css }) => ({
  cardGrid: css`
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 12px;
  `,
  compareCell: css`
    min-width: 140px;
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
  pageInner: css`
    width: min(1180px, 100%);
    margin: 0 auto;
  `,
  planCard: css`
    height: 100%;
    border-radius: 8px;
  `,
  planFeatures: css`
    margin: 0;
    padding-inline-start: 18px;
    color: ${cssVar.colorTextSecondary};
    line-height: 1.75;
  `,
  price: css`
    font-size: 30px;
    font-weight: 700;
    line-height: 1;
  `,
  section: css`
    border-radius: 8px;
  `,
  subtle: css`
    color: ${cssVar.colorTextSecondary};
  `,
  tabBar: css`
    width: 100%;
    overflow-x: auto;
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

const useBillingJson = <T,>(path: string | null, publicEndpoint = false, refreshKey = 0) => {
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
  }, [path, publicEndpoint, refreshKey]);

  return state;
};

export const normalizePlansPayload = (payload: Partial<AskCorePlansPayload> | undefined) => ({
  billingPeriods: Array.isArray(payload?.billing_periods) ? payload.billing_periods : [],
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

const formatCredits = (value?: number | null) =>
  `${compactNumberFormatter.format(Number(value || 0))} Credits`;

const formatDate = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
};

const planPrice = (plan: AskCoreBillingPlan, period: BillingPeriodId) => {
  if (period === 'yearly' && plan.yearly_monthly_price_usd !== undefined && plan.yearly_monthly_price_usd !== null) {
    return {
      detail: plan.yearly_price_usd ? `${currencyFormatter.format(plan.yearly_price_usd)} / year` : '',
      price: plan.yearly_monthly_price_usd,
      suffix: 'per month, billed yearly',
    };
  }
  if (period === 'payonce' && plan.one_time_price_usd !== undefined && plan.one_time_price_usd !== null) {
    return { detail: 'One-time payment', price: plan.one_time_price_usd, suffix: 'one time' };
  }
  return { detail: '', price: plan.monthly_price_usd, suffix: 'per month' };
};

const pageTitle = (page: AskCoreBillingPageKey) => {
  if (page === 'plans') return 'Plans';
  if (page === 'credits') return 'Credits';
  if (page === 'usage') return 'Usage';
  if (page === 'referral') return 'Referral Rewards';
  return 'Billing';
};

const BillingTabs = memo<{ page: AskCoreBillingPageKey }>(({ page }) => {
  const options = [
    { label: 'Plans', value: 'plans' },
    { label: 'Usage', value: 'usage' },
    { label: 'Credits', value: 'credits' },
    { label: 'Billing', value: 'billing' },
    { label: 'Referral Rewards', value: 'referral' },
  ];

  const handleChange = useCallback((value: string | number) => {
    if (typeof window === 'undefined') return;
    const nextPage = value as AskCoreBillingPageKey;
    const target = new URL(window.location.href);
    target.pathname = target.pathname.replace(/\/embed\/subscription\/[^/]+$/, `/embed/subscription/${nextPage}`);
    window.location.href = target.toString();
  }, []);

  return (
    <div className={styles.tabBar}>
      <Segmented block onChange={handleChange} options={options} value={page} />
    </div>
  );
});

BillingTabs.displayName = 'BillingTabs';

const PageHeader = memo<{
  account?: AskCoreAccountPayload;
  page: AskCoreBillingPageKey;
  plansPayload?: AskCorePlansPayload;
}>(({ account, page, plansPayload }) => {
  const mode = account?.mode || plansPayload?.mode;

  return (
    <Flexbox className={styles.header} horizontal>
      <Flexbox gap={8}>
        <Flexbox align={'center'} gap={10} horizontal>
          <OpenAI size={26} />
          <Text as={'h2'} style={{ fontSize: 22, fontWeight: 650, margin: 0 }}>
            {pageTitle(page)}
          </Text>
        </Flexbox>
        <Text type={'secondary'}>
          Usage, subscription management, credits, billing, and referral rewards.
        </Text>
      </Flexbox>
      {mode && <Tag color={mode === 'enforce' ? 'green' : 'blue'}>{mode}</Tag>}
    </Flexbox>
  );
});

PageHeader.displayName = 'PageHeader';

const CurrentPlanCard = memo<{
  account?: AskCoreAccountPayload;
  plans: AskCoreBillingPlan[];
}>(({ account, plans }) => {
  const planId = account?.personal.plan_id || 'free';
  const plan = plans.find((item) => item.id === planId);

  return (
    <Card className={styles.section} title="Current Plan">
      <Flexbox gap={14}>
        <Flexbox align={'center'} horizontal justify={'space-between'}>
          <Flexbox align={'center'} gap={10} horizontal>
            <Icon icon={Sparkles} />
            <Text style={{ fontSize: 18, fontWeight: 650 }}>{plan?.display_name || planId}</Text>
          </Flexbox>
          <Badge status="processing" text={account?.personal.subscription_status || 'free'} />
        </Flexbox>
        <Text type={'secondary'}>
          {plan?.description || 'See all features and compare plans below.'}
        </Text>
        <Progress
          percent={Math.min(
            100,
            Math.round(
              ((Number(account?.personal.balance_credits || 0) || 0) /
                Math.max(Number(plan?.monthly_credits || 1), 1)) *
                100,
            ),
          )}
          showInfo={false}
        />
        <Flexbox horizontal justify={'space-between'}>
          <Text type={'secondary'}>{formatCredits(account?.personal.balance_credits)} available</Text>
          <Text type={'secondary'}>{formatCredits(plan?.monthly_credits)} / month</Text>
        </Flexbox>
      </Flexbox>
    </Card>
  );
});

CurrentPlanCard.displayName = 'CurrentPlanCard';

const PlansView = memo<{
  account?: AskCoreAccountPayload;
  plansPayload?: AskCorePlansPayload;
  state: ResourceState<AskCorePlansPayload>;
}>(({ account, plansPayload, state }) => {
  const { plans } = normalizePlansPayload(plansPayload);
  const [period, setPeriod] = useState<BillingPeriodId>('yearly');
  const [checkoutPlanId, setCheckoutPlanId] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const currentPlanId = account?.personal?.plan_id || 'free';
  const provider = resolveDefaultProvider(plansPayload?.providers);

  const billingPeriodOptions = useMemo(() => {
    const periods = plansPayload?.billing_periods?.length
      ? plansPayload.billing_periods
      : [
          { id: 'yearly' as const, label: 'Yearly' },
          { id: 'monthly' as const, label: 'Monthly' },
          { id: 'payonce' as const, label: 'One-time' },
        ];
    return periods.map((item) => ({
      label:
        item.id === 'yearly'
          ? `${item.label} ${Math.max(...plans.map((plan) => plan.yearly_discount_percent || 0), 0)}% off`
          : item.label,
      value: item.id,
    }));
  }, [plans, plansPayload?.billing_periods]);

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
              interval: period,
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
    [period, provider],
  );

  const modelColumns: ColumnsType<ModelPricingRow> = useMemo(
    () => [
      { dataIndex: 'provider', title: 'Provider' },
      { dataIndex: 'model', title: 'Model' },
      {
        dataIndex: 'input_credits_per_1m',
        render: (value: number) => formatCredits(value),
        title: 'Input 1M Tokens',
      },
      {
        dataIndex: 'output_credits_per_1m',
        render: (value: number) => formatCredits(value),
        title: 'Output 1M Tokens',
      },
    ],
    [],
  );

  if (state.loading) return <Skeleton active paragraph={{ rows: 8 }} />;
  if (state.error) return <Alert message={state.error} showIcon type="error" />;
  if (plans.length === 0) return <Empty />;

  return (
    <Flexbox gap={16}>
      <CurrentPlanCard account={account} plans={plans} />
      {checkoutError && <Alert message={checkoutError} showIcon type="error" />}
      <Card className={styles.section}>
        <Flexbox gap={18}>
          <Flexbox align={'center'} horizontal justify={'space-between'}>
            <Flexbox gap={4}>
              <Text style={{ fontSize: 20, fontWeight: 650 }}>Plans & Pricing</Text>
              <Text type={'secondary'}>Start with AskCore local billing. No official cloud dependency.</Text>
            </Flexbox>
            <Segmented
              onChange={(value) => setPeriod(value as BillingPeriodId)}
              options={billingPeriodOptions}
              value={period}
            />
          </Flexbox>
          <div className={styles.cardGrid}>
            {plans.map((plan) => {
              const current = plan.id === currentPlanId;
              const price = planPrice(plan, period);
              const planExamples = plan.credit_examples || plan.benefits?.credits?.examples || [];
              return (
                <Card className={styles.planCard} key={plan.id}>
                  <Flexbox gap={16}>
                    <Flexbox align={'flex-start'} horizontal justify={'space-between'}>
                      <Flexbox gap={4}>
                        <Flexbox align={'center'} gap={8} horizontal>
                          <Icon icon={plan.id === 'ultimate' ? ShieldCheck : Sparkles} />
                          <Text style={{ fontSize: 18, fontWeight: 650 }}>{plan.display_name}</Text>
                        </Flexbox>
                        <Text type={'secondary'}>{plan.description}</Text>
                      </Flexbox>
                      {plan.badge && <Tag color="gold">{plan.badge}</Tag>}
                    </Flexbox>
                    <Flexbox gap={4}>
                      <Flexbox align={'baseline'} gap={6} horizontal>
                        <span className={styles.price}>{currencyFormatter.format(price.price || 0)}</span>
                        <Text type={'secondary'}>{price.suffix}</Text>
                      </Flexbox>
                      {price.detail && <Text type={'secondary'}>{price.detail}</Text>}
                    </Flexbox>
                    <Flexbox gap={8}>
                      <Text strong>{formatCredits(plan.monthly_credits)} / Month</Text>
                      {planExamples.slice(0, 3).map((example) => (
                        <Text key={example.model} type={'secondary'}>
                          {example.model}: approx {numberFormatter.format(example.messages || 0)} messages
                        </Text>
                      ))}
                    </Flexbox>
                    <ul className={styles.planFeatures}>
                      <li>File Storage: {numberFormatter.format(plan.file_storage_gb || 0)} GB</li>
                      <li>Vector Storage: {numberFormatter.format(plan.vector_storage_entries || 0)} entries</li>
                      <li>{plan.support || 'Community support'}</li>
                    </ul>
                    <Button
                      block
                      disabled={current || !provider}
                      loading={checkoutPlanId === plan.id}
                      onClick={() => handleCheckout(plan)}
                      type={current ? 'default' : 'primary'}
                    >
                      {current ? 'Current Plan' : plan.monthly_price_usd === 0 ? 'Get Started' : 'Purchase'}
                    </Button>
                    {!provider && <Text type={'secondary'}>No payment provider is enabled.</Text>}
                  </Flexbox>
                </Card>
              );
            })}
          </div>
        </Flexbox>
      </Card>
      <Card className={styles.section} title="Text Model Pricing">
        <Flexbox gap={12}>
          <Text type={'secondary'}>{plansPayload?.model_pricing?.description}</Text>
          <Table
            columns={modelColumns}
            dataSource={plansPayload?.model_pricing?.text || []}
            pagination={false}
            rowKey={(row) => `${row.provider}-${row.model}`}
            size="small"
          />
        </Flexbox>
      </Card>
      <Card className={styles.section} title="Plan Comparison">
        <Collapse
          defaultActiveKey={plansPayload?.plan_comparison?.map((group) => group.key)}
          items={(plansPayload?.plan_comparison || []).map((group) => ({
            children: (
              <Table
                columns={[
                  { dataIndex: 'label', fixed: 'left', title: group.title, width: 220 },
                  ...plans
                    .filter((plan) => plan.id !== 'free')
                    .map((plan) => ({
                      className: styles.compareCell,
                      dataIndex: plan.id,
                      render: (_: unknown, row: PlanComparisonGroup['rows'][number]) => {
                        const value = row.values[plan.id];
                        if (typeof value === 'number') {
                          return `${numberFormatter.format(value)}${row.unit ? ` ${row.unit}` : ''}`;
                        }
                        return value || '-';
                      },
                      title: plan.display_name,
                    })),
                ]}
                dataSource={group.rows}
                pagination={false}
                rowKey="label"
                scroll={{ x: true }}
                size="small"
              />
            ),
            key: group.key,
            label: group.title,
          }))}
        />
      </Card>
      <Card className={styles.section} title="Frequently Asked Questions">
        <Collapse
          items={(plansPayload?.faq || []).map((item) => ({
            children: <Text type={'secondary'}>{item.answer}</Text>,
            key: item.question,
            label: item.question,
          }))}
        />
      </Card>
    </Flexbox>
  );
});

PlansView.displayName = 'PlansView';

const UsageView = memo<{
  account?: AskCoreAccountPayload;
  plansPayload?: AskCorePlansPayload;
}>(({ account, plansPayload }) => {
  const state = useBillingJson<AskCoreUsagePayload>('/usage');
  const plan = plansPayload?.plans.find((item) => item.id === account?.personal.plan_id);
  const columns: ColumnsType<AskCoreUsageRow> = useMemo(
    () => [
      { dataIndex: 'created_at', render: formatDate, title: 'Created At' },
      { dataIndex: 'type', title: 'Type' },
      { dataIndex: 'trigger', title: 'Trigger' },
      { dataIndex: 'model', title: 'Model' },
      {
        dataIndex: 'tokens_total',
        render: (value: number | null) => numberFormatter.format(Number(value || 0)),
        title: 'Token Usage',
      },
      {
        dataIndex: 'amount_credits',
        render: (value: number) => `${Number(value || 0).toFixed(2)} Credits`,
        title: 'Credits',
      },
    ],
    [],
  );

  if (state.loading) return <Skeleton active paragraph={{ rows: 6 }} />;
  if (state.error) return <Alert message={state.error} showIcon type="error" />;

  const summary = state.data?.summary;
  const includedUsed = Number(summary?.by_scope?.org_seat || 0);
  const personalUsed = Number(summary?.by_scope?.user || 0);
  const total = Number(plan?.monthly_credits || account?.personal.balance_credits || 1);
  const percent = Math.min(100, Math.round(((includedUsed + personalUsed) / Math.max(total, 1)) * 100));

  return (
    <Flexbox gap={16}>
      <div className={styles.metricGrid}>
        <Card>
          <Statistic
            prefix={<Icon icon={Sparkles} />}
            title="This Month Usage"
            value={summary?.total_credits_used || 0}
            suffix="Credits"
          />
        </Card>
        <Card>
          <Statistic
            prefix={<Icon icon={FileText} />}
            title="Token Usage"
            value={summary?.total_tokens || 0}
          />
        </Card>
        <Card>
          <Statistic
            prefix={<Icon icon={Database} />}
            title="File Storage"
            value={plan?.file_storage_gb || 0}
            suffix="GB"
          />
        </Card>
      </div>
      <Card className={styles.section} title="Usage Overview">
        <Flexbox gap={12}>
          <Progress percent={percent} />
          <div className={styles.metricGrid}>
            <Card size="small">
              <Statistic title="Plan Usage" value={includedUsed} suffix="Credits" />
            </Card>
            <Card size="small">
              <Statistic title="On-demand" value={personalUsed} suffix="Credits" />
            </Card>
            <Card size="small">
              <Statistic title="Vector Storage" value={plan?.vector_storage_entries || 0} suffix="entries" />
            </Card>
          </div>
        </Flexbox>
      </Card>
      <Card className={styles.section} title="Computing Credits Usage Details">
        <Table
          columns={columns}
          dataSource={state.data?.items || []}
          locale={{ emptyText: <Empty /> }}
          pagination={false}
          rowKey={'id'}
          scroll={{ x: true }}
        />
      </Card>
    </Flexbox>
  );
});

UsageView.displayName = 'UsageView';

const CreditsView = memo<{
  accountState: ResourceState<AskCoreAccountPayload>;
  plansPayload?: AskCorePlansPayload;
}>(({ accountState, plansPayload }) => {
  const [refreshKey, setRefreshKey] = useState(0);
  const creditState = useBillingJson<AskCoreCreditPackagesPayload>('/credits', false, refreshKey);
  const autoTopupState = useBillingJson<AskCoreAutoTopupPayload>('/credits/auto-topup', false, refreshKey);
  const [checkoutPackId, setCheckoutPackId] = useState<string | null>(null);
  const [savingAutoTopup, setSavingAutoTopup] = useState(false);
  const [form] = Form.useForm<AskCoreAutoTopupPayload>();
  const provider = resolveDefaultProvider(plansPayload?.providers);
  const account = accountState.data;
  const plan = plansPayload?.plans.find((item) => item.id === account?.personal.plan_id);
  const isPaid = account?.personal.plan_id && account.personal.plan_id !== 'free';

  useEffect(() => {
    if (autoTopupState.data) form.setFieldsValue(autoTopupState.data);
  }, [autoTopupState.data, form]);

  const handleTopUp = useCallback(
    async (pack: AskCoreCreditPack) => {
      if (!provider) return;
      setCheckoutPackId(pack.id);
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
        message.error(error instanceof Error ? error.message : 'Checkout failed');
      } finally {
        setCheckoutPackId(null);
      }
    },
    [provider],
  );

  const handleSaveAutoTopup = useCallback(async () => {
    setSavingAutoTopup(true);
    try {
      const values = await form.validateFields();
      await billingJson<AskCoreAutoTopupPayload>('/credits/auto-topup', {
        body: JSON.stringify(values),
        method: 'PUT',
      });
      message.success('Auto top-up settings saved');
      setRefreshKey((key) => key + 1);
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Failed to save auto top-up settings');
    } finally {
      setSavingAutoTopup(false);
    }
  }, [form]);

  if (accountState.loading || creditState.loading) return <Skeleton active paragraph={{ rows: 6 }} />;
  if (accountState.error) return <Alert message={accountState.error} showIcon type="error" />;
  if (creditState.error) return <Alert message={creditState.error} showIcon type="error" />;

  const packages = creditState.data?.available_packs?.length
    ? creditState.data.available_packs
    : plansPayload?.credit_packs || [];

  const packageColumns: ColumnsType<AskCoreCreditPackageRow> = [
    { dataIndex: 'purchased_at', render: formatDate, title: 'Purchased On' },
    { dataIndex: 'source', title: 'Source' },
    {
      dataIndex: 'remaining_credits',
      render: (value: number) => formatCredits(value),
      title: 'Balance',
    },
    { dataIndex: 'expires_at', render: formatDate, title: 'Expires At' },
    {
      dataIndex: 'status',
      render: (value: string) => <Badge status={value === 'active' ? 'success' : 'default'} text={value} />,
      title: 'Status',
    },
  ];

  return (
    <Flexbox gap={16}>
      <div className={styles.metricGrid}>
        <Card>
          <Statistic title="Top-up Credits Balance" value={creditState.data?.balance_credits || 0} suffix="Credits" />
        </Card>
        <Card>
          <Statistic title="Subscription Credits" value={plan?.monthly_credits || 0} suffix="Credits" />
        </Card>
        <Card>
          <Statistic title="Current Plan" value={plan?.display_name || account?.personal.plan_id || 'free'} />
        </Card>
      </div>
      {!isPaid && (
        <Alert
          message="Free users need to subscribe to a paid plan before topping up credits."
          showIcon
          type="info"
        />
      )}
      <Card className={styles.section} title="Purchase Credits">
        {packages.length === 0 ? (
          <Empty description="No credit packs are currently available." />
        ) : (
          <div className={styles.cardGrid}>
            {packages.map((pack) => (
              <Card key={pack.id} size="small">
                <Flexbox gap={12}>
                  <Flexbox align={'center'} horizontal justify={'space-between'}>
                    <Text strong>{pack.display_name}</Text>
                    <Tag>{pack.validity_months || 6} months validity</Tag>
                  </Flexbox>
                  <Text type={'secondary'}>{formatCredits(pack.credits)}</Text>
                  <Text style={{ fontSize: 22, fontWeight: 700 }}>
                    {currencyFormatter.format(pack.price_usd)}
                  </Text>
                  <Text type={'secondary'}>
                    {pack.unit_price_usd_per_million
                      ? `${currencyFormatter.format(pack.unit_price_usd_per_million)} / 1M Credits`
                      : 'Unit price follows local catalog'}
                  </Text>
                  <Button
                    disabled={!provider || !isPaid}
                    loading={checkoutPackId === pack.id}
                    onClick={() => handleTopUp(pack)}
                    type="primary"
                  >
                    Purchase Now
                  </Button>
                </Flexbox>
              </Card>
            ))}
          </div>
        )}
      </Card>
      <Card className={styles.section} title="Auto Top-Up">
        {autoTopupState.error ? (
          <Alert message={autoTopupState.error} showIcon type="warning" />
        ) : (
          <Form form={form} layout="vertical">
            <div className={styles.metricGrid}>
              <Form.Item name="enabled" valuePropName="checked">
                <Switch checkedChildren="Enabled" unCheckedChildren="Disabled" />
              </Form.Item>
              <Form.Item label="Threshold" name="threshold_credits">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item label="Target Balance" name="target_credits">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item label="Monthly Limit" name="monthly_limit_usd">
                <InputNumber min={0} prefix="$" style={{ width: '100%' }} />
              </Form.Item>
            </div>
            {!autoTopupState.data?.has_payment_method && (
              <Alert
                message="No payment method on file. Auto top-up will stay shadow-safe until a customer portal payment method exists."
                showIcon
                type="warning"
              />
            )}
            <Flexbox horizontal justify={'flex-end'} style={{ marginTop: 12 }}>
              <Button loading={savingAutoTopup} onClick={handleSaveAutoTopup} type="primary">
                Save
              </Button>
            </Flexbox>
          </Form>
        )}
      </Card>
      <Card className={styles.section} title="My Credit Packages">
        <Table
          columns={packageColumns}
          dataSource={creditState.data?.items || []}
          locale={{ emptyText: <Empty description="No credit packages" /> }}
          pagination={false}
          rowKey="id"
          scroll={{ x: true }}
        />
      </Card>
    </Flexbox>
  );
});

CreditsView.displayName = 'CreditsView';

const BillingView = memo<{
  accountState: ResourceState<AskCoreAccountPayload>;
  plansPayload?: AskCorePlansPayload;
}>(({ accountState, plansPayload }) => {
  const historyState = useBillingJson<AskCoreBillingHistoryPayload>('/billing-history');
  const orgId = accountState.data?.organization?.auth_org_id;
  const orgSeatsState = useBillingJson<AskCoreBillingOrganization>(
    orgId ? `/organizations/${encodeURIComponent(orgId)}/seats` : null,
  );
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

  const columns: ColumnsType<AskCoreInvoiceRow> = [
    { dataIndex: 'provider_invoice_id', title: 'Order Number' },
    { dataIndex: 'provider', title: 'Payment Gateway' },
    {
      dataIndex: 'amount_paid_usd',
      render: (value: number) => currencyFormatter.format(value || 0),
      title: 'Amount',
    },
    { dataIndex: 'created_at', render: formatDate, title: 'Payment Date' },
    {
      dataIndex: 'status',
      render: (value: string) => (
        <Badge color={value === 'paid' ? 'green' : 'blue'} text={value || 'pending'} />
      ),
      title: 'Transaction Status',
    },
  ];

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

  if (accountState.loading || historyState.loading) return <Skeleton active paragraph={{ rows: 6 }} />;
  if (accountState.error) return <Alert message={accountState.error} showIcon type="error" />;
  if (historyState.error) return <Alert message={historyState.error} showIcon type="error" />;

  const summary = historyState.data?.summary;

  return (
    <Flexbox gap={16}>
      <Card className={styles.section} title="Billing Summary">
        <Flexbox gap={12}>
          <Descriptions
            column={{ lg: 3, md: 2, sm: 1, xs: 1 }}
            items={[
              { key: 'plan', label: 'Current Plan', children: planNames[summary?.plan_id || ''] || summary?.plan_id || 'free' },
              { key: 'status', label: 'Status', children: summary?.status || 'free' },
              { key: 'interval', label: 'Billing Cycle', children: summary?.interval || 'month' },
              { key: 'start', label: 'Start Date', children: formatDate(summary?.current_period_start) },
              { key: 'end', label: 'End Date', children: formatDate(summary?.current_period_end) },
              {
                key: 'next',
                label: 'Next Payment',
                children: currencyFormatter.format(summary?.next_payment?.amount_due_usd || 0),
              },
            ]}
          />
          <Flexbox horizontal justify={'flex-end'}>
            <Button icon={<Icon icon={Receipt} />} loading={portalLoading} onClick={handleCustomerPortal}>
              Manage Subscription
            </Button>
          </Flexbox>
          {portalError && <Alert message={portalError} showIcon type="error" />}
        </Flexbox>
      </Card>
      <OrgSeats
        error={orgSeatsState.error}
        loading={orgSeatsState.loading}
        organization={organization}
        planNames={planNames}
      />
      <Card className={styles.section} title="Billing History">
        <Table
          columns={columns}
          dataSource={historyState.data?.items || []}
          locale={{ emptyText: <Empty description="No billing history" /> }}
          pagination={false}
          rowKey={'id'}
          scroll={{ x: true }}
        />
      </Card>
    </Flexbox>
  );
});

BillingView.displayName = 'BillingView';

const ReferralView = memo(() => {
  const [refreshKey, setRefreshKey] = useState(0);
  const state = useBillingJson<AskCoreReferralPayload>('/referrals', false, refreshKey);
  const [editForm] = Form.useForm<{ referral_code: string }>();
  const [backfillForm] = Form.useForm<{ referral_code: string }>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (state.data?.referral_code) editForm.setFieldsValue({ referral_code: state.data.referral_code });
  }, [editForm, state.data?.referral_code]);

  const copyText = useCallback(async (value?: string) => {
    if (!value) return;
    await navigator.clipboard?.writeText(value);
    message.success('Copied');
  }, []);

  const saveReferralCode = useCallback(async () => {
    setSaving(true);
    try {
      const values = await editForm.validateFields();
      await billingJson('/referrals/code', {
        body: JSON.stringify(values),
        method: 'PATCH',
      });
      message.success('Referral code saved');
      setRefreshKey((key) => key + 1);
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Update failed');
    } finally {
      setSaving(false);
    }
  }, [editForm]);

  const backfillReferralCode = useCallback(async () => {
    setSaving(true);
    try {
      const values = await backfillForm.validateFields();
      await billingJson('/referrals/backfill', {
        body: JSON.stringify(values),
        method: 'POST',
      });
      message.success('Invite code bound');
      backfillForm.resetFields();
      setRefreshKey((key) => key + 1);
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Binding failed');
    } finally {
      setSaving(false);
    }
  }, [backfillForm]);

  if (state.loading) return <Skeleton active paragraph={{ rows: 6 }} />;
  if (state.error) return <Alert message={state.error} showIcon type="error" />;
  if (!state.data?.enabled) {
    return <Empty description="Referral rewards are not currently enabled." />;
  }

  const data = state.data;
  const columns: ColumnsType<AskCoreReferralPayload['items'][number]> = [
    { dataIndex: 'created_at', render: formatDate, title: 'Registration Time' },
    { dataIndex: 'invitee_email', title: 'Invitee Email' },
    {
      dataIndex: 'reward_credits',
      render: (value: number) => formatCredits(value),
      title: 'My Reward',
    },
    {
      dataIndex: 'status',
      render: (value: string) => <Badge status={value === 'rewarded' ? 'success' : 'processing'} text={value} />,
      title: 'Status',
    },
  ];

  return (
    <Flexbox gap={16}>
      <div className={styles.metricGrid}>
        <Card>
          <Statistic prefix={<Icon icon={Users} />} title="Total Invites" value={data.total_invites} />
        </Card>
        <Card>
          <Statistic prefix={<Icon icon={Gift} />} title="Valid Conversions" value={data.total_rewarded} />
        </Card>
        <Card>
          <Statistic
            prefix={<Icon icon={WalletCards} />}
            title="Available Balance"
            value={data.available_balance || 0}
            suffix="Credits"
          />
        </Card>
      </div>
      <div className={styles.cardGrid}>
        <Card title="My Referral Code">
          <Flexbox gap={12}>
            <Text type={'secondary'}>Share your exclusive referral code to invite friends to register.</Text>
            <Form form={editForm} layout="inline">
              <Form.Item
                name="referral_code"
                rules={[{ message: 'Use 2-8 letters, numbers or underscores', pattern: /^[A-Za-z0-9_]{2,8}$/ }]}
              >
                <Input />
              </Form.Item>
              <Button icon={<Icon icon={Copy} />} onClick={() => copyText(data.referral_code)}>
                Copy
              </Button>
              <Button loading={saving} onClick={saveReferralCode} type="primary">
                Save
              </Button>
            </Form>
          </Flexbox>
        </Card>
        <Card title="Referral Link">
          <Flexbox gap={12}>
            <Text type={'secondary'}>Copy the link and share with friends. Complete registration to receive rewards.</Text>
            <Input readOnly value={data.referral_link} />
            <Button icon={<Icon icon={Link} />} onClick={() => copyText(data.referral_link)}>
              Copy Link
            </Button>
          </Flexbox>
        </Card>
      </div>
      <Card className={styles.section} title="Backfill Invite Code">
        <Flexbox gap={12}>
          <Text type={'secondary'}>Forgot to enter an invite code? Bind it here before reward expiry.</Text>
          <Form form={backfillForm} layout="inline">
            <Form.Item name="referral_code" rules={[{ required: true }]}>
              <Input placeholder="Enter invite code or link" />
            </Form.Item>
            <Button loading={saving} onClick={backfillReferralCode} type="primary">
              Confirm Binding
            </Button>
          </Form>
        </Flexbox>
      </Card>
      <Card className={styles.section} title="Program Rules">
        <List
          dataSource={Object.entries(data.rules || {})}
          renderItem={([key, value]) => (
            <List.Item>
              <Space>
                <Icon icon={Check} />
                <Text strong>{key}</Text>
                <Text type={'secondary'}>{String(value)}</Text>
              </Space>
            </List.Item>
          )}
        />
      </Card>
      <Card className={styles.section} title="Referral History">
        <Table
          columns={columns}
          dataSource={data.items}
          locale={{ emptyText: <Empty description="No referral history" /> }}
          pagination={false}
          rowKey={(row) => row.invitee_user_id}
          scroll={{ x: true }}
        />
      </Card>
    </Flexbox>
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
        <Flexbox align={'center'} gap={8} horizontal>
          <Icon icon={CircleDollarSign} />
          <Text strong>Credit consumption priority</Text>
        </Flexbox>
        <Progress percent={percent} showInfo={false} />
        <Text type={'secondary'}>
          Organization seat quota is charged first. When the user's seat is exhausted, AskCore falls back to personal credits.
        </Text>
      </Flexbox>
    </Card>
  );
});

QuotaRule.displayName = 'QuotaRule';

const AskCoreBillingPage = memo<{ page: AskCoreBillingPageKey }>(({ page }) => {
  const plansState = useBillingJson<AskCorePlansPayload>('/plans', true);
  const accountState = useBillingJson<AskCoreAccountPayload>('/account');

  return (
    <Flexbox className={styles.page} gap={20}>
      <Flexbox className={styles.pageInner} gap={20}>
        <PageHeader account={accountState.data} page={page} plansPayload={plansState.data} />
        <BillingTabs page={page} />
        {page === 'plans' && (
          <PlansView account={accountState.data} plansPayload={plansState.data} state={plansState} />
        )}
        {page === 'usage' && <UsageView account={accountState.data} plansPayload={plansState.data} />}
        {page === 'credits' && (
          <CreditsView accountState={accountState} plansPayload={plansState.data} />
        )}
        {page === 'billing' && (
          <BillingView accountState={accountState} plansPayload={plansState.data} />
        )}
        {page === 'referral' && <ReferralView />}
        {!isAskCoreBillingPageKey(page) && <Empty />}
        <QuotaRule account={accountState.data} />
      </Flexbox>
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
