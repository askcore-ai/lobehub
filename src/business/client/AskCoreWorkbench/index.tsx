'use client';

import {
  Alert,
  Button,
  Descriptions,
  Empty,
  Form,
  Input,
  InputNumber,
  message,
  Modal,
  Popconfirm,
  Progress,
  Segmented,
  Select,
  Skeleton,
  Space,
  Table,
  Tabs,
  Tag,
  Upload,
} from 'antd';
import { type ColumnsType } from 'antd/es/table';
import { createStaticStyles, cssVar } from 'antd-style';
import {
  ArrowLeft,
  Download,
  FileScan,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import { type Key, memo, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import type { AskCoreWorkbenchApiClient } from './api';
import {
  askCoreWorkbenchClient,
  emptyAskCoreWorkbenchDashboard,
  emptyAskCoreWorkbenchList,
} from './api';
import { ASKCORE_WORKBENCH_TAB_OPTIONS, ASKCORE_WORKBENCH_TABS } from './config';
import {
  buildResourceBasePath,
  buildResourceEntityPath,
  type EditableResourceKey,
  EMPTY_LOOKUPS,
  fieldOptions,
  filtersFromFormState,
  fromFormState,
  getResourceIdKey,
  hydrateLookupLabels,
  type LookupCollections,
  RESOURCE_FILTER_FIELDS,
  RESOURCE_FORM_FIELDS,
  RESOURCE_LABELS,
  safeJsonParse,
  toFormState,
} from './resourceMeta';
import {
  type AskCoreWorkbenchColumn,
  type AskCoreWorkbenchDashboardPayload,
  type AskCoreWorkbenchListPayload,
  type AskCoreWorkbenchRecord,
  type AskCoreWorkbenchTab,
  type AssignmentDetailResponse,
  type FileDescriptor,
  type JsonRecord,
  type PluginInvocation,
  type ResourceKey,
  type StudentDetailResponse,
  type SubmissionDetailResponse,
} from './types';
import {
  askCoreWorkbenchTabFromRoute,
  buildAskCoreWorkbenchUrl,
  normalizeAskCoreWorkbenchTab,
} from './utils';

const PAGE_SIZE = 20;
const lookupResources: Array<keyof LookupCollections> = [
  'schools',
  'teachers',
  'classes',
  'students',
  'grades',
  'subjects',
];

const styles = createStaticStyles(({ css }) => ({
  actionBar: css`
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    justify-content: space-between;
  `,
  body: css`
    padding-block: 16px 32px;
    padding-inline: 32px;
  `,
  detailHeader: css`
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: flex-start;
    justify-content: space-between;

    margin-block-end: 14px;
  `,
  detailTitle: css`
    margin: 0;
    font-size: 22px;
    font-weight: 650;
    line-height: 1.25;
    color: ${cssVar.colorText};
  `,
  error: css`
    margin-block-start: 16px;
  `,
  fieldGrid: css`
    display: grid;
    grid-template-columns: repeat(3, minmax(180px, 1fr));
    gap: 10px;

    @media (width <= 1100px) {
      grid-template-columns: repeat(2, minmax(180px, 1fr));
    }
  `,
  footer: css`
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
    justify-content: space-between;

    margin-block-start: 14px;
    padding-block: 10px;
    padding-inline: 18px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 8px;

    font-size: 13px;
    color: ${cssVar.colorTextSecondary};

    background: ${cssVar.colorBgContainer};
  `,
  formPanel: css`
    padding: 18px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 8px;
    background: ${cssVar.colorBgContainer};
  `,
  muted: css`
    font-size: 13px;
    line-height: 1.4;
    color: ${cssVar.colorTextDescription};
  `,
  page: css`
    overflow: auto;
    min-width: 760px;
    height: 100%;
    background: ${cssVar.colorBgLayout};
  `,
  panel: css`
    padding: 16px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 8px;
    background: ${cssVar.colorBgContainer};
  `,
  panelTitle: css`
    margin: 0 0 12px;
    font-size: 15px;
    font-weight: 600;
    line-height: 1.35;
    color: ${cssVar.colorText};
  `,
  primary: css`
    border-color: ${cssVar.colorText};
    border-radius: 8px;
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
    border-radius: 8px;
    color: ${cssVar.colorText};
    background: ${cssVar.colorBgContainer};
  `,
  statGrid: css`
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;

    @media (width <= 1080px) {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  `,
  statItem: css`
    padding-block: 14px;
    padding-inline: 16px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 8px;
    background: ${cssVar.colorBgContainer};
  `,
  statTitle: css`
    font-size: 13px;
    color: ${cssVar.colorTextSecondary};
  `,
  statValue: css`
    margin-block-start: 6px;
    font-size: 26px;
    font-weight: 650;
    color: ${cssVar.colorText};
  `,
  table: css`
    overflow: hidden;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 8px;
    background: ${cssVar.colorBgContainer};

    .ant-table {
      background: ${cssVar.colorBgContainer};
    }

    .ant-table-thead > tr > th {
      height: 42px;
      padding-block: 0;
      padding-inline: 18px;
      border-block-end: 1px solid ${cssVar.colorBorderSecondary};
      font-size: 12px;
      font-weight: 500;
      color: ${cssVar.colorTextDescription};
      background: ${cssVar.colorBgContainer};
    }

    .ant-table-tbody > tr > td {
      min-height: 44px;
      padding-block: 9px;
      padding-inline: 18px;
      border-block-end: 1px solid ${cssVar.colorFillQuaternary};
      font-size: 13px;
      color: ${cssVar.colorText};
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
  `,
  toolbar: css`
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    justify-content: space-between;
    margin-block: 16px 10px;
  `,
  toolbarLeft: css`
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
  `,
  value: css`
    max-width: 720px;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
  `,
  view: css`
    display: flex;
    flex-direction: column;
    gap: 16px;
  `,
}));

type WorkbenchRoute =
  | { kind: 'dashboard'; path: string }
  | { kind: 'list'; path: string; resource: ResourceKey }
  | { kind: 'new'; path: string; resource: ResourceKey }
  | { entityId: number; kind: 'detail'; path: string; resource: ResourceKey }
  | { entityId: number; kind: 'edit'; path: string; resource: ResourceKey }
  | { kind: 'assignment-manual'; path: string }
  | { kind: 'assignment-ocr'; path: string }
  | { kind: 'submission-ocr'; path: string }
  | { kind: 'ops'; path: string };

type DetailState =
  | { item: JsonRecord; kind: 'generic' }
  | { detail: AssignmentDetailResponse; item: JsonRecord; kind: 'assignment' }
  | { detail: SubmissionDetailResponse; item: JsonRecord; kind: 'submission' }
  | { detail: StudentDetailResponse; item: JsonRecord; kind: 'student' };

const routeResourceAliases: Record<string, ResourceKey> = {
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
  graded: '已批改',
  manual: '手动',
  needs_binding: '待绑定',
  pending: '待处理',
  processing: '处理中',
  published: '已发布',
  ready: '就绪',
  running: '运行中',
  submitted: '已提交',
  succeeded: '完成',
};

const statusColor = (value: string) => {
  const normalized = value.toLowerCase();
  if (['succeeded', 'completed', 'published', 'ready', 'active', 'enabled', 'true'].includes(normalized)) {
    return 'green';
  }
  if (['pending', 'processing', 'running', 'submitted', 'manual'].includes(normalized)) return 'blue';
  if (['failed', 'cancelled', 'error'].includes(normalized)) return 'red';
  if (['draft', 'disabled', 'false'].includes(normalized)) return 'default';
  return 'gold';
};

const compactDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}/.test(value)) return value;
  return value.replace('T', ' ').replace(/\.\d+/, '').slice(0, 19);
};

const getNestedPreview = (value: unknown): string => {
  if (!value || typeof value !== 'object') return String(value ?? '');
  if (Array.isArray(value)) return value.map(getNestedPreview).filter(Boolean).slice(0, 3).join(', ');
  const record = value as JsonRecord;
  return String(
    record.title ||
      record.name ||
      record.text ||
      record.markdown ||
      record.plain_text ||
      record.content ||
      JSON.stringify(record),
  );
};

const formatCellValue = (value: unknown, column?: AskCoreWorkbenchColumn) => {
  if (value === null || value === undefined || value === '')
    return <span className={styles.muted}>--</span>;

  if (column?.isStatus || typeof value === 'boolean') {
    const label =
      typeof value === 'boolean'
        ? value
          ? '是'
          : '否'
        : statusLabelMap[String(value).toLowerCase()] || String(value);
    return (
      <Tag bordered={false} color={statusColor(String(value))} style={{ borderRadius: 999, margin: 0 }}>
        {label}
      </Tag>
    );
  }

  if (typeof value === 'string') return compactDate(value);
  if (typeof value === 'number') return value;

  const preview = getNestedPreview(value);
  return preview.length > 100 ? `${preview.slice(0, 100)}...` : preview;
};

const stringifyDetailValue = (value: unknown) => {
  if (value === null || value === undefined || value === '') return '--';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
};

const displayNode = (value: unknown) => {
  if (value === null || value === undefined || value === '') return '--';
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (typeof value === 'string') return compactDate(value);
  if (typeof value === 'number') return value;
  return stringifyDetailValue(value);
};

const compactJsonRecord = (value: Record<string, unknown>): JsonRecord =>
  Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== null && entry !== ''),
  ) as JsonRecord;

const getRecordId = (resource: ResourceKey, record: AskCoreWorkbenchRecord) => {
  const idKey = getResourceIdKey(resource);
  return Number(record[idKey] || record.id || 0) || 0;
};

const getRecordTitle = (resource: ResourceKey, record: JsonRecord) =>
  String(
    record.name ||
      record.title ||
      record.real_name ||
      record.student_name ||
      record.student_number ||
      record[getResourceIdKey(resource)] ||
      RESOURCE_LABELS[resource].singular,
  );

const normalizeRoutePath = (route?: string | null) => {
  const normalized = String(route || '')
    .trim()
    .replace(/^https?:\/\/[^/]+/i, '')
    .replace(/^\/+/, '')
    .split(/[?#]/)[0];
  return normalized ? `/${normalized}` : '';
};

const parseWorkbenchRoute = (
  route: string | null,
  activeTab: AskCoreWorkbenchTab,
): WorkbenchRoute => {
  const path = normalizeRoutePath(route);
  if (!path) {
    if (activeTab === 'overview') return { kind: 'dashboard', path: '/dashboard' };
    if (activeTab === 'ops') return { kind: 'ops', path: '/ops' };
    return { kind: 'list', path: buildResourceBasePath(activeTab as ResourceKey), resource: activeTab as ResourceKey };
  }
  if (path === '/dashboard') return { kind: 'dashboard', path };
  if (path === '/ops' || path.startsWith('/ops/')) return { kind: 'ops', path };
  if (path === '/assignments/new/manual') return { kind: 'assignment-manual', path };
  if (path === '/assignments/new/ocr') return { kind: 'assignment-ocr', path };
  if (path === '/submissions/new/ocr') return { kind: 'submission-ocr', path };

  const parts = path.replace(/^\/+/, '').split('/').filter(Boolean);
  const resource = routeResourceAliases[parts[0]];
  if (!resource) return { kind: 'dashboard', path: '/dashboard' };
  if (parts.length === 1) return { kind: 'list', path, resource };
  if (parts[1] === 'new') return { kind: 'new', path, resource };
  const entityId = Number(parts[1] || 0) || 0;
  if (!entityId) return { kind: 'list', path: buildResourceBasePath(resource), resource };
  if (parts[2] === 'edit') return { entityId, kind: 'edit', path, resource };
  return { entityId, kind: 'detail', path, resource };
};

const routeFor = (tab: AskCoreWorkbenchTab, route?: string | null) =>
  buildAskCoreWorkbenchUrl({ route, tab });

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

const invocationColumns: ColumnsType<AskCoreWorkbenchRecord> = [
  {
    dataIndex: 'action_id',
    key: 'action_id',
    render: (_, row) => String(row.action_id || row.workflow_name || row.invocation_id || '--'),
    title: '运行',
  },
  {
    dataIndex: 'state',
    key: 'state',
    render: (value) => formatCellValue(value, { dataIndex: 'state', isStatus: true, title: '状态' }),
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

const DetailHeader = ({
  actions,
  onBack,
  subtitle,
  title,
}: {
  actions?: ReactNode;
  onBack: () => void;
  subtitle?: string;
  title: string;
}) => (
  <div className={styles.detailHeader}>
    <Space align="start">
      <Button className={styles.secondary} icon={<ArrowLeft size={14} />} onClick={onBack}>
        返回列表
      </Button>
      <div>
        <h2 className={styles.detailTitle}>{title}</h2>
        {subtitle ? <div className={styles.muted}>{subtitle}</div> : null}
      </div>
    </Space>
    {actions ? <Space wrap>{actions}</Space> : null}
  </div>
);

const ResourceForm = ({
  initial,
  lookups,
  mode,
  onCancel,
  onSubmit,
  resource,
}: {
  initial?: JsonRecord | null;
  lookups: LookupCollections;
  mode: 'create' | 'edit';
  onCancel: () => void;
  onSubmit: (payload: JsonRecord) => Promise<void>;
  resource: EditableResourceKey;
}) => {
  const [form] = Form.useForm<Record<string, string>>();
  const fields = RESOURCE_FORM_FIELDS[resource];

  useEffect(() => {
    form.setFieldsValue(toFormState(resource, initial || null));
  }, [form, initial, resource]);

  return (
    <div className={styles.formPanel}>
      <Form
        form={form}
        layout="vertical"
        onFinish={async (values) => {
          await onSubmit(fromFormState(resource, values));
        }}
      >
        <div className={styles.fieldGrid}>
          {fields.map((field) => (
            <Form.Item
              extra={field.help}
              key={field.key}
              label={field.label}
              name={field.key}
              rules={field.required ? [{ message: `请输入${field.label}`, required: true }] : undefined}
            >
              {field.kind === 'select' ? (
                <Select
                  allowClear={!field.required}
                  options={fieldOptions(field, lookups)}
                  placeholder={field.placeholder || field.label}
                />
              ) : field.kind === 'number' ? (
                <InputNumber style={{ width: '100%' }} />
              ) : field.kind === 'textarea' || field.kind === 'json' ? (
                <Input.TextArea rows={field.rows || (field.kind === 'json' ? 8 : 4)} />
              ) : field.kind === 'datetime' ? (
                <Input type="datetime-local" />
              ) : (
                <Input placeholder={field.placeholder || field.label} />
              )}
            </Form.Item>
          ))}
        </div>
        <Space>
          <Button className={styles.primary} htmlType="submit">
            {mode === 'create' ? '创建' : '保存'}
          </Button>
          <Button className={styles.secondary} onClick={onCancel}>
            取消
          </Button>
        </Space>
      </Form>
    </div>
  );
};

const FileListPanel = ({
  client,
  files,
}: {
  client: AskCoreWorkbenchApiClient;
  files: FileDescriptor[];
}) => {
  if (!files.length) return <Empty description="暂无文件" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      {files.map((file) => (
        <div className={styles.actionBar} key={file.object_key}>
          <span>{file.name || file.object_key}</span>
          <Space>
            <Button
              className={styles.secondary}
              size="small"
              onClick={async () => {
                const result = await client.fetchPreviewBlob(file.object_key, { download: true });
                downloadBlob(result.blob, result.filename);
              }}
            >
              下载
            </Button>
          </Space>
        </div>
      ))}
    </Space>
  );
};

const RunStatusPanel = ({
  invocation,
  title = '运行状态',
}: {
  invocation: PluginInvocation | null;
  title?: string;
}) => (
  <div className={styles.panel}>
    <h3 className={styles.panelTitle}>{title}</h3>
    {invocation ? (
      <Descriptions
        column={2}
        size="small"
        items={[
          { children: invocation.invocation_id, label: 'Invocation' },
          { children: formatCellValue(invocation.state, { dataIndex: 'state', isStatus: true, title: '状态' }), label: '状态' },
          { children: invocation.progress_stage || '--', label: '阶段' },
          { children: invocation.failure_reason || '--', label: '错误' },
        ]}
      />
    ) : (
      <Empty description="尚未开始运行" image={Empty.PRESENTED_IMAGE_SIMPLE} />
    )}
  </div>
);

const AssignmentDetailView = ({
  client,
  detail,
  lookups,
  onBack,
  onEdit,
  onReload,
}: {
  client: AskCoreWorkbenchApiClient;
  detail: AssignmentDetailResponse;
  lookups: LookupCollections;
  onBack: () => void;
  onEdit: () => void;
  onReload: () => void;
}) => {
  const assignment = hydrateLookupLabels(detail.assignment, lookups);
  const assignmentId = Number(assignment.assignment_id || assignment.id || 0) || 0;
  const [questionOpen, setQuestionOpen] = useState(false);
  const [studentOpen, setStudentOpen] = useState(false);
  const [questionForm] = Form.useForm();
  const [studentForm] = Form.useForm();

  const questionColumns: ColumnsType<JsonRecord> = [
    { dataIndex: 'order_index', key: 'order_index', title: '题号', width: 90 },
    {
      dataIndex: 'content',
      key: 'content',
      render: (_, row) => getNestedPreview(row.content || row.question_content || row.question || row),
      title: '题目',
    },
    {
      dataIndex: 'question_type',
      key: 'question_type',
      render: (_, row) => getNestedPreview(row.question_type || row.type || '--'),
      title: '题型',
      width: 130,
    },
    {
      dataIndex: 'score',
      key: 'score',
      render: (value) => value ?? '--',
      title: '分值',
      width: 100,
    },
    {
      key: 'actions',
      render: (_, row) => {
        const id = Number(row.assignment_question_id || row.id || 0) || 0;
        return (
          <Space>
            <Button
              size="small"
              onClick={() => {
                questionForm.setFieldsValue({
                  assignment_question_id: id,
                  order_index: row.order_index,
                  score: row.score,
                });
                setQuestionOpen(true);
              }}
            >
              编辑
            </Button>
            <Popconfirm
              title="删除该题目关联？"
              onConfirm={async () => {
                await client.deleteAssignmentDetailResource('assignment-questions', id);
                message.success('题目关联已删除');
                onReload();
              }}
            >
              <Button danger size="small">
                删除
              </Button>
            </Popconfirm>
          </Space>
        );
      },
      title: '操作',
      width: 160,
    },
  ];

  return (
    <div className={styles.view}>
      <DetailHeader
        subtitle={`作业 ID ${assignmentId || '--'}`}
        title={getRecordTitle('assignments', assignment)}
        actions={
          <Button className={styles.secondary} icon={<Pencil size={14} />} onClick={onEdit}>
            编辑作业
          </Button>
        }
        onBack={onBack}
      />

      <div className={styles.panel}>
        <h3 className={styles.panelTitle}>基础信息</h3>
        <Descriptions
          bordered
          column={2}
          size="small"
          items={[
            { children: displayNode(assignment.subject_name || detail.subject?.name || assignment.subject_id), label: '学科' },
            { children: displayNode(assignment.grade_name || detail.grade?.name || assignment.grade_id), label: '年级' },
            { children: formatCellValue(assignment.creation_type, { dataIndex: 'creation_type', isStatus: true, title: '来源' }), label: '来源' },
            { children: stringifyDetailValue(assignment.assign_date), label: '布置日期' },
            { children: stringifyDetailValue(assignment.due_date), label: '截止日期' },
            { children: stringifyDetailValue(assignment.created_at), label: '创建时间' },
          ]}
        />
      </div>

      <div className={styles.panel}>
        <div className={styles.actionBar}>
          <h3 className={styles.panelTitle}>题目</h3>
          <Button
            className={styles.secondary}
            icon={<Plus size={14} />}
            onClick={() => {
              questionForm.resetFields();
              questionForm.setFieldsValue({ assignment_id: assignmentId });
              setQuestionOpen(true);
            }}
          >
            添加题目
          </Button>
        </div>
        <Table
          columns={questionColumns}
          dataSource={detail.questions}
          pagination={false}
          rowKey={(row) => String(row.assignment_question_id || row.id || row.question_id)}
          size="small"
        />
      </div>

      <div className={styles.panel}>
        <div className={styles.actionBar}>
          <h3 className={styles.panelTitle}>发布对象</h3>
          <Button
            className={styles.secondary}
            icon={<Plus size={14} />}
            onClick={() => {
              studentForm.resetFields();
              studentForm.setFieldsValue({ assignment_id: assignmentId });
              setStudentOpen(true);
            }}
          >
            添加学生/班级
          </Button>
        </div>
        <Table
          dataSource={detail.students}
          pagination={false}
          rowKey={(row) => String(row.assignment_student_id || row.id || row.student_id)}
          size="small"
          columns={[
            { dataIndex: 'student_name', key: 'student_name', title: '学生' },
            { dataIndex: 'class_name', key: 'class_name', title: '班级' },
            { dataIndex: 'status', key: 'status', render: (value) => formatCellValue(value, { dataIndex: 'status', isStatus: true, title: '状态' }), title: '状态' },
            {
              key: 'actions',
              render: (_, row: JsonRecord) => {
                const id = Number(row.assignment_student_id || row.id || 0) || 0;
                return (
                  <Popconfirm
                    title="移除该发布对象？"
                    onConfirm={async () => {
                      await client.deleteAssignmentDetailResource('assignment-students', id);
                      message.success('发布对象已移除');
                      onReload();
                    }}
                  >
                    <Button danger size="small">
                      移除
                    </Button>
                  </Popconfirm>
                );
              },
              title: '操作',
              width: 120,
            },
          ]}
        />
      </div>

      <div className={styles.panel}>
        <h3 className={styles.panelTitle}>文件</h3>
        <FileListPanel client={client} files={detail.files} />
      </div>

      <Modal
        destroyOnClose
        open={questionOpen}
        title="维护作业题目"
        onCancel={() => setQuestionOpen(false)}
        onOk={async () => {
          const values = await questionForm.validateFields();
          const id = Number(values.assignment_question_id || 0) || 0;
          if (id) {
            await client.updateAssignmentDetailResource('assignment-questions', id, compactJsonRecord({
              order_index: Number(values.order_index || 0) || undefined,
              score: values.score === undefined || values.score === '' ? undefined : Number(values.score),
            }));
          } else {
            const questionPayload = values.question_payload
              ? safeJsonParse(values.question_payload, {})
              : {
                  content: values.content,
                  question_type: values.question_type || 'problem_solving',
                };
            await client.createAssignmentDetailResource('assignment-questions', compactJsonRecord({
              assignment_id: assignmentId,
              order_index: Number(values.order_index || 0) || undefined,
              question_id: values.question_id ? Number(values.question_id) : undefined,
              question_payload: values.question_id ? undefined : questionPayload,
              score: values.score === undefined || values.score === '' ? undefined : Number(values.score),
            }));
          }
          setQuestionOpen(false);
          message.success('题目已保存');
          onReload();
        }}
      >
        <Form form={questionForm} layout="vertical">
          <Form.Item hidden name="assignment_question_id">
            <Input />
          </Form.Item>
          <Form.Item label="题号" name="order_index">
            <InputNumber style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="分值" name="score">
            <InputNumber style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="已有题目 ID" name="question_id">
            <InputNumber style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="新题目题干" name="content">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item label="新题目题型" name="question_type">
            <Input placeholder="problem_solving" />
          </Form.Item>
          <Form.Item extra="可直接粘贴插件 UI 使用的 question_payload JSON。" label="高级 JSON" name="question_payload">
            <Input.TextArea rows={5} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        destroyOnClose
        open={studentOpen}
        title="添加发布对象"
        onCancel={() => setStudentOpen(false)}
        onOk={async () => {
          const values = await studentForm.validateFields();
          await client.createAssignmentDetailResource('assignment-students', compactJsonRecord({
            assignment_id: assignmentId,
            class_id: values.class_id ? Number(values.class_id) : undefined,
            student_id: values.student_id ? Number(values.student_id) : undefined,
          }));
          setStudentOpen(false);
          message.success('发布对象已添加');
          onReload();
        }}
      >
        <Form form={studentForm} layout="vertical">
          <Form.Item label="班级" name="class_id">
            <Select allowClear options={fieldOptions({ key: 'class_id', kind: 'select', label: '班级', optionsFrom: 'classes' }, lookups)} />
          </Form.Item>
          <Form.Item label="单个学生" name="student_id">
            <Select allowClear options={fieldOptions({ key: 'student_id', kind: 'select', label: '学生', optionsFrom: 'students' }, lookups)} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

const SubmissionDetailView = ({
  client,
  detail,
  lookups,
  onBack,
  onEdit,
  onReload,
}: {
  client: AskCoreWorkbenchApiClient;
  detail: SubmissionDetailResponse;
  lookups: LookupCollections;
  onBack: () => void;
  onEdit: () => void;
  onReload: () => void;
}) => {
  const submission = hydrateLookupLabels(detail.submission, lookups);
  const submissionId = Number(submission.submission_id || submission.id || 0) || 0;
  const [busy, setBusy] = useState(false);
  const [binding, setBinding] = useState(String(submission.assignment_student_id || ''));

  const runAction = async (action: string, params: JsonRecord) => {
    setBusy(true);
    try {
      await client.invokeAction(action, params);
      message.success('后台任务已提交');
      onReload();
    } finally {
      setBusy(false);
    }
  };

  const report = detail.report;
  const reportObjectKey = report?.object_key || '';

  return (
    <div className={styles.view}>
      <DetailHeader
        subtitle={`提交 ID ${submissionId || '--'}`}
        title={getRecordTitle('submissions', submission)}
        actions={
          <>
            <Button className={styles.secondary} icon={<Pencil size={14} />} onClick={onEdit}>
              编辑提交
            </Button>
            <Button
              className={styles.secondary}
              disabled={busy || !submissionId}
              onClick={() => runAction('submission.grade.run', { submission_id: submissionId })}
            >
              批改/讲解
            </Button>
          </>
        }
        onBack={onBack}
      />

      <div className={styles.panel}>
        <h3 className={styles.panelTitle}>提交信息</h3>
        <Descriptions
          bordered
          column={2}
          size="small"
          items={[
            { children: displayNode(detail.assignment?.title || submission.assignment_title || submission.assignment_id), label: '作业' },
            { children: displayNode(detail.student?.name || submission.student_name || submission.student_id), label: '学生' },
            { children: formatCellValue(submission.status, { dataIndex: 'status', isStatus: true, title: '状态' }), label: '状态' },
            { children: stringifyDetailValue(submission.score), label: '得分' },
            { children: stringifyDetailValue(submission.total_score), label: '总分' },
            { children: stringifyDetailValue(submission.submitted_at), label: '提交时间' },
          ]}
        />
      </div>

      <div className={styles.panel}>
        <h3 className={styles.panelTitle}>绑定</h3>
        <Space wrap>
          <Input
            placeholder="assignment_student_id"
            style={{ width: 220 }}
            value={binding}
            onChange={(event) => setBinding(event.target.value)}
          />
          <Button
            className={styles.secondary}
            disabled={!submissionId || !binding}
            onClick={async () => {
              await client.updateResource('submissions', submissionId, {
                assignment_student_id: Number(binding),
              });
              message.success('绑定已更新');
              onReload();
            }}
          >
            保存绑定
          </Button>
        </Space>
      </div>

      <div className={styles.panel}>
        <div className={styles.actionBar}>
          <h3 className={styles.panelTitle}>报告</h3>
          <Space wrap>
            <Button
              className={styles.secondary}
              disabled={!reportObjectKey || busy}
              icon={<Download size={14} />}
              onClick={async () => {
                const result = await client.fetchPreviewBlob(reportObjectKey, { download: true });
                downloadBlob(result.blob, result.filename || 'submission-report.pdf');
              }}
            >
              下载报告
            </Button>
            <Button
              className={styles.secondary}
              disabled={!submissionId || busy}
              onClick={() => runAction('submission.report.generate', { force: true, submission_id: submissionId })}
            >
              生成报告
            </Button>
            <Button
              className={styles.secondary}
              disabled={!submissionId || busy}
              icon={<Printer size={14} />}
              onClick={() => runAction('submission.report.print', { submission_id: submissionId })}
            >
              打印报告
            </Button>
          </Space>
        </div>
        <Descriptions
          column={2}
          size="small"
          items={[
            { children: report?.status ? formatCellValue(report.status, { dataIndex: 'status', isStatus: true, title: '状态' }) : '--', label: '状态' },
            { children: report?.name || report?.object_key || '--', label: '文件' },
            { children: report?.generated_at || '--', label: '生成时间' },
            { children: report?.error || '--', label: '错误' },
          ]}
        />
      </div>

      <div className={styles.panel}>
        <h3 className={styles.panelTitle}>题目结果</h3>
        <Table
          dataSource={detail.questions}
          pagination={false}
          rowKey={(row) => String(row.submission_question_id || row.id || row.question_id)}
          size="small"
          columns={[
            { dataIndex: 'order_index', key: 'order_index', title: '题号', width: 80 },
            { dataIndex: 'student_answer', key: 'student_answer', render: (value) => getNestedPreview(value), title: '学生作答' },
            { dataIndex: 'score', key: 'score', title: '得分', width: 100 },
            { dataIndex: 'max_score', key: 'max_score', title: '满分', width: 100 },
            { dataIndex: 'is_correct', key: 'is_correct', render: (value) => formatCellValue(value, { dataIndex: 'is_correct', isStatus: true, title: '是否正确' }), title: '正确', width: 100 },
            {
              key: 'actions',
              render: (_, row: JsonRecord) => (
                <Button
                  size="small"
                  onClick={() => {
                    const id = Number(row.submission_question_id || row.id || 0) || 0;
                    if (id) window.location.href = routeFor('submissions', `/submissions/questions/${id}/edit`);
                  }}
                >
                  编辑
                </Button>
              ),
              title: '操作',
              width: 100,
            },
          ]}
        />
      </div>

      <div className={styles.panel}>
        <h3 className={styles.panelTitle}>原始文件</h3>
        <FileListPanel client={client} files={detail.files} />
      </div>
    </div>
  );
};

const StudentDetailView = ({
  detail,
  onBack,
  onEdit,
}: {
  detail: StudentDetailResponse;
  onBack: () => void;
  onEdit: () => void;
}) => {
  const student = detail.student;
  return (
    <div className={styles.view}>
      <DetailHeader
        subtitle={`学生 ID ${student.student_id || student.id || '--'}`}
        title={getRecordTitle('students', student)}
        actions={
          <Button className={styles.secondary} icon={<Pencil size={14} />} onClick={onEdit}>
            编辑学生
          </Button>
        }
        onBack={onBack}
      />
      <div className={styles.panel}>
        <Descriptions
          bordered
          column={2}
          size="small"
          items={[
            { children: displayNode(student.student_number), label: '学号' },
            { children: displayNode(student.name), label: '姓名' },
            { children: displayNode(detail.classroom?.name || student.class_name || student.class_id), label: '班级' },
            { children: displayNode(detail.school?.name), label: '学校' },
            { children: displayNode(student.gender), label: '性别' },
            { children: displayNode(student.created_at), label: '创建时间' },
          ]}
        />
      </div>
      <Tabs
        items={[
          {
            children: (
              <Table
                dataSource={detail.submissions}
                pagination={false}
                rowKey={(row) => String(row.submission_id || row.id)}
                size="small"
                columns={[
                  { dataIndex: 'name', key: 'name', title: '提交' },
                  { dataIndex: 'assignment_title', key: 'assignment_title', title: '作业' },
                  { dataIndex: 'status', key: 'status', render: (value) => formatCellValue(value, { dataIndex: 'status', isStatus: true, title: '状态' }), title: '状态' },
                  { dataIndex: 'score', key: 'score', title: '得分' },
                ]}
              />
            ),
            key: 'submissions',
            label: `提交 (${detail.submissions_total || detail.submissions.length})`,
          },
          {
            children: (
              <Table
                dataSource={detail.wrong_questions}
                pagination={false}
                rowKey={(row) => String(row.wrong_question_id)}
                size="small"
                columns={[
                  { dataIndex: 'question_preview', key: 'question_preview', title: '题目' },
                  { dataIndex: 'wrong_count', key: 'wrong_count', title: '错误次数', width: 120 },
                  { dataIndex: 'updated_at', key: 'updated_at', title: '更新时间', width: 180 },
                ]}
              />
            ),
            key: 'wrong',
            label: `错题 (${detail.wrong_questions.length})`,
          },
        ]}
      />
    </div>
  );
};

const GenericDetailView = ({
  item,
  onBack,
  onDelete,
  onEdit,
  resource,
}: {
  item: JsonRecord;
  onBack: () => void;
  onDelete: () => void;
  onEdit: () => void;
  resource: ResourceKey;
}) => (
  <div className={styles.view}>
    <DetailHeader
      subtitle={`${RESOURCE_LABELS[resource].singular} ID ${getRecordId(resource, item) || '--'}`}
      title={getRecordTitle(resource, item)}
      actions={
        <>
          <Button className={styles.secondary} icon={<Pencil size={14} />} onClick={onEdit}>
            编辑
          </Button>
          <Popconfirm title={`删除该${RESOURCE_LABELS[resource].singular}？`} onConfirm={onDelete}>
            <Button danger icon={<Trash2 size={14} />}>
              删除
            </Button>
          </Popconfirm>
        </>
      }
      onBack={onBack}
    />
    <div className={styles.panel}>
      <Descriptions
        bordered
        column={1}
        size="small"
        items={Object.entries(item).map(([key, value]) => ({
          children: <pre className={styles.value}>{stringifyDetailValue(value)}</pre>,
          key,
          label: key,
        }))}
      />
    </div>
  </div>
);

const AssignmentManualCreateView = ({
  client,
  lookups,
  onBack,
}: {
  client: AskCoreWorkbenchApiClient;
  lookups: LookupCollections;
  onBack: () => void;
}) => {
  const [form] = Form.useForm();
  const [invocation, setInvocation] = useState<PluginInvocation | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className={styles.view}>
      <DetailHeader subtitle="使用插件 UI 的 durable action 创建草稿并发布。" title="手动创建作业" onBack={onBack} />
      <div className={styles.formPanel}>
        <Form
          form={form}
          layout="vertical"
          onFinish={async (values) => {
            setBusy(true);
            try {
              const result = await client.invokeAction('assignment.draft.create_manual', {
                draft: {
                  grade_id: Number(values.grade_id),
                  questions: safeJsonParse(values.questions_json || '{"questions":[]}', { questions: [] }),
                  subject_id: Number(values.subject_id),
                  title: values.title,
                },
              });
              const next = await client.getInvocation(result.invocation_id);
              setInvocation(next);
              message.success('手动作业创建任务已提交');
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className={styles.fieldGrid}>
            <Form.Item label="标题" name="title" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item label="学科" name="subject_id" rules={[{ required: true }]}>
              <Select options={fieldOptions({ key: 'subject_id', kind: 'select', label: '学科', optionsFrom: 'subjects' }, lookups)} />
            </Form.Item>
            <Form.Item label="年级" name="grade_id" rules={[{ required: true }]}>
              <Select options={fieldOptions({ key: 'grade_id', kind: 'select', label: '年级', optionsFrom: 'grades' }, lookups)} />
            </Form.Item>
          </div>
          <Form.Item extra="保留插件 UI 的 JSON 草稿入口，可粘贴 questions 数组。" label="题目 JSON" name="questions_json">
            <Input.TextArea placeholder='{"questions":[]}' rows={8} />
          </Form.Item>
          <Button className={styles.primary} htmlType="submit" loading={busy}>
            创建草稿
          </Button>
        </Form>
      </div>
      <RunStatusPanel invocation={invocation} />
    </div>
  );
};

const UploadActionView = ({
  action,
  client,
  extraFields,
  onBack,
  title,
}: {
  action: 'assignment.draft.create_from_ocr' | 'submission.create_from_ocr';
  client: AskCoreWorkbenchApiClient;
  extraFields?: ReactNode;
  onBack: () => void;
  title: string;
}) => {
  const [form] = Form.useForm();
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [invocation, setInvocation] = useState<PluginInvocation | null>(null);

  return (
    <div className={styles.view}>
      <DetailHeader subtitle="上传图片后复用插件 UI 的 OCR durable action。" title={title} onBack={onBack} />
      <div className={styles.formPanel}>
        <Form
          form={form}
          layout="vertical"
          onFinish={async (values) => {
            if (!files.length) {
              message.warning('请先选择扫描图片');
              return;
            }
            setBusy(true);
            setProgress(0);
            try {
              const refs = await client.uploadScanFiles(files, {
                onProgress: (item) => {
                  setProgress(Math.round((item.completed / Math.max(1, item.total)) * 100));
                },
              });
              const params: JsonRecord =
                action === 'assignment.draft.create_from_ocr'
                  ? compactJsonRecord({
                      grade_id: values.grade_id ? Number(values.grade_id) : undefined,
                      scan_refs: refs,
                      subject_id: values.subject_id ? Number(values.subject_id) : undefined,
                      title: values.title,
                    })
                  : compactJsonRecord({
                      assignment_id: Number(values.assignment_id),
                      pages_per_student: values.pages_per_student ? Number(values.pages_per_student) : undefined,
                      scan_refs: refs,
                    });
              const result = await client.invokeAction(action, params);
              const next = await client.getInvocation(result.invocation_id);
              setInvocation(next);
              setProgress(100);
              message.success('OCR 任务已提交');
            } finally {
              setBusy(false);
            }
          }}
        >
          {extraFields}
          <Form.Item label="扫描图片">
            <Upload
              multiple
              accept="image/*"
              beforeUpload={() => false}
              onChange={(info) => {
                setFiles(info.fileList.map((file) => file.originFileObj).filter(Boolean) as File[]);
              }}
            >
              <Button icon={<UploadCloud size={14} />}>选择图片</Button>
            </Upload>
          </Form.Item>
          {busy || progress > 0 ? <Progress percent={progress} /> : null}
          <Button className={styles.primary} htmlType="submit" icon={<FileScan size={14} />} loading={busy}>
            开始 OCR
          </Button>
        </Form>
      </div>
      <RunStatusPanel invocation={invocation} />
    </div>
  );
};

const AssignmentOcrCreateView = ({
  client,
  lookups,
  onBack,
}: {
  client: AskCoreWorkbenchApiClient;
  lookups: LookupCollections;
  onBack: () => void;
}) => (
  <UploadActionView
    action="assignment.draft.create_from_ocr"
    client={client}
    title="OCR 创建作业"
    extraFields={
      <div className={styles.fieldGrid}>
        <Form.Item label="标题" name="title">
          <Input />
        </Form.Item>
        <Form.Item label="学科" name="subject_id">
          <Select allowClear options={fieldOptions({ key: 'subject_id', kind: 'select', label: '学科', optionsFrom: 'subjects' }, lookups)} />
        </Form.Item>
        <Form.Item label="年级" name="grade_id">
          <Select allowClear options={fieldOptions({ key: 'grade_id', kind: 'select', label: '年级', optionsFrom: 'grades' }, lookups)} />
        </Form.Item>
      </div>
    }
    onBack={onBack}
  />
);

const SubmissionOcrCreateView = ({
  client,
  onBack,
}: {
  client: AskCoreWorkbenchApiClient;
  onBack: () => void;
}) => (
  <UploadActionView
    action="submission.create_from_ocr"
    client={client}
    title="提交 OCR 录入"
    extraFields={
      <div className={styles.fieldGrid}>
        <Form.Item label="作业 ID" name="assignment_id" rules={[{ required: true }]}>
          <InputNumber style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item label="每位学生页数" name="pages_per_student">
          <InputNumber min={1} style={{ width: '100%' }} />
        </Form.Item>
      </div>
    }
    onBack={onBack}
  />
);

const AskCoreWorkbenchPage = memo(() => {
  const location = useLocation();
  const navigate = useNavigate();
  const query = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const routeQuery = query.get('route');
  const routeTab = routeQuery ? askCoreWorkbenchTabFromRoute(routeQuery) : undefined;
  const activeTab = normalizeAskCoreWorkbenchTab(query.get('tab') || routeTab);
  const activeConfig = ASKCORE_WORKBENCH_TABS.find((tab) => tab.key === activeTab)!;
  const currentRoute = useMemo(() => parseWorkbenchRoute(routeQuery, activeTab), [activeTab, routeQuery]);

  const [dashboard, setDashboard] = useState<AskCoreWorkbenchDashboardPayload>(
    emptyAskCoreWorkbenchDashboard,
  );
  const [list, setList] = useState<AskCoreWorkbenchListPayload | null>(null);
  const [lookups, setLookups] = useState<LookupCollections>(EMPTY_LOOKUPS);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<DetailState | null>(null);
  const [error, setError] = useState<string>();
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterForm, setFilterForm] = useState<Record<string, string>>({});
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([]);

  const navigateToTab = useCallback(
    (tab: AskCoreWorkbenchTab) => {
      navigate(buildAskCoreWorkbenchUrl({ tab }));
    },
    [navigate],
  );

  const backToList = useCallback(() => {
    const resource =
      currentRoute.kind === 'detail' || currentRoute.kind === 'edit' || currentRoute.kind === 'new'
        ? currentRoute.resource
        : activeConfig.resource;
    navigate(routeFor((resource || activeTab) as AskCoreWorkbenchTab, null));
  }, [activeConfig.resource, activeTab, currentRoute, navigate]);

  const loadLookups = useCallback(async () => {
    const entries = await Promise.all(
      lookupResources.map(async (resource) => {
        try {
          return [resource, await askCoreWorkbenchClient.listAllResource(resource)] as const;
        } catch {
          return [resource, []] as const;
        }
      }),
    );
    setLookups(Object.fromEntries(entries) as LookupCollections);
  }, []);

  const reloadListOrDashboard = useCallback(async () => {
    setError(undefined);
    if (currentRoute.kind !== 'list' && currentRoute.kind !== 'dashboard' && currentRoute.kind !== 'ops') {
      return;
    }
    setLoading(true);
    try {
      if (currentRoute.kind === 'dashboard' || currentRoute.kind === 'ops' || !activeConfig.resource) {
        const payload = await askCoreWorkbenchClient.getDashboard();
        setDashboard(payload || emptyAskCoreWorkbenchDashboard());
        setList(null);
        return;
      }

      const filters = filtersFromFormState(currentRoute.resource, filterForm);
      const payload = await askCoreWorkbenchClient.listResource(currentRoute.resource, filters, {
        page,
        pageSize: PAGE_SIZE,
      });
      setList({
        ...payload,
        items: payload.items.map((item) => hydrateLookupLabels(item, lookups)),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
      if (currentRoute.kind === 'list') {
        setList(emptyAskCoreWorkbenchList(currentRoute.resource, page, PAGE_SIZE));
      }
    } finally {
      setLoading(false);
    }
  }, [activeConfig.resource, currentRoute, filterForm, lookups, page]);

  const reloadDetail = useCallback(async () => {
    if (currentRoute.kind !== 'detail' && currentRoute.kind !== 'edit') return;
    setError(undefined);
    setDetailLoading(true);
    try {
      if (currentRoute.resource === 'assignments') {
        const payload = await askCoreWorkbenchClient.getAssignmentDetail(currentRoute.entityId);
        setDetail({ detail: payload, item: hydrateLookupLabels(payload.assignment, lookups), kind: 'assignment' });
      } else if (currentRoute.resource === 'submissions') {
        const payload = await askCoreWorkbenchClient.getSubmissionDetail(currentRoute.entityId);
        setDetail({ detail: payload, item: hydrateLookupLabels(payload.submission, lookups), kind: 'submission' });
      } else if (currentRoute.resource === 'students') {
        const payload = await askCoreWorkbenchClient.getStudentDetail(currentRoute.entityId);
        setDetail({ detail: payload, item: hydrateLookupLabels(payload.student, lookups), kind: 'student' });
      } else {
        const payload = await askCoreWorkbenchClient.getResource(currentRoute.resource, currentRoute.entityId);
        setDetail({ item: hydrateLookupLabels(payload.item, lookups), kind: 'generic' });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '详情加载失败');
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, [currentRoute, lookups]);

  useEffect(() => {
    void loadLookups();
  }, [loadLookups]);

  useEffect(() => {
    setSearchQuery('');
    setSelectedRowKeys([]);
    setPage(1);
  }, [activeTab]);

  useEffect(() => {
    void reloadListOrDashboard();
  }, [reloadListOrDashboard]);

  useEffect(() => {
    void reloadDetail();
  }, [reloadDetail]);

  const filteredItems = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();
    const items = list?.items || [];
    if (!keyword) return items;
    return items.filter((item) => JSON.stringify(item).toLowerCase().includes(keyword));
  }, [list?.items, searchQuery]);

  const renderDashboard = () => {
    const recent = dashboard.recent_invocations || [];
    const active = dashboard.active_invocations || [];
    const drafts = dashboard.drafts || [];
    const counts = dashboard.counts || {};
    const stats = [
      { key: 'submissions', label: '提交', value: counts.submissions || 0 },
      { key: 'assignments', label: '作业', value: counts.assignments || 0 },
      { key: 'questions', label: '题目', value: counts.questions || 0 },
      { key: 'students', label: '学生', value: counts.students || 0 },
    ];

    return (
      <div className={styles.view}>
        <div className={styles.statGrid}>
          {stats.map((item) => (
            <div className={styles.statItem} key={item.key}>
              <div className={styles.statTitle}>{item.label}</div>
              <div className={styles.statValue}>{item.value}</div>
            </div>
          ))}
        </div>
        <div className={styles.table}>
          <Table
            columns={invocationColumns}
            dataSource={activeTab === 'ops' ? [...active, ...recent] : recent}
            locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
            pagination={false}
            rowKey={(record) => String(record.invocation_id || record.run_id)}
            size="middle"
          />
        </div>
        <div className={styles.footer}>
          <span>
            共 {drafts.length} 个草稿，{active.length} 个后台任务正在运行。
          </span>
          <Space wrap>
            <Button
              className={styles.secondary}
              onClick={() => navigate(routeFor('assignments', '/assignments/new/manual'))}
            >
              创建作业
            </Button>
            <Button
              className={styles.secondary}
              onClick={() => navigate(routeFor('submissions', '/submissions/new/ocr'))}
            >
              导入提交
            </Button>
            <Button className={styles.secondary} icon={<RefreshCw size={14} />} onClick={reloadListOrDashboard}>
              刷新
            </Button>
          </Space>
        </div>
      </div>
    );
  };

  const renderResourceList = (resource: ResourceKey) => {
    const config = ASKCORE_WORKBENCH_TABS.find((tab) => tab.resource === resource)!;
    const filters = RESOURCE_FILTER_FIELDS[resource] || [];
    const selectedIds = selectedRowKeys.map((key) => Number(key)).filter((id) => id > 0);

    const columns: ColumnsType<AskCoreWorkbenchRecord> = [
      ...(config.columns || []).map((column) => ({
        dataIndex: column.displayIndex || column.dataIndex,
        ellipsis: true,
        key: column.displayIndex || column.dataIndex,
        render: (_value: unknown, row: AskCoreWorkbenchRecord) => {
          const primary = column.displayIndex ? row[column.displayIndex] || row[column.dataIndex] : row[column.dataIndex];
          const secondary = column.displayIndex ? row[column.dataIndex] : column.secondaryIndex ? row[column.secondaryIndex] : undefined;
          return (
            <span>
              {formatCellValue(primary, column)}
              {secondary && primary !== secondary ? <span className={styles.muted}> #{String(secondary)}</span> : null}
            </span>
          );
        },
        title: column.title,
        width: column.width,
      })),
      {
        key: 'action',
        render: (_, record) => (
          <Button
            size="small"
            type="link"
            onClick={(event) => {
              event.stopPropagation();
              const id = getRecordId(resource, record);
              if (!id) return;
              navigate(routeFor(resource as AskCoreWorkbenchTab, buildResourceEntityPath(resource, id)));
            }}
          >
            管理
          </Button>
        ),
        title: '操作',
        width: 90,
      },
    ];

    return (
      <div className={styles.view}>
        <div className={styles.toolbar}>
          <div className={styles.toolbarLeft}>
            <Input
              allowClear
              placeholder={config.searchPlaceholder || '搜索'}
              prefix={<Search size={16} />}
              style={{ borderRadius: 8, height: 36, width: 260 }}
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
            {filters.map((field) =>
              field.kind === 'select' ? (
                <Select
                  allowClear
                  key={field.key}
                  options={fieldOptions(field, lookups)}
                  placeholder={field.label}
                  style={{ width: 160 }}
                  value={filterForm[field.key] || undefined}
                  onChange={(value) => setFilterForm((current) => ({ ...current, [field.key]: value || '' }))}
                />
              ) : (
                <Input
                  allowClear
                  key={field.key}
                  placeholder={field.placeholder || field.label}
                  style={{ width: 160 }}
                  value={filterForm[field.key] || ''}
                  onChange={(event) =>
                    setFilterForm((current) => ({ ...current, [field.key]: event.target.value }))
                  }
                />
              ),
            )}
            <Button className={styles.secondary} onClick={() => { setPage(1); void reloadListOrDashboard(); }}>
              筛选
            </Button>
          </div>
          <Space wrap>
            {resource === 'assignments' ? (
              <>
                <Button className={styles.secondary} onClick={() => navigate(routeFor('assignments', '/assignments/new/ocr'))}>
                  OCR 创建
                </Button>
                <Button className={styles.primary} icon={<Plus size={14} />} onClick={() => navigate(routeFor('assignments', '/assignments/new/manual'))}>
                  手动创建
                </Button>
              </>
            ) : resource === 'submissions' ? (
              <Button className={styles.primary} icon={<FileScan size={14} />} onClick={() => navigate(routeFor('submissions', '/submissions/new/ocr'))}>
                OCR 录入
              </Button>
            ) : (
              <Button className={styles.primary} icon={<Plus size={14} />} onClick={() => navigate(routeFor(resource as AskCoreWorkbenchTab, `${buildResourceBasePath(resource)}/new`))}>
                {config.newLabel || `新建${RESOURCE_LABELS[resource].singular}`}
              </Button>
            )}
          </Space>
        </div>

        <div className={styles.actionBar}>
          <Space wrap>
            <Popconfirm
              disabled={!selectedIds.length}
              title={`批量删除 ${selectedIds.length} 条记录？`}
              onConfirm={async () => {
                for (const id of selectedIds) {
                  await askCoreWorkbenchClient.deleteResource(resource, id);
                }
                message.success('批量删除完成');
                setSelectedRowKeys([]);
                await reloadListOrDashboard();
              }}
            >
              <Button danger disabled={!selectedIds.length} icon={<Trash2 size={14} />}>
                批量删除
              </Button>
            </Popconfirm>
            {resource === 'submissions' ? (
              <Button
                className={styles.secondary}
                disabled={!selectedIds.length}
                icon={<Download size={14} />}
                onClick={async () => {
                  const result = await askCoreWorkbenchClient.downloadSubmissionReportsZip(selectedIds);
                  downloadBlob(result.blob, result.filename || 'submission-reports.zip');
                }}
              >
                下载报告
              </Button>
            ) : null}
          </Space>
          <span className={styles.muted}>
            已选 {selectedIds.length} 条。详情页将占用整个工作区，不再打开右侧抽屉。
          </span>
        </div>

        <div className={styles.table}>
          <Table
            columns={columns}
            dataSource={filteredItems}
            loading={loading}
            locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
            pagination={false}
            rowKey={(record) => String(getRecordId(resource, record) || JSON.stringify(record))}
            scroll={{ x: 980 }}
            size="middle"
            rowSelection={{
              selectedRowKeys,
              onChange: setSelectedRowKeys,
            }}
            onRow={(record) => ({
              onClick: () => {
                const id = getRecordId(resource, record);
                if (id) navigate(routeFor(resource as AskCoreWorkbenchTab, buildResourceEntityPath(resource, id)));
              },
            })}
          />
        </div>

        <div className={styles.footer}>
          <span>
            共 {list?.total ?? filteredItems.length} 条，当前第 {page} 页。
          </span>
          <Space>
            <Button className={styles.secondary} disabled={page <= 1} size="small" onClick={() => setPage((current) => Math.max(1, current - 1))}>
              上一页
            </Button>
            <Button className={styles.secondary} disabled={!list?.has_more && page * PAGE_SIZE >= (list?.total || 0)} size="small" onClick={() => setPage((current) => current + 1)}>
              下一页
            </Button>
          </Space>
        </div>
      </div>
    );
  };

  const renderEditOrCreate = (resource: ResourceKey, mode: 'create' | 'edit') => (
    <div className={styles.view}>
      <DetailHeader
        subtitle={mode === 'create' ? RESOURCE_LABELS[resource].description : `编辑 ${getRecordTitle(resource, detail?.item || {})}`}
        title={mode === 'create' ? `新建${RESOURCE_LABELS[resource].singular}` : `编辑${RESOURCE_LABELS[resource].singular}`}
        onBack={backToList}
      />
      {mode === 'edit' && detailLoading ? (
        <Skeleton active />
      ) : (
        <ResourceForm
          initial={mode === 'edit' ? detail?.item || null : null}
          lookups={lookups}
          mode={mode}
          resource={resource as EditableResourceKey}
          onCancel={backToList}
          onSubmit={async (payload) => {
            if (mode === 'create') {
              const result = await askCoreWorkbenchClient.createResource(resource, payload);
              const id = getRecordId(resource, result.item);
              message.success('创建成功');
              navigate(routeFor(resource as AskCoreWorkbenchTab, id ? buildResourceEntityPath(resource, id) : buildResourceBasePath(resource)));
            } else if (currentRoute.kind === 'edit') {
              await askCoreWorkbenchClient.updateResource(resource, currentRoute.entityId, payload);
              message.success('保存成功');
              navigate(routeFor(resource as AskCoreWorkbenchTab, buildResourceEntityPath(resource, currentRoute.entityId)));
            }
          }}
        />
      )}
    </div>
  );

  const renderDetail = () => {
    if (detailLoading) return <Skeleton active />;
    if (!detail || (currentRoute.kind !== 'detail' && currentRoute.kind !== 'edit')) {
      return <Empty description="未找到记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
    }
    if (currentRoute.kind === 'edit') return renderEditOrCreate(currentRoute.resource, 'edit');
    const editRoute = buildResourceEntityPath(currentRoute.resource, currentRoute.entityId, 'edit');
    if (detail.kind === 'assignment') {
      return (
        <AssignmentDetailView
          client={askCoreWorkbenchClient}
          detail={detail.detail}
          lookups={lookups}
          onBack={backToList}
          onEdit={() => navigate(routeFor('assignments', editRoute))}
          onReload={reloadDetail}
        />
      );
    }
    if (detail.kind === 'submission') {
      return (
        <SubmissionDetailView
          client={askCoreWorkbenchClient}
          detail={detail.detail}
          lookups={lookups}
          onBack={backToList}
          onEdit={() => navigate(routeFor('submissions', editRoute))}
          onReload={reloadDetail}
        />
      );
    }
    if (detail.kind === 'student') {
      return (
        <StudentDetailView
          detail={detail.detail}
          onBack={backToList}
          onEdit={() => navigate(routeFor('students', editRoute))}
        />
      );
    }
    return (
      <GenericDetailView
        item={detail.item}
        resource={currentRoute.resource}
        onBack={backToList}
        onEdit={() => navigate(routeFor(currentRoute.resource as AskCoreWorkbenchTab, editRoute))}
        onDelete={async () => {
          await askCoreWorkbenchClient.deleteResource(currentRoute.resource, currentRoute.entityId);
          message.success('删除成功');
          backToList();
        }}
      />
    );
  };

  const renderMain = () => {
    if (currentRoute.kind === 'dashboard' || currentRoute.kind === 'ops') return renderDashboard();
    if (currentRoute.kind === 'list') return renderResourceList(currentRoute.resource);
    if (currentRoute.kind === 'new') return renderEditOrCreate(currentRoute.resource, 'create');
    if (currentRoute.kind === 'detail' || currentRoute.kind === 'edit') return renderDetail();
    if (currentRoute.kind === 'assignment-manual') {
      return <AssignmentManualCreateView client={askCoreWorkbenchClient} lookups={lookups} onBack={backToList} />;
    }
    if (currentRoute.kind === 'assignment-ocr') {
      return <AssignmentOcrCreateView client={askCoreWorkbenchClient} lookups={lookups} onBack={backToList} />;
    }
    if (currentRoute.kind === 'submission-ocr') {
      return <SubmissionOcrCreateView client={askCoreWorkbenchClient} onBack={backToList} />;
    }
    return renderDashboard();
  };

  return (
    <div className={styles.page}>
      <div className={styles.body}>
        <Segmented
          block
          className={styles.tabs}
          options={ASKCORE_WORKBENCH_TAB_OPTIONS}
          value={activeTab}
          onChange={(value) => navigateToTab(value as AskCoreWorkbenchTab)}
        />

        {error ? (
          <Alert
            showIcon
            className={styles.error}
            title={error}
            type="error"
            action={
              <Button
                icon={<RefreshCw size={14} />}
                size="small"
                onClick={() => {
                  void reloadListOrDashboard();
                  void reloadDetail();
                }}
              >
                重试
              </Button>
            }
          />
        ) : null}

        <div style={{ marginTop: 18 }}>{renderMain()}</div>
      </div>
    </div>
  );
});

AskCoreWorkbenchPage.displayName = 'AskCoreWorkbenchPage';

export const AskCoreWorkbenchRoute = AskCoreWorkbenchPage;
