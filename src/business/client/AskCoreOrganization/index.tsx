'use client';

import { Alert, Button, Empty, Form, Input, Modal, Skeleton } from 'antd';
import { cssVar } from 'antd-style';
import { Check, Copy, Pencil, Plus, RefreshCw, Save } from 'lucide-react';
import { memo, useCallback, useState } from 'react';

import { message } from '@/components/AntdStaticMethods';

import {
  EducationOrgSection,
  HeroCard,
  MemberSection,
  SettingsSection,
} from './components';
import { useOrganization } from './hooks/useOrganization';
import { styles } from './styles';

type TabKey = 'overview' | 'members' | 'schools';

const tabs: { key: TabKey; label: string }[] = [
  { key: 'overview', label: '概览' },
  { key: 'members', label: '成员' },
  { key: 'schools', label: '学校' },
];

export const AskCoreOrganizationRoute = memo(() => {
  const org = useOrganization();
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [inviteOpen, setInviteOpen] = useState(false);

  // Overview editing state
  const [editingMeta, setEditingMeta] = useState(false);
  const [savedPulse, setSavedPulse] = useState(false);

  const handleSaveMeta = useCallback(async () => {
    await org.handleSaveMeta();
    setEditingMeta(false);
    setSavedPulse(true);
    setTimeout(() => setSavedPulse(false), 1500);
  }, [org]);

  const handleCancelMeta = useCallback(() => {
    setEditingMeta(false);
    if (org.current) {
      org.metaForm.setFieldsValue({
        name: org.current.name,
        description: org.current.description,
        contact: org.current.contact,
      });
    }
  }, [org]);

  const copyId = useCallback((id: string) => {
    navigator.clipboard.writeText(id).then(() => message.success('已复制'));
  }, []);

  const statCards = [
    { label: '成员', value: org.members.length },
    { label: '学校', value: org.educationUnits.filter((u) => u.unit_type === 'school').length },
    { label: '班级', value: org.educationUnits.filter((u) => u.unit_type === 'class').length },
    { label: '创建时间', value: org.current?.createdAt?.slice(0, 10) || '--' },
  ];

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
            {/* Hero Card - always visible */}
            <div className={styles.staggerItem} style={{ animationDelay: '0s' }}>
              <HeroCard
                canUpdateMeta={org.canUpdateMeta}
                onEdit={() => setEditingMeta(true)}
                payload={org.payload}
              />
            </div>

            {/* Tab Navigation */}
            <div className={styles.staggerItem} style={{ animationDelay: '0.06s', display: 'flex', justifyContent: 'center' }}>
              <div className={styles.tabNav}>
                {tabs.map((t) => (
                  <button
                    className={`${styles.tabButton} ${activeTab === t.key ? styles.tabButtonActive : ''}`}
                    key={t.key}
                    type="button"
                    onClick={() => setActiveTab(t.key)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Tab Content */}
            <div className={styles.tabContent} key={activeTab}>
              {activeTab === 'overview' && (
                <div className={styles.staggerItem} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  {/* Stat Cards */}
                  <div className={styles.statGrid}>
                    {statCards.map((s) => (
                      <div className={styles.statCard} key={s.label}>
                        <div className={styles.statValue}>{s.value}</div>
                        <div className={styles.statLabel}>{s.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Org Info Card */}
                  <div className={styles.sectionCard}>
                    <div className={styles.sectionHeader}>
                      <span className={styles.sectionTitle}>组织信息</span>
                      {org.canUpdateMeta && !editingMeta && (
                        <Button
                          className={styles.pillButton}
                          icon={<Pencil size={14} />}
                          size="small"
                          onClick={() => setEditingMeta(true)}
                        >
                          编辑
                        </Button>
                      )}
                    </div>
                    <div className={styles.sectionBody}>
                      {editingMeta ? (
                        <div>
                          <Form form={org.metaForm} layout="vertical">
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
                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                            <Button className={styles.pillButton} onClick={handleCancelMeta}>
                              取消
                            </Button>
                            <Button
                              className={styles.pillButton}
                              icon={savedPulse ? <Check size={14} /> : <Save size={14} />}
                              loading={org.savingMeta}
                              type="primary"
                              onClick={handleSaveMeta}
                            >
                              {savedPulse ? '已保存' : '保存'}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                          <div className={styles.settingsRow}>
                            <span className={styles.settingsLabel}>组织名称</span>
                            <span style={{ fontSize: 14, fontWeight: 500, color: cssVar.colorText }}>
                              {org.current?.name}
                            </span>
                          </div>
                          <div className={styles.settingsRow}>
                            <span className={styles.settingsLabel}>组织简介</span>
                            <span style={{ fontSize: 14, color: cssVar.colorText }}>
                              {org.current?.description || '--'}
                            </span>
                          </div>
                          <div className={styles.settingsRow}>
                            <span className={styles.settingsLabel}>联系人</span>
                            <span style={{ fontSize: 14, color: cssVar.colorText }}>
                              {org.current?.contact || '--'}
                            </span>
                          </div>
                          <div className={styles.settingsRow}>
                            <span className={styles.settingsLabel}>组织 ID</span>
                            <span className={styles.settingsValue}>
                              {org.current?.id}
                              <Button
                                className={styles.copyBtn}
                                icon={<Copy size={13} />}
                                size="small"
                                style={{ marginLeft: 8 }}
                                type="text"
                                onClick={() => copyId(org.current!.id)}
                              />
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Settings */}
                  <SettingsSection payload={org.payload} />
                </div>
              )}

              {activeTab === 'members' && (
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
              )}

              {activeTab === 'schools' && (
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
              )}
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
