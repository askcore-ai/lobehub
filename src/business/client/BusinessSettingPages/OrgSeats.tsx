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

const OrgSeats = memo<OrgSeatsProps>(({ error, loading, organization, planNames = {} }) => {
  const { t } = useTranslation('subscription');
  const rows = organization?.seats || [];

  const columns: ColumnsType<AskCoreOrganizationSeat> = useMemo(
    () => [
      { dataIndex: 'user_id', title: t('askcore.seats.user', { defaultValue: 'Member' }) },
      {
        dataIndex: 'plan_id',
        render: (value: string) => planNames[value] || value,
        title: t('askcore.seats.plan', { defaultValue: 'Seat plan' }),
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
        title: t('askcore.seats.quota', { defaultValue: 'Quota' }),
      },
      {
        dataIndex: 'status',
        render: (value: string, row) => {
          const exhausted = Number(row.quota_credits_remaining || 0) <= 0;
          return (
            <Tag color={exhausted ? 'warning' : 'success'}>
              {exhausted
                ? t('askcore.seats.exhausted', { defaultValue: 'Fallback active' })
                : value || t('askcore.seats.active', { defaultValue: 'Active' })}
            </Tag>
          );
        },
        title: t('askcore.seats.status', { defaultValue: 'Status' }),
      },
    ],
    [planNames, t],
  );

  return (
    <Card title={t('askcore.seats.title', { defaultValue: 'Organization seats' })}>
      <Flexbox gap={16}>
        {loading ? (
          <Skeleton active paragraph={{ rows: 4 }} />
        ) : error && !organization ? (
          <Alert message={error} showIcon type="warning" />
        ) : !organization ? (
          <Empty
            description={t('askcore.seats.emptyOrganization', {
              defaultValue: 'No active organization billing account.',
            })}
          />
        ) : rows.length === 0 ? (
          <Empty
            description={t('askcore.seats.empty', {
              defaultValue: 'No organization seats have been assigned.',
            })}
          />
        ) : (
          <Table columns={columns} dataSource={rows} pagination={false} rowKey={'seat_id'} />
        )}
        {organization && (
          <Text type={'secondary'}>
            {t('askcore.seats.rule', {
              defaultValue:
                'Seats are independent quota buckets. Exhausted seats fall back to the member personal plan.',
            })}
          </Text>
        )}
      </Flexbox>
    </Card>
  );
});

OrgSeats.displayName = 'OrgSeats';

export default OrgSeats;
