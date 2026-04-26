'use client';

import { Button, Flexbox, Tag, Text } from '@lobehub/ui';
import { Card, Progress, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { createStaticStyles, cssVar } from 'antd-style';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

interface SeatRow {
  id: string;
  plan: string;
  remaining: number;
  status: 'active' | 'exhausted';
  total: number;
  used: number;
  user: string;
}

export const askCoreSeatRows: SeatRow[] = [
  {
    id: 'seat-001',
    plan: 'Premium',
    remaining: 3200,
    status: 'active',
    total: 5000,
    used: 1800,
    user: 'teacher-001',
  },
  {
    id: 'seat-002',
    plan: 'Starter',
    remaining: 0,
    status: 'exhausted',
    total: 1000,
    used: 1000,
    user: 'teacher-002',
  },
];

const numberFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
});

const styles = createStaticStyles(({ css }) => ({
  footer: css`
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 8px;
    padding: 12px;
    background: ${cssVar.colorFillQuaternary};
  `,
}));

const OrgSeats = memo(() => {
  const { t } = useTranslation('subscription');
  const columns: ColumnsType<SeatRow> = useMemo(
    () => [
      { dataIndex: 'user', title: t('askcore.seats.user', { defaultValue: 'Member' }) },
      { dataIndex: 'plan', title: t('askcore.seats.plan', { defaultValue: 'Seat plan' }) },
      {
        render: (_, row) => (
          <Flexbox gap={6}>
            <Progress
              percent={Math.round((row.used / row.total) * 100)}
              showInfo={false}
              status={row.status === 'exhausted' ? 'exception' : 'active'}
            />
            <Text type={'secondary'}>
              {numberFormatter.format(row.remaining)} / {numberFormatter.format(row.total)}
            </Text>
          </Flexbox>
        ),
        title: t('askcore.seats.quota', { defaultValue: 'Quota' }),
      },
      {
        dataIndex: 'status',
        render: (value: SeatRow['status']) => (
          <Tag color={value === 'active' ? 'success' : 'warning'}>
            {value === 'active'
              ? t('askcore.seats.active', { defaultValue: 'Active' })
              : t('askcore.seats.exhausted', { defaultValue: 'Fallback active' })}
          </Tag>
        ),
        title: t('askcore.seats.status', { defaultValue: 'Status' }),
      },
    ],
    [t],
  );

  return (
    <Card title={t('askcore.seats.title', { defaultValue: 'Organization seats' })}>
      <Flexbox gap={16}>
        <Table columns={columns} dataSource={askCoreSeatRows} pagination={false} rowKey={'id'} />
        <Flexbox className={styles.footer} gap={8} horizontal justify={'space-between'}>
          <Text type={'secondary'}>
            {t('askcore.seats.rule', {
              defaultValue:
                'Seats are independent quota buckets. Exhausted seats fall back to the member personal plan.',
            })}
          </Text>
          <Button>{t('askcore.seats.assign', { defaultValue: 'Assign seat' })}</Button>
        </Flexbox>
      </Flexbox>
    </Card>
  );
});

OrgSeats.displayName = 'OrgSeats';

export default OrgSeats;
