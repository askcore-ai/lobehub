'use client';

import { sha256 } from 'js-sha256';
import { type ReactNode, useEffect, useLayoutEffect, useRef } from 'react';

import { stableSchoolSessionGeneration } from '@/business/client/AskCoreSchoolPortal/api';
import { setSchoolHandoffSessionState } from '@/business/client/AskCoreSchoolPortal/handoffClient';
import { useSession } from '@/libs/better-auth/auth-client';

export const SCHOOL_SESSION_CHANNEL = 'askcore-school-session-v1';

const SchoolSessionGenerationNotifier = () => {
  const {
    data: accountSession,
    isPending: accountSessionPending,
    isRefetching: accountSessionRefetching,
  } = useSession();
  const sessionGeneration = stableSchoolSessionGeneration(accountSession, {
    isPending: accountSessionPending,
    isRefetching: accountSessionRefetching,
  });
  const previousNotification = useRef<string | undefined>(undefined);
  const generationHash = sessionGeneration ? sha256(sessionGeneration) : null;
  const sessionState = accountSessionRefetching
    ? 'unstable'
    : sessionGeneration
      ? 'stable'
      : 'signed-out';

  useLayoutEffect(() => {
    if (accountSessionPending && !accountSessionRefetching) return;
    setSchoolHandoffSessionState(sessionState, generationHash);
  }, [
    accountSessionPending,
    accountSessionRefetching,
    generationHash,
    sessionState,
  ]);

  useEffect(() => {
    if (accountSessionPending && !accountSessionRefetching) return;
    const notification = `${sessionState}:${generationHash ?? ''}`;
    if (previousNotification.current === notification) return;
    previousNotification.current = notification;
    if (typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel(SCHOOL_SESSION_CHANNEL);
    channel.postMessage({ generationHash, sessionState, type: 'generation-changed' });
    channel.close();
  }, [
    accountSessionPending,
    accountSessionRefetching,
    generationHash,
    sessionGeneration,
    sessionState,
  ]);

  return null;
};

export default function BusinessGlobalProvider({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <SchoolSessionGenerationNotifier />
    </>
  );
}
