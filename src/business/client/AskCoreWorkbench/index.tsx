'use client';

import {
  Alert,
  Button,
  Descriptions,
  Drawer,
  Empty,
  Input,
  Segmented,
  Skeleton,
  Space,
  Table,
  Tag,
} from 'antd';
import { type ColumnsType } from 'antd/es/table';
import { createStaticStyles, cssVar } from 'antd-style';
import {
  ChevronLeft,
  ChevronRight,
  Columns3,
  Filter,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import {
  askCoreWorkbenchDashboardUrl,
  askCoreWorkbenchItemUrl,
  askCoreWorkbenchResourceUrl,
  emptyAskCoreWorkbenchDashboard,
  emptyAskCoreWorkbenchList,
  fetchAskCorePluginToken,
  fetchAskCoreWorkbenchJson,
} from './api';
import { ASKCORE_WORKBENCH_TAB_OPTIONS, ASKCORE_WORKBENCH_TABS } from './config';
import {
  type AskCoreWorkbenchColumn,
  type AskCoreWorkbenchDashboardPayload,
  type AskCoreWorkbenchListPayload,
  type AskCoreWorkbenchRecord,
  type AskCoreWorkbenchTab,
} from './types';
import {
  askCoreWorkbenchTabFromRoute,
  buildAskCoreWorkbenchUrl,
  normalizeAskCoreWorkbenchTab,
} from './utils';

const PAGE_SIZE = 20;

const styles = createStaticStyles(({ css }) => ({
  body: css`
    padding-block: 16px 32px;
    padding-inline: 32px;
  `,
  cardGrid: css`
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 14px;

    @media (width <= 1080px) {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  `,
  detailValue: css`
    max-width: 520px;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
  `,
  error: css`
    margin-block-start: 16px;
  `,
  footer: css`
    display: flex;
    align-items: center;
    justify-content: space-between;

    margin-block-start: 14px;
    padding-block: 10px;
    padding-inline: 18px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 12px;

    font-size: 13px;
    color: ${cssVar.colorTextSecondary};

    background: ${cssVar.colorBgContainer};
  `,
  header: css`
    display: flex;
    align-items: center;
    justify-content: space-between;

    height: 72px;
    padding-block: 0;
    padding-inline: 32px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};

    background: ${cssVar.colorBgContainer};
  `,
  headerActions: css`
    display: flex;
    gap: 10px;
  `,
  page: css`
    overflow: auto;
    min-width: 760px;
    height: 100%;
    background: ${cssVar.colorBgLayout};
  `,
  primary: css`
    border-color: ${cssVar.colorText};
    border-radius: 999px;
    color: ${cssVar.colorBgContainer};
    background: ${cssVar.colorText};

    &:hover,
    &:focus {
      border-color: ${cssVar.colorTextSecondary} !important;
      color: ${cssVar.colorBgContainer} !important;
      background: ${cssVar.colorTextSecondary} !important;
    }
  `,
  secondary: css`
    border-color: ${cssVar.colorBorderSecondary};
    border-radius: 999px;
    color: ${cssVar.colorText};
    background: ${cssVar.colorBgContainer};
  `,
  stat: css`
    padding-block: 16px;
    padding-inline: 18px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 12px;

    background: ${cssVar.colorBgContainer};
  `,
  statHint: css`
    font-size: 12px;
    line-height: 1.35;
    color: ${cssVar.colorTextDescription};
  `,
  statTitle: css`
    font-size: 13px;
    line-height: 1.35;
    color: ${cssVar.colorTextSecondary};
  `,
  statValue: css`
    margin-block-start: 6px;

    font-size: 28px;
    font-weight: 650;
    line-height: 1.1;
    color: ${cssVar.colorText};
  `,
  subtitle: css`
    font-size: 13px;
    line-height: 1.4;
    color: ${cssVar.colorTextDescription};
  `,
  table: css`
    overflow: hidden;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 12px;
    background: ${cssVar.colorBgContainer};

    .ant-table {
      background: ${cssVar.colorBgContainer};
    }

    .ant-table-thead > tr > th {
      height: 42px;
      padding-block: 0;
      padding-inline: 22px;
      border-block-end: 1px solid ${cssVar.colorBorderSecondary};

      font-size: 12px;
      font-weight: 400;
      color: ${cssVar.colorTextDescription};

      background: ${cssVar.colorBgContainer};
    }

    .ant-table-tbody > tr > td {
      height: 44px;
      padding-block: 0;
      padding-inline: 22px;
      border-block-end: 1px solid ${cssVar.colorFillQuaternary};

      font-size: 13px;
      color: ${cssVar.colorText};
    }

    .ant-table-tbody > tr:last-child > td {
      border-block-end: 0;
    }

    .ant-table-tbody > tr:hover > td {
      background: ${cssVar.colorFillQuaternary};
    }
  `,
  tabs: css`
    width: 100%;
    max-width: 880px;
    padding-block: 4px;
    padding-inline: 4px;
    border-radius: 999px;

    background: ${cssVar.colorFillTertiary};

    .ant-segmented-item {
      min-width: 70px;
      border-radius: 999px;
    }

    .ant-segmented-item-label {
      min-height: 34px;
      font-size: 13px;
      line-height: 34px;
      color: ${cssVar.colorTextSecondary};
    }

    .ant-segmented-item-selected .ant-segmented-item-label {
      font-weight: 500;
      color: ${cssVar.colorText};
    }
  `,
  title: css`
    display: flex;
    gap: 10px;
    align-items: baseline;

    font-size: 24px;
    font-weight: 650;
    line-height: 1;
    color: ${cssVar.colorText};
    letter-spacing: 0;
  `,
  toolbar: css`
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    justify-content: space-between;

    margin-block: 16px 8px;
    margin-inline: 0;
  `,
  toolbarLeft: css`
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  `,
  view: css`
    display: flex;
    flex-direction: column;
    gap: 18px;
  `,
}));

const routeResourceAliases: Record<string, string> = {
  assignment: 'assignments',
  assignments: 'assignments',
  class: 'classes',
  classes: 'classes',
  grade: 'grades',
  grades: 'grades',
  question: 'questions',
  questions: 'questions',
  school: 'schools',
  schools: 'schools',
  student: 'students',
  students: 'students',
  subject: 'subjects',
  subjects: 'subjects',
  submission: 'submissions',
  submissions: 'submissions',
  teacher: 'teachers',
  teachers: 'teachers',
};

const statusLabelMap: Record<string, string> = {
  cancelled: '已取消',
  completed: '完成',
  draft: '草稿',
  failed: '失败',
  manual: '手动',
  pending: '待确认',
  processing: '处理中',
  published: '已发布',
  running: '运行中',
  succeeded: '完成',
};

const statusColor = (value: string) => {
  const normalized = value.toLowerCase();
  if (['succeeded', 'completed', 'published', 'active', 'enabled', 'true'].includes(normalized)) {
    return 'green';
  }
  if (['pending', 'processing', 'running', 'manual'].includes(normalized)) return 'blue';
  if (['failed', 'cancelled', 'error'].includes(normalized)) return 'red';
  if (['draft', 'disabled', 'false'].includes(normalized)) return 'default';
  return 'gold';
};

const getRecordId = (record: AskCoreWorkbenchRecord) =>
  record.id ??
  record.school_id ??
  record.teacher_id ??
  record.class_id ??
  record.student_id ??
  record.grade_id ??
  record.subject_id ??
  record.assignment_id ??
  record.question_id ??
  record.submission_id;

const compactDate = (value: string) => value.replace('T', ' ').replace(/\.\d+/, '').slice(0, 19);

const getNestedPreview = (value: any): string => {
  if (!value || typeof value !== 'object') return String(value ?? '');
  if (Array.isArray(value))
    return value.map(getNestedPreview).filter(Boolean).slice(0, 3).join(', ');
  return (
    value.title ||
    value.name ||
    value.text ||
    value.markdown ||
    value.plain_text ||
    value.content ||
    JSON.stringify(value)
  );
};

const formatCellValue = (value: any, column?: AskCoreWorkbenchColumn) => {
  if (value === null || value === undefined || value === '')
    return <span className={styles.subtitle}>--</span>;

  if (column?.isStatus || typeof value === 'boolean') {
    const label =
      typeof value === 'boolean'
        ? value
          ? '是'
          : '否'
        : statusLabelMap[String(value).toLowerCase()] || String(value);
    return (
      <Tag
        bordered={false}
        color={statusColor(String(value))}
        style={{ borderRadius: 999, margin: 0 }}
      >
        {label}
      </Tag>
    );
  }

  if (typeof value === 'string') return compactDate(value);
  if (typeof value === 'number') return value;

  const preview = getNestedPreview(value);
  return preview.length > 80 ? `${preview.slice(0, 80)}...` : preview;
};

const stringifyDetailValue = (value: any) => {
  if (value === null || value === undefined || value === '') return '--';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
};

const parseRouteSelection = (route?: string | null) => {
  const normalized = String(route || '')
    .trim()
    .replace(/^https?:\/\/[^/]+/i, '')
    .replace(/^\/+/, '')
    .split(/[?#]/)[0];
  const [rawResource, rawId] = normalized.split('/');
  const resource = routeResourceAliases[rawResource];
  return resource && rawId ? { id: rawId, resource } : undefined;
};

const filterRecords = (items: AskCoreWorkbenchRecord[], query: string) => {
  const keyword = query.trim().toLowerCase();
  if (!keyword) return items;
  return items.filter((item) => JSON.stringify(item).toLowerCase().includes(keyword));
};

const invocationColumns: ColumnsType<AskCoreWorkbenchRecord> = [
  {
    dataIndex: 'action_id',
    key: 'action_id',
    render: (_, row) => row.action_id || row.workflow_name || row.invocation_id,
    title: '运行',
  },
  {
    dataIndex: 'state',
    key: 'state',
    render: (value) =>
      formatCellValue(value, { dataIndex: 'state', isStatus: true, title: '状态' }),
    title: '状态',
    width: 120,
  },
  {
    dataIndex: 'progress_stage',
    key: 'progress_stage',
    render: (value) => formatCellValue(value),
    title: '阶段',
    width: 160,
  },
  {
    dataIndex: 'artifact_count',
    key: 'artifact_count',
    render: (value) => formatCellValue(value),
    title: '结果',
    width: 100,
  },
  {
    dataIndex: 'created_at',
    key: 'created_at',
    render: (value) => formatCellValue(value),
    title: '创建时间',
    width: 180,
  },
];

const AskCoreWorkbenchPage = memo(() => {
  const location = useLocation();
  const navigate = useNavigate();
  const query = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const routeQuery = query.get('route');
  const routeTab = routeQuery ? askCoreWorkbenchTabFromRoute(routeQuery) : undefined;
  const activeTab = normalizeAskCoreWorkbenchTab(query.get('tab') || routeTab);
  const activeConfig = ASKCORE_WORKBENCH_TABS.find((tab) => tab.key === activeTab)!;

  const tokenRef = useRef('');
  const [dashboard, setDashboard] = useState<AskCoreWorkbenchDashboardPayload>(
    emptyAskCoreWorkbenchDashboard,
  );
  const [list, setList] = useState<AskCoreWorkbenchListPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRecord, setSelectedRecord] = useState<AskCoreWorkbenchRecord | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const refreshToken = useCallback(async () => {
    const token = await fetchAskCorePluginToken();
    tokenRef.current = token;
    return token;
  }, []);

  const ensureToken = useCallback(async () => tokenRef.current || refreshToken(), [refreshToken]);

  const navigateToTab = useCallback(
    (tab: AskCoreWorkbenchTab) => {
      navigate(buildAskCoreWorkbenchUrl({ tab }));
    },
    [navigate],
  );

  const reload = useCallback(async () => {
    setLoading(true);
    setError(undefined);

    try {
      const token = await ensureToken();

      if (!activeConfig.resource) {
        const payload = await fetchAskCoreWorkbenchJson<AskCoreWorkbenchDashboardPayload>(
          askCoreWorkbenchDashboardUrl(),
          token,
          refreshToken,
        );
        setDashboard(payload || emptyAskCoreWorkbenchDashboard());
        setList(null);
        return;
      }

      const payload = await fetchAskCoreWorkbenchJson<AskCoreWorkbenchListPayload>(
        askCoreWorkbenchResourceUrl(activeConfig.resource, page, PAGE_SIZE),
        token,
        refreshToken,
      );
      setList(payload || emptyAskCoreWorkbenchList(activeConfig.resource, page, PAGE_SIZE));
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
      if (activeConfig.resource) {
        setList(emptyAskCoreWorkbenchList(activeConfig.resource, page, PAGE_SIZE));
      }
    } finally {
      setLoading(false);
    }
  }, [activeConfig.resource, ensureToken, page, refreshToken]);

  useEffect(() => {
    setSearchQuery('');
    setSelectedRecord(null);
    setPage(1);
  }, [activeTab]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    if (!activeConfig.resource || !routeQuery) {
      setSelectedRecord(null);
      return;
    }

    const selection = parseRouteSelection(routeQuery);
    if (!selection || selection.resource !== activeConfig.resource) return;

    const matchingRecord = list?.items.find(
      (record) => String(getRecordId(record)) === selection.id,
    );
    if (matchingRecord) {
      setSelectedRecord(matchingRecord);
      return;
    }

    let ignore = false;
    const loadDetail = async () => {
      setDetailLoading(true);
      try {
        const token = await ensureToken();
        const payload = await fetchAskCoreWorkbenchJson<{ item?: AskCoreWorkbenchRecord }>(
          askCoreWorkbenchItemUrl(activeConfig.resource!, selection.id),
          token,
          refreshToken,
        );
        if (!ignore) setSelectedRecord(payload.item || null);
      } catch {
        if (!ignore) setSelectedRecord(null);
      } finally {
        if (!ignore) setDetailLoading(false);
      }
    };

    loadDetail();
    return () => {
      ignore = true;
    };
  }, [activeConfig.resource, ensureToken, list?.items, refreshToken, routeQuery]);

  const filteredItems = useMemo(
    () => filterRecords(list?.items || [], searchQuery),
    [list?.items, searchQuery],
  );

  const tableColumns = useMemo<ColumnsType<AskCoreWorkbenchRecord>>(() => {
    const columns = (activeConfig.columns || []).map((column) => ({
      dataIndex: column.dataIndex,
      ellipsis: true,
      key: column.dataIndex,
      render: (value: any) => formatCellValue(value, column),
      title: column.title,
      width: column.width,
    }));

    return [
      ...columns,
      {
        align: 'left' as const,
        dataIndex: 'action',
        fixed: 'right' as const,
        key: 'action',
        render: (_: any, record: AskCoreWorkbenchRecord) => (
          <Button
            size="small"
            type="link"
            onClick={() => {
              const id = getRecordId(record);
              if (!activeConfig.resource || id === undefined || id === null) return;
              setSelectedRecord(record);
              navigate(
                buildAskCoreWorkbenchUrl({
                  route: `/${activeConfig.resource}/${id}`,
                  tab: activeTab,
                }),
              );
            }}
          >
            管理
          </Button>
        ),
        title: '操作',
        width: 110,
      },
    ];
  }, [activeConfig.columns, activeConfig.resource, activeTab, navigate]);

  const stats = useMemo(() => {
    const counts = dashboard.counts || {};
    return [
      { hint: '实时数据', key: 'submissions', label: '提交', value: counts.submissions || 0 },
      { hint: '实时数据', key: 'assignments', label: '作业', value: counts.assignments || 0 },
      { hint: '实时数据', key: 'questions', label: '题目', value: counts.questions || 0 },
      { hint: '实时数据', key: 'students', label: '学生', value: counts.students || 0 },
    ];
  }, [dashboard.counts]);

  const closeDrawer = useCallback(() => {
    setSelectedRecord(null);
    navigate(buildAskCoreWorkbenchUrl({ tab: activeTab }), { replace: true });
  }, [activeTab, navigate]);

  const renderDashboard = () => {
    const recent = dashboard.recent_invocations || [];
    const active = dashboard.active_invocations || [];
    const drafts = dashboard.drafts || [];

    return (
      <div className={styles.view}>
        <div className={styles.cardGrid}>
          {stats.map((item) => (
            <div className={styles.stat} key={item.key}>
              <div className={styles.statTitle}>{item.label}</div>
              <div className={styles.statValue}>{item.value}</div>
              <div className={styles.statHint}>{item.hint}</div>
            </div>
          ))}
        </div>

        <div className={styles.table}>
          <Table
            columns={invocationColumns}
            dataSource={activeTab === 'ops' ? [...active, ...recent] : recent}
            locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
            pagination={false}
            rowKey={(record) => record.invocation_id || record.run_id}
            size="middle"
          />
        </div>

        {activeTab === 'overview' && (
          <div className={styles.footer}>
            <span>
              共 {drafts.length} 个草稿，{active.length} 个后台任务正在运行。
            </span>
            <Space>
              <Button className={styles.secondary} size="small">
                创建作业
              </Button>
              <Button className={styles.secondary} size="small">
                导入提交
              </Button>
              <Button className={styles.secondary} size="small" onClick={reload}>
                运行日志
              </Button>
            </Space>
          </div>
        )}
      </div>
    );
  };

  const renderResource = () => (
    <div className={styles.view}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <Input
            allowClear
            placeholder={activeConfig.searchPlaceholder || '搜索'}
            prefix={<Search size={16} />}
            style={{ borderRadius: 999, height: 36, width: 280 }}
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          <Button className={styles.secondary} icon={<Filter size={14} />}>
            筛选
          </Button>
          <Button className={styles.secondary} icon={<SlidersHorizontal size={14} />}>
            排序
          </Button>
          <Button className={styles.secondary} icon={<Columns3 size={14} />}>
            列设置
          </Button>
        </div>
        <Button className={styles.primary} icon={<Plus size={14} />}>
          {activeConfig.newLabel || '新建'}
        </Button>
      </div>

      <div className={styles.table}>
        <Table
          columns={tableColumns}
          dataSource={filteredItems}
          loading={loading}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
          pagination={false}
          rowKey={(record) => String(getRecordId(record) || JSON.stringify(record))}
          scroll={{ x: 920 }}
          size="middle"
        />
      </div>

      <div className={styles.footer}>
        <span>
          共 {list?.total ?? filteredItems.length} 条，支持筛选、批量操作、行内编辑和右侧详情抽屉。
        </span>
        <Space>
          <Button
            className={styles.secondary}
            disabled={page <= 1}
            icon={<ChevronLeft size={14} />}
            size="small"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            上一页
          </Button>
          <Button
            className={styles.secondary}
            disabled={!list?.has_more && page * PAGE_SIZE >= (list?.total || 0)}
            icon={<ChevronRight size={14} />}
            size="small"
            onClick={() => setPage((current) => current + 1)}
          >
            下一页
          </Button>
        </Space>
      </div>
    </div>
  );

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.title}>
          教学工作台 <span className={styles.subtitle}>{activeConfig.label}</span>
        </div>
        <div className={styles.headerActions}>
          <Button className={styles.secondary}>批量操作</Button>
          <Button className={styles.primary} icon={<Plus size={14} />}>
            新建
          </Button>
        </div>
      </div>

      <div className={styles.body}>
        <Segmented
          block
          className={styles.tabs}
          options={ASKCORE_WORKBENCH_TAB_OPTIONS}
          value={activeTab}
          onChange={(value) => navigateToTab(value as AskCoreWorkbenchTab)}
        />

        {error && (
          <Alert
            showIcon
            className={styles.error}
            title={error}
            type="error"
            action={
              <Button icon={<RefreshCw size={14} />} size="small" onClick={reload}>
                重试
              </Button>
            }
          />
        )}

        <div style={{ marginTop: 18 }}>
          {loading && !activeConfig.resource ? (
            <Skeleton active />
          ) : activeConfig.resource ? (
            renderResource()
          ) : (
            renderDashboard()
          )}
        </div>
      </div>

      <Drawer
        destroyOnClose
        open={Boolean(selectedRecord) || detailLoading}
        size="large"
        title="详情"
        onClose={closeDrawer}
      >
        {detailLoading ? (
          <Skeleton active />
        ) : selectedRecord ? (
          <Descriptions
            bordered
            column={1}
            size="small"
            items={Object.entries(selectedRecord).map(([key, value]) => ({
              key,
              label: key,
              children: <pre className={styles.detailValue}>{stringifyDetailValue(value)}</pre>,
            }))}
          />
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />
        )}
      </Drawer>
    </div>
  );
});

AskCoreWorkbenchPage.displayName = 'AskCoreWorkbenchPage';

export const AskCoreWorkbenchRoute = AskCoreWorkbenchPage;
