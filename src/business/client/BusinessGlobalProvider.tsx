'use client';

import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import useSWR, { useSWRConfig } from 'swr';

import {
  fetchSchoolPortalManifest,
  fetchSchoolSourceSession,
  SCHOOL_PORTAL_API,
} from '@/business/client/AskCoreSchoolPortal/api';
import { useSession } from '@/libs/better-auth/auth-client';

const WARMUP_TIMEOUT_MS = 30_000;

const sourceSessionReady = (frame: HTMLIFrameElement) => {
  try {
    return !!frame.contentDocument?.querySelector('meta[name="askcore-session"][content="ready"]');
  } catch {
    return false;
  }
};

const SchoolSessionWarmup = () => {
  const { pathname } = useLocation();
  const { data: accountSession } = useSession();
  const accountUserId = accountSession?.user.id;
  const schoolRouteActive = pathname === '/school' || pathname.startsWith('/school/');
  const identityLinkPending =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('protocol') === 'identity-link';
  const { mutate } = useSWRConfig();
  const { data: portal } = useSWR(
    accountUserId && !identityLinkPending && !schoolRouteActive
      ? ([SCHOOL_PORTAL_API, accountUserId] as const)
      : null,
    () => fetchSchoolPortalManifest(),
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );
  const warmups = useMemo(() => {
    if (portal?.state !== 'ready') return [];
    const destinations = portal.schools[0]?.destinations ?? [];
    return [...destinations]
      .sort((left, right) => Number(left.key === 'teaching') - Number(right.key === 'teaching'))
      .map((destination) => ({ key: destination.key, url: destination.session_launch_url }));
  }, [portal]);
  const [activeWarmup, setActiveWarmup] = useState(0);

  useEffect(() => {
    setActiveWarmup(0);
  }, [accountUserId, warmups]);

  useEffect(() => {
    if (activeWarmup >= warmups.length) return;
    const timer = window.setTimeout(() => setActiveWarmup(warmups.length), WARMUP_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [activeWarmup, warmups.length]);

  if (!accountSession || identityLinkPending || schoolRouteActive || warmups.length === 0) {
    return null;
  }
  const roleSourceUrl = portal?.schools[0]?.role_source_url;
  const roleSourceKey =
    roleSourceUrl && accountUserId ? ([roleSourceUrl, accountUserId] as const) : null;
  const warmup = warmups[activeWarmup];
  if (!warmup) return null;

  return (
    <iframe
      hidden
      data-askcore-school-session={warmup.key}
      key={`${accountUserId}:${warmup.key}`}
      src={warmup.url}
      title={`askcore-school-session-${warmup.key}`}
      onLoad={(event) => {
        const advanceWarmup = () => {
          setActiveWarmup((current) => (current === activeWarmup ? current + 1 : current));
        };
        if (sourceSessionReady(event.currentTarget)) {
          if (roleSourceKey) void mutate(roleSourceKey);
          advanceWarmup();
          return;
        }
        if (warmup.key !== 'school-services' || !roleSourceUrl || !roleSourceKey) return;

        void fetchSchoolSourceSession(roleSourceUrl)
          .then((sourceSession) => {
            void mutate(roleSourceKey, sourceSession, { revalidate: false });
            advanceWarmup();
          })
          .catch(() => {});
      }}
    />
  );
};

export default function BusinessGlobalProvider({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <SchoolSessionWarmup />
    </>
  );
}
