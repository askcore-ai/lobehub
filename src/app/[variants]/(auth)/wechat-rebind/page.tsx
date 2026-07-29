'use client';

import { Button, Flexbox, Text } from '@lobehub/ui';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import AuthCard from '@/features/AuthCard';
import { listAccounts, useSession } from '@/libs/better-auth/auth-client';

import { classifyWechatClient } from '../signin/useSignIn';

const TAB_STORAGE_PREFIX = 'askcore:wechat-mobile:tab:';

interface RebindAccount {
  id: string;
  providerId: string;
}

interface StartResponse {
  expiresAt: string;
  openTarget: string;
  pollAfterMs: number;
  tabBinding: string;
  transactionId: string;
}

const stableErrorCode = (value: unknown, fallback: string): string =>
  typeof value === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(value) ? value : fallback;

const isRetryableStatus = (status: number | undefined): boolean =>
  status === 429 || status === 502 || status === 503;

const isStartResponse = (value: unknown, channel: 'desktop' | 'mobile'): value is StartResponse => {
  if (!value || typeof value !== 'object') return false;
  const response = value as Partial<StartResponse>;
  const expectedTarget =
    channel === 'mobile' ? 'weixin://dl/business/' : 'https://open.weixin.qq.com/';
  return (
    typeof response.expiresAt === 'string' &&
    !Number.isNaN(Date.parse(response.expiresAt)) &&
    typeof response.openTarget === 'string' &&
    response.openTarget.startsWith(expectedTarget) &&
    typeof response.pollAfterMs === 'number' &&
    response.pollAfterMs >= 500 &&
    response.pollAfterMs <= 10_000 &&
    typeof response.tabBinding === 'string' &&
    /^[\w-]{43}$/.test(response.tabBinding) &&
    typeof response.transactionId === 'string' &&
    /^wxm_[\w-]{16,96}$/.test(response.transactionId)
  );
};

type RebindState =
  | { phase: 'idle' | 'loading' | 'verified' }
  | {
      channel: 'desktop' | 'mobile';
      openTarget?: string;
      phase: 'prepared' | 'waiting';
      pollAfterMs: number;
      transactionId: string;
    }
  | { phase: 'proved'; transactionId: string }
  | {
      code: string;
      phase: 'failed';
      retryTransaction?: {
        channel: 'desktop' | 'mobile';
        pollAfterMs: number;
        transactionId: string;
      };
      retryable: boolean;
    };

const request = async <T,>(
  path: string,
  input: { body?: Record<string, unknown>; method?: 'GET' | 'POST'; transactionId?: string },
): Promise<{ data: null | T; error: null | { code: string; status: number } }> => {
  const headers: Record<string, string> = {};
  if (input.body) headers['Content-Type'] = 'application/json';
  if (input.transactionId) {
    try {
      const tabBinding = sessionStorage.getItem(`${TAB_STORAGE_PREFIX}${input.transactionId}`);
      if (tabBinding) headers['X-AskCore-WeChat-Tab-Binding'] = tabBinding;
    } catch {
      return {
        data: null,
        error: { code: 'WECHAT_TAB_STORAGE_UNAVAILABLE', status: 400 },
      };
    }
  }
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 8000);
  let response: Response;
  let payload: Record<string, unknown>;
  try {
    response = await fetch(path, {
      ...(input.body ? { body: JSON.stringify(input.body) } : {}),
      cache: 'no-store',
      credentials: 'same-origin',
      headers,
      method: input.method || 'POST',
      signal: controller.signal,
    });
    const decoded = await response.json();
    if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) {
      throw new Error('malformed_response');
    }
    payload = decoded as Record<string, unknown>;
  } catch {
    return {
      data: null,
      error: { code: 'WECHAT_NETWORK_OR_RESPONSE_ERROR', status: 503 },
    };
  } finally {
    window.clearTimeout(timeout);
  }
  if (!response.ok) {
    return {
      data: null,
      error: {
        code: stableErrorCode(payload.code || payload.message, 'WECHAT_REBIND_FAILED'),
        status: response.status,
      },
    };
  }
  return { data: payload as T, error: null };
};

const WechatRebindPage = () => {
  const { t } = useTranslation('auth');
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, isPending } = useSession();
  const [accounts, setAccounts] = useState<RebindAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [state, setState] = useState<RebindState>({ phase: 'loading' });

  useEffect(() => {
    if (isPending) return;
    if (!session) {
      router.replace('/signin?callbackUrl=%2Fwechat-rebind');
      return;
    }
    void listAccounts().then((result) => {
      const wechatAccounts = ((result.data || []) as RebindAccount[]).filter(
        (account) => account.providerId === 'wechat',
      );
      setAccounts(wechatAccounts);
      setSelectedAccountId(wechatAccounts.length === 1 ? wechatAccounts[0].id : '');

      const transactionId = searchParams.get('transactionId');
      const callbackError = stableErrorCode(searchParams.get('error'), 'WECHAT_REBIND_FAILED');
      if (searchParams.get('error')) {
        setState({ code: callbackError, phase: 'failed', retryable: true });
      } else if (transactionId) {
        setState({
          channel: 'desktop',
          phase: 'waiting',
          pollAfterMs: 1200,
          transactionId,
        });
      } else {
        setState({ phase: 'idle' });
      }
    });
  }, [isPending, router, searchParams, session]);

  const poll = async (
    transactionId: string,
    retryTransaction: {
      channel: 'desktop' | 'mobile';
      pollAfterMs: number;
      transactionId: string;
    },
  ) => {
    const result = await request<{ state: string }>(
      `/api/auth/wechat-mobile/status?transactionId=${encodeURIComponent(transactionId)}`,
      { method: 'GET', transactionId },
    );
    if (result.data?.state === 'authorized') {
      setState({ phase: 'proved', transactionId });
    } else if (
      result.data?.state === 'failed' ||
      result.data?.state === 'expired' ||
      result.error ||
      !result.data ||
      result.data.state !== 'pending'
    ) {
      setState({
        code:
          result.error?.code ||
          (result.data?.state === 'expired'
            ? 'WECHAT_TRANSACTION_EXPIRED'
            : 'WECHAT_REBIND_FAILED'),
        phase: 'failed',
        retryable: result.data?.state === 'expired' || isRetryableStatus(result.error?.status),
        ...(isRetryableStatus(result.error?.status) ? { retryTransaction } : {}),
      });
    }
  };

  useEffect(() => {
    if (state.phase !== 'waiting') return;
    const { channel, pollAfterMs, transactionId } = state;
    const retryTransaction = { channel, pollAfterMs, transactionId };
    const check = () => void poll(transactionId, retryTransaction);
    check();
    const interval = window.setInterval(check, pollAfterMs);
    const onFocus = () => check();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') check();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [state]);

  const start = async () => {
    const channel = classifyWechatClient({
      maxTouchPoints: navigator.maxTouchPoints,
      userAgent: navigator.userAgent,
      userAgentData: (
        navigator as Navigator & {
          userAgentData?: { mobile?: boolean };
        }
      ).userAgentData,
    });
    setState({ phase: 'loading' });
    const result = await request<StartResponse>('/api/auth/wechat-rebind/start', {
      body: {
        channel,
        ...(selectedAccountId ? { legacyAccountRowId: selectedAccountId } : {}),
      },
    });
    if (!isStartResponse(result.data, channel)) {
      setState({
        code: result.error?.code || 'WECHAT_REBIND_FAILED',
        phase: 'failed',
        retryable: isRetryableStatus(result.error?.status),
      });
      return;
    }
    try {
      sessionStorage.setItem(
        `${TAB_STORAGE_PREFIX}${result.data.transactionId}`,
        result.data.tabBinding,
      );
    } catch {
      setState({
        code: 'WECHAT_TAB_STORAGE_UNAVAILABLE',
        phase: 'failed',
        retryable: false,
      });
      return;
    }
    setState({
      channel,
      openTarget: result.data.openTarget,
      phase: 'prepared',
      pollAfterMs: result.data.pollAfterMs,
      transactionId: result.data.transactionId,
    });
  };

  const openProof = () => {
    if (state.phase !== 'prepared' || !state.openTarget) return;
    const target = state.openTarget;
    setState({
      channel: state.channel,
      phase: 'waiting',
      pollAfterMs: state.pollAfterMs,
      transactionId: state.transactionId,
    });
    window.location.assign(target);
  };

  const retry = async () => {
    if (state.phase === 'failed' && state.retryTransaction) {
      setState({ ...state.retryTransaction, phase: 'waiting' });
      await poll(state.retryTransaction.transactionId, state.retryTransaction);
      return;
    }
    await start();
  };

  const confirm = async () => {
    if (state.phase !== 'proved') return;
    const result = await request<{ state: string }>('/api/auth/wechat-rebind/confirm', {
      body: { transactionId: state.transactionId },
      transactionId: state.transactionId,
    });
    if (result.data?.state === 'verified') {
      try {
        sessionStorage.removeItem(`${TAB_STORAGE_PREFIX}${state.transactionId}`);
      } catch {
        // The server-side claim is already verified; storage cleanup is best effort.
      }
      setState({ phase: 'verified' });
      router.replace('/wechat-rebind');
      return;
    }
    setState({
      code: result.error?.code || 'WECHAT_REBIND_FAILED',
      phase: 'failed',
      retryable: false,
    });
  };

  const hasSelectableAccount = accounts.length === 1 || Boolean(selectedAccountId);
  const subtitle =
    state.phase === 'verified'
      ? t('betterAuth.wechatRebind.verified')
      : state.phase === 'waiting'
        ? t('betterAuth.wechatRebind.returnGuidance')
        : state.phase === 'proved'
          ? t('betterAuth.wechatRebind.confirmExplanation')
          : state.phase === 'failed'
            ? t(`betterAuth.wechatRebind.errors.${state.code}`, {
                defaultValue: t('betterAuth.wechatRebind.failed'),
              })
            : t('betterAuth.wechatRebind.explanation');

  return (
    <AuthCard
      gap={24}
      subtitle={subtitle}
      title={t('betterAuth.wechatRebind.title')}
      width={'min(100%,440px)'}
    >
      {accounts.length > 1 && state.phase === 'idle' && (
        <Flexbox gap={8}>
          <label htmlFor="wechat-rebind-account">
            <Text>{t('betterAuth.wechatRebind.selectAccount')}</Text>
          </label>
          <select
            id="wechat-rebind-account"
            value={selectedAccountId}
            onChange={(event) => setSelectedAccountId(event.target.value)}
          >
            <option value="">{t('betterAuth.wechatRebind.selectPlaceholder')}</option>
            {accounts.map((account, index) => (
              <option key={account.id} value={account.id}>
                {t('betterAuth.wechatRebind.accountLabel', { index: index + 1 })}
              </option>
            ))}
          </select>
        </Flexbox>
      )}
      {accounts.length === 0 && state.phase === 'idle' && (
        <Text type={'secondary'}>{t('betterAuth.wechatRebind.noAccount')}</Text>
      )}
      {state.phase === 'idle' && accounts.length > 0 && (
        <Button block disabled={!hasSelectableAccount} size="large" type="primary" onClick={start}>
          {t('betterAuth.wechatRebind.start')}
        </Button>
      )}
      {state.phase === 'prepared' && (
        <Button block size="large" type="primary" onClick={openProof}>
          {state.channel === 'mobile'
            ? t('betterAuth.wechatRebind.openWechat')
            : t('betterAuth.wechatRebind.openDesktopProof')}
        </Button>
      )}
      {state.phase === 'proved' && (
        <Button block danger size="large" type="primary" onClick={confirm}>
          {t('betterAuth.wechatRebind.confirm')}
        </Button>
      )}
      {state.phase === 'failed' && state.retryable && (
        <Button block size="large" type="primary" onClick={retry}>
          {t('betterAuth.wechatRebind.retry')}
        </Button>
      )}
    </AuthCard>
  );
};

export default WechatRebindPage;
