'use client';

import type { ReactNode } from 'react';

import { Button, Drawer, Form, Input, QRCode, Segmented, Select } from 'antd';
import { Copy, Link2, Mail, QrCode } from 'lucide-react';
import { memo } from 'react';

import { message } from '@/components/AntdStaticMethods';

import { styles } from '../styles';
import {
  type AskCoreInviteChannel,
  type AskCoreInviteExpiry,
  type AskCoreInvitePayload,
  type AskCoreOrganizationRole,
} from '../types';

const expiryOptions: { label: string; value: AskCoreInviteExpiry }[] = [
  { label: '30 分钟', value: '30m' },
  { label: '1 天', value: '1d' },
  { label: '7 天', value: '7d' },
  { label: '30 天', value: '30d' },
];

const roleOptions: { label: string; value: AskCoreOrganizationRole }[] = [
  { label: '管理员', value: 'admin' },
  { label: '成员', value: 'member' },
];

interface InviteSlideOverProps {
  channel: AskCoreInviteChannel;
  inviteForm: ReturnType<typeof Form.useForm>[0];
  inviteLoading: boolean;
  inviteResult: AskCoreInvitePayload | null;
  onChannelChange: (c: AskCoreInviteChannel) => void;
  onClose: () => void;
  onInvite: () => Promise<void>;
  open: boolean;
}

export const InviteSlideOver = memo<InviteSlideOverProps>(
  ({
    open,
    onClose,
    channel,
    onChannelChange,
    inviteForm,
    inviteLoading,
    inviteResult,
    onInvite,
  }) => {
    const handleCopy = (text: string) => {
      navigator.clipboard.writeText(text).then(() => message.success('已复制'));
    };

    const channels: { icon: ReactNode; key: AskCoreInviteChannel; label: string }[] = [
      { icon: <Mail size={18} />, key: 'email', label: '邮箱' },
      { icon: <Link2 size={18} />, key: 'link', label: '链接' },
      { icon: <QrCode size={18} />, key: 'qr', label: '二维码' },
    ];
    const currentResult = inviteResult?.channel === channel ? inviteResult : null;

    const renderResult = () => {
      if (!currentResult) return null;

      if (channel === 'email') {
        return (
          <div className={styles.inviteResultBox}>
            <div className={styles.inviteResultTitle}>邀请邮件已发送</div>
            <div className={styles.inviteResultMeta}>{currentResult.email}</div>
          </div>
        );
      }

      if (channel === 'qr') {
        return (
          <div className={`${styles.inviteResultBox} ${styles.inviteQrResult}`}>
            <QRCode size={180} value={currentResult.link} />
            <Button icon={<Copy size={14} />} onClick={() => handleCopy(currentResult.link)}>
              复制链接
            </Button>
          </div>
        );
      }

      return (
        <div className={styles.inviteResultBox}>
          <Input readOnly value={currentResult.link} />
          <Button icon={<Copy size={14} />} onClick={() => handleCopy(currentResult.link)}>
            复制链接
          </Button>
        </div>
      );
    };

    return (
      <Drawer
        closable
        open={open}
        placement="right"
        size="large"
        title="邀请成员"
        onClose={onClose}
      >
        <Segmented
          block
          className={styles.inviteSegmented}
          options={channels.map((c) => ({
            icon: c.icon,
            label: c.label,
            value: c.key,
          }))}
          value={channel}
          onChange={(value) => onChannelChange(value as AskCoreInviteChannel)}
        />

        <Form form={inviteForm} layout="vertical">
          {channel === 'email' && (
            <Form.Item
              label="邮箱地址"
              name="email"
              rules={[{ required: true, message: '请输入邮箱' }]}
            >
              <Input placeholder="请输入收件人邮箱" />
            </Form.Item>
          )}
          <Form.Item
            initialValue="member"
            label="角色"
            name="role"
            rules={[{ required: true }]}
          >
            <Select options={roleOptions} />
          </Form.Item>
          <Form.Item
            initialValue="7d"
            label="有效期"
            name="expiresIn"
            rules={[{ required: true }]}
          >
            <Select options={expiryOptions} />
          </Form.Item>
        </Form>

        <Button
          block
          className={styles.pillButton}
          loading={inviteLoading}
          type="primary"
          onClick={onInvite}
        >
          {channel === 'email' ? '发送邀请' : '生成邀请'}
        </Button>

        {renderResult()}
      </Drawer>
    );
  },
);

InviteSlideOver.displayName = 'InviteSlideOver';
