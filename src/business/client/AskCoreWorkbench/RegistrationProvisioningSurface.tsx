'use client';

import { Button } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar } from 'antd-style';
import { sha256 } from 'js-sha256';
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { stableSchoolSessionGeneration } from '@/business/client/AskCoreSchoolPortal/api';
import { SCHOOL_SESSION_CHANNEL } from '@/business/client/BusinessGlobalProvider';
import { useSession } from '@/libs/better-auth/auth-client';
import { useUserStore } from '@/store/user';
import { onboardingSelectors } from '@/store/user/selectors';

import {
  AskCoreWorkbenchApiError,
  fetchRegistrationStatus,
  prepareRegistrationIntent,
  recoverRegistration,
  type RegistrationStatus,
} from './api';
import {
  ASKCORE_REGISTRATION_PATH,
  registrationInvitationFromSession,
  registrationReturnPath,
  registrationSessionBinding,
} from './config';

const styles = createStaticStyles(({ css }) => ({
  page: css`
    display: grid;
    place-items: center;
    min-height: min(640px, 80dvh);
    padding: 24px;
  `,
  panel: css`
    display: grid;
    gap: 16px;
    width: min(100%, 560px);
    padding: 24px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 16px;
    background: ${cssVar.colorBgContainer};
    color: ${cssVar.colorText};
  `,
}));

const stateKeys = {
  authenticate: 'registration.state.authenticate',
  choose_intent: 'registration.state.chooseIntent',
  contact_school: 'registration.state.contactSchool',
  continue: 'registration.state.completed',
  replace_invitation: 'registration.state.replaceInvitation',
  retry: 'registration.state.retry',
  review_identity: 'registration.state.reviewIdentity',
  wait: 'registration.state.pending',
} as const;

export const RegistrationProvisioningSurface = memo(() => {
  const { t } = useTranslation('auth');
  const navigate = useNavigate();
  const session = useSession();
  const refetchSession = useRef(session.refetch);
  refetchSession.current = session.refetch;
  const generation = stableSchoolSessionGeneration(session.data, session);
  const binding = generation && session.data
    ? registrationSessionBinding(session.data.user.id, session.data.session.id) : undefined;
  const refreshUserState = useUserStore((state) => state.refreshUserState);
  const [result, setResult] = useState<{ binding: string; status: RegistrationStatus }>();
  const [error, setError] = useState<number>();
  const [busy, setBusy] = useState(false);
  const [crossTabInvalidated, setCrossTabInvalidated] = useState(false);
  const controller = useRef<AbortController | undefined>(undefined);
  const epoch = useRef(0);
  const currentBinding = useRef(binding);
  const currentGeneration = useRef(generation);

  const invalidate = useCallback(() => {
    epoch.current += 1;
    controller.current?.abort();
    setResult(undefined);
    setBusy(false);
    setError(undefined);
  }, []);

  useLayoutEffect(() => {
    currentBinding.current = binding;
    currentGeneration.current = generation;
    invalidate();
  }, [binding, generation, invalidate]);

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel(SCHOOL_SESSION_CHANNEL);
    channel.onmessage = (event: MessageEvent<unknown>) => {
      const value = event.data as { generationHash?: unknown; sessionState?: unknown; type?: unknown } | null;
      if (!value || value.type !== 'generation-changed') return;
      if (value.sessionState === 'stable' && currentGeneration.current && value.generationHash === sha256(currentGeneration.current)) return;
      invalidate();
      currentBinding.current = undefined;
      setCrossTabInvalidated(true);
      void Promise.resolve(refetchSession.current()).then(() => setCrossTabInvalidated(false)).catch(() => setError(503));
    };
    return () => channel.close();
  }, [invalidate]);

  const run = useCallback(async (operation?: 'ordinary' | 'invitation' | 'acknowledge' | 'retry') => {
    if (!binding || crossTabInvalidated || currentBinding.current !== binding) return;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    const attempt = ++epoch.current;
    const active = () => !abort.signal.aborted && epoch.current === attempt && currentBinding.current === binding;
    setBusy(true);
    setError(undefined);
    try {
      let status: RegistrationStatus;
      if (!operation) {
        status = await fetchRegistrationStatus(abort.signal);
      } else {
        let intentHandle: string | undefined;
        if (operation === 'ordinary' || operation === 'invitation') {
          const token = registrationInvitationFromSession();
          if (operation === 'invitation' && !token) throw new AskCoreWorkbenchApiError('Invitation required', 409);
          const intent = await prepareRegistrationIntent(operation === 'invitation'
            ? { kind: 'invitation', invitationToken: token, returnPath: '/school' }
            : { kind: 'ordinary', returnPath: '/school' }, abort.signal);
          if (!active()) return;
          intentHandle = intent.handle;
        }
        status = await recoverRegistration(binding, {
          ...(intentHandle ? { intentHandle } : {}),
          ...(operation === 'acknowledge' ? { acknowledgeCurrentIdentity: true as const } : {}),
        }, abort.signal);
      }
      if (!active()) return;
      setResult({ binding, status });
      if (status.action === 'continue') {
        const target = registrationReturnPath(status.returnPath);
        await refreshUserState();
        if (!active()) return;
        navigate(onboardingSelectors.needsOnboarding(useUserStore.getState()) ? '/onboarding' : target, { replace: true });
      }
    } catch (reason) {
      if (!active()) return;
      const code = reason instanceof AskCoreWorkbenchApiError ? reason.status : 503;
      setError(code);
      if (code === 409) {
        invalidate();
        setError(409);
        currentBinding.current = undefined;
        setCrossTabInvalidated(true);
        void Promise.resolve(refetchSession.current()).then(() => setCrossTabInvalidated(false)).catch(() => setError(503));
      }
    } finally {
      if (active()) setBusy(false);
    }
  }, [binding, crossTabInvalidated, invalidate, navigate, refreshUserState]);

  useEffect(() => {
    if (!crossTabInvalidated) currentBinding.current = binding;
    void run();
    return () => { epoch.current += 1; controller.current?.abort(); };
  }, [binding, crossTabInvalidated, run]);

  const status = result?.binding === binding && !crossTabInvalidated ? result.status : undefined;
  useEffect(() => {
    if (busy || error || !status || !['wait', 'retry'].includes(status.action)) return;
    const timer = setTimeout(() => void run(), 5000);
    return () => clearTimeout(timer);
  }, [busy, error, run, status]);

  const authenticationRequired = error === 401 || (!session.isPending && !session.isRefetching && !session.data);
  const messageKey = authenticationRequired ? 'registration.state.authenticate'
    : error === 409 ? 'registration.state.sessionChanged'
      : error ? 'registration.state.unavailable'
        : status ? stateKeys[status.action] : 'registration.state.loading';
  const hasInvitation = Boolean(registrationInvitationFromSession());

  return (
    <main className={styles.page}>
      <section aria-labelledby="registration-title" className={styles.panel}>
        <h1 id="registration-title">{t('registration.title')}</h1>
        <p aria-live="polite" role="status">{t(messageKey)}</p>
        {authenticationRequired ? (
          <a href={`/signin?callbackUrl=${encodeURIComponent(ASKCORE_REGISTRATION_PATH)}`}>{t('registration.action.signIn')}</a>
        ) : (
          <>
            {status?.action === 'choose_intent' && <Button disabled={busy} onClick={() => void run('ordinary')}>{t('registration.action.createIdentity')}</Button>}
            {hasInvitation && (status?.action === 'choose_intent' || status?.action === 'replace_invitation') && <Button disabled={busy} onClick={() => void run('invitation')}>{t('registration.action.useInvitation')}</Button>}
            {status?.action === 'review_identity' && <Button disabled={busy} onClick={() => void run('acknowledge')}>{t('registration.action.acknowledgeIdentity')}</Button>}
            {status?.action === 'retry' && <Button disabled={busy} onClick={() => void run('retry')}>{t('registration.action.retryProvisioning')}</Button>}
            <Button disabled={busy || !binding || crossTabInvalidated} onClick={() => void run()}>{t('registration.action.refresh')}</Button>
          </>
        )}
        <a href="/">{t('registration.action.home')}</a>
      </section>
    </main>
  );
});
RegistrationProvisioningSurface.displayName = 'RegistrationProvisioningSurface';
