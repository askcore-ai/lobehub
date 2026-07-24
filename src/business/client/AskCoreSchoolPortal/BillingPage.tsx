'use client';

import { Button, SearchBar } from '@lobehub/ui';
import { Select } from '@lobehub/ui/base-ui';
import {
  Alert,
  App,
  Card,
  Col,
  Empty,
  Popconfirm,
  Progress,
  Row,
  Skeleton,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { createStaticStyles, cssVar } from 'antd-style';
import { RefreshCw, Search, UserRoundCog } from 'lucide-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

import {
  assignSchoolSponsoredSeat,
  fetchSchoolBillingAdminSummary,
  fetchSchoolBillingSourceProof,
  fetchSchoolSponsoredSeats,
  fetchSchoolSponsorshipSummary,
  fetchSchoolUsageSummary,
  releaseSchoolSponsoredSeat,
  SchoolPortalApiError,
  searchSchoolEligibleMembers,
} from './api';
import type { SchoolEligibleMember, SchoolSponsoredSeat } from './types';

const styles = createStaticStyles(({ css }) => ({
  allocation: css`
    display: grid;
    gap: 12px;
  `,
  card: css`
    height: 100%;
  `,
  page: css`
    overflow: auto;
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 16px;

    min-height: 0;
    padding-block-end: 24px;
  `,
  secondary: css`
    color: ${cssVar.colorTextDescription};
  `,
  toolbar: css`
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    justify-content: space-between;
  `,
}));

const credits = (value: number) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);

const tokens = (value: number) => new Intl.NumberFormat().format(value);

export interface SchoolBillingPageProps {
  accountUserId: string;
  schoolKey: string;
}

export const SchoolBillingPage = memo<SchoolBillingPageProps>(({ accountUserId, schoolKey }) => {
  const { message } = App.useApp();
  const { t } = useTranslation('common');
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [candidates, setCandidates] = useState<SchoolEligibleMember[]>([]);
  const [selectedSeatId, setSelectedSeatId] = useState<number>();
  const [mutatingSeatId, setMutatingSeatId] = useState<number>();
  const proofKey =
    accountUserId && schoolKey ? ['school-billing-proof', accountUserId, schoolKey] : null;
  const {
    data: proof,
    error: proofError,
    isLoading: proofLoading,
    mutate: refreshProof,
  } = useSWR(proofKey, () => fetchSchoolBillingSourceProof({ schoolKey }), {
    refreshInterval: (current) =>
      current ? Math.max(15_000, current.expires_at * 1000 - Date.now() - 15_000) : 30_000,
    revalidateOnFocus: true,
    shouldRetryOnError: false,
  });
  const sourceProof = proof?.source_proof;
  const billingErrorMessage = (error: unknown): string => {
    const translationKey =
      error instanceof SchoolPortalApiError && error.translationKey
        ? error.translationKey
        : 'schoolBilling.error.generic';
    return t(translationKey);
  };
  const selfKey = sourceProof ? ['school-billing-self', schoolKey, sourceProof] : null;
  const {
    data: sponsorship,
    error: sponsorshipError,
    isLoading: sponsorshipLoading,
    mutate: refreshSponsorship,
  } = useSWR(selfKey, () => fetchSchoolSponsorshipSummary(schoolKey, sourceProof!), {
    shouldRetryOnError: false,
  });
  const adminKey = sourceProof ? ['school-billing-admin', schoolKey, sourceProof] : null;
  const {
    data: admin,
    error: adminError,
    mutate: refreshAdmin,
  } = useSWR(adminKey, () => fetchSchoolBillingAdminSummary(schoolKey, sourceProof!), {
    shouldRetryOnError: false,
  });
  const isAdministrator = !!admin;
  const adminDenied = adminError instanceof SchoolPortalApiError && adminError.status === 403;
  const seatsKey =
    isAdministrator && sourceProof ? ['school-billing-seats', schoolKey, sourceProof] : null;
  const usageKey =
    isAdministrator && sourceProof ? ['school-billing-usage', schoolKey, sourceProof] : null;
  const { data: seats = [], mutate: refreshSeats } = useSWR(
    seatsKey,
    () => fetchSchoolSponsoredSeats(schoolKey, sourceProof!),
    { shouldRetryOnError: false },
  );
  const { data: usage, mutate: refreshUsage } = useSWR(
    usageKey,
    () => fetchSchoolUsageSummary(schoolKey, sourceProof!),
    { shouldRetryOnError: false },
  );

  const refreshAll = async () => {
    await Promise.allSettled([
      refreshProof(),
      refreshSponsorship(),
      refreshAdmin(),
      refreshSeats(),
      refreshUsage(),
    ]);
  };

  const assignCandidate = async (candidate: SchoolEligibleMember) => {
    const seat = seats.find((item) => item.seat_id === selectedSeatId);
    if (!seat || !sourceProof) return;
    setMutatingSeatId(seat.seat_id);
    try {
      await assignSchoolSponsoredSeat(schoolKey, sourceProof, seat, candidate.eligibility_token);
      setCandidates([]);
      setQuery('');
      await refreshAll();
      void message.success(t('schoolBilling.assignment.updated'));
    } catch (error) {
      void message.error(billingErrorMessage(error));
    } finally {
      setMutatingSeatId(undefined);
    }
  };

  const releaseSeat = async (seat: SchoolSponsoredSeat) => {
    if (!sourceProof) return;
    setMutatingSeatId(seat.seat_id);
    try {
      await releaseSchoolSponsoredSeat(schoolKey, sourceProof, seat.seat_id);
      await refreshAll();
      void message.success(t('schoolBilling.assignment.released'));
    } catch (error) {
      void message.error(billingErrorMessage(error));
    } finally {
      setMutatingSeatId(undefined);
    }
  };

  const searchCandidates = async () => {
    const normalized = query.trim();
    if (!sourceProof || normalized.length < 1) return;
    setSearching(true);
    try {
      setCandidates(await searchSchoolEligibleMembers(schoolKey, sourceProof, normalized));
    } catch (error) {
      void message.error(billingErrorMessage(error));
    } finally {
      setSearching(false);
    }
  };

  const columns: ColumnsType<SchoolSponsoredSeat> = [
    {
      dataIndex: 'slot_number',
      key: 'slot',
      render: (value: number) => `#${value}`,
      title: t('schoolBilling.seats.slot'),
      width: 80,
    },
    {
      key: 'member',
      render: (_, seat) =>
        seat.assignment ? (
          <Space orientation="vertical" size={0}>
            <span>{seat.assignment.display_name}</span>
            <Typography.Text ellipsis className={styles.secondary}>
              {seat.assignment.account_user_id}
            </Typography.Text>
          </Space>
        ) : (
          <Typography.Text type="secondary">{t('schoolBilling.seats.unassigned')}</Typography.Text>
        ),
      title: t('schoolBilling.seats.member'),
    },
    {
      key: 'usage',
      render: (_, seat) => {
        const item = usage?.by_seat.find((row) => row.seat_id === seat.seat_id);
        return item
          ? t('schoolBilling.seats.usageValue', {
              credits: credits(item.credits_used),
              tokens: tokens(item.tokens_total),
            })
          : '—';
      },
      title: t('schoolBilling.seats.usage'),
    },
    {
      key: 'status',
      render: (_, seat) => (
        <Space wrap>
          <Tag>{t(`schoolBilling.seats.status.${seat.status}`)}</Tag>
          {!seat.voluntary_reassignment_available ? (
            <Tag color="warning">{t('schoolBilling.seats.changeUsed')}</Tag>
          ) : null}
        </Space>
      ),
      title: t('schoolBilling.seats.state'),
    },
    {
      key: 'actions',
      render: (_, seat) =>
        seat.assignment ? (
          <Popconfirm
            description={t('schoolBilling.assignment.releaseWarning')}
            okText={t('confirm')}
            title={t('schoolBilling.assignment.release')}
            onConfirm={() => releaseSeat(seat)}
          >
            <Button danger loading={mutatingSeatId === seat.seat_id} size="small">
              {t('schoolBilling.assignment.release')}
            </Button>
          </Popconfirm>
        ) : null,
      title: t('schoolBilling.seats.actions'),
      width: 110,
    },
  ];

  if (proofLoading || sponsorshipLoading) return <Skeleton active paragraph={{ rows: 6 }} />;

  if (proofError || sponsorshipError || !sponsorship) {
    return (
      <Alert
        showIcon
        title={t('schoolBilling.sourceUnavailable')}
        type="error"
        action={
          <Button icon={<RefreshCw size={14} />} size="small" onClick={() => void refreshAll()}>
            {t('retry')}
          </Button>
        }
      />
    );
  }

  const schoolFunded = sponsorship.current_funding_priority === 'school_then_personal';
  const usagePercent = admin
    ? Math.min(
        100,
        (admin.period.settled_credits / Math.max(admin.period.granted_credits, 1)) * 100,
      )
    : 0;

  return (
    <section className={styles.page}>
      <Alert
        showIcon
        type={schoolFunded ? 'success' : 'warning'}
        title={t(
          schoolFunded ? 'schoolBilling.payer.schoolThenPersonal' : 'schoolBilling.payer.personal',
        )}
      />

      {!isAdministrator && !adminDenied && adminError ? (
        <Alert showIcon title={t('schoolBilling.adminUnavailable')} type="warning" />
      ) : null}

      {isAdministrator && admin ? (
        <>
          <Row gutter={[12, 12]}>
            <Col lg={6} sm={12} xs={24}>
              <Card className={styles.card}>
                <Statistic
                  title={t('schoolBilling.summary.totalSeats')}
                  value={admin.seat_counts.total}
                />
              </Card>
            </Col>
            <Col lg={6} sm={12} xs={24}>
              <Card className={styles.card}>
                <Statistic
                  title={t('schoolBilling.summary.assignedSeats')}
                  value={admin.seat_counts.assigned}
                />
              </Card>
            </Col>
            <Col lg={6} sm={12} xs={24}>
              <Card className={styles.card}>
                <Statistic
                  title={t('schoolBilling.summary.availableCredits')}
                  value={credits(admin.period.available_credits)}
                />
              </Card>
            </Col>
            <Col lg={6} sm={12} xs={24}>
              <Card className={styles.card}>
                <Statistic
                  title={t('schoolBilling.summary.tokens')}
                  value={tokens(usage?.tokens_total || 0)}
                />
              </Card>
            </Col>
          </Row>

          <Card title={t('schoolBilling.pool.title')}>
            <Progress percent={Number(usagePercent.toFixed(1))} />
            <Typography.Text className={styles.secondary}>
              {t('schoolBilling.pool.detail', {
                available: credits(admin.period.available_credits),
                granted: credits(admin.period.granted_credits),
                used: credits(admin.period.settled_credits),
              })}
            </Typography.Text>
          </Card>

          <Card title={t('schoolBilling.assignment.title')}>
            <div className={styles.allocation}>
              <Alert showIcon title={t('schoolBilling.assignment.warning')} type="warning" />
              <Select
                aria-label={t('schoolBilling.assignment.seat')}
                placeholder={t('schoolBilling.assignment.selectSeat')}
                value={selectedSeatId}
                options={seats.map((seat) => ({
                  label: `#${seat.slot_number} · ${
                    seat.assignment?.display_name || t('schoolBilling.seats.unassigned')
                  }`,
                  value: seat.seat_id,
                }))}
                onChange={setSelectedSeatId}
              />
              <SearchBar
                allowClear
                placeholder={t('schoolBilling.assignment.searchPlaceholder')}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <Button icon={<Search size={14} />} loading={searching} onClick={searchCandidates}>
                {t('schoolBilling.assignment.search')}
              </Button>
              {candidates.length > 0 ? (
                <Space orientation="vertical">
                  {candidates.map((candidate) => (
                    <Button
                      disabled={!selectedSeatId}
                      icon={<UserRoundCog size={14} />}
                      key={candidate.eligibility_token}
                      loading={mutatingSeatId === selectedSeatId}
                      onClick={() => void assignCandidate(candidate)}
                    >
                      {candidate.display_name}
                    </Button>
                  ))}
                </Space>
              ) : null}
            </div>
          </Card>

          <Card
            title={t('schoolBilling.seats.title')}
            extra={
              <Button icon={<RefreshCw size={14} />} size="small" onClick={() => void refreshAll()}>
                {t('schoolBilling.refresh')}
              </Button>
            }
          >
            <Table
              columns={columns}
              dataSource={seats}
              locale={{ emptyText: <Empty description={t('schoolBilling.seats.empty')} /> }}
              pagination={false}
              rowKey="seat_id"
              scroll={{ x: 760 }}
              size="small"
            />
          </Card>
        </>
      ) : (
        <Card title={t('schoolBilling.member.title')}>
          <Space orientation="vertical">
            <Typography.Text>
              {t(`schoolBilling.member.status.${sponsorship.sponsorship_status}`)}
            </Typography.Text>
            {sponsorship.seat_id ? (
              <Typography.Text type="secondary">
                {t('schoolBilling.member.seat', { seat: sponsorship.seat_id })}
              </Typography.Text>
            ) : null}
          </Space>
        </Card>
      )}
    </section>
  );
});

SchoolBillingPage.displayName = 'SchoolBillingPage';
