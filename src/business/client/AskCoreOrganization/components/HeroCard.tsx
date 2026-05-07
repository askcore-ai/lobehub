'use client';

import { Avatar, Button, Form, Input, Space } from 'antd';
import { cssVar } from 'antd-style';
import { Check, Pencil, Save, UsersRound } from 'lucide-react';
import { memo, useState } from 'react';

import { styles } from '../styles';
import { type AskCoreOrganizationPayload } from '../types';

interface HeroCardProps {
  canUpdateMeta: boolean;
  metaForm: ReturnType<typeof Form.useForm>[0];
  onSaveMeta: () => Promise<void>;
  payload: AskCoreOrganizationPayload | null;
  savingMeta: boolean;
}

export const HeroCard = memo<HeroCardProps>(
  ({ payload, canUpdateMeta, savingMeta, metaForm, onSaveMeta }) => {
    const [editing, setEditing] = useState(false);
    const [savedPulse, setSavedPulse] = useState(false);
    const current = payload?.current;

    const handleSave = async () => {
      await onSaveMeta();
      setEditing(false);
      setSavedPulse(true);
      setTimeout(() => setSavedPulse(false), 1500);
    };

    const handleCancel = () => {
      setEditing(false);
      if (current) {
        metaForm.setFieldsValue({
          name: current.name,
          description: current.description,
          contact: current.contact,
        });
      }
    };

    return (
      <div className={styles.heroCard}>
        <div className={styles.heroAvatarWrap}>
          <Avatar className={styles.heroAvatar} size={80} src={current?.logo}>
            {current?.name?.slice(0, 1) || '?'}
          </Avatar>
        </div>

        <div className={styles.heroName}>{current?.name || '未命名组织'}</div>
        <div className={styles.heroDesc}>{current?.description || '暂无描述'}</div>

        <div className={styles.heroStats}>
          <span
            style={{
              background: current?.role === 'owner' ? '#fef3c7' : current?.role === 'admin' ? '#dbeafe' : '#f3f4f6',
              borderRadius: 6,
              color: current?.role === 'owner' ? '#92400e' : current?.role === 'admin' ? '#1e40af' : '#4b5563',
              fontSize: 12,
              fontWeight: 500,
              padding: '2px 10px',
            }}
          >
            {current?.role === 'owner' ? '所有者' : current?.role === 'admin' ? '管理员' : '成员'}
          </span>
          <span style={{ color: cssVar.colorTextSecondary, fontSize: 13 }}>
            <UsersRound size={13} style={{ marginRight: 4, verticalAlign: -2 }} />
            {payload?.members.length || 0} 成员
          </span>
        </div>

        {canUpdateMeta && !editing && (
          <Space style={{ marginTop: 16 }}>
            <Button
              className={styles.pillButton}
              icon={<Pencil size={14} />}
              onClick={() => setEditing(true)}
            >
              编辑资料
            </Button>
          </Space>
        )}

        {editing && (
          <div className={styles.heroEditForm}>
            <Form form={metaForm} layout="vertical">
              <Form.Item label="组织名称" name="name" rules={[{ required: true, message: '请输入名称' }]}>
                <Input maxLength={80} />
              </Form.Item>
              <Form.Item label="组织简介" name="description">
                <Input.TextArea autoSize={{ maxRows: 3, minRows: 2 }} maxLength={500} />
              </Form.Item>
              <Form.Item label="联系人" name="contact">
                <Input maxLength={120} />
              </Form.Item>
            </Form>
            <div className={styles.heroEditActions}>
              <Button className={styles.pillButton} onClick={handleCancel}>
                取消
              </Button>
              <Button
                className={styles.pillButton}
                icon={savedPulse ? <Check size={14} /> : <Save size={14} />}
                loading={savingMeta}
                type="primary"
                onClick={handleSave}
              >
                {savedPulse ? '已保存' : '保存'}
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  },
);

HeroCard.displayName = 'HeroCard';
