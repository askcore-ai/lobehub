'use client';

import { Flexbox, Tag, Text } from '@lobehub/ui';
import { Alert, Card, Empty, Progress, Skeleton, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import type { AskCoreBillingOrganization, AskCoreOrganizationSeat } from './AskCoreBillingPage';

interface OrgSeatsProps {
  error?: string | null;
  loading?: boolean;
  organization?: AskCoreBillingOrganization | null;
  planNames?: Record<string, string>;
}

const numberFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
});

const orgSeatCopy = (language?: string) => {
  const isChinese = language?.toLowerCase().startsWith('zh') ?? false;
  return isChinese
    ? {
        active: '生效中',
        empty: '暂无已分配的组织席位。',
        emptyOrganization: '当前没有可用的组织账单账户。',
        exhausted: '已启用回退',
        plan: '席位套餐',
        quota: '额度',
        rule: '席位是独立额度桶。席位额度耗尽后，会回退使用成员的个人套餐。',
        status: '状态',
        title: '组织席位',
        user: '成员',
      }
    : {
        active: 'Active',
        empty: 'No organization seats have been assigned.',
        emptyOrganization: 'No active organization billing account.',
        exhausted: 'Fallback active',
        plan: 'Seat plan',
        quota: 'Quota',
        rule: 'Seats are independent quota buckets. Exhausted seats fall back to the member personal plan.',
        status: 'Status',
        title: 'Organization seats',
        user: 'Member',
      };
};

const OrgSeats = memo<OrgSeatsProps>(({ error, loading, organization, planNames = {} }) => {
  const { i18n } = useTranslation('subscription');
  const copy = useMemo(() => orgSeatCopy(i18n.language), [i18n.language]);
  const rows = organization?.seats || [];

  const columns: ColumnsType<AskCoreOrganizationSeat> = useMemo(
    () => [
      { dataIndex: 'user_id', title: copy.user },
      {
        dataIndex: 'plan_id',
        render: (value: string) => planNames[value] || value,
        title: copy.plan,
      },
      {
        render: (_, row) => {
          const total = Number(row.quota_credits_total || 0);
          const used = Number(row.quota_credits_used || 0);
          const remaining = Number(row.quota_credits_remaining || 0);
          const percent = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;

          return (
            <Flexbox gap={6}>
              <Progress
                percent={percent}
                showInfo={false}
                status={remaining <= 0 ? 'exception' : 'active'}
              />
              <Text type={'secondary'}>
                {numberFormatter.format(remaining)} / {numberFormatter.format(total)}
              </Text>
            </Flexbox>
          );
        },
        title: copy.quota,
      },
      {
        dataIndex: 'status',
        render: (value: string, row) => {
          const exhausted = Number(row.quota_credits_remaining || 0) <= 0;
          return (
            <Tag color={exhausted ? 'warning' : 'success'}>
              {exhausted ? copy.exhausted : value || copy.active}
            </Tag>
          );
        },
        title: copy.status,
      },
    ],
    [copy, planNames],
  );

  return (
    <Card title={copy.title}>
      <Flexbox gap={16}>
        {loading ? (
          <Skeleton active paragraph={{ rows: 4 }} />
        ) : error && !organization ? (
          <Alert message={error} showIcon type="warning" />
        ) : !organization ? (
          <Empty description={copy.emptyOrganization} />
        ) : rows.length === 0 ? (
          <Empty description={copy.empty} />
        ) : (
          <Table columns={columns} dataSource={rows} pagination={false} rowKey={'seat_id'} />
        )}
        {organization && <Text type={'secondary'}>{copy.rule}</Text>}
      </Flexbox>
    </Card>
  );
});

OrgSeats.displayName = 'OrgSeats';

export default OrgSeats;
