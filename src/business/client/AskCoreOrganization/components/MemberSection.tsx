'use client';

import type { Form} from 'antd';
import { Button, Input, Space } from 'antd';
import { Plus, Search } from 'lucide-react';
import { memo, useMemo, useState } from 'react';

import { styles } from '../styles';
import {
  type AskCoreInviteChannel,
  type AskCoreInvitePayload,
  type AskCoreOrganizationMember,
  type AskCoreOrganizationRole,
} from '../types';
import { InviteSlideOver } from './InviteSlideOver';
import { MemberCard } from './MemberCard';

interface MemberSectionProps {
  canInvite: boolean;
  canManage: boolean;
  inviteChannel: AskCoreInviteChannel;
  inviteForm: ReturnType<typeof Form.useForm>[0];
  inviteLoading: boolean;
  inviteOpen: boolean;
  inviteResult: AskCoreInvitePayload | null;
  members: AskCoreOrganizationMember[];
  onInvite: () => Promise<void>;
  onRemove: (memberId: string) => Promise<void>;
  onRoleChange: (memberId: string, role: AskCoreOrganizationRole) => Promise<void>;
  setInviteChannel: (c: AskCoreInviteChannel) => void;
  setInviteOpen: (v: boolean) => void;
}

export const MemberSection = memo<MemberSectionProps>(
  ({
    members,
    canManage,
    canInvite,
    onRoleChange,
    onRemove,
    inviteOpen,
    setInviteOpen,
    inviteChannel,
    setInviteChannel,
    inviteForm,
    inviteLoading,
    inviteResult,
    onInvite,
  }) => {
    const [query, setQuery] = useState('');

    const filtered = useMemo(() => {
      const q = query.trim().toLowerCase();
      if (!q) return members;
      return members.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          (m.email || '').toLowerCase().includes(q),
      );
    }, [members, query]);

    return (
      <div className={styles.sectionCard}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionHeaderLeft}>
            <span className={styles.sectionTitle}>成员</span>
            <span className={styles.sectionSubtitle}>{members.length} 人</span>
          </div>
          <Space>
            <div className={styles.searchWrap}>
              <Input
                allowClear
                className={styles.searchInput}
                placeholder="搜索成员..."
                prefix={<Search size={14} />}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            {canInvite && (
              <Button
                className={styles.pillButton}
                icon={<Plus size={14} />}
                type="primary"
                onClick={() => setInviteOpen(true)}
              >
                邀请成员
              </Button>
            )}
          </Space>
        </div>
        <div className={styles.sectionBody}>
          {filtered.length === 0 ? (
            <div className={styles.emptyState}>未找到匹配的成员</div>
          ) : (
            filtered.map((member) => (
              <MemberCard
                canManage={canManage}
                key={member.id}
                member={member}
                onRemove={onRemove}
                onRoleChange={onRoleChange}
              />
            ))
          )}
        </div>

        <InviteSlideOver
          channel={inviteChannel}
          inviteForm={inviteForm}
          inviteLoading={inviteLoading}
          inviteResult={inviteResult}
          open={inviteOpen}
          onChannelChange={setInviteChannel}
          onClose={() => setInviteOpen(false)}
          onInvite={onInvite}
        />
      </div>
    );
  },
);

MemberSection.displayName = 'MemberSection';
