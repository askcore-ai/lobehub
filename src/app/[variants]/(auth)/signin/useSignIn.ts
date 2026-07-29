import { Form } from 'antd';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { CheckUserResponseData } from '@/app/(backend)/api/auth/check-user/route';
import type { ResolveUsernameResponseData } from '@/app/(backend)/api/auth/resolve-username/route';
import { useBusinessSignin } from '@/business/client/hooks/useBusinessSignin';
import { message } from '@/components/AntdStaticMethods';
import { trackLoginOrSignupClicked } from '@/features/User/UserLoginOrSignup/trackLoginOrSignupClicked';
import { requestPasswordReset, signIn } from '@/libs/better-auth/auth-client';
import { isBuiltinProvider, normalizeProviderId } from '@/libs/better-auth/utils/client';

import { useAuthServerConfigStore } from '../_layout/AuthServerConfigProvider';
import { EMAIL_REGEX, USERNAME_REGEX } from './SignInEmailStep';

const LAST_AUTH_PROVIDER_KEY = 'lobehub:auth:last-provider:v1';
const WECHAT_TAB_STORAGE_PREFIX = 'askcore:wechat-mobile:tab:';

export type WechatClientClass = 'desktop' | 'mobile';

export const classifyWechatClient = (client: {
  maxTouchPoints?: number;
  userAgent?: string;
  userAgentData?: { mobile?: boolean };
}): WechatClientClass => {
  const userAgent = client.userAgent || '';
  const mobileToken = /Android|iPad|iPhone|iPod|Mobile|Windows Phone/i.test(userAgent);
  if (client.userAgentData?.mobile === true || mobileToken) return 'mobile';
  const desktopToken = /Macintosh|Windows NT|X11|CrOS|Linux x86_64/i.test(userAgent);
  if (
    client.userAgentData?.mobile === false &&
    desktopToken &&
    (client.maxTouchPoints || 0) === 0
  ) {
    return 'desktop';
  }
  if (desktopToken && (client.maxTouchPoints || 0) === 0) return 'desktop';
  // Unknown or contradictory clients take the no-QR mobile path.
  return 'mobile';
};

export type WechatMobileLoginState =
  | { phase: 'idle' }
  | {
      expiresAt: string;
      phase: 'prepared';
      transactionId: string;
    }
  | {
      expiresAt: string;
      phase: 'waiting';
      transactionId: string;
    }
  | {
      phase: 'account-switch';
      transactionId: string;
    }
  | {
      message: string;
      phase: 'failed';
      retry?:
        | {
            confirmAccountSwitch: boolean;
            kind: 'consume';
            transactionId: string;
          }
        | {
            expiresAt: string;
            kind: 'poll';
            transactionId: string;
          };
      retryable: boolean;
    };

interface WechatMobileStartResponse {
  expiresAt: string;
  openTarget: string;
  pollAfterMs: number;
  tabBinding: string;
  transactionId: string;
}

const isWechatMobileStartResponse = (value: unknown): value is WechatMobileStartResponse => {
  if (!value || typeof value !== 'object') return false;
  const response = value as Partial<WechatMobileStartResponse>;
  return (
    typeof response.expiresAt === 'string' &&
    !Number.isNaN(Date.parse(response.expiresAt)) &&
    typeof response.openTarget === 'string' &&
    response.openTarget.startsWith('weixin://dl/business/') &&
    typeof response.pollAfterMs === 'number' &&
    response.pollAfterMs >= 500 &&
    response.pollAfterMs <= 10_000 &&
    typeof response.tabBinding === 'string' &&
    /^[\w-]{43}$/.test(response.tabBinding) &&
    typeof response.transactionId === 'string' &&
    /^wxm_[\w-]{16,96}$/.test(response.transactionId)
  );
};

const stableErrorCode = (value: unknown, fallback: string): string =>
  typeof value === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(value) ? value : fallback;

const isRetryableWechatStatus = (status: number | undefined): boolean =>
  status === 429 || status === 502 || status === 503;

type Step = 'email' | 'password';

interface SignInFormValues {
  email: string;
  password: string;
}

interface ResolvedEmailResult {
  email: string;
  identifierType: 'email' | 'username';
}

export const useSignIn = () => {
  const { t } = useTranslation('auth');
  const router = useRouter();
  const searchParams = useSearchParams();
  const enableMagicLink = useAuthServerConfigStore((s) => s.serverConfig.enableMagicLink || false);
  const disableEmailPassword = useAuthServerConfigStore(
    (s) => s.serverConfig.disableEmailPassword || false,
  );
  const enableBusinessFeatures = useAuthServerConfigStore(
    (s) => s.serverConfig.enableBusinessFeatures || false,
  );
  const enableWechatMobileLogin = useAuthServerConfigStore(
    (s) => s.serverConfig.enableWechatMobileLogin || false,
  );
  const [form] = Form.useForm<SignInFormValues>();
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [isSocialOnly, setIsSocialOnly] = useState(false);
  const [wechatMobileLogin, setWechatMobileLogin] = useState<WechatMobileLoginState>({
    phase: 'idle',
  });
  const [wechatOpenTarget, setWechatOpenTarget] = useState<null | string>(null);
  const [wechatPollAfterMs, setWechatPollAfterMs] = useState(1200);
  const [lastAuthProvider] = useState(() => {
    try {
      return localStorage.getItem(LAST_AUTH_PROVIDER_KEY);
    } catch {
      return null;
    }
  });
  const serverConfigInit = useAuthServerConfigStore((s) => s.serverConfigInit);
  const oAuthSSOProviders = useAuthServerConfigStore((s) => s.serverConfig.oAuthSSOProviders) || [];
  const { getAdditionalData, preSocialSigninCheck, ssoProviders } = useBusinessSignin();

  useEffect(() => {
    const emailParam = searchParams.get('email');
    if (emailParam) form.setFieldValue('email', emailParam);
  }, [searchParams, form]);

  const clearWechatTransaction = (transactionId?: string) => {
    if (transactionId) {
      try {
        sessionStorage.removeItem(`${WECHAT_TAB_STORAGE_PREFIX}${transactionId}`);
      } catch {
        // sessionStorage is an optional tab-bound hardening layer; failure ends the transaction.
      }
    }
    setWechatOpenTarget(null);
  };

  const wechatRequest = async <T>(
    path: string,
    input: { body?: Record<string, unknown>; method?: 'GET' | 'POST'; transactionId?: string },
  ): Promise<{ data: null | T; error: null | { code: string; status: number } }> => {
    const headers: Record<string, string> = {};
    if (input.body) headers['Content-Type'] = 'application/json';
    if (input.transactionId) {
      let tabBinding: null | string = null;
      try {
        tabBinding = sessionStorage.getItem(`${WECHAT_TAB_STORAGE_PREFIX}${input.transactionId}`);
      } catch {
        // Treat unavailable storage as a missing proof.
      }
      if (tabBinding) headers['X-AskCore-WeChat-Tab-Binding'] = tabBinding;
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
          code: stableErrorCode(payload.code || payload.message, 'WECHAT_MOBILE_LOGIN_FAILED'),
          status: response.status,
        },
      };
    }
    return { data: payload as T, error: null };
  };

  const consumeWechatTransaction = async (transactionId: string, confirmAccountSwitch: boolean) => {
    const result = await wechatRequest<{ redirectTo: string }>('/api/auth/wechat-mobile/consume', {
      body: { confirmAccountSwitch, transactionId },
      transactionId,
    });
    if (result.data) {
      clearWechatTransaction(transactionId);
      setWechatMobileLogin({ phase: 'idle' });
      router.push(result.data.redirectTo);
      return;
    }
    if (result.error?.code === 'ACCOUNT_SWITCH_CONFIRMATION_REQUIRED') {
      setWechatMobileLogin({ phase: 'account-switch', transactionId });
      return;
    }
    const retryable = isRetryableWechatStatus(result.error?.status);
    setWechatMobileLogin({
      message: result.error?.code || 'WECHAT_MOBILE_LOGIN_FAILED',
      phase: 'failed',
      ...(retryable
        ? {
            retry: {
              confirmAccountSwitch,
              kind: 'consume' as const,
              transactionId,
            },
          }
        : {}),
      retryable,
    });
  };

  const pollWechatTransaction = async (transactionId: string, expiresAt: string) => {
    const result = await wechatRequest<{ state: string }>(
      `/api/auth/wechat-mobile/status?transactionId=${encodeURIComponent(transactionId)}`,
      { method: 'GET', transactionId },
    );
    if (result.data?.state === 'authorized' || result.data?.state === 'consumed') {
      await consumeWechatTransaction(transactionId, false);
      return;
    }
    if (result.data?.state === 'failed' || result.data?.state === 'expired') {
      clearWechatTransaction(transactionId);
      setWechatMobileLogin({
        message: `WECHAT_TRANSACTION_${result.data.state.toUpperCase()}`,
        phase: 'failed',
        retryable: result.data.state === 'expired',
      });
      return;
    }
    if (result.error?.status === 410 || result.error?.status === 401) {
      clearWechatTransaction(transactionId);
      setWechatMobileLogin({
        message: result.error.code,
        phase: 'failed',
        retryable: result.error.status === 410,
      });
      return;
    }
    if (result.error || !result.data || result.data.state !== 'pending') {
      const retryable = isRetryableWechatStatus(result.error?.status);
      setWechatMobileLogin({
        message: result.error?.code || 'WECHAT_MALFORMED_RESPONSE',
        phase: 'failed',
        ...(retryable ? { retry: { expiresAt, kind: 'poll' as const, transactionId } } : {}),
        retryable,
      });
    }
  };

  useEffect(() => {
    if (wechatMobileLogin.phase !== 'waiting') return;
    const transactionId = wechatMobileLogin.transactionId;
    const expiresAt = wechatMobileLogin.expiresAt;
    const poll = () => void pollWechatTransaction(transactionId, expiresAt);
    const interval = window.setInterval(poll, wechatPollAfterMs);
    const onFocus = () => poll();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') poll();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [wechatMobileLogin, wechatPollAfterMs]);

  const prepareWechatMobileLogin = async () => {
    const callbackURL = searchParams.get('callbackUrl') || '/';
    const result = await wechatRequest<WechatMobileStartResponse>('/api/auth/wechat-mobile/start', {
      body: { callbackURL },
    });
    if (!isWechatMobileStartResponse(result.data)) {
      setWechatMobileLogin({
        message: result.error?.code || 'WECHAT_MALFORMED_RESPONSE',
        phase: 'failed',
        retryable: isRetryableWechatStatus(result.error?.status),
      });
      return;
    }
    try {
      sessionStorage.setItem(
        `${WECHAT_TAB_STORAGE_PREFIX}${result.data.transactionId}`,
        result.data.tabBinding,
      );
    } catch {
      setWechatMobileLogin({
        message: 'WECHAT_TAB_STORAGE_UNAVAILABLE',
        phase: 'failed',
        retryable: false,
      });
      return;
    }
    // openTarget contains the completion capability and must remain transient page memory only.
    setWechatOpenTarget(result.data.openTarget);
    setWechatPollAfterMs(result.data.pollAfterMs);
    setWechatMobileLogin({
      expiresAt: result.data.expiresAt,
      phase: 'prepared',
      transactionId: result.data.transactionId,
    });
  };

  const retryWechatMobileLogin = async () => {
    if (wechatMobileLogin.phase === 'failed' && wechatMobileLogin.retry?.kind === 'consume') {
      await consumeWechatTransaction(
        wechatMobileLogin.retry.transactionId,
        wechatMobileLogin.retry.confirmAccountSwitch,
      );
      return;
    }
    if (wechatMobileLogin.phase === 'failed' && wechatMobileLogin.retry?.kind === 'poll') {
      setWechatMobileLogin({
        expiresAt: wechatMobileLogin.retry.expiresAt,
        phase: 'waiting',
        transactionId: wechatMobileLogin.retry.transactionId,
      });
      await pollWechatTransaction(
        wechatMobileLogin.retry.transactionId,
        wechatMobileLogin.retry.expiresAt,
      );
      return;
    }
    await prepareWechatMobileLogin();
  };

  const openPreparedWechat = () => {
    if (wechatMobileLogin.phase !== 'prepared' || !wechatOpenTarget) return;
    const target = wechatOpenTarget;
    setWechatOpenTarget(null);
    setWechatMobileLogin({ ...wechatMobileLogin, phase: 'waiting' });
    // This assignment executes synchronously inside the explicit second button click.
    window.location.assign(target);
  };

  const cancelWechatMobile = async () => {
    if (
      wechatMobileLogin.phase !== 'prepared' &&
      wechatMobileLogin.phase !== 'waiting' &&
      wechatMobileLogin.phase !== 'account-switch'
    ) {
      setWechatMobileLogin({ phase: 'idle' });
      return;
    }
    const id = wechatMobileLogin.transactionId;
    await wechatRequest('/api/auth/wechat-mobile/cancel', {
      body: { transactionId: id },
      transactionId: id,
    });
    clearWechatTransaction(id);
    setWechatMobileLogin({ phase: 'idle' });
  };

  const confirmWechatAccountSwitch = async () => {
    if (wechatMobileLogin.phase !== 'account-switch') return;
    await consumeWechatTransaction(wechatMobileLogin.transactionId, true);
  };

  const handleSendMagicLink = async (targetEmail?: string) => {
    try {
      const emailValue =
        targetEmail ||
        (await form
          .validateFields(['email'])
          .then((v) => v.email as string)
          .catch(() => null));
      if (!emailValue) return;

      const callbackUrl = searchParams.get('callbackUrl') || '/';
      const { error } = await signIn.magicLink({ callbackURL: callbackUrl, email: emailValue });
      if (error) {
        message.error(error.message || t('betterAuth.signin.magicLinkError'));
        return;
      }
      message.success(t('betterAuth.signin.magicLinkSent'));
    } catch (error) {
      if (!(error as any)?.errorFields) {
        console.error('Magic link error:', error);
        message.error(t('betterAuth.signin.magicLinkError'));
      }
    }
  };

  const resolveEmailFromIdentifier = async (
    identifier: string,
  ): Promise<ResolvedEmailResult | null> => {
    const trimmedIdentifier = identifier.trim();
    if (!trimmedIdentifier) return null;

    const isEmailIdentifier = EMAIL_REGEX.test(trimmedIdentifier);
    if (isEmailIdentifier)
      return { email: trimmedIdentifier.toLowerCase(), identifierType: 'email' };

    if (!USERNAME_REGEX.test(trimmedIdentifier)) {
      message.error(t('betterAuth.errors.emailInvalid'));
      return null;
    }

    try {
      const response = await fetch('/api/auth/resolve-username', {
        body: JSON.stringify({ username: trimmedIdentifier }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });
      const data: ResolveUsernameResponseData = await response.json();
      if (!response.ok || !data.exists || !data.email) {
        message.error(t('betterAuth.errors.usernameNotRegistered'));
        return null;
      }
      return { email: data.email, identifierType: 'username' };
    } catch (error) {
      console.error('Error resolving username:', error);
      message.error(t('betterAuth.signin.error'));
      return null;
    }
  };

  const handleCheckUser = async (values: Pick<SignInFormValues, 'email'>) => {
    setLoading(true);
    await trackLoginOrSignupClicked({ spm: 'signin.email_step.submit' });

    try {
      const resolvedEmail = await resolveEmailFromIdentifier(values.email);
      if (!resolvedEmail) return;

      const { email: targetEmail, identifierType } = resolvedEmail;
      const response = await fetch('/api/auth/check-user', {
        body: JSON.stringify({ email: targetEmail }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });
      const data: CheckUserResponseData = await response.json();

      if (!data.exists) {
        if (identifierType === 'username') {
          message.error(t('betterAuth.errors.usernameNotRegistered'));
          return;
        }
        const callbackUrl = searchParams.get('callbackUrl') || '/';
        router.push(
          `/signup?email=${encodeURIComponent(targetEmail)}&callbackUrl=${encodeURIComponent(callbackUrl)}`,
        );
        return;
      }

      setEmail(targetEmail);
      if (data.hasPassword) {
        setStep('password');
        return;
      }

      if (enableMagicLink) {
        await handleSendMagicLink(targetEmail);
        return;
      }

      // User has no password and magic link is disabled, they can only sign in via social
      setIsSocialOnly(true);
    } catch (error) {
      console.error('Error checking user:', error);
      message.error(t('betterAuth.signin.error'));
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = async (values: Pick<SignInFormValues, 'password'>) => {
    setLoading(true);
    await trackLoginOrSignupClicked({ spm: 'signin.password_step.submit' });

    try {
      const callbackUrl = searchParams.get('callbackUrl') || '/';
      const result = await signIn.email(
        { callbackURL: callbackUrl, email, password: values.password },
        {
          onError: (ctx) => {
            console.error('Sign in error:', ctx.error);
            if (ctx.error.status === 403) {
              router.push(
                `/verify-email?email=${encodeURIComponent(email)}&callbackUrl=${encodeURIComponent(callbackUrl)}`,
              );
            }
          },
          onSuccess: () => router.push(callbackUrl),
        },
      );

      if (result.error && result.error.status !== 403) {
        message.error(result.error.message || t('betterAuth.signin.error'));
      }
    } catch (error) {
      console.error('Sign in error:', error);
      message.error(t('betterAuth.signin.error'));
    } finally {
      setLoading(false);
    }
  };

  const handleSocialSignIn = async (provider: string) => {
    setSocialLoading(provider);
    const normalizedProvider = normalizeProviderId(provider);
    await trackLoginOrSignupClicked({
      provider: normalizedProvider,
      spm: 'signin.social.click',
    });

    try {
      if (enableBusinessFeatures && !(await preSocialSigninCheck())) {
        setSocialLoading(null);
        return;
      }

      try {
        localStorage.setItem(LAST_AUTH_PROVIDER_KEY, provider);
      } catch {
        // Ignore localStorage errors (e.g., quota exceeded, private mode)
      }

      const callbackUrl = searchParams.get('callbackUrl') || '/';
      if (
        normalizedProvider === 'wechat' &&
        enableWechatMobileLogin &&
        classifyWechatClient({
          maxTouchPoints: navigator.maxTouchPoints,
          userAgent: navigator.userAgent,
          userAgentData: (
            navigator as Navigator & {
              userAgentData?: { mobile?: boolean };
            }
          ).userAgentData,
        }) === 'mobile'
      ) {
        await prepareWechatMobileLogin();
        return;
      }
      const additionalData = await getAdditionalData();
      const signInWithAdditionalData = async () =>
        isBuiltinProvider(normalizedProvider)
          ? await signIn.social({
              additionalData,
              callbackURL: callbackUrl,
              provider: normalizedProvider,
            })
          : await signIn.oauth2({
              additionalData,
              callbackURL: callbackUrl,
              providerId: normalizedProvider,
            });

      const result = await signInWithAdditionalData();

      if (result && 'error' in result && result.error) throw result.error;
    } catch (error) {
      console.error(`${normalizedProvider} sign in error:`, error);
      message.error(t('betterAuth.signin.socialError'));
    } finally {
      setSocialLoading(null);
    }
  };

  const handleBackToEmail = () => {
    setStep('email');
    setEmail('');
    setIsSocialOnly(false);
  };

  const handleGoToSignup = () => {
    const currentEmail = form.getFieldValue('email');
    const callbackUrl = searchParams.get('callbackUrl') || '/';
    const params = new URLSearchParams();
    if (currentEmail) params.set('email', currentEmail);
    params.set('callbackUrl', callbackUrl);
    void trackLoginOrSignupClicked({ spm: 'signin.go_to_signup.click' }).finally(() => {
      router.push(`/signup?${params.toString()}`);
    });
  };

  const handleForgotPassword = async () => {
    try {
      await requestPasswordReset({
        email,
        redirectTo: `/reset-password?email=${encodeURIComponent(email)}`,
      });
      message.success(t('betterAuth.signin.forgotPasswordSent'));
    } catch {
      message.error(t('betterAuth.signin.forgotPasswordError'));
    }
  };

  const resolvedProviders = enableBusinessFeatures ? ssoProviders : oAuthSSOProviders;
  const sortedProviders = lastAuthProvider
    ? [...resolvedProviders].sort((a, b) => {
        if (a === lastAuthProvider) return -1;
        if (b === lastAuthProvider) return 1;
        return 0;
      })
    : resolvedProviders;

  return {
    disableEmailPassword,
    email,
    form,
    handleBackToEmail,
    handleCheckUser,
    handleForgotPassword,
    handleGoToSignup,
    handleSignIn,
    handleSocialSignIn,
    cancelWechatMobile,
    confirmWechatAccountSwitch,
    isSocialOnly,
    lastAuthProvider,
    loading,
    oAuthSSOProviders: sortedProviders,
    serverConfigInit: enableBusinessFeatures ? true : serverConfigInit,
    socialLoading,
    step,
    openPreparedWechat,
    prepareWechatMobileLogin,
    retryWechatMobileLogin,
    wechatMobileLogin,
  };
};
