'use client';

import { Alert, Button, Empty, Form, Input, Modal, Skeleton } from 'antd';
import {
  BarChart3,
  Building2,
  Plus,
  RefreshCw,
  Settings,
  UsersRound,
} from 'lucide-react';
import { memo, useCallback, useMemo, useRef, useState } from 'react';

import {
  EducationOrgSection,
  HeroCard,
  MemberSection,
  QuickActions,
  SettingsSection,
} from './components';
import { useOrganization } from './hooks/useOrganization';
import { styles } from './styles';

export const AskCoreOrganizationRoute = memo(() => {
  const org = useOrganization();
  const membersRef = useRef<HTMLDivElement>(null);
  const schoolsRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useMemo(
    () => ({
      members: membersRef,
      schools: schoolsRef,
      settings: settingsRef,
    }),
    [],
  );

  const scrollTo = useCallback((key: keyof typeof sectionRefs) => {
    sectionRefs[key].current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [sectionRefs]);

  const quickActions = [
    {
      desc: '管理成员与邀请',
      icon: <UsersRound size={22} />,
      onClick: () => scrollTo('members'),
      title: '成员管理',
    },
    {
      desc: '学校/年级/班级',
      icon: <Building2 size={22} />,
      onClick: () => scrollTo('schools'),
      title: '学校管理',
    },
    {
      desc: '组织信息与设置',
      icon: <Settings size={22} />,
      onClick: () => scrollTo('settings'),
      title: '组织设置',
    },
    {
      desc: '查看统计数据',
      icon: <BarChart3 size={22} />,
      onClick: () => scrollTo('members'),
      title: '统计概览',
    },
  ];

  const [inviteOpen, setInviteOpen] = useState(false);

  return (
    <div className={styles.page}>
      <div className={styles.pageInner}>
        {org.error && (
          <Alert
            showIcon
            style={{ marginBottom: 8 }}
            title={org.error}
            type="error"
            action={
              <Button icon={<RefreshCw size={14} />} size="small" onClick={org.reload}>
                重试
              </Button>
            }
          />
        )}

        {org.loading ? (
          <Skeleton active paragraph={{ rows: 8 }} />
        ) : org.current ? (
          <>
            <div className={styles.staggerItem} style={{ animationDelay: '0s' }}>
              <HeroCard
                canUpdateMeta={org.canUpdateMeta}
                metaForm={org.metaForm}
                payload={org.payload}
                savingMeta={org.savingMeta}
                onSaveMeta={org.handleSaveMeta}
              />
            </div>

            <div className={styles.staggerItem} style={{ animationDelay: '0.08s' }}>
              <QuickActions actions={quickActions} />
            </div>

            <div className={styles.staggerItem} ref={sectionRefs.members} style={{ animationDelay: '0.16s' }}>
              <MemberSection
                canInvite={org.canInvite}
                canManage={org.canManage}
                inviteChannel={org.inviteChannel}
                inviteForm={org.inviteForm}
                inviteLoading={org.inviteLoading}
                inviteOpen={inviteOpen}
                inviteResult={org.inviteResult}
                members={org.members}
                setInviteChannel={org.setInviteChannel}
                setInviteOpen={setInviteOpen}
                onInvite={org.handleInvite}
                onRemove={org.handleRemoveMember}
                onRoleChange={org.handleRoleChange}
              />
            </div>

            <div className={styles.staggerItem} ref={sectionRefs.schools} style={{ animationDelay: '0.24s' }}>
              <EducationOrgSection
                assigningRole={org.assigningRole}
                canManage={org.canManage}
                creatingUnit={org.creatingUnit}
                error={org.educationError}
                loading={org.educationLoading}
                orgRoleForm={org.orgRoleForm}
                orgUnitForm={org.orgUnitForm}
                payload={org.educationPayload}
                onAssignRole={org.handleAssignEducationRole}
                onCreateUnit={org.handleCreateEducationUnit}
                onReload={org.reloadEducationOrgUnits}
              />
            </div>

            <div className={styles.staggerItem} ref={sectionRefs.settings} style={{ animationDelay: '0.32s' }}>
              <SettingsSection payload={org.payload} />
            </div>
          </>
        ) : (
          <div className={styles.emptyState}>
            <Empty description="还没有组织" image={Empty.PRESENTED_IMAGE_SIMPLE}>
              <Button
                className={styles.pillButton}
                icon={<Plus size={14} />}
                type="primary"
                onClick={() => org.setCreateOpen(true)}
              >
                创建组织
              </Button>
            </Empty>
          </div>
        )}
      </div>

      <Modal
        destroyOnHidden
        confirmLoading={org.creating}
        okText="创建并激活"
        open={org.createOpen}
        title="创建组织"
        onCancel={() => org.setCreateOpen(false)}
        onOk={org.handleCreateOrganization}
      >
        <Form form={org.createForm} layout="vertical">
          <Form.Item label="组织名称" name="name" rules={[{ required: true, message: '请输入组织名称' }]}>
            <Input maxLength={80} placeholder="例如：Seed 的组织" />
          </Form.Item>
          <Form.Item label="组织简介" name="description">
            <Input.TextArea autoSize={{ maxRows: 4, minRows: 3 }} maxLength={500} />
          </Form.Item>
          <Form.Item label="联系人" name="contact">
            <Input maxLength={120} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
});

AskCoreOrganizationRoute.displayName = 'AskCoreOrganizationRoute';
