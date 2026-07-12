'use client';

import { Alert, Button, Empty, Skeleton, Tag } from 'antd';
import { createStaticStyles, cssVar } from 'antd-style';
import { BookOpenCheck, RefreshCw, School, ShieldCheck } from 'lucide-react';
import { memo } from 'react';
import { useLocation } from 'react-router-dom';
import useSWR from 'swr';

import {
  fetchSchoolIntegrationOperations,
  fetchSchoolPortalManifest,
  fetchSchoolSourceSession,
  SCHOOL_OPERATIONS_API,
  SCHOOL_PORTAL_API,
} from './api';
import { type SchoolPortalState } from './types';

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
  frame: css`
    display: block;

    width: 100%;
    height: calc(100dvh - 154px);
    min-height: 520px;
    border: 0;

    background: ${cssVar.colorBgContainer};

    @media (width <= 840px) {
      height: calc(100dvh - 126px);
      min-height: 420px;
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
    min-height: 100%;
    padding-block: 16px 28px;
    padding-inline: clamp(12px, 2vw, 28px);
  `,
  surface: css`
    overflow: hidden;

    min-width: 0;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 8px;

    background: ${cssVar.colorBgContainer};
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

export const AskCoreSchoolPortalRoute = memo(() => {
  const { pathname } = useLocation();
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
  const isTeachingSurface =
    pathname === '/school/teaching-center' || pathname === '/school/learning-space';
  const destinationKey = isTeachingSurface ? 'teaching' : 'school-services';
  const destination = sharedSchool?.destinations.find((item) => item.key === destinationKey);
  const surfaceTitle = isTeachingSurface
    ? sourceSession?.role === 'student' || pathname === '/school/learning-space'
      ? '学习空间'
      : '教学中心'
    : '学校';
  const SurfaceIcon = isTeachingSurface ? BookOpenCheck : School;
  const productionPreflightPassed = operations?.production_preflight?.preflight_status === 'passed';
  const processingConnectionReady =
    productionPreflightPassed && (operations?.production_preflight?.active_deployments || 0) > 0;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <span className={styles.headerIcon}>
          <SurfaceIcon size={20} />
        </span>
        <div>
          <h1 className={styles.title}>{surfaceTitle}</h1>
          <div className={styles.subtitle}>{sharedSchool?.name || 'AskCore 在线学校'}</div>
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

      {!error && data?.state === 'ready' && destination ? (
        <section className={styles.surface}>
          <iframe
            className={styles.frame}
            src={destination.launch_url}
            title={`${sharedSchool?.name || 'AskCore 在线学校'} ${surfaceTitle}`}
          />
        </section>
      ) : null}

      {!error && data?.state === 'ready' && !destination ? (
        <Empty description="学校服务暂不可用" image={Empty.PRESENTED_IMAGE_SIMPLE}>
          <Button icon={<RefreshCw size={14} />} onClick={() => void mutate()}>
            刷新连接状态
          </Button>
        </Empty>
      ) : null}

      {!isTeachingSurface && !error && data?.can_manage_integrations ? (
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
    </main>
  );
});

AskCoreSchoolPortalRoute.displayName = 'AskCoreSchoolPortalRoute';
