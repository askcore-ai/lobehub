'use client';

import { Button, Flexbox } from '@lobehub/ui';
import { createStaticStyles } from 'antd-style';
import { useTranslation } from 'react-i18next';

import type { WechatMobileLoginState } from './useSignIn';

const styles = createStaticStyles(({ css, cssVar }) => ({
  description: css`
    margin: 0;
    color: ${cssVar.colorTextSecondary};
  `,
  root: css`
    padding: 12px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 12px;

    color: ${cssVar.colorText};

    background: ${cssVar.colorBgElevated};
  `,
  title: css`
    font-weight: 600;
  `,
}));

interface WechatMobileLoginStatusProps {
  onCancel: () => void;
  onConfirmAccountSwitch: () => void;
  onOpenWechat: () => void;
  onRetry: () => void;
  state: WechatMobileLoginState;
}

export const WechatMobileLoginStatus = ({
  onCancel,
  onConfirmAccountSwitch,
  onOpenWechat,
  onRetry,
  state,
}: WechatMobileLoginStatusProps) => {
  const { t } = useTranslation('auth');
  if (state.phase === 'idle') return null;

  const preparing = state.phase === 'preparing';
  const prepared = state.phase === 'prepared';
  const switching = state.phase === 'account-switch';
  const failed = state.phase === 'failed';
  let description: string;
  if (state.phase === 'preparing') description = t('betterAuth.wechatMobile.preparing');
  else if (state.phase === 'prepared') description = t('betterAuth.wechatMobile.prepared');
  else if (state.phase === 'waiting') description = t('betterAuth.wechatMobile.returnGuidance');
  else if (state.phase === 'account-switch')
    description = t('betterAuth.wechatMobile.accountSwitch');
  else {
    description = t(`betterAuth.wechatMobile.errors.${state.message}`, {
      defaultValue: t('betterAuth.wechatMobile.failed'),
    });
  }

  return (
    <section
      aria-atomic="true"
      aria-busy={preparing}
      aria-live="polite"
      className={styles.root}
      role={failed ? 'alert' : 'status'}
    >
      <Flexbox gap={12}>
        <div className={styles.title}>{t('betterAuth.wechatMobile.title')}</div>
        <p className={styles.description}>{description}</p>
        {prepared && (
          <Button block type="primary" onClick={onOpenWechat}>
            {t('betterAuth.wechatMobile.openWechat')}
          </Button>
        )}
        {switching && (
          <Button block danger type="primary" onClick={onConfirmAccountSwitch}>
            {t('betterAuth.wechatMobile.confirmSwitch')}
          </Button>
        )}
        {failed && state.retryable && (
          <Button block type="primary" onClick={onRetry}>
            {t('betterAuth.wechatMobile.retry')}
          </Button>
        )}
        <Button block onClick={onCancel}>
          {t('betterAuth.wechatMobile.cancel')}
        </Button>
      </Flexbox>
    </section>
  );
};
