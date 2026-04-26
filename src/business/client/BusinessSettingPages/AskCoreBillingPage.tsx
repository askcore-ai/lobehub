'use client';

import { OpenAI } from '@lobehub/icons';
import { Button, Flexbox, Tag, Text } from '@lobehub/ui';
import { Badge, Card, Empty, Progress, Statistic, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { createStaticStyles, cssVar } from 'antd-style';
import { memo, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import OrgSeats from './OrgSeats';

export type AskCoreBillingPageKey = 'billing' | 'credits' | 'plans' | 'referral' | 'usage';

export interface AskCorePlan {
  features: string[];
  id: string;
  monthlyCredits: number;
  monthlyPriceUsd: number;
  name: string;
}

export interface AskCoreCreditPack {
  credits: number;
  id: string;
  name: string;
  priceUsd: number;
}

interface AskCoreUsageRow {
  amount: number;
  id: string;
  model: string;
  scope: string;
  time: string;
  tokens: number;
}

interface AskCoreInvoiceRow {
  amount: number;
  id: string;
  provider: string;
  status: 'paid' | 'shadow';
  time: string;
}

const currencyFormatter = new Intl.NumberFormat('en-US', {
  currency: 'USD',
  maximumFractionDigits: 2,
  style: 'currency',
});

const numberFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
});

export const askCorePlanCatalog: AskCorePlan[] = [
  {
    features: ['Basic chat', 'Private AskCore market', 'Personal fallback credits'],
    id: 'free',
    monthlyCredits: 100,
    monthlyPriceUsd: 0,
    name: 'Free',
  },
  {
    features: ['Higher context usage', 'OCR and grading calls', 'Personal credit rollover'],
    id: 'starter',
    monthlyCredits: 1000,
    monthlyPriceUsd: 12,
    name: 'Starter',
  },
  {
    features: ['Priority model routes', 'Assignment OCR', 'Submission grading'],
    id: 'premium',
    monthlyCredits: 5000,
    monthlyPriceUsd: 29,
    name: 'Premium',
  },
  {
    features: ['Highest local quota', 'Organization seat tier', 'Advanced support lane'],
    id: 'ultimate',
    monthlyCredits: 15000,
    monthlyPriceUsd: 79,
    name: 'Ultimate',
  },
];

export const askCoreCreditPacks: AskCoreCreditPack[] = [
  { credits: 1000, id: 'starter-pack', name: 'Starter Pack', priceUsd: 10 },
  { credits: 5000, id: 'growth-pack', name: 'Growth Pack', priceUsd: 45 },
  { credits: 15000, id: 'scale-pack', name: 'Scale Pack', priceUsd: 120 },
];

export const askCoreUsageRows: AskCoreUsageRow[] = [
  {
    amount: -16.4,
    id: 'usage-001',
    model: 'qwen/qwen3.5-plus',
    scope: 'Organization seat',
    time: '2026-04-26 10:24',
    tokens: 16400,
  },
  {
    amount: -2.8,
    id: 'usage-002',
    model: 'doubao-embedding-vision',
    scope: 'Personal fallback',
    time: '2026-04-26 10:31',
    tokens: 2800,
  },
];

const askCoreInvoices: AskCoreInvoiceRow[] = [
  {
    amount: 58,
    id: 'inv-shadow-001',
    provider: 'Stripe',
    status: 'shadow',
    time: '2026-04-26',
  },
  {
    amount: 45,
    id: 'inv-shadow-002',
    provider: 'WeChat Pay',
    status: 'paid',
    time: '2026-04-18',
  },
];

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

const useRemotePlans = () => {
  const [plans, setPlans] = useState<AskCorePlan[]>(askCorePlanCatalog);

  useEffect(() => {
    const controller = new AbortController();

    fetch('/api/billing/v1/plans', {
      credentials: 'include',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return;
        const payload = await response.json();
        const remotePlans = Array.isArray(payload?.plans) ? payload.plans : [];
        if (remotePlans.length === 0) return;
        setPlans(
          remotePlans.map((plan: any) => ({
            features: Array.isArray(plan.features) ? plan.features : [],
            id: String(plan.id),
            monthlyCredits: Number(plan.monthly_credits ?? 0),
            monthlyPriceUsd: Number(plan.monthly_price_usd ?? 0),
            name: String(plan.display_name ?? plan.id),
          })),
        );
      })
      .catch(() => {
        setPlans(askCorePlanCatalog);
      });

    return () => controller.abort();
  }, []);

  return plans;
};

const PageHeader = memo<{ page: AskCoreBillingPageKey }>(({ page }) => {
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
      <Tag color={'blue'}>{t('askcore.billing.mode.shadow', { defaultValue: 'Shadow mode' })}</Tag>
    </Flexbox>
  );
});

PageHeader.displayName = 'PageHeader';

const PlansView = memo(() => {
  const { t } = useTranslation('subscription');
  const plans = useRemotePlans();

  return (
    <div className={styles.cards}>
      {plans.map((plan) => (
        <Card className={styles.planCard} key={plan.id}>
          <Flexbox gap={16}>
            <Flexbox align={'center'} horizontal justify={'space-between'}>
              <Text style={{ fontSize: 18, fontWeight: 650 }}>{plan.name}</Text>
              <Tag>{numberFormatter.format(plan.monthlyCredits)} credits</Tag>
            </Flexbox>
            <Flexbox gap={4}>
              <Text style={{ fontSize: 28, fontWeight: 700 }}>
                {currencyFormatter.format(plan.monthlyPriceUsd)}
              </Text>
              <Text type={'secondary'}>
                {t('askcore.plans.perMonth', { defaultValue: 'per month' })}
              </Text>
            </Flexbox>
            <ul className={styles.planFeatures}>
              {plan.features.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
            <Button block type={plan.id === 'free' ? 'default' : 'primary'}>
              {plan.id === 'free'
                ? t('askcore.plans.current', { defaultValue: 'Current plan' })
                : t('askcore.plans.checkout', { defaultValue: 'Start checkout' })}
            </Button>
          </Flexbox>
        </Card>
      ))}
    </div>
  );
});

PlansView.displayName = 'PlansView';

const CreditsView = memo(() => {
  const { t } = useTranslation('subscription');

  return (
    <Flexbox gap={16}>
      <div className={styles.metricGrid}>
        <Card>
          <Statistic title={t('askcore.credits.personal', { defaultValue: 'Personal credits' })} value={4280} />
        </Card>
        <Card>
          <Statistic title={t('askcore.credits.topup', { defaultValue: 'Top-up credits' })} value={2700} />
        </Card>
        <Card>
          <Statistic title={t('askcore.credits.referral', { defaultValue: 'Referral credits' })} value={300} />
        </Card>
      </div>
      <div className={styles.cards}>
        {askCoreCreditPacks.map((pack) => (
          <Card className={styles.section} key={pack.id}>
            <Flexbox gap={12}>
              <Text style={{ fontSize: 17, fontWeight: 650 }}>{pack.name}</Text>
              <Text type={'secondary'}>{numberFormatter.format(pack.credits)} credits</Text>
              <Text style={{ fontSize: 22, fontWeight: 700 }}>
                {currencyFormatter.format(pack.priceUsd)}
              </Text>
              <Button>{t('askcore.credits.buy', { defaultValue: 'Buy credits' })}</Button>
            </Flexbox>
          </Card>
        ))}
      </div>
    </Flexbox>
  );
});

CreditsView.displayName = 'CreditsView';

const UsageView = memo(() => {
  const { t } = useTranslation('subscription');
  const columns: ColumnsType<AskCoreUsageRow> = useMemo(
    () => [
      { dataIndex: 'time', title: t('askcore.usage.time', { defaultValue: 'Time' }) },
      { dataIndex: 'scope', title: t('askcore.usage.scope', { defaultValue: 'Scope' }) },
      { dataIndex: 'model', title: t('askcore.usage.model', { defaultValue: 'Model' }) },
      {
        dataIndex: 'tokens',
        render: (value: number) => numberFormatter.format(value),
        title: t('askcore.usage.tokens', { defaultValue: 'Tokens' }),
      },
      {
        dataIndex: 'amount',
        render: (value: number) => `${value.toFixed(2)} credits`,
        title: t('askcore.usage.amount', { defaultValue: 'Credits' }),
      },
    ],
    [t],
  );

  return (
    <Card className={styles.section}>
      <Table columns={columns} dataSource={askCoreUsageRows} pagination={false} rowKey={'id'} />
    </Card>
  );
});

UsageView.displayName = 'UsageView';

const BillingView = memo(() => {
  const { t } = useTranslation('subscription');
  const columns: ColumnsType<AskCoreInvoiceRow> = useMemo(
    () => [
      { dataIndex: 'time', title: t('askcore.billing.date', { defaultValue: 'Date' }) },
      { dataIndex: 'provider', title: t('askcore.billing.provider', { defaultValue: 'Provider' }) },
      {
        dataIndex: 'amount',
        render: (value: number) => currencyFormatter.format(value),
        title: t('askcore.billing.amount', { defaultValue: 'Amount' }),
      },
      {
        dataIndex: 'status',
        render: (value: AskCoreInvoiceRow['status']) => (
          <Badge
            color={value === 'paid' ? 'green' : 'blue'}
            text={value === 'paid' ? 'Paid' : 'Shadow'}
          />
        ),
        title: t('askcore.billing.status', { defaultValue: 'Status' }),
      },
    ],
    [t],
  );

  return (
    <Flexbox gap={16}>
      <OrgSeats />
      <Card className={styles.section} title={t('askcore.billing.history', { defaultValue: 'Billing history' })}>
        <Table columns={columns} dataSource={askCoreInvoices} pagination={false} rowKey={'id'} />
      </Card>
    </Flexbox>
  );
});

BillingView.displayName = 'BillingView';

const ReferralView = memo(() => {
  const { t } = useTranslation('subscription');

  return (
    <div className={styles.metricGrid}>
      <Card>
        <Statistic title={t('askcore.referral.invites', { defaultValue: 'Invites' })} value={6} />
      </Card>
      <Card>
        <Statistic title={t('askcore.referral.rewarded', { defaultValue: 'Rewarded' })} value={4} />
      </Card>
      <Card>
        <Statistic
          suffix={'credits'}
          title={t('askcore.referral.credits', { defaultValue: 'Credits earned' })}
          value={1200}
        />
      </Card>
    </div>
  );
});

ReferralView.displayName = 'ReferralView';

const AskCoreBillingPage = memo<{ page: AskCoreBillingPageKey }>(({ page }) => {
  return (
    <Flexbox className={styles.page} gap={20}>
      <PageHeader page={page} />
      {page === 'plans' && <PlansView />}
      {page === 'credits' && <CreditsView />}
      {page === 'usage' && <UsageView />}
      {page === 'billing' && <BillingView />}
      {page === 'referral' && <ReferralView />}
      {!['plans', 'credits', 'usage', 'billing', 'referral'].includes(page) && <Empty />}
      <Card className={styles.section}>
        <Flexbox gap={8}>
          <Progress percent={72} showInfo={false} />
          <Text type={'secondary'}>
            Organization seat quota is charged first. When a user's seat is exhausted, AskCore
            falls back to the user's personal credits.
          </Text>
        </Flexbox>
      </Card>
    </Flexbox>
  );
});

AskCoreBillingPage.displayName = 'AskCoreBillingPage';

export default AskCoreBillingPage;
