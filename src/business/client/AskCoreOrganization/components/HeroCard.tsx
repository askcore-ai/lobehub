'use client';

import { Button, Form, type FormInstance, Input, Space } from 'antd';
import { cssVar } from 'antd-style';
import { Check, Copy, Pencil, Save, Trash2, UserCog, UsersRound } from 'lucide-react';
import { memo } from 'react';

import { styles } from '../styles';
import { type AskCoreOrganizationPayload } from '../types';

interface HeroCardProps {
  canUpdateMeta: boolean;
  editing: boolean;
  metaForm: FormInstance;
  onCancel: () => void;
  onCopyId: (id: string) => void;
  onDeleteOrganization?: () => void;
  onEdit: () => void;
  onSave: () => void;
  onTransferOwnership?: () => void;
  payload: AskCoreOrganizationPayload | null;
  savedPulse: boolean;
  saving: boolean;
  showOwnerActions?: boolean;
}

export const HeroCard = memo<HeroCardProps>(
  ({
    payload,
    canUpdateMeta,
    editing,
    metaForm,
    onCancel,
    onCopyId,
    onDeleteOrganization,
    onEdit,
    onSave,
    onTransferOwnership,
    savedPulse,
    saving,
    showOwnerActions,
  }) => {
    const current = payload?.current;

    const roleBg =
      current?.role === 'owner' ? '#fef3c7' : current?.role === 'admin' ? '#dbeafe' : '#f3f4f6';
    const roleColor =
      current?.role === 'owner' ? '#92400e' : current?.role === 'admin' ? '#1e40af' : '#4b5563';

    return (
      <div className={styles.heroCard}>
        <div className={styles.heroSummary}>
          <div className={styles.heroBody}>
            <div className={styles.heroTitleRow}>
              <div className={styles.heroName}>{current?.name || '未命名组织'}</div>
              {current?.id && (
                <Button
                  className={styles.heroIdButton}
                  icon={<Copy size={12} />}
                  size="small"
                  type="text"
                  onClick={() => onCopyId(current.id)}
                >
                  {current.id}
                </Button>
              )}
            </div>
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

          {!editing && (
            <Space wrap>
              {showOwnerActions && onTransferOwnership ? (
                <Button
                  className={styles.pillButton}
                  icon={<UserCog size={12} />}
                  size="small"
                  style={{ fontSize: 12, padding: '0 10px', height: 28 }}
                  type="text"
                  onClick={onTransferOwnership}
                >
                  移交所有者
                </Button>
              ) : null}
              {showOwnerActions && onDeleteOrganization ? (
                <Button
                  danger
                  className={styles.pillButton}
                  icon={<Trash2 size={12} />}
                  size="small"
                  style={{ fontSize: 12, padding: '0 10px', height: 28 }}
                  type="text"
                  onClick={onDeleteOrganization}
                >
                  删除组织
                </Button>
              ) : null}
              {canUpdateMeta && (
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
            </Space>
          )}
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
        ) : null}
      </div>
    );
  },
);

HeroCard.displayName = 'HeroCard';
