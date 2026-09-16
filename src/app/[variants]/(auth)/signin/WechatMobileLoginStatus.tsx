'use client';

import { Modal } from '@lobehub/ui/base-ui';
import { Button, Space, Typography } from 'antd';
import { useTranslation } from 'react-i18next';

import type { WechatMobileLoginState } from './useSignIn';

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

  const prepared = state.phase === 'prepared';
  const waiting = state.phase === 'waiting';
  const switching = state.phase === 'account-switch';
  const failed = state.phase === 'failed';
  let description: string;
  if (state.phase === 'prepared') description = t('betterAuth.wechatMobile.prepared');
  else if (state.phase === 'waiting') description = t('betterAuth.wechatMobile.returnGuidance');
  else if (state.phase === 'account-switch')
    description = t('betterAuth.wechatMobile.accountSwitch');
  else {
    description = t(`betterAuth.wechatMobile.errors.${state.message}`, {
      defaultValue: t('betterAuth.wechatMobile.failed'),
    });
  }

  return (
    <Modal
      centered
      open
      closable={!waiting}
      footer={null}
      title={t('betterAuth.wechatMobile.title')}
      onCancel={onCancel}
    >
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Typography.Paragraph>{description}</Typography.Paragraph>
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
      </Space>
    </Modal>
  );
};
