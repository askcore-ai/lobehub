'use client';

import { type ReactNode, useEffect, useMemo, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';

import {
  fetchSchoolPortalManifest,
  SCHOOL_PORTAL_API,
} from '@/business/client/AskCoreSchoolPortal/api';
import { useSession } from '@/libs/better-auth/auth-client';

const WARMUP_STAGGER_MS = 3000;

const SchoolSessionWarmup = () => {
  const { data: accountSession } = useSession();
  const { mutate } = useSWRConfig();
  const { data: portal } = useSWR(
    accountSession ? SCHOOL_PORTAL_API : null,
    fetchSchoolPortalManifest,
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );
  const warmups = useMemo(() => {
    if (portal?.state !== 'ready') return [];
    const destinations = portal.schools[0]?.destinations ?? [];
    return [...destinations]
      .sort((left, right) => Number(left.key === 'teaching') - Number(right.key === 'teaching'))
      .map((destination) => ({ key: destination.key, url: destination.session_launch_url }));
  }, [portal]);
  const [visibleCount, setVisibleCount] = useState(1);

  useEffect(() => {
    setVisibleCount(1);
    if (warmups.length < 2) return;
    const timer = window.setInterval(() => {
      setVisibleCount((count) => {
        if (count >= warmups.length) {
          window.clearInterval(timer);
          return count;
        }
        return count + 1;
      });
    }, WARMUP_STAGGER_MS);
    return () => window.clearInterval(timer);
  }, [warmups]);

  if (!accountSession || warmups.length === 0) return null;
  const roleSourceUrl = portal?.schools[0]?.role_source_url;

  return warmups.slice(0, visibleCount).map((warmup) => (
    <iframe
      hidden
      data-askcore-school-session={warmup.key}
      key={warmup.key}
      src={warmup.url}
      title={`askcore-school-session-${warmup.key}`}
      onLoad={() => {
        if (roleSourceUrl) void mutate(roleSourceUrl);
      }}
    />
  ));
};

export default function BusinessGlobalProvider({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <SchoolSessionWarmup />
    </>
  );
}
