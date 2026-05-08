'use client';

import { Avatar, Button } from 'antd';
import { cssVar } from 'antd-style';
import { Pencil, UsersRound } from 'lucide-react';
import { memo } from 'react';

import { styles } from '../styles';
import { type AskCoreOrganizationPayload } from '../types';

interface HeroCardProps {
  payload: AskCoreOrganizationPayload | null;
  canUpdateMeta: boolean;
  onEdit: () => void;
}

export const HeroCard = memo<HeroCardProps>(({ payload, canUpdateMeta, onEdit }) => {
  const current = payload?.current;

  const roleBg =
    current?.role === 'owner'
      ? '#fef3c7'
      : current?.role === 'admin'
        ? '#dbeafe'
        : '#f3f4f6';
  const roleColor =
    current?.role === 'owner'
      ? '#92400e'
      : current?.role === 'admin'
        ? '#1e40af'
        : '#4b5563';

  return (
    <div className={styles.heroCard}>
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
            {current?.role === 'owner' ? '所有者' : current?.role === 'admin' ? '管理员' : '成员'}
          </span>
          <span style={{ color: cssVar.colorTextSecondary, fontSize: 12 }}>
            <UsersRound size={12} style={{ marginRight: 3, verticalAlign: -2 }} />
            {payload?.members.length || 0} 成员
          </span>
          {canUpdateMeta && (
            <Button
              className={styles.pillButton}
              icon={<Pencil size={12} />}
              size="small"
              style={{ marginLeft: 'auto', fontSize: 12, padding: '0 10px', height: 26 }}
              type="text"
              onClick={onEdit}
            >
              编辑资料
            </Button>
          )}
        </div>
      </div>
    </div>
  );
});

HeroCard.displayName = 'HeroCard';
