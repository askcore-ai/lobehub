'use client';

import {
  Alert,
  Button,
  Checkbox,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Skeleton,
  Space,
  Upload,
} from 'antd';
import { cssVar } from 'antd-style';
import { Check, Copy, FileSpreadsheet, Pencil, Plus, RefreshCw, Save } from 'lucide-react';
import { type Key, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

import { message } from '@/components/AntdStaticMethods';

import {
  askCoreWorkbenchClient,
  isAskCoreWorkbenchDeleteNotFound,
} from '../AskCoreWorkbench/api';
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
  mergeResourceItems,
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
  'students' | 'teachers'
>;
type TabKey = 'hierarchy' | 'members' | 'overview' | OrganizationRosterResource;

const tabs: { key: TabKey; label: string }[] = [
  { key: 'overview', label: '概览' },
  { key: 'members', label: '成员' },
  { key: 'hierarchy', label: '层级' },
  { key: 'teachers', label: '教师' },
  { key: 'students', label: '学生' },
];

const rosterResources: OrganizationRosterResource[] = [
  'teachers',
  'students',
];
const lookupResources: LookupCollectionKey[] = ['students', 'teachers'];
const ROSTER_PAGE_SIZE = 20;
const ROSTER_IMPORT_TERMINAL_STATES = new Set(['cancelled', 'failed', 'succeeded']);
const ROSTER_IMPORT_ACTIONS: Record<OrganizationRosterResource, string> = {
  students: 'ops.import.students',
  teachers: 'ops.import.teachers',
};

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

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });

const fileSha256Hex = async (file: File) => {
  if (!globalThis.crypto?.subtle) throw new Error('当前浏览器不支持文件校验。');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
};

const csvImportDefaults = (
  resource: OrganizationRosterResource,
  filterForm: Record<string, string>,
) => {
  const defaults: JsonRecord = {};
  if (resource === 'students' && filterForm.org_unit_id) {
    defaults.org_unit_id = Number(filterForm.org_unit_id);
  }
  return defaults;
};

const waitForRosterImport = async (invocationId: string) => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const invocation = await askCoreWorkbenchClient.getInvocation(invocationId);
    if (ROSTER_IMPORT_TERMINAL_STATES.has(String(invocation.state))) return invocation;
    await sleep(1000);
  }
  return null;
};

const labelForField = (resource: OrganizationRosterResource, key: string) => {
  const fields = [...RESOURCE_FORM_FIELDS[resource], ...RESOURCE_FILTER_FIELDS[resource]];
  return (
    fields.find((field) => field.key === key)?.label ||
    {
      class_name: '班级',
      created_at: '创建时间',
      grade_name: '教学年级',
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
  const [total, setTotal] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [nextAfterId, setNextAfterId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [importing, setImporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([]);
  const [editing, setEditing] = useState<JsonRecord | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const listVersionRef = useRef(0);
  const loadMoreTriggerRef = useRef<HTMLDivElement | null>(null);

  const filters = RESOURCE_FILTER_FIELDS[resource] || [];
  const formFields = RESOURCE_FORM_FIELDS[resource] || [];
  const visibleIds = useMemo(
    () => new Set(items.map((item) => recordId(resource, item)).filter((id) => id > 0)),
    [items, resource],
  );
  const selectedKeySet = useMemo(
    () => new Set(selectedRowKeys.map(Number).filter((id) => id > 0)),
    [selectedRowKeys],
  );
  const selectedIds = [...visibleIds].filter((id) => selectedKeySet.has(id));
  const allVisibleSelected =
    visibleIds.size > 0 && [...visibleIds].every((id) => selectedKeySet.has(id));

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
    setLookups({ ...EMPTY_LOOKUPS, ...Object.fromEntries(entries) } as LookupCollections);
  }, []);

  const loadItems = useCallback(async () => {
    const requestVersion = listVersionRef.current + 1;
    listVersionRef.current = requestVersion;
    setLoading(true);
    setLoadingMore(false);
    setError(undefined);
    try {
      const response = await askCoreWorkbenchClient.listResource(
        resource,
        filtersFromFormState(resource, filterForm),
        { pageSize: ROSTER_PAGE_SIZE },
      );
      if (listVersionRef.current !== requestVersion) return;
      setItems(response.items.map((item) => hydrateLookupLabels(item, lookups)));
      setTotal(response.total ?? null);
      setHasMore(Boolean(response.has_more));
      setNextAfterId(response.next_after_id ?? null);
    } catch (reason) {
      if (listVersionRef.current !== requestVersion) return;
      setError(reason instanceof Error ? reason.message : '加载失败');
      setItems([]);
      setTotal(0);
      setHasMore(false);
      setNextAfterId(null);
    } finally {
      if (listVersionRef.current === requestVersion) setLoading(false);
    }
  }, [filterForm, lookups, resource]);

  const loadMoreItems = useCallback(async () => {
    if (loading || loadingMore || !hasMore || !nextAfterId) return;
    const requestVersion = listVersionRef.current;
    const requestedAfterId = nextAfterId;
    setLoadingMore(true);
    setError(undefined);
    try {
      const response = await askCoreWorkbenchClient.listResource(
        resource,
        filtersFromFormState(resource, filterForm),
        {
          afterId: requestedAfterId,
          includeTotal: false,
          pageSize: ROSTER_PAGE_SIZE,
        },
      );
      if (listVersionRef.current !== requestVersion) return;
      const incoming = response.items.map((item) => hydrateLookupLabels(item, lookups));
      setItems((current) => mergeResourceItems(resource, current, incoming));
      setHasMore(Boolean(response.has_more));
      setNextAfterId(response.next_after_id ?? null);
      setTotal((current) => current ?? response.total ?? null);
    } catch (reason) {
      if (listVersionRef.current === requestVersion) {
        setError(reason instanceof Error ? reason.message : '加载更多失败');
      }
    } finally {
      if (listVersionRef.current === requestVersion) setLoadingMore(false);
    }
  }, [filterForm, hasMore, loading, loadingMore, lookups, nextAfterId, resource]);

  useEffect(() => {
    void loadLookups();
  }, [loadLookups]);

  useEffect(() => {
    setFilterForm({});
    setSelectedRowKeys([]);
    setEditing(null);
    setModalOpen(false);
  }, [resource]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  useEffect(() => {
    const target = loadMoreTriggerRef.current;
    if (!target || loading || loadingMore || !hasMore || !nextAfterId) return;
    if (typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadMoreItems();
      },
      { rootMargin: '240px 0px' },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore, loadMoreItems, nextAfterId]);

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
        if (isAskCoreWorkbenchDeleteNotFound(reason)) {
          deleted.push(id);
        } else {
          failed.push(`ID ${id}: ${reason instanceof Error ? reason.message : '删除失败'}`);
        }
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

  const importCsv = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      message.warning('请选择 CSV 文件');
      return;
    }

    setImporting(true);
    try {
      const sha256 = await fileSha256Hex(file);
      const signed = await askCoreWorkbenchClient.presignUpload({
        content_type: 'text/csv',
        filename: file.name,
        purpose: 'csv',
        sha256,
      });
      await askCoreWorkbenchClient.uploadFile(file, signed);
      const params: JsonRecord = {
        csv_ref: {
          integrity: { sha256 },
          locator: { kind: 'object_store', object_key: signed.object_key },
          media_type: 'text/csv',
          purpose: 'csv',
          sensitivity: resource === 'students' ? 'student_personal' : 'restricted',
        },
      };
      const defaults = csvImportDefaults(resource, filterForm);
      if (Object.keys(defaults).length) params.defaults = defaults;

      const result = await askCoreWorkbenchClient.invokeAction(
        ROSTER_IMPORT_ACTIONS[resource],
        params,
      );
      const invocation = await waitForRosterImport(result.invocation_id);
      if (!invocation) {
        message.success('导入任务已提交，稍后刷新列表查看结果');
      } else if (invocation.state === 'succeeded') {
        message.success('导入完成');
      } else {
        message.error(invocation.failure_reason || `导入失败：${invocation.state}`);
      }
      await loadLookups();
      await loadItems();
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : '导入失败');
    } finally {
      setImporting(false);
    }
  };

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
                setSelectedRowKeys([]);
                void loadItems();
              }}
            >
              筛选
            </Button>
          </Space>
          {canManage ? (
            <Space wrap>
              <Upload
                accept=".csv,text/csv"
                disabled={importing}
                showUploadList={false}
                beforeUpload={(file) => {
                  void importCsv(file as File);
                  return false;
                }}
              >
                <Button disabled={importing} icon={<FileSpreadsheet size={14} />} loading={importing}>
                  导入 CSV
                </Button>
              </Upload>
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
        <div className={styles.rosterListHeader}>
          {canManage ? (
            <Checkbox
              checked={allVisibleSelected}
              disabled={!visibleIds.size || loading}
              indeterminate={Boolean(selectedIds.length) && !allVisibleSelected}
              onChange={(event) => {
                setSelectedRowKeys(event.target.checked ? [...visibleIds] : []);
              }}
            >
              全选已加载记录
            </Checkbox>
          ) : (
            <span className={styles.settingsLabel}>已加载记录</span>
          )}
          <span className={styles.settingsLabel}>
            已加载 {items.length} 条{total != null ? ` / ${total} 条` : ''}，已选 {selectedIds.length} 条。
          </span>
        </div>
        {loading && !items.length ? (
          <Skeleton active paragraph={{ rows: 5 }} />
        ) : items.length ? (
          <div className={styles.rosterMasonry}>
            {items.map((item) => {
              const id = recordId(resource, item);
              const selected = id > 0 && selectedKeySet.has(id);
              const title =
                String(item.name || item.title || item.real_name || item.student_name || item.student_number || '').trim() ||
                `${RESOURCE_LABELS[resource].singular} #${id || '--'}`;
              return (
                <article
                  className={`${styles.rosterCard} ${selected ? styles.rosterCardSelected : ''}`}
                  key={`${resource}-${id || JSON.stringify(item)}`}
                >
                  <div className={styles.rosterCardHeader}>
                    {canManage ? (
                      <Checkbox
                        checked={selected}
                        disabled={id <= 0 || loading}
                        onChange={(event) => {
                          if (id <= 0) return;
                          setSelectedRowKeys((current) => {
                            const next = new Set(current.map(Number));
                            if (event.target.checked) next.add(id);
                            else next.delete(id);
                            return [...next];
                          });
                        }}
                      />
                    ) : null}
                    <div className={styles.rosterCardTitleWrap}>
                      <div className={styles.rosterCardTitle}>{title}</div>
                      <div className={styles.rosterCardMeta}>ID {id || '--'}</div>
                    </div>
                    <Space size={4}>
                      <Button size="small" type="link" onClick={() => openEditor(item)}>
                        编辑
                      </Button>
                      {canManage ? (
                        <Popconfirm
                          title={`删除该${RESOURCE_LABELS[resource].singular}？`}
                          onConfirm={() => deleteRecords([id])}
                        >
                          <Button danger size="small" type="link">
                            删除
                          </Button>
                        </Popconfirm>
                      ) : null}
                    </Space>
                  </div>
                  <div className={styles.rosterCardFields}>
                    {rosterColumnsByResource[resource].map((key) => (
                      <div className={styles.rosterFieldChip} key={`${id || title}-${key}`}>
                        <span>{labelForField(resource, key)}</span>
                        <strong>{displayValue(item[key])}</strong>
                      </div>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />
        )}
        {hasMore ? <div className={styles.scrollSentinel} ref={loadMoreTriggerRef} /> : null}
        <div className={styles.rosterLoadStatus}>
          {loadingMore ? '正在加载更多…' : hasMore ? '滚动到底部会自动加载更多记录。' : '已加载完当前结果。'}
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
    { label: '届别', value: org.educationUnits.filter((u) => u.unit_type === 'cohort').length },
    { label: '班级', value: org.educationUnits.filter((u) => u.unit_type === 'class').length },
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
                  members={org.members}
                  orgRoleForm={org.orgRoleForm}
                  payload={org.educationPayload}
                  roleAssignments={org.educationRoleAssignments}
                  roleLoading={org.educationRoleLoading}
                  students={org.educationStudents}
                  teachers={org.educationTeachers}
                  onAddChild={org.handleAddEducationChild}
                  onAddSchool={org.handleAddSchoolUnit}
                  onAssignRole={org.handleAssignEducationRole}
                  onDeleteRole={org.handleDeleteEducationRole}
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
