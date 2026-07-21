'use client';

import { CURRENT_ONBOARDING_VERSION } from '@lobechat/const';
import { Button } from '@lobehub/ui';
import { Alert, Result, Skeleton, Space } from 'antd';
import { createStaticStyles, cssVar } from 'antd-style';
import { Home, LogIn, RefreshCw } from 'lucide-react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { userService } from '@/services/user';
import { useUserStore } from '@/store/user';
import { onboardingSelectors } from '@/store/user/selectors';

import { acceptProtocolIdentityLinkInvitation, AskCoreWorkbenchApiError } from './api';
import { ASKCORE_IDENTITY_LINK_TOKEN_STORAGE_KEY } from './config';

const styles = createStaticStyles(({ css }) => ({
  page: css`
    display: grid;
    place-items: center;

    min-height: min(680px, calc(100vh - 72px));
    padding: 24px;

    color: ${cssVar.colorText};

    background: ${cssVar.colorBgLayout};
  `,
  result: css`
    width: min(560px, 100%);
  `,
}));

const invitationTokenFromSession = () => {
  try {
    return window.sessionStorage.getItem(ASKCORE_IDENTITY_LINK_TOKEN_STORAGE_KEY)?.trim() || '';
  } catch {
    return '';
  }
};

const preserveInvitationToken = (token: string) => {
  try {
    window.sessionStorage.setItem(ASKCORE_IDENTITY_LINK_TOKEN_STORAGE_KEY, token);
  } catch {
    // The in-memory prop remains available when browser storage is disabled.
  }
};

const discardInvitationToken = () => {
  try {
    window.sessionStorage.removeItem(ASKCORE_IDENTITY_LINK_TOKEN_STORAGE_KEY);
  } catch {
    // Nothing else needs cleanup when browser storage is disabled.
  }
};

const clearTokenFromAddressBar = () => {
  const url = new URL(window.location.href);
  if (!url.searchParams.has('token')) return;
  url.searchParams.delete('token');
  const query = url.searchParams.toString();
  window.history.replaceState(
    window.history.state,
    '',
    `${url.pathname}${query ? `?${query}` : ''}${url.hash}`,
  );
};

type IdentityLinkState = 'error' | 'loading' | 'success';

const identityLinkErrorMessage = (reason: unknown) => {
  if (!(reason instanceof AskCoreWorkbenchApiError)) return '学校身份关联失败，请稍后重试';
  if (reason.status === 401) return '请先登录当前 AskCore 账号，再继续关联学校身份';
  if (
    reason.status === 400 ||
    reason.status === 404 ||
    reason.status === 410 ||
    /invitation token|invitation.*(?:invalid|expired|used)/i.test(reason.message)
  ) {
    return '邀请链接无效、已过期或已被使用，请联系学校管理员重新发送';
  }
  if (reason.status === 409) return '该学校身份已关联到其他账号，请联系学校管理员处理';
  if (reason.status >= 500) return '学校身份服务暂时不可用，请稍后重试';
  return '学校身份关联失败，请稍后重试';
};

export const ProtocolIdentityLinkSurface = memo(
  ({ invitationToken }: { invitationToken?: string }) => {
    const navigate = useNavigate();
    const { t } = useTranslation('error');
    const currentOnboardingStep = useUserStore(onboardingSelectors.currentStep);
    const needsOnboarding = useUserStore(onboardingSelectors.needsOnboarding);
    const refreshUserState = useUserStore((state) => state.refreshUserState);
    const started = useRef(false);
    const [state, setState] = useState<IdentityLinkState>('loading');
    const [error, setError] = useState('');
    const [authenticationRequired, setAuthenticationRequired] = useState(false);

    const accept = useCallback(async () => {
      const token = invitationToken?.trim() || invitationTokenFromSession();
      if (!token) {
        setError('邀请令牌缺失或已被使用');
        setState('error');
        return;
      }

      preserveInvitationToken(token);
      clearTokenFromAddressBar();
      setAuthenticationRequired(false);
      setError('');
      setState('loading');
      let acceptance: Awaited<ReturnType<typeof acceptProtocolIdentityLinkInvitation>>;
      try {
        acceptance = await acceptProtocolIdentityLinkInvitation(token);
      } catch (reason) {
        setAuthenticationRequired(
          reason instanceof AskCoreWorkbenchApiError && reason.status === 401,
        );
        setError(identityLinkErrorMessage(reason));
        setState('error');
        return;
      }

      discardInvitationToken();
      setState('success');
      try {
        if (needsOnboarding) {
          await userService.updateOnboarding({
            currentStep: currentOnboardingStep,
            finishedAt: new Date().toISOString(),
            version: CURRENT_ONBOARDING_VERSION,
          });
        }
        await refreshUserState();
        navigate(acceptance.replayed ? '/' : '/school', { replace: true });
      } catch {
        // The identity link is already committed. Keep the success state and let the user leave safely.
      }
    }, [currentOnboardingStep, invitationToken, navigate, needsOnboarding, refreshUserState]);

    useEffect(() => {
      if (started.current) return;
      started.current = true;
      void accept();
    }, [accept]);

    return (
      <main className={styles.page}>
        {state === 'loading' ? (
          <Result
            className={styles.result}
            icon={<Skeleton.Avatar active size={56} />}
            title="正在关联学校身份"
          />
        ) : state === 'success' ? (
          <Result
            className={styles.result}
            status="success"
            subTitle="当前 AskCore 账号已完成关联"
            title="学校身份已关联"
            extra={
              <Button icon={<Home size={16} />} onClick={() => navigate('/')}>
                {t('error.backHome')}
              </Button>
            }
          />
        ) : (
          <Result
            className={styles.result}
            status="warning"
            subTitle={<Alert showIcon title={error} type="warning" />}
            title="身份关联失败"
            extra={
              <Space wrap>
                {authenticationRequired ? (
                  <Button
                    icon={<LogIn size={16} />}
                    type="primary"
                    href={`/signin?callbackUrl=${encodeURIComponent(
                      '/askcore/workbench?protocol=identity-link',
                    )}`}
                  >
                    登录
                  </Button>
                ) : (
                  <Button icon={<RefreshCw size={16} />} onClick={() => void accept()}>
                    重试
                  </Button>
                )}
                <Button icon={<Home size={16} />} onClick={() => navigate('/')}>
                  {t('error.backHome')}
                </Button>
              </Space>
            }
          />
        )}
      </main>
    );
  },
);

ProtocolIdentityLinkSurface.displayName = 'ProtocolIdentityLinkSurface';
