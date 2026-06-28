'use client';

import { Avatar, Button, Form, type FormInstance, Input } from 'antd';
import { cssVar } from 'antd-style';
import { Check, Copy, Pencil, Save, UsersRound } from 'lucide-react';
import { memo } from 'react';

import { styles } from '../styles';
import { type AskCoreOrganizationPayload } from '../types';

interface HeroStat {
  label: string;
  value: number;
}

interface HeroCardProps {
  canUpdateMeta: boolean;
  editing: boolean;
  metaForm: FormInstance;
  onCancel: () => void;
  onCopyId: (id: string) => void;
  onEdit: () => void;
  onSave: () => void;
  payload: AskCoreOrganizationPayload | null;
  savedPulse: boolean;
  saving: boolean;
  stats: HeroStat[];
}

export const HeroCard = memo<HeroCardProps>(
  ({
    payload,
    canUpdateMeta,
    editing,
    metaForm,
    onCancel,
    onCopyId,
    onEdit,
    onSave,
    savedPulse,
    saving,
    stats,
  }) => {
    const current = payload?.current;

    const roleBg =
      current?.role === 'owner' ? '#fef3c7' : current?.role === 'admin' ? '#dbeafe' : '#f3f4f6';
    const roleColor =
      current?.role === 'owner' ? '#92400e' : current?.role === 'admin' ? '#1e40af' : '#4b5563';

    return (
      <div className={styles.heroCard}>
        <div className={styles.heroSummary}>
          <div className={styles.heroAvatarWrap}>
            <Avatar className={styles.heroAvatar} size={56} src={current?.logo}>
              {current?.name?.slice(0, 1) || '?'}
            </Avatar>
          </div>

          <div className={styles.heroBody}>
            <div className={styles.heroName}>{current?.name || '未命名组织'}</div>
            <div className={styles.heroDesc}>{current?.description || '暂无描述'}</div>

            <div className={styles.heroStats}>
              <span
                style={{
                  background: roleBg,
                  borderRadius: 6,
                  color: roleColor,
                  fontSize: 11,
                  fontWeight: 500,
                  padding: '1px 8px',
                }}
              >
                {current?.role === 'owner'
                  ? '所有者'
                  : current?.role === 'admin'
                    ? '管理员'
                    : '成员'}
              </span>
              <span style={{ color: cssVar.colorTextSecondary, fontSize: 12 }}>
                <UsersRound size={12} style={{ marginRight: 3, verticalAlign: -2 }} />
                {payload?.members.length || 0} 注册成员
              </span>
            </div>
          </div>

          {canUpdateMeta && !editing && (
            <Button
              className={styles.pillButton}
              icon={<Pencil size={12} />}
              size="small"
              style={{ fontSize: 12, padding: '0 10px', height: 28 }}
              type="text"
              onClick={onEdit}
            >
              编辑资料
            </Button>
          )}
        </div>

        <div className={styles.heroOverviewStats}>
          {stats.map((item) => (
            <div className={styles.heroOverviewStat} key={item.label}>
              <strong>{item.value}</strong>
              <span>{item.label}</span>
            </div>
          ))}
        </div>

        {editing ? (
          <div className={styles.heroEditForm}>
            <Form form={metaForm} layout="vertical">
              <Form.Item
                label="组织名称"
                name="name"
                rules={[{ required: true, message: '请输入名称' }]}
              >
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
              <Button className={styles.pillButton} onClick={onCancel}>
                取消
              </Button>
              <Button
                className={styles.pillButton}
                icon={savedPulse ? <Check size={14} /> : <Save size={14} />}
                loading={saving}
                type="primary"
                onClick={onSave}
              >
                {savedPulse ? '已保存' : '保存'}
              </Button>
            </div>
          </div>
        ) : (
          <div className={styles.heroInfoGrid}>
            <span>组织名称</span>
            <strong>{current?.name || '--'}</strong>
            <span>组织简介</span>
            <strong>{current?.description || '--'}</strong>
            <span>联系人</span>
            <strong>{current?.contact || '--'}</strong>
            <span>组织 ID</span>
            <strong className={styles.heroOrgId}>
              {current?.id || '--'}
              {current?.id && (
                <Button
                  className={styles.copyBtn}
                  icon={<Copy size={13} />}
                  size="small"
                  type="text"
                  onClick={() => onCopyId(current.id)}
                />
              )}
            </strong>
          </div>
        )}
      </div>
    );
  },
);

HeroCard.displayName = 'HeroCard';
