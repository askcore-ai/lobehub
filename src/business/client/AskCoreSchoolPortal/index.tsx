'use client';

import { Alert, Button, Empty, Skeleton } from 'antd';
import { createStaticStyles, cssVar } from 'antd-style';
import { BookOpenCheck, RefreshCw, School } from 'lucide-react';
import { memo } from 'react';
import { useLocation } from 'react-router-dom';
import useSWR from 'swr';

import { useSession } from '@/libs/better-auth/auth-client';

import { fetchSchoolPortalManifest, fetchSchoolSourceSession, SCHOOL_PORTAL_API } from './api';
import { type SchoolPortalState } from './types';

const styles = createStaticStyles(({ css }) => ({
  frame: css`
    display: block;

    width: 100%;
    height: 100%;
    min-height: 0;
    border: 0;

    background: ${cssVar.colorBgContainer};
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

    box-sizing: border-box;
    min-width: 0;
    height: 100%;
    min-height: 0;
    padding-block: 16px;
    padding-inline: clamp(12px, 2vw, 28px);

    @media (width <= 840px) {
      height: 100dvh;
    }
  `,
  surface: css`
    overflow: hidden;
    flex: 1;

    min-width: 0;
    min-height: 0;
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
  const { data: accountSession } = useSession();
  const accountUserId = accountSession?.user.id;
  const { data, error, isLoading, mutate } = useSWR(SCHOOL_PORTAL_API, fetchSchoolPortalManifest, {
    revalidateOnFocus: false,
  });
  const sharedSchool = data?.state === 'ready' ? data.schools[0] : undefined;
  const roleSourceKey =
    sharedSchool?.role_source_url && accountUserId
      ? ([sharedSchool.role_source_url, accountUserId] as const)
      : null;
  const { data: sourceSession, mutate: mutateSourceSession } = useSWR(
    roleSourceKey,
    ([url]) => fetchSchoolSourceSession(url),
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
            onLoad={() => {
              if (destinationKey !== 'school-services') return;
              void mutateSourceSession().catch(() => {});
            }}
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
