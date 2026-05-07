'use client';

import { Avatar, Button, Popconfirm, Tooltip } from 'antd';
import { Trash2 } from 'lucide-react';
import { memo } from 'react';

import { styles } from '../styles';
import { type AskCoreOrganizationMember, type AskCoreOrganizationRole } from '../types';
import { RoleTag } from './RoleTag';

interface MemberCardProps {
  canManage: boolean;
  member: AskCoreOrganizationMember;
  onRemove: (memberId: string) => Promise<void>;
  onRoleChange: (memberId: string, role: AskCoreOrganizationRole) => Promise<void>;
}

export const MemberCard = memo<MemberCardProps>(
  ({ member, canManage, onRoleChange, onRemove }) => {
    return (
      <div className={styles.memberCard}>
        <Avatar className={styles.memberAvatar} size={40} src={member.avatar}>
          {member.name.slice(0, 1)}
        </Avatar>
        <div className={styles.memberInfo}>
          <span className={styles.memberName}>{member.name}</span>
          <span className={styles.memberEmail}>{member.email || '--'}</span>
        </div>
        <div className={styles.memberActions}>
          <RoleTag
            editable={canManage}
            role={member.role}
            onChange={(role) => onRoleChange(member.id, role)}
          />
          {canManage && member.role !== 'owner' && (
            <Popconfirm
              description="移除后该成员将失去组织访问权限"
              okText="移除"
              okType="danger"
              title="确认移除成员？"
              onConfirm={() => onRemove(member.id)}
            >
              <Tooltip title="移除成员">
                <Button danger icon={<Trash2 size={14} />} size="small" type="text" />
              </Tooltip>
            </Popconfirm>
          )}
        </div>
      </div>
    );
  },
);

MemberCard.displayName = 'MemberCard';
