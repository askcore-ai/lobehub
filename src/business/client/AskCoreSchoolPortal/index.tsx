'use client';

import { Button } from '@lobehub/ui';
import { Alert, Empty, Skeleton } from 'antd';
import { createStaticStyles, cssVar } from 'antd-style';
import { BookOpenCheck, RefreshCw, School } from 'lucide-react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import useSWR from 'swr';

import { useSession } from '@/libs/better-auth/auth-client';

import {
  fetchSchoolPortalManifest,
  fetchSchoolSourceSession,
  gibbonSessionProbeReady,
  SCHOOL_PORTAL_API,
  schoolSessionGeneration,
  schoolSourceSessionCacheKey,
} from './api';

const ROLE_RECOVERY_TIMEOUT_MS = 30_000;
const SOURCE_FRAME_TIMEOUT_MS = 30_000;

type SourceFrameStatus = 'failed' | 'loading' | 'ready';

const sourceFrameStatus = (
  frame: HTMLIFrameElement,
  destinationKey: 'school-services' | 'teaching',
): SourceFrameStatus => {
  try {
    const path = frame.contentWindow?.location.pathname || '';
    const body = frame.contentDocument?.body;
    const text = (body?.innerText || body?.textContent || '').trim();
    const marker = frame.contentDocument?.querySelector<HTMLMetaElement>(
      'meta[name="askcore-session"]',
    );
    if (
      (text.startsWith('{') && text.slice(0, 500).includes('"detail"')) ||
      text.includes('School destination is unavailable') ||
      text.includes('学校目标不可用') ||
      path === '/signin' ||
      path.includes('/login.php') ||
      path.includes('/login/index.php')
    ) {
      return 'failed';
    }
    if (marker?.content === 'ready') return 'ready';
    const sourcePrefix = destinationKey === 'teaching' ? '/school/teaching/' : '/school/services/';
    const transient =
      path.includes('/local/askcore/warmup.php') ||
      path.includes('/askcore/warmup.php') ||
      path.includes('/auth/oauth2/login.php') ||
      path.includes('/admin/oauth2callback.php');
    const atSourceDestination = path === sourcePrefix.slice(0, -1) || path.startsWith(sourcePrefix);
    return atSourceDestination && !transient ? 'ready' : 'loading';
  } catch {
    return 'loading';
  }
};

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

export const AskCoreSchoolPortalRoute = memo(() => {
  const { t } = useTranslation('common');
  const { pathname } = useLocation();
  const { data: accountSession } = useSession();
  const sessionGeneration = schoolSessionGeneration(accountSession);
  const isTeachingSurface =
    pathname === '/school/teaching-center' || pathname === '/school/learning-space';
  const destinationKey = isTeachingSurface ? 'teaching' : 'school-services';
  const portalCacheKey = sessionGeneration
    ? ([SCHOOL_PORTAL_API, sessionGeneration, destinationKey] as const)
    : null;
  const { data, error, isLoading, isValidating, mutate } = useSWR(
    portalCacheKey,
    fetchSchoolPortalManifest,
    {
      revalidateOnFocus: false,
      revalidateOnMount: true,
    },
  );
  const roleSourceKey = schoolSourceSessionCacheKey(sessionGeneration);
  const {
    data: liveSourceSession,
    error: sourceSessionError,
    isLoading: sourceSessionLoading,
    isValidating: sourceSessionValidating,
    mutate: mutateSourceSession,
  } = useSWR(roleSourceKey, ([url]) => fetchSchoolSourceSession(url), {
    revalidateOnFocus: true,
    shouldRetryOnError: false,
  });
  const sharedSchool = data?.state === 'ready' ? data.schools[0] : undefined;
  const destination = sharedSchool?.destinations.find((item) => item.key === destinationKey);
  const gibbonWarmup = sharedSchool?.destinations.find((item) => item.key === 'school-services');
  const terminalState =
    data?.state && data.state !== 'ready'
      ? {
          message: t(`schoolPortal.state.${data.state}.message`),
          title: t(`schoolPortal.state.${data.state}.title`),
        }
      : undefined;
  const trustedSourceSession =
    !sourceSessionError && !sourceSessionValidating ? liveSourceSession : undefined;
  const sourceRole = trustedSourceSession?.role;
  const roleAllowed =
    pathname === '/school/learning-space'
      ? sourceRole === 'student'
      : pathname === '/school/teaching-center'
        ? sourceRole === 'teacher' || sourceRole === 'administrator'
        : true;
  const surfaceTitle =
    pathname === '/school/learning-space'
      ? t('schoolPortal.surface.learningSpace')
      : pathname === '/school/teaching-center'
        ? t('schoolPortal.surface.teachingCenter')
        : t('schoolPortal.surface.school');
  const schoolName = sharedSchool?.name || t('schoolPortal.name');
  const SurfaceIcon = isTeachingSurface ? BookOpenCheck : School;
  const [lifecycleEpoch, setLifecycleEpoch] = useState(0);
  const [trustedGeneration, setTrustedGeneration] = useState(sessionGeneration);
  const [covered, setCovered] = useState(false);
  const [recoveryFailed, setRecoveryFailed] = useState(false);
  const [activeRecoveryKey, setActiveRecoveryKey] = useState<string>();
  const [sourceFrameLifecycle, setSourceFrameLifecycle] = useState<{
    key: string;
    status: SourceFrameStatus;
  }>({ key: '', status: 'loading' });
  const [visibleGibbonReadyKey, setVisibleGibbonReadyKey] = useState('');
  const activeGeneration = useRef(sessionGeneration);
  const roleProbeInFlight = useRef(false);
  const visibleRoleProbeKey = useRef('');
  const surfaceRef = useRef<HTMLElement>(null);
  activeGeneration.current = sessionGeneration;
  const recoveryKey = `${sessionGeneration || ''}:${lifecycleEpoch}:${
    gibbonWarmup?.session_launch_url || ''
  }`;

  const refreshLifecycle = useCallback(async () => {
    const expectedGeneration = sessionGeneration;
    setCovered(true);
    setTrustedGeneration(undefined);
    setLifecycleEpoch((current) => current + 1);
    await Promise.allSettled([mutate(), mutateSourceSession()]);
    if (activeGeneration.current !== expectedGeneration) return;
    setTrustedGeneration(expectedGeneration);
    setCovered(false);
  }, [mutate, mutateSourceSession, sessionGeneration]);

  useEffect(() => {
    if (trustedGeneration === sessionGeneration) return;
    void refreshLifecycle();
  }, [refreshLifecycle, sessionGeneration, trustedGeneration]);

  useEffect(() => {
    const onPageHide = () => {
      surfaceRef.current?.setAttribute('hidden', '');
      setCovered(true);
    };
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      void refreshLifecycle();
    };
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [refreshLifecycle]);

  const shouldStartRoleRecovery =
    !!sessionGeneration &&
    isTeachingSurface &&
    !sourceSessionLoading &&
    !sourceSessionValidating &&
    !!sourceSessionError &&
    !!gibbonWarmup &&
    !recoveryFailed;

  useEffect(() => {
    roleProbeInFlight.current = false;
    setActiveRecoveryKey(undefined);
    setRecoveryFailed(false);
  }, [recoveryKey]);

  useEffect(() => {
    if (shouldStartRoleRecovery) setActiveRecoveryKey(recoveryKey);
  }, [recoveryKey, shouldStartRoleRecovery]);

  const recoveringRole =
    activeRecoveryKey === recoveryKey && !recoveryFailed && !trustedSourceSession;

  useEffect(() => {
    if (!recoveringRole) return;
    const timer = window.setTimeout(() => setRecoveryFailed(true), ROLE_RECOVERY_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [recoveringRole, recoveryKey]);

  const generationReady = !!sessionGeneration && trustedGeneration === sessionGeneration;
  const canLaunchFrame =
    generationReady &&
    !covered &&
    !error &&
    !isValidating &&
    data?.state === 'ready' &&
    !!destination &&
    (!isTeachingSurface || roleAllowed);
  const sourceFrameKey = canLaunchFrame
    ? `${sessionGeneration}:${lifecycleEpoch}:${destinationKey}:${destination?.launch_url}`
    : '';
  const currentSourceFrameStatus =
    sourceFrameLifecycle.key === sourceFrameKey ? sourceFrameLifecycle.status : 'loading';

  useEffect(() => {
    if (!sourceFrameKey) return;
    setSourceFrameLifecycle({ key: sourceFrameKey, status: 'loading' });
    const timer = window.setTimeout(() => {
      setSourceFrameLifecycle((current) =>
        current.key === sourceFrameKey ? { ...current, status: 'failed' } : current,
      );
    }, SOURCE_FRAME_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [sourceFrameKey]);

  useEffect(() => {
    if (
      destinationKey !== 'school-services' ||
      visibleGibbonReadyKey !== sourceFrameKey ||
      sourceSessionValidating ||
      visibleRoleProbeKey.current === sourceFrameKey
    ) {
      return;
    }
    visibleRoleProbeKey.current = sourceFrameKey;
    void mutateSourceSession().catch(() => {});
  }, [
    destinationKey,
    mutateSourceSession,
    sourceFrameKey,
    sourceSessionValidating,
    visibleGibbonReadyKey,
  ]);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <span className={styles.headerIcon}>
          <SurfaceIcon size={20} />
        </span>
        <div>
          <h1 className={styles.title}>{surfaceTitle}</h1>
          <div className={styles.subtitle}>{schoolName}</div>
        </div>
      </header>

      {!sessionGeneration ||
      isLoading ||
      isValidating ||
      sourceSessionLoading ||
      recoveringRole ||
      covered ||
      (canLaunchFrame && currentSourceFrameStatus === 'loading') ? (
        <Skeleton active paragraph={{ rows: 4 }} />
      ) : null}

      {error ? (
        <Alert
          showIcon
          message={t('schoolPortal.connection.unavailable')}
          type="error"
          action={
            <Button
              icon={<RefreshCw size={14} />}
              size="small"
              onClick={() => void refreshLifecycle()}
            >
              {t('retry')}
            </Button>
          }
        />
      ) : null}

      {recoveringRole && gibbonWarmup ? (
        <iframe
          hidden
          data-askcore-school-session="school-services"
          key={`${sessionGeneration}:role-recovery:${lifecycleEpoch}`}
          src={gibbonWarmup.session_launch_url}
          title="askcore-school-role-recovery"
          onLoad={(event) => {
            if (!gibbonSessionProbeReady(event.currentTarget)) return;
            if (roleProbeInFlight.current) return;
            roleProbeInFlight.current = true;
            void mutateSourceSession()
              .then((sourceSession) => {
                if (sourceSession?.authenticated) setActiveRecoveryKey(undefined);
              })
              .catch(() => {})
              .finally(() => {
                roleProbeInFlight.current = false;
              });
          }}
        />
      ) : null}

      {canLaunchFrame ? (
        <section
          className={styles.surface}
          hidden={currentSourceFrameStatus !== 'ready'}
          ref={surfaceRef}
        >
          <iframe
            className={styles.frame}
            key={sourceFrameKey}
            src={destination.launch_url}
            title={`${schoolName} ${surfaceTitle}`}
            onLoad={(event) => {
              const status = sourceFrameStatus(event.currentTarget, destinationKey);
              if (status !== 'loading') {
                setSourceFrameLifecycle((current) =>
                  current.key === sourceFrameKey ? { ...current, status } : current,
                );
              }
              if (
                destinationKey === 'school-services' &&
                gibbonSessionProbeReady(event.currentTarget)
              ) {
                setVisibleGibbonReadyKey(sourceFrameKey);
              }
            }}
          />
        </section>
      ) : null}

      {!error && !isValidating && canLaunchFrame && currentSourceFrameStatus === 'failed' ? (
        <Empty
          description={t('schoolPortal.connection.unavailable')}
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        >
          <Button icon={<RefreshCw size={14} />} onClick={() => void refreshLifecycle()}>
            {t('schoolPortal.connection.refresh')}
          </Button>
        </Empty>
      ) : null}

      {!error && !isValidating && data?.state === 'ready' && !destination ? (
        <Empty
          description={t('schoolPortal.connection.unavailable')}
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        >
          <Button icon={<RefreshCw size={14} />} onClick={() => void refreshLifecycle()}>
            {t('schoolPortal.connection.refresh')}
          </Button>
        </Empty>
      ) : null}

      {!error && !isValidating && isTeachingSurface && recoveryFailed ? (
        <Empty
          description={t('schoolPortal.connection.unavailable')}
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        >
          <Button
            icon={<RefreshCw size={14} />}
            onClick={() => {
              setRecoveryFailed(false);
              void refreshLifecycle();
            }}
          >
            {t('schoolPortal.connection.refresh')}
          </Button>
        </Empty>
      ) : null}

      {!error && !isValidating && isTeachingSurface && trustedSourceSession && !roleAllowed ? (
        <Empty
          description={t('schoolPortal.identity.denied')}
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      ) : null}

      {!error && !isValidating && terminalState ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            <div>
              <div>{terminalState.title}</div>
              <div className={styles.subtitle}>{terminalState.message}</div>
            </div>
          }
        >
          <Button icon={<RefreshCw size={14} />} onClick={() => void refreshLifecycle()}>
            {t('schoolPortal.connection.refresh')}
          </Button>
        </Empty>
      ) : null}
    </main>
  );
});

AskCoreSchoolPortalRoute.displayName = 'AskCoreSchoolPortalRoute';
