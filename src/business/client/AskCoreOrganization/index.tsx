'use client';

import {
  Alert,
  Button,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Skeleton,
  Space,
  Table,
} from 'antd';
import { type ColumnsType } from 'antd/es/table';
import { cssVar } from 'antd-style';
import { Check, Copy, Pencil, Plus, RefreshCw, Save } from 'lucide-react';
import { type Key, memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';

import { message } from '@/components/AntdStaticMethods';

import { askCoreWorkbenchClient } from '../AskCoreWorkbench/api';
import {
  type EditableResourceKey,
  EMPTY_LOOKUPS,
  type FieldDefinition,
  fieldOptions,
  filtersFromFormState,
  fromFormState,
  getResourceIdKey,
  hydrateLookupLabels,
  type LookupCollectionKey,
  type LookupCollections,
  RESOURCE_FILTER_FIELDS,
  RESOURCE_FORM_FIELDS,
  RESOURCE_LABELS,
  toFormState,
} from '../AskCoreWorkbench/resourceMeta';
import { type JsonRecord, type ResourceKey } from '../AskCoreWorkbench/types';
import {
  EducationOrgSection,
  HeroCard,
  MemberSection,
  SettingsSection,
} from './components';
import { useOrganization } from './hooks/useOrganization';
import { styles } from './styles';

type OrganizationRosterResource = Extract<
  ResourceKey,
  'classes' | 'grades' | 'schools' | 'students' | 'teachers'
>;
type TabKey = 'hierarchy' | 'members' | 'overview' | OrganizationRosterResource;

const tabs: { key: TabKey; label: string }[] = [
  { key: 'overview', label: '概览' },
  { key: 'members', label: '成员' },
  { key: 'hierarchy', label: '层级' },
  { key: 'schools', label: '学校' },
  { key: 'grades', label: '年级' },
  { key: 'classes', label: '班级' },
  { key: 'teachers', label: '教师' },
  { key: 'students', label: '学生' },
];

const rosterResources: OrganizationRosterResource[] = [
  'schools',
  'grades',
  'classes',
  'teachers',
  'students',
];
const lookupResources = Object.keys(EMPTY_LOOKUPS) as LookupCollectionKey[];
const ROSTER_PAGE_SIZE = 20;

const normalizeTab = (value?: string | null): TabKey =>
  tabs.some((tab) => tab.key === value) ? (value as TabKey) : 'overview';

const normalizeFormValues = (values: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(values).map(([key, value]) => {
      if (value === undefined || value === null) return [key, ''];
      if (Array.isArray(value)) return [key, value.map(String).join(', ')];
      if (typeof value === 'object') return [key, JSON.stringify(value)];
      return [key, String(value)];
    }),
  ) as Record<string, string>;

const recordId = (resource: OrganizationRosterResource, record: JsonRecord) =>
  Number(record[getResourceIdKey(resource)] || record.id || 0) || 0;

const labelForField = (resource: OrganizationRosterResource, key: string) => {
  const fields = [...RESOURCE_FORM_FIELDS[resource], ...RESOURCE_FILTER_FIELDS[resource]];
  return (
    fields.find((field) => field.key === key)?.label ||
    {
      class_name: '班级',
      created_at: '创建时间',
      grade_name: '年级',
      school_name: '学校',
      updated_at: '更新时间',
    }[key] ||
    key
  );
};

const displayValue = (value: unknown) => {
  if (value === undefined || value === null || value === '') return '--';
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (typeof value === 'string') return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 19).replace('T', ' ') : value;
  if (typeof value === 'number') return value;
  return JSON.stringify(value);
};

const rosterColumnsByResource: Record<OrganizationRosterResource, string[]> = {
  classes: ['name', 'school_name', 'education_level', 'admission_year', 'graduation_year'],
  grades: ['name', 'education_level', 'grade_order', 'is_graduation_grade'],
  schools: ['name', 'province', 'city', 'contact_phone'],
  students: ['name', 'student_number', 'class_name', 'gender'],
  teachers: ['real_name', 'username', 'role', 'school_name'],
};

const RosterField = ({
  field,
  lookups,
}: {
  field: FieldDefinition;
  lookups: LookupCollections;
}) => {
  if (field.kind === 'select') {
    return (
      <Select
        allowClear={!field.required}
        options={fieldOptions(field, lookups)}
        placeholder={field.placeholder || field.label}
      />
    );
  }
  if (field.kind === 'number') return <InputNumber style={{ width: '100%' }} />;
  if (field.kind === 'datetime') return <Input type="datetime-local" />;
  if (field.kind === 'textarea' || field.kind === 'json') {
    return <Input.TextArea rows={field.rows || (field.kind === 'json' ? 8 : 3)} />;
  }
  return <Input placeholder={field.placeholder || field.label} />;
};

const OrganizationRosterSection = memo<{
  canManage: boolean;
  resource: OrganizationRosterResource;
}>(({ canManage, resource }) => {
  const [form] = Form.useForm<Record<string, unknown>>();
  const [items, setItems] = useState<JsonRecord[]>([]);
  const [lookups, setLookups] = useState<LookupCollections>(EMPTY_LOOKUPS);
  const [filterForm, setFilterForm] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([]);
  const [editing, setEditing] = useState<JsonRecord | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const filters = RESOURCE_FILTER_FIELDS[resource] || [];
  const formFields = RESOURCE_FORM_FIELDS[resource] || [];
  const visibleIds = useMemo(
    () => new Set(items.map((item) => recordId(resource, item)).filter((id) => id > 0)),
    [items, resource],
  );
  const selectedIds = selectedRowKeys.map(Number).filter((id) => id > 0 && visibleIds.has(id));

  const loadLookups = useCallback(async () => {
    const entries = await Promise.all(
      lookupResources.map(async (lookup) => {
        try {
          return [lookup, await askCoreWorkbenchClient.listAllResource(lookup)] as const;
        } catch {
          return [lookup, []] as const;
        }
      }),
    );
    setLookups(Object.fromEntries(entries) as LookupCollections);
  }, []);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const response = await askCoreWorkbenchClient.listResource(
        resource,
        filtersFromFormState(resource, filterForm),
        { page, pageSize: ROSTER_PAGE_SIZE },
      );
      setItems(response.items.map((item) => hydrateLookupLabels(item, lookups)));
      setTotal(response.total ?? null);
      setHasMore(Boolean(response.has_more));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '加载失败');
      setItems([]);
      setTotal(0);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [filterForm, lookups, page, resource]);

  useEffect(() => {
    void loadLookups();
  }, [loadLookups]);

  useEffect(() => {
    setFilterForm({});
    setSelectedRowKeys([]);
    setPage(1);
    setEditing(null);
    setModalOpen(false);
  }, [resource]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  const openEditor = (record: JsonRecord | null) => {
    setEditing(record);
    form.setFieldsValue(toFormState(resource as EditableResourceKey, record));
    setModalOpen(true);
  };

  const submitEditor = async () => {
    const values = await form.validateFields();
    const payload = fromFormState(resource as EditableResourceKey, normalizeFormValues(values));
    const editingId = editing ? recordId(resource, editing) : 0;

    setSaving(true);
    try {
      if (editingId) {
        await askCoreWorkbenchClient.updateResource(resource, editingId, payload);
        message.success('已保存');
      } else {
        await askCoreWorkbenchClient.createResource(resource, payload);
        message.success('已创建');
      }
      setModalOpen(false);
      setEditing(null);
      await loadLookups();
      await loadItems();
    } finally {
      setSaving(false);
    }
  };

  const deleteRecords = async (ids: number[]) => {
    const deleted: number[] = [];
    const failed: string[] = [];
    for (const id of ids) {
      try {
        await askCoreWorkbenchClient.deleteResource(resource, id);
        deleted.push(id);
      } catch (reason) {
        failed.push(`ID ${id}: ${reason instanceof Error ? reason.message : '删除失败'}`);
      }
    }
    setSelectedRowKeys([]);
    await loadLookups();
    await loadItems();
    if (failed.length) {
      message.error(`已删除 ${deleted.length} 条，失败 ${failed.length} 条：${failed[0]}`);
    } else {
      message.success(`已删除 ${deleted.length} 条`);
    }
  };

  const columns: ColumnsType<JsonRecord> = [
    ...rosterColumnsByResource[resource].map((key) => ({
      dataIndex: key,
      key,
      render: (value: unknown) => displayValue(value),
      title: labelForField(resource, key),
    })),
    {
      key: 'actions',
      render: (_, row) => {
        const id = recordId(resource, row);
        return (
          <Space>
            <Button size="small" type="link" onClick={() => openEditor(row)}>
              编辑
            </Button>
            {canManage ? (
              <Popconfirm title={`删除该${RESOURCE_LABELS[resource].singular}？`} onConfirm={() => deleteRecords([id])}>
                <Button danger size="small" type="link">
                  删除
                </Button>
              </Popconfirm>
            ) : null}
          </Space>
        );
      },
      title: '操作',
      width: 130,
    },
  ];

  return (
    <div className={styles.sectionCard}>
      <div className={styles.sectionHeader}>
        <div className={styles.sectionHeaderLeft}>
          <span className={styles.sectionTitle}>{RESOURCE_LABELS[resource].label}</span>
          <span className={styles.sectionSubtitle}>{RESOURCE_LABELS[resource].description}</span>
        </div>
        <Button icon={<RefreshCw size={14} />} loading={loading} size="small" type="text" onClick={loadItems} />
      </div>
      <div className={styles.sectionBody}>
        {error ? <Alert showIcon style={{ marginBottom: 12 }} title={error} type="error" /> : null}
        <div className={styles.flexBetween} style={{ marginBottom: 12 }}>
          <Space wrap>
            {filters.map((field) =>
              field.kind === 'select' ? (
                <Select
                  allowClear
                  key={field.key}
                  options={fieldOptions(field, lookups)}
                  placeholder={field.label}
                  style={{ width: 160 }}
                  value={filterForm[field.key] || undefined}
                  onChange={(value) =>
                    setFilterForm((current) => ({ ...current, [field.key]: value || '' }))
                  }
                />
              ) : field.kind === 'number' ? (
                <InputNumber
                  key={field.key}
                  placeholder={field.label}
                  style={{ width: 160 }}
                  value={filterForm[field.key] ? Number(filterForm[field.key]) : null}
                  onChange={(value) =>
                    setFilterForm((current) => ({
                      ...current,
                      [field.key]: value == null ? '' : String(value),
                    }))
                  }
                />
              ) : (
                <Input
                  allowClear
                  key={field.key}
                  placeholder={field.placeholder || field.label}
                  style={{ width: 180 }}
                  value={filterForm[field.key] || ''}
                  onChange={(event) =>
                    setFilterForm((current) => ({ ...current, [field.key]: event.target.value }))
                  }
                />
              ),
            )}
            <Button
              className={styles.pillButton}
              onClick={() => {
                setPage(1);
                setSelectedRowKeys([]);
                void loadItems();
              }}
            >
              筛选
            </Button>
          </Space>
          {canManage ? (
            <Space wrap>
              <Popconfirm
                disabled={!selectedIds.length}
                title={`批量删除 ${selectedIds.length} 条记录？`}
                onConfirm={() => deleteRecords(selectedIds)}
              >
                <Button danger disabled={!selectedIds.length}>
                  批量删除
                </Button>
              </Popconfirm>
              <Button className={styles.pillButton} icon={<Plus size={14} />} type="primary" onClick={() => openEditor(null)}>
                新建{RESOURCE_LABELS[resource].singular}
              </Button>
            </Space>
          ) : null}
        </div>
        <Table
          columns={columns}
          dataSource={items}
          loading={loading}
          pagination={false}
          rowKey={(row) => String(recordId(resource, row) || JSON.stringify(row))}
          size="small"
          rowSelection={
            canManage
              ? {
                  selectedRowKeys,
                  onChange: setSelectedRowKeys,
                }
              : undefined
          }
        />
        <div className={styles.flexBetween} style={{ marginTop: 12 }}>
          <span className={styles.settingsLabel}>
            共 {total ?? items.length} 条，当前第 {page} 页，已选 {selectedIds.length} 条。
          </span>
          <Space>
            <Button
              className={styles.pillButton}
              disabled={page <= 1}
              size="small"
              onClick={() => {
                setSelectedRowKeys([]);
                setPage((current) => Math.max(1, current - 1));
              }}
            >
              上一页
            </Button>
            <Button
              className={styles.pillButton}
              disabled={!hasMore && page * ROSTER_PAGE_SIZE >= (total || 0)}
              size="small"
              onClick={() => {
                setSelectedRowKeys([]);
                setPage((current) => current + 1);
              }}
            >
              下一页
            </Button>
          </Space>
        </div>
      </div>

      <Modal
        destroyOnHidden
        confirmLoading={saving}
        okText={editing ? '保存' : '创建'}
        open={modalOpen}
        title={`${editing ? '编辑' : '新建'}${RESOURCE_LABELS[resource].singular}`}
        onCancel={() => setModalOpen(false)}
        onOk={submitEditor}
      >
        <Form form={form} layout="vertical">
          {formFields.map((field) => (
            <Form.Item
              extra={field.help}
              key={field.key}
              label={field.label}
              name={field.key}
              rules={field.required ? [{ message: `请输入${field.label}`, required: true }] : undefined}
            >
              <RosterField field={field} lookups={lookups} />
            </Form.Item>
          ))}
        </Form>
      </Modal>
    </div>
  );
});

OrganizationRosterSection.displayName = 'OrganizationRosterSection';

export const AskCoreOrganizationRoute = memo(() => {
  const location = useLocation();
  const org = useOrganization();
  const [activeTab, setActiveTab] = useState<TabKey>(() =>
    normalizeTab(new URLSearchParams(location.search).get('tab')),
  );
  const [inviteOpen, setInviteOpen] = useState(false);

  // Overview editing state
  const [editingMeta, setEditingMeta] = useState(false);
  const [savedPulse, setSavedPulse] = useState(false);

  useEffect(() => {
    setActiveTab(normalizeTab(new URLSearchParams(location.search).get('tab')));
  }, [location.search]);

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
	            <div className={styles.staggerItem} style={{ animationDelay: '0s' }}>
	              <div className={styles.sectionCard}>
	                <div className={styles.sectionHeader}>
	                  <div className={styles.sectionHeaderLeft}>
	                    <span className={styles.sectionTitle}>当前组织</span>
	                    <span className={styles.sectionSubtitle}>{org.organizations.length} 个组织</span>
	                  </div>
	                  <Space wrap>
	                    <Select
	                      style={{ minWidth: 240 }}
	                      value={org.current.id}
	                      options={org.organizations.map((item) => ({
	                        label: item.name,
	                        value: item.id,
	                      }))}
	                      onChange={(value) => void org.handleActiveChange(value)}
	                    />
	                    <Button
	                      className={styles.pillButton}
	                      icon={<Plus size={14} />}
	                      onClick={() => org.setCreateOpen(true)}
	                    >
	                      新建组织
	                    </Button>
	                  </Space>
	                </div>
	              </div>
	            </div>

	            {/* Hero Card - always visible */}
	            <div className={styles.staggerItem} style={{ animationDelay: '0.03s' }}>
	              <HeroCard
	                canUpdateMeta={org.canUpdateMeta}
	                payload={org.payload}
	                onEdit={() => setEditingMeta(true)}
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

	              {activeTab === 'hierarchy' && (
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

	              {rosterResources.includes(activeTab as OrganizationRosterResource) && (
	                <OrganizationRosterSection
	                  canManage={org.canManage}
	                  resource={activeTab as OrganizationRosterResource}
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
