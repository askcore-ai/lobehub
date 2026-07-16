'use client';

import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import useSWR from 'swr';

import {
  fetchSchoolPortalManifestForGeneration,
  fetchSchoolSourceSessionForGeneration,
  gibbonSessionProbeReady,
  recoverSchoolSourceSession,
  schoolPortalManifestCacheKey,
  schoolPortalManifestScope,
  schoolSessionGeneration,
  schoolSourceSessionCacheKey,
  sourceSessionReady,
} from '@/business/client/AskCoreSchoolPortal/api';
import { useSession } from '@/libs/better-auth/auth-client';

const WARMUP_TIMEOUT_MS = 30_000;

type WarmupStage = 'complete' | 'gibbon' | 'moodle' | 'stopped' | null;

const SchoolSessionWarmup = () => {
  const { pathname } = useLocation();
  const { data: accountSession } = useSession();
  const sessionGeneration = schoolSessionGeneration(accountSession);
  const schoolRouteActive = pathname === '/school' || pathname.startsWith('/school/');
  const identityLinkPending =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('protocol') === 'identity-link';
  const enabled = !!sessionGeneration && !identityLinkPending && !schoolRouteActive;
  const [schoolLifecycleEpoch, setSchoolLifecycleEpoch] = useState(0);

  const {
    data: portal,
    isValidating: portalIsValidating,
    mutate: mutatePortal,
  } = useSWR(
    enabled
      ? schoolPortalManifestCacheKey(sessionGeneration, schoolPortalManifestScope(pathname))
      : null,
    ([, generation]) => fetchSchoolPortalManifestForGeneration(generation),
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );
  const roleKey = enabled ? schoolSourceSessionCacheKey(sessionGeneration) : null;
  const {
    data: liveRole,
    error: roleError,
    isValidating: roleIsValidating,
    mutate: mutateRole,
  } = useSWR(
    roleKey,
    ([url, generation]) => fetchSchoolSourceSessionForGeneration(url, generation),
    {
      revalidateOnFocus: true,
      shouldRetryOnError: false,
    },
  );

  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted || !enabled) return;
      setSchoolLifecycleEpoch((current) => current + 1);
      void Promise.allSettled([mutatePortal(), mutateRole()]);
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, [enabled, mutatePortal, mutateRole]);
  const trustedLiveRole = !roleError && !roleIsValidating ? liveRole : undefined;
  const destinations = useMemo(
    () => (portal?.state === 'ready' ? (portal.schools[0]?.destinations ?? []) : []),
    [portal],
  );
  const gibbonWarmup = useMemo(
    () => destinations.find((destination) => destination.key === 'school-services'),
    [destinations],
  );
  const moodleWarmup = useMemo(
    () => destinations.find((destination) => destination.key === 'teaching'),
    [destinations],
  );
  const flowKey = `${sessionGeneration || ''}:${schoolLifecycleEpoch}:${
    gibbonWarmup?.session_launch_url || ''
  }:${moodleWarmup?.session_launch_url || ''}`;
  const [stage, setStage] = useState<WarmupStage>(null);
  const gibbonProbeInFlight = useRef(false);
  const gibbonRoleConfirmedFor = useRef<string | null>(null);
  const activeFlowKey = useRef(flowKey);
  activeFlowKey.current = flowKey;

  useEffect(() => {
    gibbonProbeInFlight.current = false;
    gibbonRoleConfirmedFor.current = null;
    setStage(null);
  }, [flowKey]);

  useEffect(() => {
    if (!enabled || portalIsValidating || portal?.state !== 'ready' || roleIsValidating) return;
    if (trustedLiveRole?.authenticated) {
      setStage((current) => {
        if (current === 'complete' || current === 'gibbon' || current === 'stopped') return current;
        return moodleWarmup ? 'moodle' : 'complete';
      });
      return;
    }
    if (roleError && gibbonWarmup) setStage((current) => current ?? 'gibbon');
  }, [
    enabled,
    gibbonWarmup,
    trustedLiveRole,
    moodleWarmup,
    portal?.state,
    portalIsValidating,
    roleError,
    roleIsValidating,
  ]);

  useEffect(() => {
    if (!stage) return;
    const timer = window.setTimeout(() => setStage('stopped'), WARMUP_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [flowKey, stage]);

  if (
    !enabled ||
    portalIsValidating ||
    portal?.state !== 'ready' ||
    !stage ||
    stage === 'complete' ||
    stage === 'stopped'
  ) {
    return null;
  }
  const warmup = stage === 'gibbon' ? gibbonWarmup : moodleWarmup;
  if (!warmup) return null;

  return (
    <iframe
      hidden
      data-askcore-school-session={warmup.key}
      key={`${flowKey}:${stage}`}
      src={warmup.session_launch_url}
      title={`askcore-school-session-${warmup.key}`}
      onLoad={(event) => {
        if (stage === 'moodle') {
          if (sourceSessionReady(event.currentTarget)) setStage('complete');
          return;
        }
        if (!gibbonSessionProbeReady(event.currentTarget)) return;
        if (gibbonProbeInFlight.current || gibbonRoleConfirmedFor.current === flowKey) return;
        const expectedFlowKey = flowKey;
        gibbonProbeInFlight.current = true;
        void recoverSchoolSourceSession(() => mutateRole(), {
          isCurrent: () => activeFlowKey.current === expectedFlowKey,
        })
          .then((sourceSession) => {
            if (!sourceSession?.authenticated || activeFlowKey.current !== expectedFlowKey) return;
            gibbonRoleConfirmedFor.current = flowKey;
            setStage(moodleWarmup ? 'moodle' : 'complete');
          })
          .catch(() => {})
          .finally(() => {
            gibbonProbeInFlight.current = false;
          });
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
