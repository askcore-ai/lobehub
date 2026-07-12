'use client';

import { Alert, Button, Empty, Skeleton, Tag } from 'antd';
import { createStaticStyles, cssVar } from 'antd-style';
import {
  BookOpenCheck,
  Building2,
  ExternalLink,
  RefreshCw,
  School,
  ShieldCheck,
} from 'lucide-react';
import { memo } from 'react';
import useSWR from 'swr';

import {
  fetchSchoolIntegrationOperations,
  fetchSchoolPortalManifest,
  fetchSchoolSourceSession,
  SCHOOL_OPERATIONS_API,
  SCHOOL_PORTAL_API,
} from './api';
import { type SchoolPortalDestination, type SchoolPortalState } from './types';

const styles = createStaticStyles(({ css }) => ({
  card: css`
    min-width: 0;
    padding: 18px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 8px;

    background: ${cssVar.colorBgContainer};
  `,
  cardHeader: css`
    display: flex;
    gap: 10px;
    align-items: center;
    margin-block-end: 16px;
  `,
  cardTitle: css`
    margin: 0;

    font-size: 16px;
    font-weight: 650;
    line-height: 1.4;
    color: ${cssVar.colorText};
    overflow-wrap: anywhere;
  `,
  destination: css`
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr) auto;
    gap: 12px;
    align-items: center;

    min-height: 66px;
    padding-block: 10px;
    padding-inline: 10px;
    border-block-start: 1px solid ${cssVar.colorBorderSecondary};
  `,
  destinationCopy: css`
    min-width: 0;
  `,
  destinationDescription: css`
    margin-block-start: 2px;

    font-size: 12px;
    line-height: 1.45;
    color: ${cssVar.colorTextDescription};
    overflow-wrap: anywhere;
  `,
  destinationIcon: css`
    display: grid;
    place-items: center;

    width: 34px;
    height: 34px;
    border-radius: 8px;

    color: ${cssVar.colorPrimary};

    background: ${cssVar.colorPrimaryBg};
  `,
  destinationLabel: css`
    font-size: 14px;
    font-weight: 600;
    line-height: 1.4;
    color: ${cssVar.colorText};
  `,
  grid: css`
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;

    @media (width <= 840px) {
      grid-template-columns: 1fr;
    }
  `,
  operationRow: css`
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    justify-content: space-between;

    min-height: 42px;
    border-block-start: 1px solid ${cssVar.colorBorderSecondary};
  `,
  header: css`
    display: flex;
    gap: 12px;
    align-items: center;

    padding-block-end: 16px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};
  `,
  headerIcon: css`
    display: grid;
    flex: 0 0 40px;
    place-items: center;

    width: 40px;
    height: 40px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 8px;

    color: ${cssVar.colorPrimary};
  `,
  page: css`
    display: flex;
    flex-direction: column;
    gap: 16px;

    min-width: 0;
    padding-block: 16px 28px;
    padding-inline: clamp(12px, 2vw, 28px);
  `,
  subtitle: css`
    margin-block-start: 3px;
    font-size: 13px;
    line-height: 1.45;
    color: ${cssVar.colorTextDescription};
  `,
  title: css`
    margin: 0;

    font-size: 21px;
    font-weight: 650;
    line-height: 1.3;
    color: ${cssVar.colorText};
  `,
}));

const stateCopy: Record<Exclude<SchoolPortalState, 'ready'>, { message: string; title: string }> = {
  conflict: {
    message: '请联系学校管理员确认正确的学校连接后重试。',
    title: '学校连接存在冲突',
  },
  unavailable: {
    message: '学校服务正在恢复，请稍后重试。个人空间仍可正常使用。',
    title: '学校连接暂不可用',
  },
};

const destinationIcon = (destination: SchoolPortalDestination) =>
  destination.key === 'teaching' ? <BookOpenCheck size={17} /> : <Building2 size={17} />;

export const AskCoreSchoolPortalRoute = memo(() => {
  const { data, error, isLoading, mutate } = useSWR(SCHOOL_PORTAL_API, fetchSchoolPortalManifest, {
    revalidateOnFocus: false,
  });
  const {
    data: operations,
    error: operationsError,
    isLoading: operationsLoading,
    mutate: refreshOperations,
  } = useSWR(
    data?.can_manage_integrations ? SCHOOL_OPERATIONS_API : null,
    fetchSchoolIntegrationOperations,
    { revalidateOnFocus: false },
  );
  const sharedSchool = data?.state === 'ready' ? data.schools[0] : undefined;
  const { data: sourceSession } = useSWR(
    sharedSchool?.role_source_url ?? null,
    fetchSchoolSourceSession,
    { revalidateOnFocus: true, shouldRetryOnError: false },
  );

  const terminalState = data?.state && data.state !== 'ready' ? stateCopy[data.state] : undefined;
  const productionPreflightPassed = operations?.production_preflight?.preflight_status === 'passed';
  const processingConnectionReady =
    productionPreflightPassed && (operations?.production_preflight?.active_deployments || 0) > 0;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <span className={styles.headerIcon}>
          <School size={20} />
        </span>
        <div>
          <h1 className={styles.title}>学校</h1>
          <div className={styles.subtitle}>AskCore 在线学校</div>
        </div>
      </header>

      {isLoading ? <Skeleton active paragraph={{ rows: 4 }} /> : null}

      {error ? (
        <Alert
          showIcon
          message="学校连接暂不可用"
          type="error"
          action={
            <Button icon={<RefreshCw size={14} />} size="small" onClick={() => void mutate()}>
              重试
            </Button>
          }
        />
      ) : null}

      {!error && data?.can_manage_integrations ? (
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <ShieldCheck size={18} />
            <h2 className={styles.cardTitle}>系统集成</h2>
          </div>
          {operationsLoading ? <Skeleton active paragraph={{ rows: 2 }} /> : null}
          {operationsError ? (
            <Alert
              showIcon
              message="集成状态暂不可用"
              type="error"
              action={
                <Button size="small" onClick={() => void refreshOperations()}>
                  重试
                </Button>
              }
            />
          ) : null}
          {operations ? (
            <>
              <div className={styles.operationRow}>
                <span>教学处理连接</span>
                <Tag color={processingConnectionReady ? 'green' : 'gold'}>
                  {processingConnectionReady ? '已就绪' : '需处理'}
                </Tag>
              </div>
              <div className={styles.operationRow}>
                <span>生产运行检查</span>
                <Tag color={productionPreflightPassed ? 'green' : 'gold'}>
                  {productionPreflightPassed ? '已通过' : '需处理'}
                </Tag>
              </div>
              <div className={styles.operationRow}>
                <span>学校数据副本</span>
                <Tag color={operations.roster_projection_rows === 0 ? 'green' : 'red'}>
                  {operations.roster_projection_rows === 0 ? '未保存' : '发现异常'}
                </Tag>
              </div>
              <Button icon={<RefreshCw size={14} />} onClick={() => void refreshOperations()}>
                刷新状态
              </Button>
            </>
          ) : null}
        </section>
      ) : null}

      {!error && terminalState ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            <div>
              <div>{terminalState.title}</div>
              <div className={styles.subtitle}>{terminalState.message}</div>
            </div>
          }
        >
          <Button icon={<RefreshCw size={14} />} onClick={() => void mutate()}>
            刷新连接状态
          </Button>
        </Empty>
      ) : null}

      {!error && data?.state === 'ready' ? (
        <div className={styles.grid}>
          {data.schools.map((school) => (
            <section className={styles.card} key={school.key}>
              <div className={styles.cardHeader}>
                <School size={18} />
                <h2 className={styles.cardTitle}>{school.name}</h2>
              </div>
              {school.destinations.map((destination) => (
                <div className={styles.destination} key={destination.key}>
                  <span className={styles.destinationIcon}>{destinationIcon(destination)}</span>
                  <div className={styles.destinationCopy}>
                    <div className={styles.destinationLabel}>
                      {destination.key === 'teaching' && sourceSession?.role === 'student'
                        ? '学习空间'
                        : destination.label}
                    </div>
                    <div className={styles.destinationDescription}>{destination.description}</div>
                  </div>
                  <Button
                    href={destination.launch_url}
                    icon={<ExternalLink size={15} />}
                    type="text"
                    aria-label={`进入${
                      destination.key === 'teaching' && sourceSession?.role === 'student'
                        ? '学习空间'
                        : destination.label
                    }`}
                  />
                </div>
              ))}
            </section>
          ))}
        </div>
      ) : null}
    </main>
  );
});

AskCoreSchoolPortalRoute.displayName = 'AskCoreSchoolPortalRoute';
