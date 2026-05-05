'use client';

import {
  Alert,
  Button,
  Checkbox,
  Descriptions,
  Empty,
  Form,
  Input,
  InputNumber,
  message,
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
import { createStaticStyles, cssVar, cx } from 'antd-style';
import {
  ArrowLeft,
  Download,
  Eye,
  FileImage,
  FileScan,
  GripVertical,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  Save,
  Search,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import {
  type DragEvent,
  type Key,
  memo,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import type { AskCoreWorkbenchApiClient } from './api';
import {
  askCoreWorkbenchClient,
  emptyAskCoreWorkbenchDashboard,
  emptyAskCoreWorkbenchList,
} from './api';
import { ASKCORE_WORKBENCH_TAB_OPTIONS, ASKCORE_WORKBENCH_TABS } from './config';
import {
  buildQuestionPreviewDataFromModel,
  buildQuestionPreviewDataFromPayload,
  createEmptyQuestionForm,
  deserializeQuestionPayload,
  getNextSubQuestionId,
  isJsonRecord,
  type QuestionFormModel,
  type QuestionPreviewData,
  serializeQuestionForm,
} from './questionModel';
import {
  MarkdownPreview,
  QuestionCompactPreview,
  QuestionMarkdownPreview,
  QuestionSummaryPreview,
} from './questionPreview';
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
  dragHandle: css`
    cursor: grab;
    display: inline-flex;
    align-items: center;
    color: ${cssVar.colorTextDescription};
  `,
  dropZone: css`
    height: 10px;
    border-radius: 999px;
  `,
  dropZoneActive: css`
    background: ${cssVar.colorPrimaryBg};
  `,
  editorGrid: css`
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;

    @media (width <= 760px) {
      grid-template-columns: 1fr;
    }
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
  imageCard: css`
    overflow: hidden;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 8px;
    background: ${cssVar.colorBgContainer};
  `,
  imagePreview: css`
    display: block;

    width: 100%;
    max-height: 460px;

    object-fit: contain;
    background: ${cssVar.colorFillQuaternary};
  `,
  inlineEditor: css`
    display: flex;
    flex-direction: column;
    gap: 14px;

    margin-block-start: 12px;
    padding: 14px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 8px;

    background: ${cssVar.colorFillQuaternary};
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
    margin-block: 0 12px;
    margin-inline: 0;

    font-size: 15px;
    font-weight: 600;
    line-height: 1.35;
    color: ${cssVar.colorText};
  `,
  previewBox: css`
    min-width: 0;
    padding: 12px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 8px;

    background: ${cssVar.colorBgContainer};
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
  splitWorkspace: css`
    display: grid;
    grid-template-columns: minmax(0, 1.35fr) minmax(320px, 0.85fr);
    gap: 16px;
    align-items: start;

    @media (width <= 1100px) {
      grid-template-columns: 1fr;
    }
  `,
  stack: css`
    display: flex;
    flex-direction: column;
    gap: 12px;
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
  tightTable: css`
    .ant-table-tbody > tr > td {
      vertical-align: top;
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
  questionCard: css`
    padding: 12px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 8px;
    background: ${cssVar.colorBgContainer};
  `,
  questionCardActive: css`
    border-color: ${cssVar.colorPrimaryBorder};
    background: ${cssVar.colorPrimaryBg};
  `,
  questionCardHeader: css`
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    justify-content: space-between;

    margin-block-end: 10px;
  `,
  questionPreviewCell: css`
    min-width: 280px;
    max-width: 560px;
  `,
  stickyRail: css`
    position: sticky;
    inset-block-start: 16px;
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
  question: 'questions',
  questions: 'questions',
  subject: 'subjects',
  subjects: 'subjects',
  submission: 'submissions',
  submissions: 'submissions',
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
  if (
    ['succeeded', 'completed', 'published', 'ready', 'active', 'enabled', 'true'].includes(
      normalized,
    )
  ) {
    return 'green';
  }
  if (['pending', 'processing', 'running', 'submitted', 'manual'].includes(normalized))
    return 'blue';
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
  if (Array.isArray(value))
    return value.map(getNestedPreview).filter(Boolean).slice(0, 3).join(', ');
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
    Object.entries(value).filter(
      ([, entry]) => entry !== undefined && entry !== null && entry !== '',
    ),
  ) as JsonRecord;

const asError = (reason: unknown) =>
  reason instanceof Error ? reason.message : String(reason || '操作失败');

const readRecordArray = (value: unknown): JsonRecord[] =>
  Array.isArray(value) ? value.filter(isJsonRecord) : [];

const splitTags = (value: string) =>
  value
    .split(/[,\n，、]/)
    .map((entry) => entry.trim())
    .filter(Boolean);

const parseOptionalNumeric = (value: unknown) => {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

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
    return {
      kind: 'list',
      path: buildResourceBasePath(activeTab as ResourceKey),
      resource: activeTab as ResourceKey,
    };
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
              rules={
                field.required ? [{ message: `请输入${field.label}`, required: true }] : undefined
              }
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

const QUESTION_TYPE_OPTIONS = [
  { label: '单选题', value: 'single_choice' },
  { label: '多选题', value: 'multiple_choice' },
  { label: '填空题', value: 'fill_in_blank' },
  { label: '解答题', value: 'problem_solving' },
];

const OPTION_CODE_BASE = 'A'.charCodeAt(0);

const createOptionCode = (index: number) =>
  index < 26 ? String.fromCharCode(OPTION_CODE_BASE + index) : `选项${index + 1}`;

const getNextOptionCode = (options: QuestionFormModel['options']) => {
  let maxIndex = -1;
  options.forEach((option) => {
    [option.id, option.label].forEach((rawValue) => {
      const value = rawValue.trim().toUpperCase();
      if (!/^[A-Z]$/.test(value)) return;
      maxIndex = Math.max(maxIndex, value.charCodeAt(0) - OPTION_CODE_BASE);
    });
  });
  return createOptionCode(maxIndex + 1);
};

const QuestionEditor = ({
  lookups,
  model,
  onChange,
  showRelationFields = true,
}: {
  lookups: LookupCollections;
  model: QuestionFormModel;
  onChange: (next: QuestionFormModel) => void;
  showRelationFields?: boolean;
}) => {
  const hasSubQuestions = model.subQuestions.length > 0;
  const isChoice =
    model.questionType === 'single_choice' || model.questionType === 'multiple_choice';
  const setModel = (next: Partial<QuestionFormModel>) => onChange({ ...model, ...next });
  const setOption = (index: number, updates: Partial<QuestionFormModel['options'][number]>) => {
    setModel({
      options: model.options.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...updates } : row,
      ),
    });
  };
  const setSubQuestion = (
    index: number,
    key: keyof QuestionFormModel['subQuestions'][number],
    value: string,
  ) => {
    setModel({
      subQuestions: model.subQuestions.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [key]: value } : row,
      ),
    });
  };

  const addSubQuestion = () => {
    const nextRow = {
      answerText: hasSubQuestions ? '' : model.answerText,
      id: getNextSubQuestionId(model.subQuestions),
      points: hasSubQuestions ? '' : model.points,
      prompt: '',
      thinking: hasSubQuestions ? '' : model.thinking,
    };
    setModel({
      answerText: hasSubQuestions ? model.answerText : '',
      points: hasSubQuestions ? model.points : '',
      subQuestions: [...model.subQuestions, nextRow],
      thinking: hasSubQuestions ? model.thinking : '',
    });
  };

  return (
    <div className={styles.stack}>
      <div className={styles.formPanel}>
        <h4 className={styles.panelTitle}>基础信息</h4>
        <div className={styles.editorGrid}>
          <label>
            <div className={styles.muted}>题型</div>
            <Select
              options={QUESTION_TYPE_OPTIONS}
              style={{ width: '100%' }}
              value={model.questionType}
              onChange={(value) =>
                setModel({
                  options:
                    value === 'single_choice' || value === 'multiple_choice'
                      ? model.options.length
                        ? model.options
                        : createEmptyQuestionForm({
                            questionType: value as QuestionFormModel['questionType'],
                          }).options
                      : model.options,
                  questionType: value as QuestionFormModel['questionType'],
                })
              }
            />
          </label>
          {showRelationFields ? (
            <>
              <label>
                <div className={styles.muted}>科目</div>
                <Select
                  allowClear
                  options={fieldOptions(
                    { key: 'subject_id', kind: 'select', label: '科目', optionsFrom: 'subjects' },
                    lookups,
                  )}
                  style={{ width: '100%' }}
                  value={model.subjectId || undefined}
                  onChange={(value) => setModel({ subjectId: value || '' })}
                />
              </label>
              <label>
                <div className={styles.muted}>年级</div>
                <Select
                  allowClear
                  options={fieldOptions(
                    { key: 'grade_id', kind: 'select', label: '年级', optionsFrom: 'grades' },
                    lookups,
                  )}
                  style={{ width: '100%' }}
                  value={model.gradeId || undefined}
                  onChange={(value) => setModel({ gradeId: value || '' })}
                />
              </label>
            </>
          ) : null}
          <label>
            <div className={styles.muted}>难度</div>
            <Input
              placeholder="0.0 - 1.0"
              value={model.difficulty}
              onChange={(event) => setModel({ difficulty: event.target.value })}
            />
          </label>
          <label style={{ gridColumn: '1 / -1' }}>
            <div className={styles.muted}>知识点</div>
            <Input
              placeholder="用逗号分隔，例如 函数, 集合"
              value={model.knowledgePoints.join(', ')}
              onChange={(event) => setModel({ knowledgePoints: splitTags(event.target.value) })}
            />
          </label>
        </div>
      </div>

      <div className={styles.formPanel}>
        <h4 className={styles.panelTitle}>题干结构</h4>
        <Input.TextArea
          placeholder="输入题目背景、条件与整体说明，支持 Markdown + LaTeX"
          rows={4}
          value={model.stem}
          onChange={(event) => setModel({ stem: event.target.value })}
        />
      </div>

      {isChoice ? (
        <div className={styles.formPanel}>
          <div className={styles.actionBar}>
            <h4 className={styles.panelTitle}>选项</h4>
            <Button
              className={styles.secondary}
              icon={<Plus size={14} />}
              size="small"
              onClick={() => {
                const code = getNextOptionCode(model.options);
                setModel({ options: [...model.options, { content: '', id: code, label: code }] });
              }}
            >
              添加选项
            </Button>
          </div>
          <div className={styles.stack}>
            {model.options.map((option, index) => (
              <div className={styles.previewBox} key={`${option.id}-${index}`}>
                <div className={styles.editorGrid}>
                  <label>
                    <div className={styles.muted}>选项编号</div>
                    <Input
                      value={option.label}
                      onChange={(event) => {
                        const normalized =
                          event.target.value.trim().toUpperCase() || createOptionCode(index);
                        setOption(index, { id: normalized, label: normalized });
                      }}
                    />
                  </label>
                  <label>
                    <div className={styles.muted}>选项内容</div>
                    <Input.TextArea
                      rows={2}
                      value={option.content}
                      onChange={(event) => setOption(index, { content: event.target.value })}
                    />
                  </label>
                </div>
                <Button
                  danger
                  disabled={model.options.length <= 2}
                  icon={<Trash2 size={14} />}
                  size="small"
                  style={{ marginTop: 8 }}
                  onClick={() =>
                    setModel({ options: model.options.filter((_, rowIndex) => rowIndex !== index) })
                  }
                >
                  删除选项
                </Button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className={styles.formPanel}>
        <div className={styles.actionBar}>
          <h4 className={styles.panelTitle}>小问</h4>
          <Button
            className={styles.secondary}
            icon={<Plus size={14} />}
            size="small"
            onClick={addSubQuestion}
          >
            添加小问
          </Button>
        </div>
        {model.subQuestions.length ? (
          <div className={styles.stack}>
            {model.subQuestions.map((subQuestion, index) => (
              <div className={styles.previewBox} key={`${subQuestion.id}-${index}`}>
                <Space align="start" style={{ width: '100%' }}>
                  <div style={{ flex: 1 }}>
                    <div className={styles.editorGrid}>
                      <label>
                        <div className={styles.muted}>小问 ID</div>
                        <Input
                          value={subQuestion.id}
                          onChange={(event) => setSubQuestion(index, 'id', event.target.value)}
                        />
                      </label>
                      <label>
                        <div className={styles.muted}>分值</div>
                        <Input
                          value={subQuestion.points}
                          onChange={(event) => setSubQuestion(index, 'points', event.target.value)}
                        />
                      </label>
                      <label style={{ gridColumn: '1 / -1' }}>
                        <div className={styles.muted}>小问题干</div>
                        <Input.TextArea
                          rows={3}
                          value={subQuestion.prompt}
                          onChange={(event) => setSubQuestion(index, 'prompt', event.target.value)}
                        />
                      </label>
                      <label>
                        <div className={styles.muted}>答案</div>
                        <Input.TextArea
                          rows={2}
                          value={subQuestion.answerText}
                          onChange={(event) =>
                            setSubQuestion(index, 'answerText', event.target.value)
                          }
                        />
                      </label>
                      <label>
                        <div className={styles.muted}>解析</div>
                        <Input.TextArea
                          rows={2}
                          value={subQuestion.thinking}
                          onChange={(event) =>
                            setSubQuestion(index, 'thinking', event.target.value)
                          }
                        />
                      </label>
                    </div>
                  </div>
                  <Button
                    danger
                    icon={<Trash2 size={14} />}
                    onClick={() =>
                      setModel({
                        subQuestions: model.subQuestions.filter(
                          (_, rowIndex) => rowIndex !== index,
                        ),
                      })
                    }
                  />
                </Space>
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.editorGrid}>
            <label>
              <div className={styles.muted}>分值</div>
              <Input
                value={model.points}
                onChange={(event) => setModel({ points: event.target.value })}
              />
            </label>
            <label>
              <div className={styles.muted}>答案</div>
              <Input.TextArea
                rows={2}
                value={model.answerText}
                onChange={(event) => setModel({ answerText: event.target.value })}
              />
            </label>
            <label style={{ gridColumn: '1 / -1' }}>
              <div className={styles.muted}>解析</div>
              <Input.TextArea
                rows={3}
                value={model.thinking}
                onChange={(event) => setModel({ thinking: event.target.value })}
              />
            </label>
          </div>
        )}
      </div>
    </div>
  );
};

const isImageFile = (file: FileDescriptor) => {
  const mediaType = String(file.media_type || '').toLowerCase();
  if (mediaType.startsWith('image/')) return true;
  return /\.(?:png|jpe?g|webp|gif|bmp|tiff?)$/i.test(file.name || file.object_key);
};

const ImageReferenceRail = ({
  client,
  files,
  title = '原始图片对照',
}: {
  client: AskCoreWorkbenchApiClient;
  files: FileDescriptor[];
  title?: string;
}) => {
  const imageFiles = useMemo(() => files.filter(isImageFile), [files]);
  const nonImageFiles = useMemo(() => files.filter((file) => !isImageFile(file)), [files]);
  const [previews, setPreviews] = useState<
    Array<FileDescriptor & { error?: string | null; url?: string | null }>
  >([]);
  const [loading, setLoading] = useState(false);
  const objectUrlsRef = useRef<string[]>([]);

  useEffect(() => {
    objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrlsRef.current = [];
    setPreviews([]);

    if (!imageFiles.length) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    Promise.all(
      imageFiles.map(async (file) => {
        try {
          const url = await client.fetchPreviewBlobUrl(file.object_key);
          return { ...file, error: null, url };
        } catch (reason) {
          return { ...file, error: asError(reason), url: null };
        }
      }),
    ).then((next) => {
      if (cancelled) {
        next.forEach((item) => {
          if (item.url) URL.revokeObjectURL(item.url);
        });
        return;
      }
      objectUrlsRef.current = next
        .map((item) => item.url)
        .filter((url): url is string => Boolean(url));
      setPreviews(next);
      setLoading(false);
    });

    return () => {
      cancelled = true;
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      objectUrlsRef.current = [];
    };
  }, [client, imageFiles]);

  return (
    <div className={styles.stack}>
      <div className={styles.panel}>
        <div className={styles.actionBar}>
          <h3 className={styles.panelTitle}>{title}</h3>
          <Tag bordered={false}>{previews.length || imageFiles.length} 张</Tag>
        </div>
        {loading ? <Skeleton active paragraph={{ rows: 5 }} /> : null}
        {!loading && !imageFiles.length ? (
          <Empty description="暂无原始图片" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : null}
        <div className={styles.stack}>
          {previews.map((file) => (
            <div className={styles.imageCard} key={file.object_key}>
              {file.url ? (
                <img
                  alt={file.name || file.object_key}
                  className={styles.imagePreview}
                  src={file.url}
                />
              ) : (
                <Alert showIcon message={file.error || '图片预览失败'} type="warning" />
              )}
              <div className={styles.actionBar} style={{ padding: 10 }}>
                <Space>
                  <FileImage size={14} />
                  <span className={styles.muted}>{file.name || file.object_key}</span>
                </Space>
                <Space>
                  <Button
                    className={styles.secondary}
                    disabled={!file.url}
                    icon={<Eye size={14} />}
                    size="small"
                    onClick={() => {
                      if (file.url) window.open(file.url, '_blank', 'noopener,noreferrer');
                    }}
                  >
                    打开原图
                  </Button>
                  <Button
                    className={styles.secondary}
                    icon={<Download size={14} />}
                    size="small"
                    onClick={async () => {
                      const result = await client.fetchPreviewBlob(file.object_key, {
                        download: true,
                      });
                      downloadBlob(result.blob, result.filename);
                    }}
                  >
                    下载
                  </Button>
                </Space>
              </div>
            </div>
          ))}
        </div>
      </div>
      {nonImageFiles.length ? (
        <div className={styles.panel}>
          <h3 className={styles.panelTitle}>附件</h3>
          <FileListPanel client={client} files={nonImageFiles} />
        </div>
      ) : null}
    </div>
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
          {
            children: formatCellValue(invocation.state, {
              dataIndex: 'state',
              isStatus: true,
              title: '状态',
            }),
            label: '状态',
          },
          { children: invocation.progress_stage || '--', label: '阶段' },
          { children: invocation.failure_reason || '--', label: '错误' },
        ]}
      />
    ) : (
      <Empty description="尚未开始运行" image={Empty.PRESENTED_IMAGE_SIMPLE} />
    )}
  </div>
);

type AssignmentDetailQuestionItem = {
  assignmentQuestionId: number | null;
  clientKey: string;
  draftModel: QuestionFormModel;
  extraData: JsonRecord;
  isDirty: boolean;
  isDraft: boolean;
  question: JsonRecord | null;
  questionId: number | null;
  scoreValue: string;
};

const createAssignmentQuestionDraftKey = () =>
  `draft-question-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const buildAssignmentQuestionPayload = (row: JsonRecord, gradeId: string, subjectId: string) => {
  const nestedQuestion = isJsonRecord(row.question) ? row.question : null;
  if (nestedQuestion) return nestedQuestion;
  return compactJsonRecord({
    answer: row.answer,
    content: row.content || row.question_content || row.stem,
    difficulty: row.difficulty,
    extra_data: row.extra_data,
    grade_id: row.grade_id || gradeId,
    knowledge_points: row.knowledge_points,
    question_id: row.question_id,
    question_type: row.question_type || row.type,
    subject_id: row.subject_id || subjectId,
    thinking: row.thinking || row.explanation,
  });
};

const buildAssignmentQuestionItem = ({
  gradeId,
  index,
  row,
  subjectId,
}: {
  gradeId: string;
  index: number;
  row: JsonRecord;
  subjectId: string;
}): AssignmentDetailQuestionItem => {
  const question = buildAssignmentQuestionPayload(row, gradeId, subjectId);
  const score = parseOptionalNumeric(row.score);
  return {
    assignmentQuestionId: Number(row.assignment_question_id || row.id || 0) || null,
    clientKey: `assignment-question-${String(row.assignment_question_id || row.id || row.question_id || index)}`,
    draftModel: deserializeQuestionPayload(question),
    extraData: isJsonRecord(row.extra_data) ? row.extra_data : {},
    isDirty: false,
    isDraft: false,
    question,
    questionId: Number(question.question_id || row.question_id || 0) || null,
    scoreValue: score === null ? '' : String(score),
  };
};

const buildAssignmentQuestionDraft = ({
  gradeId,
  subjectId,
}: {
  gradeId: string;
  subjectId: string;
}): AssignmentDetailQuestionItem => ({
  assignmentQuestionId: null,
  clientKey: createAssignmentQuestionDraftKey(),
  draftModel: createEmptyQuestionForm({ gradeId, subjectId }),
  extraData: {},
  isDirty: true,
  isDraft: true,
  question: null,
  questionId: null,
  scoreValue: '',
});

const deriveAssignmentQuestionScore = (payload: JsonRecord) => {
  const content = isJsonRecord(payload.content) ? payload.content : {};
  const subQuestions = Array.isArray(content.sub_questions)
    ? content.sub_questions.filter(isJsonRecord)
    : [];
  if (subQuestions.length) {
    const total = subQuestions.reduce((sum, row) => {
      const points = parseOptionalNumeric(row.points);
      return points && points > 0 ? sum + points : sum;
    }, 0);
    return total > 0 ? total : null;
  }
  const points = parseOptionalNumeric(content.points);
  return points && points > 0 ? points : null;
};

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
  onReload: () => Promise<void> | void;
}) => {
  const assignment = hydrateLookupLabels(detail.assignment, lookups);
  const assignmentId = Number(assignment.assignment_id || assignment.id || 0) || 0;
  const gradeId = String(detail.grade?.grade_id || assignment.grade_id || '');
  const subjectId = String(detail.subject?.subject_id || assignment.subject_id || '');
  const [questionItems, setQuestionItems] = useState<AssignmentDetailQuestionItem[]>(() =>
    detail.questions.map((row, index) =>
      buildAssignmentQuestionItem({ gradeId, index, row, subjectId }),
    ),
  );
  const [activeQuestionKey, setActiveQuestionKey] = useState<string | null>(null);
  const [questionSelectedKeys, setQuestionSelectedKeys] = useState<string[]>([]);
  const [questionSaving, setQuestionSaving] = useState(false);
  const [questionNotice, setQuestionNotice] = useState<string | null>(null);
  const [questionError, setQuestionError] = useState<string | null>(null);
  const [draggingQuestionKey, setDraggingQuestionKey] = useState<string | null>(null);
  const [questionDropIndex, setQuestionDropIndex] = useState<number | null>(null);
  const [recipientItems, setRecipientItems] = useState<JsonRecord[]>(() => detail.students);
  const [recipientSelectedIds, setRecipientSelectedIds] = useState<number[]>([]);
  const [recipientBusy, setRecipientBusy] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState('');

  useEffect(() => {
    setQuestionItems(
      detail.questions.map((row, index) =>
        buildAssignmentQuestionItem({ gradeId, index, row, subjectId }),
      ),
    );
    setActiveQuestionKey(null);
    setQuestionSelectedKeys([]);
    setQuestionNotice(null);
    setQuestionError(null);
    setRecipientItems(detail.students);
    setRecipientSelectedIds([]);
  }, [detail.questions, detail.students, gradeId, subjectId]);

  const questionSelectedKeySet = useMemo(
    () => new Set(questionSelectedKeys),
    [questionSelectedKeys],
  );
  const recipientSelectedIdSet = useMemo(
    () => new Set(recipientSelectedIds),
    [recipientSelectedIds],
  );
  const dirtyQuestionCount = useMemo(
    () => questionItems.filter((item) => item.isDirty || item.isDraft).length,
    [questionItems],
  );

  const updateQuestionItem = (
    clientKey: string,
    updater: (item: AssignmentDetailQuestionItem) => AssignmentDetailQuestionItem,
  ) => {
    setQuestionItems((current) =>
      current.map((item) => (item.clientKey === clientKey ? updater(item) : item)),
    );
    setQuestionError(null);
    setQuestionNotice(null);
  };

  const syncQuestionOrder = async (items: AssignmentDetailQuestionItem[]) => {
    await Promise.all(
      items.map((item, index) =>
        item.assignmentQuestionId && !item.isDraft
          ? client.updateAssignmentDetailResource(
              'assignment-questions',
              item.assignmentQuestionId,
              {
                order_index: index + 1,
              },
            )
          : Promise.resolve(null),
      ),
    );
  };

  const moveQuestionItem = async (clientKey: string, targetIndex: number) => {
    const sourceIndex = questionItems.findIndex((item) => item.clientKey === clientKey);
    if (sourceIndex < 0) return;
    const next = [...questionItems];
    const [moving] = next.splice(sourceIndex, 1);
    let insertIndex = targetIndex;
    if (sourceIndex < targetIndex) insertIndex -= 1;
    next.splice(Math.max(0, Math.min(insertIndex, next.length)), 0, moving);
    setQuestionItems(next);
    setQuestionSaving(true);
    try {
      await syncQuestionOrder(next);
      setQuestionNotice('题目顺序已更新。');
      void onReload();
    } catch (reason) {
      setQuestionError(`排序同步失败：${asError(reason)}`);
    } finally {
      setQuestionSaving(false);
    }
  };

  const handleQuestionDragStart = (event: DragEvent<HTMLDivElement>, clientKey: string) => {
    setDraggingQuestionKey(clientKey);
    setQuestionDropIndex(null);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', clientKey);
  };

  const saveActiveQuestion = async () => {
    if (!assignmentId || !activeQuestionKey) return;
    const index = questionItems.findIndex((item) => item.clientKey === activeQuestionKey);
    const current = questionItems[index];
    if (!current || questionSaving) return;
    const payload = serializeQuestionForm(current.draftModel);
    const score =
      parseOptionalNumeric(current.scoreValue) ?? deriveAssignmentQuestionScore(payload);

    setQuestionSaving(true);
    setQuestionError(null);
    setQuestionNotice(null);
    try {
      if (current.isDraft) {
        const created = await client.createAssignmentDetailResource(
          'assignment-questions',
          compactJsonRecord({
            assignment_id: assignmentId,
            order_index: index + 1,
            question_payload: payload,
            score,
          }),
        );
        const saved = buildAssignmentQuestionItem({
          gradeId,
          index,
          row: created.item,
          subjectId,
        });
        setQuestionItems((items) =>
          items.map((item) => (item.clientKey === current.clientKey ? saved : item)),
        );
        setActiveQuestionKey(saved.clientKey);
      } else {
        if (current.questionId) {
          await client.updateResource('questions', current.questionId, payload);
        }
        if (current.assignmentQuestionId) {
          await client.updateAssignmentDetailResource(
            'assignment-questions',
            current.assignmentQuestionId,
            compactJsonRecord({
              order_index: index + 1,
              score,
            }),
          );
        }
        setQuestionItems((items) =>
          items.map((item) =>
            item.clientKey === current.clientKey
              ? {
                  ...item,
                  isDirty: false,
                  question: compactJsonRecord({
                    ...payload,
                    question_id: item.questionId || undefined,
                  }),
                  scoreValue: score === null ? '' : String(score),
                }
              : item,
          ),
        );
      }
      setQuestionNotice('题目已保存。');
      void onReload();
    } catch (reason) {
      setQuestionError(asError(reason));
    } finally {
      setQuestionSaving(false);
    }
  };

  const deleteQuestionItems = async (clientKeys: string[]) => {
    const targets = questionItems.filter((item) => clientKeys.includes(item.clientKey));
    if (!targets.length) return;
    setQuestionSaving(true);
    setQuestionError(null);
    try {
      for (const item of targets) {
        if (item.assignmentQuestionId) {
          await client.deleteAssignmentDetailResource(
            'assignment-questions',
            item.assignmentQuestionId,
          );
        }
      }
      setQuestionItems((items) => items.filter((item) => !clientKeys.includes(item.clientKey)));
      setQuestionSelectedKeys((keys) => keys.filter((key) => !clientKeys.includes(key)));
      if (activeQuestionKey && clientKeys.includes(activeQuestionKey)) setActiveQuestionKey(null);
      setQuestionNotice(`已删除 ${targets.length} 道题目。`);
      void onReload();
    } catch (reason) {
      setQuestionError(asError(reason));
    } finally {
      setQuestionSaving(false);
    }
  };

  const addRecipients = async () => {
    if (!assignmentId) return;
    const existingStudentIds = new Set(
      recipientItems.map((row) => Number(row.student_id || 0) || 0).filter((id) => id > 0),
    );
    const selectedStudents = selectedStudentId
      ? lookups.students.filter(
          (student) => String(student.student_id || student.id) === selectedStudentId,
        )
      : lookups.students.filter((student) => String(student.class_id || '') === selectedClassId);
    const studentsToCreate = selectedStudents.filter((student) => {
      const studentId = Number(student.student_id || student.id || 0) || 0;
      return studentId > 0 && !existingStudentIds.has(studentId);
    });
    if (!studentsToCreate.length) {
      message.info('没有新的发布对象可添加');
      return;
    }
    setRecipientBusy(true);
    try {
      const created: JsonRecord[] = [];
      for (const student of studentsToCreate) {
        const studentId = Number(student.student_id || student.id || 0) || 0;
        const result = await client.createAssignmentDetailResource('assignment-students', {
          assignment_id: assignmentId,
          student_id: studentId,
        });
        created.push(result.item);
      }
      setRecipientItems((items) => [...items, ...created]);
      setSelectedClassId('');
      setSelectedStudentId('');
      message.success(`已新增 ${created.length} 个发布对象`);
      void onReload();
    } catch (reason) {
      message.error(asError(reason));
    } finally {
      setRecipientBusy(false);
    }
  };

  const removeRecipients = async (ids: number[]) => {
    if (!ids.length) return;
    setRecipientBusy(true);
    try {
      for (const id of ids) {
        await client.deleteAssignmentDetailResource('assignment-students', id);
      }
      setRecipientItems((items) =>
        items.filter((row) => !ids.includes(Number(row.assignment_student_id || row.id || 0) || 0)),
      );
      setRecipientSelectedIds((current) => current.filter((id) => !ids.includes(id)));
      message.success(`已移除 ${ids.length} 个发布对象`);
      void onReload();
    } catch (reason) {
      message.error(asError(reason));
    } finally {
      setRecipientBusy(false);
    }
  };

  const questionWorkspace = (
    <div className={styles.panel}>
      <div className={styles.actionBar}>
        <div>
          <h3 className={styles.panelTitle}>题目列表</h3>
          <div className={styles.muted}>
            左侧查看和编辑题目，支持 Markdown + LaTeX 预览、插入、删除、拖拽排序和批量删除。
          </div>
        </div>
        <Space wrap>
          <Button
            className={styles.secondary}
            icon={<Plus size={14} />}
            onClick={() => {
              const draft = buildAssignmentQuestionDraft({ gradeId, subjectId });
              setQuestionItems((items) => [...items, draft]);
              setActiveQuestionKey(draft.clientKey);
            }}
          >
            添加题目
          </Button>
          <Popconfirm
            disabled={!questionSelectedKeys.length}
            title={`删除已选 ${questionSelectedKeys.length} 道题目？`}
            onConfirm={() => deleteQuestionItems(questionSelectedKeys)}
          >
            <Button danger disabled={!questionSelectedKeys.length} icon={<Trash2 size={14} />}>
              批量删除
            </Button>
          </Popconfirm>
        </Space>
      </div>
      {questionError ? <Alert showIcon message={questionError} type="error" /> : null}
      {questionNotice ? <Alert showIcon message={questionNotice} type="success" /> : null}
      {!questionItems.length ? (
        <Empty description="暂无题目" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : null}
      <div className={styles.stack}>
        {questionItems.map((item, index) => {
          const active = activeQuestionKey === item.clientKey;
          const preview =
            item.isDirty || item.isDraft
              ? buildQuestionPreviewDataFromModel(item.draftModel)
              : buildQuestionPreviewDataFromPayload(item.question);
          return (
            <div key={item.clientKey}>
              <div
                className={cx(
                  styles.dropZone,
                  questionDropIndex === index ? styles.dropZoneActive : undefined,
                )}
                onDragOver={(event) => {
                  if (!draggingQuestionKey) return;
                  event.preventDefault();
                  setQuestionDropIndex(index);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (draggingQuestionKey) void moveQuestionItem(draggingQuestionKey, index);
                  setDraggingQuestionKey(null);
                  setQuestionDropIndex(null);
                }}
              />
              <div
                className={cx(styles.questionCard, active ? styles.questionCardActive : undefined)}
                draggable={!questionSaving}
                onDragStart={(event) => handleQuestionDragStart(event, item.clientKey)}
                onDragEnd={() => {
                  setDraggingQuestionKey(null);
                  setQuestionDropIndex(null);
                }}
              >
                <div className={styles.questionCardHeader}>
                  <Space wrap>
                    <span className={styles.dragHandle} title="拖拽排序">
                      <GripVertical size={16} />
                    </span>
                    <Checkbox
                      checked={questionSelectedKeySet.has(item.clientKey)}
                      onChange={(event) =>
                        setQuestionSelectedKeys((keys) =>
                          event.target.checked
                            ? [...keys, item.clientKey]
                            : keys.filter((key) => key !== item.clientKey),
                        )
                      }
                    />
                    <strong>第 {index + 1} 题</strong>
                    <Tag bordered={false}>{preview.questionType}</Tag>
                    {item.scoreValue ? (
                      <span className={styles.muted}>分值 {item.scoreValue}</span>
                    ) : null}
                    {item.isDirty || item.isDraft ? <Tag color="gold">未保存</Tag> : null}
                  </Space>
                  <Space>
                    <Button
                      className={styles.secondary}
                      size="small"
                      onClick={() => setActiveQuestionKey(active ? null : item.clientKey)}
                    >
                      {active ? '收起编辑' : '编辑'}
                    </Button>
                    <Popconfirm
                      title="删除该题目？"
                      onConfirm={() => deleteQuestionItems([item.clientKey])}
                    >
                      <Button danger icon={<Trash2 size={14} />} size="small">
                        删除
                      </Button>
                    </Popconfirm>
                  </Space>
                </div>
                {active ? (
                  <div className={styles.inlineEditor}>
                    <div className={styles.editorGrid}>
                      <label>
                        <div className={styles.muted}>题目分值</div>
                        <Input
                          value={item.scoreValue}
                          onChange={(event) =>
                            updateQuestionItem(item.clientKey, (current) => ({
                              ...current,
                              isDirty: true,
                              scoreValue: event.target.value,
                            }))
                          }
                        />
                      </label>
                    </div>
                    <QuestionEditor
                      showRelationFields
                      lookups={lookups}
                      model={item.draftModel}
                      onChange={(nextModel) =>
                        updateQuestionItem(item.clientKey, (current) => ({
                          ...current,
                          draftModel: nextModel,
                          isDirty: true,
                        }))
                      }
                    />
                    <div className={styles.previewBox}>
                      <h4 className={styles.panelTitle}>实时预览</h4>
                      <QuestionMarkdownPreview
                        preview={buildQuestionPreviewDataFromModel(item.draftModel)}
                      />
                    </div>
                    <Space>
                      <Button
                        className={styles.primary}
                        icon={<Save size={14} />}
                        loading={questionSaving}
                        onClick={saveActiveQuestion}
                      >
                        保存题目
                      </Button>
                      <Button
                        className={styles.secondary}
                        onClick={() => setActiveQuestionKey(null)}
                      >
                        取消
                      </Button>
                    </Space>
                  </div>
                ) : (
                  <QuestionCompactPreview preview={preview} />
                )}
              </div>
            </div>
          );
        })}
        <div
          className={cx(
            styles.dropZone,
            questionDropIndex === questionItems.length ? styles.dropZoneActive : undefined,
          )}
          onDragOver={(event) => {
            if (!draggingQuestionKey) return;
            event.preventDefault();
            setQuestionDropIndex(questionItems.length);
          }}
          onDrop={(event) => {
            event.preventDefault();
            if (draggingQuestionKey)
              void moveQuestionItem(draggingQuestionKey, questionItems.length);
            setDraggingQuestionKey(null);
            setQuestionDropIndex(null);
          }}
        />
      </div>
      <div className={styles.footer}>
        <span>
          共 {questionItems.length} 道题，{dirtyQuestionCount} 道未保存。
        </span>
        <Button
          className={styles.secondary}
          disabled={!questionItems.length}
          icon={<Plus size={14} />}
          size="small"
          onClick={() => {
            const draft = buildAssignmentQuestionDraft({ gradeId, subjectId });
            setQuestionItems((items) => [...items, draft]);
            setActiveQuestionKey(draft.clientKey);
          }}
        >
          末尾插入
        </Button>
      </div>
    </div>
  );

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
            {
              children: displayNode(
                assignment.subject_name || detail.subject?.name || assignment.subject_id,
              ),
              label: '学科',
            },
            {
              children: displayNode(
                assignment.grade_name || detail.grade?.name || assignment.grade_id,
              ),
              label: '年级',
            },
            {
              children: formatCellValue(assignment.creation_type, {
                dataIndex: 'creation_type',
                isStatus: true,
                title: '来源',
              }),
              label: '来源',
            },
            { children: stringifyDetailValue(assignment.assign_date), label: '布置日期' },
            { children: stringifyDetailValue(assignment.due_date), label: '截止日期' },
            { children: stringifyDetailValue(assignment.created_at), label: '创建时间' },
          ]}
        />
      </div>

      <div className={styles.splitWorkspace}>
        {questionWorkspace}
        <div className={styles.stickyRail}>
          <ImageReferenceRail client={client} files={detail.files} />
        </div>
      </div>

      <div className={styles.panel}>
        <div className={styles.actionBar}>
          <div>
            <h3 className={styles.panelTitle}>发布对象</h3>
            <div className={styles.muted}>
              按班级一次性增加发布对象，也可以添加单个学生；支持勾选后批量移除。
            </div>
          </div>
          <Space wrap>
            <Select
              allowClear
              options={fieldOptions(
                { key: 'class_id', kind: 'select', label: '班级', optionsFrom: 'classes' },
                lookups,
              )}
              placeholder="选择班级"
              style={{ width: 180 }}
              value={selectedClassId || undefined}
              onChange={(value) => setSelectedClassId(value || '')}
            />
            <Select
              allowClear
              options={fieldOptions(
                { key: 'student_id', kind: 'select', label: '学生', optionsFrom: 'students' },
                lookups,
              )}
              placeholder="或选择单个学生"
              style={{ width: 180 }}
              value={selectedStudentId || undefined}
              onChange={(value) => setSelectedStudentId(value || '')}
            />
            <Button
              className={styles.secondary}
              disabled={!selectedClassId && !selectedStudentId}
              icon={<Plus size={14} />}
              loading={recipientBusy}
              onClick={addRecipients}
            >
              添加学生/班级
            </Button>
            <Popconfirm
              disabled={!recipientSelectedIds.length}
              title={`移除已选 ${recipientSelectedIds.length} 个发布对象？`}
              onConfirm={() => removeRecipients(recipientSelectedIds)}
            >
              <Button danger disabled={!recipientSelectedIds.length} icon={<Trash2 size={14} />}>
                批量移除
              </Button>
            </Popconfirm>
          </Space>
        </div>
        {recipientItems.length ? (
          <Table
            className={styles.tightTable}
            dataSource={recipientItems}
            pagination={false}
            rowKey={(row) => String(row.assignment_student_id || row.id || row.student_id)}
            size="small"
            columns={[
              {
                key: 'select',
                render: (_, row) => {
                  const id = Number(row.assignment_student_id || row.id || 0) || 0;
                  return (
                    <Checkbox
                      checked={recipientSelectedIdSet.has(id)}
                      onChange={(event) =>
                        setRecipientSelectedIds((ids) =>
                          event.target.checked ? [...ids, id] : ids.filter((entry) => entry !== id),
                        )
                      }
                    />
                  );
                },
                width: 52,
              },
              {
                dataIndex: 'student_name',
                key: 'student_name',
                render: (value, row) => displayNode(value || row.student_number || row.student_id),
                title: '学生',
              },
              {
                dataIndex: 'class_name',
                key: 'class_name',
                render: (value, row) => displayNode(value || row.class_id),
                title: '班级',
              },
              {
                dataIndex: 'status',
                key: 'status',
                render: (value) =>
                  formatCellValue(value, { dataIndex: 'status', isStatus: true, title: '状态' }),
                title: '状态',
              },
              {
                key: 'actions',
                render: (_, row: JsonRecord) => {
                  const id = Number(row.assignment_student_id || row.id || 0) || 0;
                  return (
                    <Popconfirm title="移除该发布对象？" onConfirm={() => removeRecipients([id])}>
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
        ) : (
          <Empty description="暂无发布对象" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        )}
      </div>
    </div>
  );
};

type SubmissionAssignmentQuestionCandidate = {
  assignmentQuestionId: number | null;
  orderIndex: number;
  question: JsonRecord | null;
  questionId: number;
  score: number | null;
};

type SubmissionDetailQuestionItem = {
  clientKey: string;
  feedback: string;
  isCorrectValue: string;
  isDirty: boolean;
  isDraft: boolean;
  maxScoreValue: string;
  orderIndex: number;
  question: JsonRecord | null;
  questionId: string;
  scoreValue: string;
  studentAnswer: string;
  subResults: JsonRecord[];
  submissionQuestionId: number | null;
};

const createSubmissionQuestionDraftKey = () =>
  `draft-submission-question-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const buildSubmissionCandidateMap = (assignmentQuestions: JsonRecord[]) => {
  const map = new Map<number, SubmissionAssignmentQuestionCandidate>();
  assignmentQuestions.forEach((row, index) => {
    const question = isJsonRecord(row.question)
      ? row.question
      : buildAssignmentQuestionPayload(
          row,
          String(row.grade_id || ''),
          String(row.subject_id || ''),
        );
    const questionId = Number(row.question_id || question.question_id || 0) || 0;
    if (!questionId) return;
    map.set(questionId, {
      assignmentQuestionId: Number(row.assignment_question_id || row.id || 0) || null,
      orderIndex: Number(row.order_index || index + 1) || index + 1,
      question,
      questionId,
      score: parseOptionalNumeric(row.score),
    });
  });
  return map;
};

const buildSubmissionQuestionItem = ({
  candidateByQuestionId,
  index,
  row,
}: {
  candidateByQuestionId: Map<number, SubmissionAssignmentQuestionCandidate>;
  index: number;
  row: JsonRecord;
}): SubmissionDetailQuestionItem => {
  const questionId =
    Number(row.question_id || (isJsonRecord(row.question) ? row.question.question_id : 0) || 0) ||
    0;
  const candidate = questionId ? candidateByQuestionId.get(questionId) || null : null;
  return {
    clientKey: `submission-question-${String(row.submission_question_id || row.id || index)}`,
    feedback: typeof row.feedback === 'string' ? row.feedback : '',
    isCorrectValue: row.is_correct === true ? 'true' : row.is_correct === false ? 'false' : '',
    isDirty: false,
    isDraft: false,
    maxScoreValue:
      row.max_score === undefined || row.max_score === null ? '' : String(row.max_score),
    orderIndex: Number(row.order_index || index + 1) || index + 1,
    question: isJsonRecord(row.question) ? row.question : candidate?.question || null,
    questionId: questionId ? String(questionId) : '',
    scoreValue: row.score === undefined || row.score === null ? '' : String(row.score),
    studentAnswer: typeof row.student_answer === 'string' ? row.student_answer : '',
    subResults: readRecordArray(row.sub_results),
    submissionQuestionId: Number(row.submission_question_id || row.id || 0) || null,
  };
};

const buildSubmissionQuestionDraft = (): SubmissionDetailQuestionItem => ({
  clientKey: createSubmissionQuestionDraftKey(),
  feedback: '',
  isCorrectValue: '',
  isDirty: true,
  isDraft: true,
  maxScoreValue: '',
  orderIndex: 1,
  question: null,
  questionId: '',
  scoreValue: '',
  studentAnswer: '',
  subResults: [],
  submissionQuestionId: null,
});

const submissionSubResultStatus = (row: JsonRecord) => {
  if (row.is_correct === true) return '正确';
  if (row.is_correct === false) return '待改进';
  const score = parseOptionalNumeric(row.score);
  const maxScore = parseOptionalNumeric(row.max_score);
  if (score !== null && maxScore !== null && maxScore > 0)
    return score < maxScore ? '待改进' : '正确';
  return '未设置';
};

const SubmissionSubResultPreview = ({
  referencePreview,
  subResults,
}: {
  referencePreview: QuestionPreviewData | null;
  subResults: JsonRecord[];
}) => {
  if (!subResults.length) return null;
  const referenceById = new Map(
    referencePreview?.subQuestions.map((item) => [item.id, item]) || [],
  );
  return (
    <div className={styles.previewBox}>
      <h4 className={styles.panelTitle}>小问批改结果</h4>
      <div className={styles.stack}>
        {subResults.map((row, index) => {
          const subQuestionId = String(row.sub_question_id || '').trim();
          const subQuestionIndex = Number(row.sub_question_index || index + 1) || index + 1;
          const reference = referenceById.get(subQuestionId) || null;
          return (
            <div className={styles.questionCard} key={subQuestionId || `sub-result-${index}`}>
              <Space wrap>
                <strong>小问 {subQuestionIndex}</strong>
                <Tag bordered={false}>{submissionSubResultStatus(row)}</Tag>
                {row.score !== undefined || row.max_score !== undefined ? (
                  <span className={styles.muted}>
                    得分 {displayNode(row.score)} / {displayNode(row.max_score)}
                  </span>
                ) : null}
                {row.error_type ? (
                  <span className={styles.muted}>{String(row.error_type)}</span>
                ) : null}
              </Space>
              {reference?.prompt ? (
                <div className={styles.previewBox} style={{ marginTop: 8 }}>
                  <div className={styles.muted}>题干</div>
                  <MarkdownPreview content={reference.prompt} empty="暂无小问题干" />
                </div>
              ) : null}
              <div className={styles.previewBox} style={{ marginTop: 8 }}>
                <div className={styles.muted}>学生作答</div>
                <MarkdownPreview
                  content={typeof row.student_answer === 'string' ? row.student_answer : ''}
                  empty="暂无学生作答"
                />
              </div>
              {reference?.answerText ? (
                <div className={styles.previewBox} style={{ marginTop: 8 }}>
                  <div className={styles.muted}>参考答案</div>
                  <MarkdownPreview content={reference.answerText} empty="暂无参考答案" />
                </div>
              ) : null}
              {row.feedback ? (
                <div className={styles.previewBox} style={{ marginTop: 8 }}>
                  <div className={styles.muted}>批改反馈</div>
                  <MarkdownPreview content={String(row.feedback)} empty="暂无批改反馈" />
                </div>
              ) : null}
              {reference?.thinking ? (
                <div className={styles.previewBox} style={{ marginTop: 8 }}>
                  <div className={styles.muted}>参考思路</div>
                  <MarkdownPreview content={reference.thinking} empty="暂无参考思路" />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
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
  onReload: () => Promise<void> | void;
}) => {
  const submission = hydrateLookupLabels(detail.submission, lookups);
  const submissionId = Number(submission.submission_id || submission.id || 0) || 0;
  const assignmentQuestions = useMemo(
    () => readRecordArray(detail.assignment_questions),
    [detail.assignment_questions],
  );
  const candidateByQuestionId = useMemo(
    () => buildSubmissionCandidateMap(assignmentQuestions),
    [assignmentQuestions],
  );
  const [questionItems, setQuestionItems] = useState<SubmissionDetailQuestionItem[]>(() =>
    readRecordArray(detail.questions).map((row, index) =>
      buildSubmissionQuestionItem({ candidateByQuestionId, index, row }),
    ),
  );
  const [activeQuestionKey, setActiveQuestionKey] = useState<string | null>(null);
  const [questionSelectedKeys, setQuestionSelectedKeys] = useState<string[]>([]);
  const [questionSaving, setQuestionSaving] = useState(false);
  const [questionError, setQuestionError] = useState<string | null>(null);
  const [questionNotice, setQuestionNotice] = useState<string | null>(null);
  const [draggingQuestionKey, setDraggingQuestionKey] = useState<string | null>(null);
  const [questionDropIndex, setQuestionDropIndex] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [binding, setBinding] = useState(String(submission.assignment_student_id || ''));

  useEffect(() => {
    setQuestionItems(
      readRecordArray(detail.questions).map((row, index) =>
        buildSubmissionQuestionItem({ candidateByQuestionId, index, row }),
      ),
    );
    setActiveQuestionKey(null);
    setQuestionSelectedKeys([]);
    setQuestionError(null);
    setQuestionNotice(null);
  }, [candidateByQuestionId, detail.questions]);

  const questionSelectedKeySet = useMemo(
    () => new Set(questionSelectedKeys),
    [questionSelectedKeys],
  );
  const candidateOptions = useMemo(
    () =>
      assignmentQuestions
        .map((row, index) => {
          const question = isJsonRecord(row.question)
            ? row.question
            : buildAssignmentQuestionPayload(
                row,
                String(row.grade_id || ''),
                String(row.subject_id || ''),
              );
          const questionId = Number(row.question_id || question.question_id || 0) || 0;
          if (!questionId) return null;
          const preview = buildQuestionPreviewDataFromPayload(question);
          const orderIndex = Number(row.order_index || index + 1) || index + 1;
          return {
            label: `第 ${orderIndex} 题 · ${preview.summaryMarkdown.replaceAll(/\s+/g, ' ').slice(0, 80)}`,
            value: String(questionId),
          };
        })
        .filter((entry): entry is { label: string; value: string } => Boolean(entry)),
    [assignmentQuestions],
  );

  const runAction = async (action: string, params: JsonRecord) => {
    setBusy(true);
    try {
      await client.invokeAction(action, params);
      message.success('后台任务已提交');
      void onReload();
    } finally {
      setBusy(false);
    }
  };

  const updateQuestionItem = (
    clientKey: string,
    updater: (item: SubmissionDetailQuestionItem) => SubmissionDetailQuestionItem,
  ) => {
    setQuestionItems((items) =>
      items.map((item) => (item.clientKey === clientKey ? updater(item) : item)),
    );
    setQuestionError(null);
    setQuestionNotice(null);
  };

  const updateQuestionBinding = (clientKey: string, questionIdValue: string) => {
    const questionId = Number(questionIdValue || 0) || 0;
    const candidate = questionId ? candidateByQuestionId.get(questionId) || null : null;
    updateQuestionItem(clientKey, (item) => ({
      ...item,
      isDirty: true,
      maxScoreValue:
        item.maxScoreValue || (candidate?.score == null ? '' : String(candidate.score)),
      question: candidate?.question || null,
      questionId: questionIdValue,
    }));
  };

  const syncQuestionOrder = async (items: SubmissionDetailQuestionItem[]) => {
    await Promise.all(
      items.map((item, index) =>
        item.submissionQuestionId && !item.isDraft
          ? client.updateResource('submission-questions', item.submissionQuestionId, {
              order_index: index + 1,
            })
          : Promise.resolve(null),
      ),
    );
  };

  const moveQuestionItem = async (clientKey: string, targetIndex: number) => {
    const sourceIndex = questionItems.findIndex((item) => item.clientKey === clientKey);
    if (sourceIndex < 0) return;
    const next = [...questionItems];
    const [moving] = next.splice(sourceIndex, 1);
    let insertIndex = targetIndex;
    if (sourceIndex < targetIndex) insertIndex -= 1;
    next.splice(Math.max(0, Math.min(insertIndex, next.length)), 0, moving);
    const reindexed = next.map((item, index) => ({ ...item, orderIndex: index + 1 }));
    setQuestionItems(reindexed);
    setQuestionSaving(true);
    try {
      await syncQuestionOrder(reindexed);
      setQuestionNotice('题目顺序已更新。');
      void onReload();
    } catch (reason) {
      setQuestionError(`排序同步失败：${asError(reason)}`);
    } finally {
      setQuestionSaving(false);
    }
  };

  const saveActiveQuestion = async () => {
    if (!submissionId || !activeQuestionKey) return;
    const index = questionItems.findIndex((item) => item.clientKey === activeQuestionKey);
    const current = questionItems[index];
    if (!current || questionSaving) return;
    const questionId = Number(current.questionId || 0) || 0;
    if (!questionId) {
      setQuestionError('保存前请先绑定当前作业中的一道题目。');
      return;
    }
    if (!candidateByQuestionId.has(questionId)) {
      setQuestionError('只能绑定到当前作业范围内的题目。');
      return;
    }

    const payload: JsonRecord = {
      feedback: current.feedback,
      is_correct: current.isCorrectValue === '' ? null : current.isCorrectValue === 'true',
      max_score: current.maxScoreValue.trim() ? Number(current.maxScoreValue) : null,
      order_index: index + 1,
      question_id: questionId,
      score: current.scoreValue.trim() ? Number(current.scoreValue) : null,
      student_answer: current.studentAnswer,
      submission_id: submissionId,
    };

    setQuestionSaving(true);
    setQuestionError(null);
    setQuestionNotice(null);
    try {
      if (current.isDraft) {
        const created = await client.createResource('submission-questions', payload);
        const saved = buildSubmissionQuestionItem({
          candidateByQuestionId,
          index,
          row: created.item,
        });
        setQuestionItems((items) =>
          items.map((item) => (item.clientKey === current.clientKey ? saved : item)),
        );
        setActiveQuestionKey(saved.clientKey);
      } else if (current.submissionQuestionId) {
        const updated = await client.updateResource(
          'submission-questions',
          current.submissionQuestionId,
          payload,
        );
        const saved = buildSubmissionQuestionItem({
          candidateByQuestionId,
          index,
          row: updated.item,
        });
        setQuestionItems((items) =>
          items.map((item) => (item.clientKey === current.clientKey ? saved : item)),
        );
        setActiveQuestionKey(saved.clientKey);
      }
      setQuestionNotice('题目作答与批改结果已保存。');
      void onReload();
    } catch (reason) {
      setQuestionError(asError(reason));
    } finally {
      setQuestionSaving(false);
    }
  };

  const deleteQuestionItems = async (clientKeys: string[]) => {
    const targets = questionItems.filter((item) => clientKeys.includes(item.clientKey));
    if (!targets.length) return;
    setQuestionSaving(true);
    try {
      for (const item of targets) {
        if (item.submissionQuestionId)
          await client.deleteResource('submission-questions', item.submissionQuestionId);
      }
      setQuestionItems((items) => items.filter((item) => !clientKeys.includes(item.clientKey)));
      setQuestionSelectedKeys((keys) => keys.filter((key) => !clientKeys.includes(key)));
      if (activeQuestionKey && clientKeys.includes(activeQuestionKey)) setActiveQuestionKey(null);
      setQuestionNotice(`已删除 ${targets.length} 条题目结果。`);
      void onReload();
    } catch (reason) {
      setQuestionError(asError(reason));
    } finally {
      setQuestionSaving(false);
    }
  };

  const handleQuestionDragStart = (event: DragEvent<HTMLDivElement>, clientKey: string) => {
    setDraggingQuestionKey(clientKey);
    setQuestionDropIndex(null);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', clientKey);
  };

  const report = detail.report;
  const reportObjectKey = report?.object_key || '';

  const questionWorkspace = (
    <div className={styles.panel}>
      <div className={styles.actionBar}>
        <div>
          <h3 className={styles.panelTitle}>题目工作区</h3>
          <div className={styles.muted}>
            左侧维护题目、学生作答、批改结果与讲评反馈；右侧保留原始图片对照。
          </div>
        </div>
        <Space wrap>
          <Button
            className={styles.secondary}
            icon={<Plus size={14} />}
            onClick={() => {
              const draft = {
                ...buildSubmissionQuestionDraft(),
                orderIndex: questionItems.length + 1,
              };
              setQuestionItems((items) => [...items, draft]);
              setActiveQuestionKey(draft.clientKey);
            }}
          >
            添加题目结果
          </Button>
          <Popconfirm
            disabled={!questionSelectedKeys.length}
            title={`删除已选 ${questionSelectedKeys.length} 条题目结果？`}
            onConfirm={() => deleteQuestionItems(questionSelectedKeys)}
          >
            <Button danger disabled={!questionSelectedKeys.length} icon={<Trash2 size={14} />}>
              批量删除
            </Button>
          </Popconfirm>
        </Space>
      </div>
      {questionError ? <Alert showIcon message={questionError} type="error" /> : null}
      {questionNotice ? <Alert showIcon message={questionNotice} type="success" /> : null}
      {!questionItems.length ? (
        <Empty description="暂无题目结果" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : null}
      <div className={styles.stack}>
        {questionItems.map((item, index) => {
          const active = activeQuestionKey === item.clientKey;
          const referencePreview = item.question
            ? buildQuestionPreviewDataFromPayload(item.question)
            : null;
          return (
            <div key={item.clientKey}>
              <div
                className={cx(
                  styles.dropZone,
                  questionDropIndex === index ? styles.dropZoneActive : undefined,
                )}
                onDragOver={(event) => {
                  if (!draggingQuestionKey) return;
                  event.preventDefault();
                  setQuestionDropIndex(index);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (draggingQuestionKey) void moveQuestionItem(draggingQuestionKey, index);
                  setDraggingQuestionKey(null);
                  setQuestionDropIndex(null);
                }}
              />
              <div
                className={cx(styles.questionCard, active ? styles.questionCardActive : undefined)}
                draggable={!questionSaving}
                onDragStart={(event) => handleQuestionDragStart(event, item.clientKey)}
                onDragEnd={() => {
                  setDraggingQuestionKey(null);
                  setQuestionDropIndex(null);
                }}
              >
                <div className={styles.questionCardHeader}>
                  <Space wrap>
                    <span className={styles.dragHandle} title="拖拽排序">
                      <GripVertical size={16} />
                    </span>
                    <Checkbox
                      checked={questionSelectedKeySet.has(item.clientKey)}
                      onChange={(event) =>
                        setQuestionSelectedKeys((keys) =>
                          event.target.checked
                            ? [...keys, item.clientKey]
                            : keys.filter((key) => key !== item.clientKey),
                        )
                      }
                    />
                    <strong>第 {index + 1} 题</strong>
                    {item.scoreValue || item.maxScoreValue ? (
                      <span className={styles.muted}>
                        得分 {item.scoreValue || '--'} / {item.maxScoreValue || '--'}
                      </span>
                    ) : null}
                    {item.isCorrectValue ? (
                      <Tag
                        bordered={false}
                        color={item.isCorrectValue === 'true' ? 'green' : 'gold'}
                      >
                        {item.isCorrectValue === 'true' ? '正确' : '待改进'}
                      </Tag>
                    ) : null}
                    {item.isDirty || item.isDraft ? <Tag color="gold">未保存</Tag> : null}
                  </Space>
                  <Space>
                    <Button
                      className={styles.secondary}
                      size="small"
                      onClick={() => setActiveQuestionKey(active ? null : item.clientKey)}
                    >
                      {active ? '收起编辑' : '编辑'}
                    </Button>
                    <Popconfirm
                      title="删除该题目结果？"
                      onConfirm={() => deleteQuestionItems([item.clientKey])}
                    >
                      <Button danger icon={<Trash2 size={14} />} size="small">
                        删除
                      </Button>
                    </Popconfirm>
                  </Space>
                </div>

                {active ? (
                  <div className={styles.inlineEditor}>
                    <label>
                      <div className={styles.muted}>绑定题目</div>
                      <Select
                        options={candidateOptions}
                        placeholder="选择当前作业题目"
                        style={{ width: '100%' }}
                        value={item.questionId || undefined}
                        onChange={(value) => updateQuestionBinding(item.clientKey, value || '')}
                      />
                    </label>
                    {item.question ? (
                      <div className={styles.previewBox}>
                        <h4 className={styles.panelTitle}>题目</h4>
                        <QuestionCompactPreview
                          preview={buildQuestionPreviewDataFromPayload(item.question)}
                        />
                      </div>
                    ) : null}
                    <div className={styles.previewBox}>
                      <h4 className={styles.panelTitle}>学生作答</h4>
                      <Input.TextArea
                        rows={4}
                        value={item.studentAnswer}
                        onChange={(event) =>
                          updateQuestionItem(item.clientKey, (current) => ({
                            ...current,
                            isDirty: true,
                            studentAnswer: event.target.value,
                          }))
                        }
                      />
                      <div style={{ marginTop: 10 }}>
                        <MarkdownPreview content={item.studentAnswer} empty="暂无学生作答" />
                      </div>
                    </div>
                    <div className={styles.editorGrid}>
                      <label>
                        <div className={styles.muted}>得分</div>
                        <Input
                          value={item.scoreValue}
                          onChange={(event) =>
                            updateQuestionItem(item.clientKey, (current) => ({
                              ...current,
                              isDirty: true,
                              scoreValue: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <label>
                        <div className={styles.muted}>满分</div>
                        <Input
                          value={item.maxScoreValue}
                          onChange={(event) =>
                            updateQuestionItem(item.clientKey, (current) => ({
                              ...current,
                              isDirty: true,
                              maxScoreValue: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <label>
                        <div className={styles.muted}>正确性</div>
                        <Select
                          value={item.isCorrectValue}
                          options={[
                            { label: '未设置', value: '' },
                            { label: '正确', value: 'true' },
                            { label: '错误', value: 'false' },
                          ]}
                          onChange={(value) =>
                            updateQuestionItem(item.clientKey, (current) => ({
                              ...current,
                              isCorrectValue: value,
                              isDirty: true,
                            }))
                          }
                        />
                      </label>
                    </div>
                    <div className={styles.previewBox}>
                      <h4 className={styles.panelTitle}>讲评反馈</h4>
                      <Input.TextArea
                        rows={3}
                        value={item.feedback}
                        onChange={(event) =>
                          updateQuestionItem(item.clientKey, (current) => ({
                            ...current,
                            feedback: event.target.value,
                            isDirty: true,
                          }))
                        }
                      />
                      <div style={{ marginTop: 10 }}>
                        <MarkdownPreview content={item.feedback} empty="暂无讲评反馈" />
                      </div>
                    </div>
                    <SubmissionSubResultPreview
                      referencePreview={
                        item.question ? buildQuestionPreviewDataFromPayload(item.question) : null
                      }
                      subResults={item.subResults}
                    />
                    <Space>
                      <Button
                        className={styles.primary}
                        icon={<Save size={14} />}
                        loading={questionSaving}
                        onClick={saveActiveQuestion}
                      >
                        保存题目结果
                      </Button>
                      <Button
                        className={styles.secondary}
                        onClick={() => setActiveQuestionKey(null)}
                      >
                        取消
                      </Button>
                    </Space>
                  </div>
                ) : (
                  <div className={styles.stack}>
                    {referencePreview ? (
                      <div className={styles.previewBox}>
                        <h4 className={styles.panelTitle}>题目</h4>
                        <QuestionCompactPreview preview={referencePreview} />
                      </div>
                    ) : null}
                    <div className={styles.previewBox}>
                      <h4 className={styles.panelTitle}>学生作答</h4>
                      <MarkdownPreview content={item.studentAnswer} empty="暂无学生作答" />
                    </div>
                    <div className={styles.previewBox}>
                      <h4 className={styles.panelTitle}>讲评反馈</h4>
                      <MarkdownPreview content={item.feedback} empty="暂无讲评反馈" />
                    </div>
                    <SubmissionSubResultPreview
                      referencePreview={referencePreview}
                      subResults={item.subResults}
                    />
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div
          className={cx(
            styles.dropZone,
            questionDropIndex === questionItems.length ? styles.dropZoneActive : undefined,
          )}
          onDragOver={(event) => {
            if (!draggingQuestionKey) return;
            event.preventDefault();
            setQuestionDropIndex(questionItems.length);
          }}
          onDrop={(event) => {
            event.preventDefault();
            if (draggingQuestionKey)
              void moveQuestionItem(draggingQuestionKey, questionItems.length);
            setDraggingQuestionKey(null);
            setQuestionDropIndex(null);
          }}
        />
      </div>
    </div>
  );

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
            {
              children: displayNode(
                detail.assignment?.title || submission.assignment_title || submission.assignment_id,
              ),
              label: '作业',
            },
            {
              children: displayNode(
                detail.student?.name || submission.student_name || submission.student_id,
              ),
              label: '学生',
            },
            {
              children: formatCellValue(submission.status, {
                dataIndex: 'status',
                isStatus: true,
                title: '状态',
              }),
              label: '状态',
            },
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
              void onReload();
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
              onClick={() =>
                runAction('submission.report.generate', {
                  force: true,
                  submission_id: submissionId,
                })
              }
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
            {
              children: report?.status
                ? formatCellValue(report.status, {
                    dataIndex: 'status',
                    isStatus: true,
                    title: '状态',
                  })
                : '--',
              label: '状态',
            },
            { children: report?.name || report?.object_key || '--', label: '文件' },
            { children: report?.generated_at || '--', label: '生成时间' },
            { children: report?.error || '--', label: '错误' },
          ]}
        />
      </div>

      <div className={styles.splitWorkspace}>
        {questionWorkspace}
        <div className={styles.stickyRail}>
          <ImageReferenceRail client={client} files={detail.files} />
        </div>
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
            {
              children: displayNode(
                detail.classroom?.name || student.class_name || student.class_id,
              ),
              label: '班级',
            },
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
                  {
                    dataIndex: 'status',
                    key: 'status',
                    render: (value) =>
                      formatCellValue(value, {
                        dataIndex: 'status',
                        isStatus: true,
                        title: '状态',
                      }),
                    title: '状态',
                  },
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
      <DetailHeader
        subtitle="使用插件 UI 的 durable action 创建草稿并发布。"
        title="手动创建作业"
        onBack={onBack}
      />
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
                  questions: safeJsonParse(values.questions_json || '{"questions":[]}', {
                    questions: [],
                  }),
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
              <Select
                options={fieldOptions(
                  { key: 'subject_id', kind: 'select', label: '学科', optionsFrom: 'subjects' },
                  lookups,
                )}
              />
            </Form.Item>
            <Form.Item label="年级" name="grade_id" rules={[{ required: true }]}>
              <Select
                options={fieldOptions(
                  { key: 'grade_id', kind: 'select', label: '年级', optionsFrom: 'grades' },
                  lookups,
                )}
              />
            </Form.Item>
          </div>
          <Form.Item
            extra="保留插件 UI 的 JSON 草稿入口，可粘贴 questions 数组。"
            label="题目 JSON"
            name="questions_json"
          >
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
      <DetailHeader
        subtitle="上传图片后复用插件 UI 的 OCR durable action。"
        title={title}
        onBack={onBack}
      />
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
                      pages_per_student: values.pages_per_student
                        ? Number(values.pages_per_student)
                        : undefined,
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
          <Button
            className={styles.primary}
            htmlType="submit"
            icon={<FileScan size={14} />}
            loading={busy}
          >
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
          <Select
            allowClear
            options={fieldOptions(
              { key: 'subject_id', kind: 'select', label: '学科', optionsFrom: 'subjects' },
              lookups,
            )}
          />
        </Form.Item>
        <Form.Item label="年级" name="grade_id">
          <Select
            allowClear
            options={fieldOptions(
              { key: 'grade_id', kind: 'select', label: '年级', optionsFrom: 'grades' },
              lookups,
            )}
          />
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
  const currentRoute = useMemo(
    () => parseWorkbenchRoute(routeQuery, activeTab),
    [activeTab, routeQuery],
  );

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
    if (
      currentRoute.kind !== 'list' &&
      currentRoute.kind !== 'dashboard' &&
      currentRoute.kind !== 'ops'
    ) {
      return;
    }
    setLoading(true);
    try {
      if (
        currentRoute.kind === 'dashboard' ||
        currentRoute.kind === 'ops' ||
        !activeConfig.resource
      ) {
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
        setDetail({
          detail: payload,
          item: hydrateLookupLabels(payload.assignment, lookups),
          kind: 'assignment',
        });
      } else if (currentRoute.resource === 'submissions') {
        const payload = await askCoreWorkbenchClient.getSubmissionDetail(currentRoute.entityId);
        setDetail({
          detail: payload,
          item: hydrateLookupLabels(payload.submission, lookups),
          kind: 'submission',
        });
      } else if (currentRoute.resource === 'students') {
        const payload = await askCoreWorkbenchClient.getStudentDetail(currentRoute.entityId);
        setDetail({
          detail: payload,
          item: hydrateLookupLabels(payload.student, lookups),
          kind: 'student',
        });
      } else {
        const payload = await askCoreWorkbenchClient.getResource(
          currentRoute.resource,
          currentRoute.entityId,
        );
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
            <Button
              className={styles.secondary}
              icon={<RefreshCw size={14} />}
              onClick={reloadListOrDashboard}
            >
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
        ellipsis: resource === 'questions' && column.dataIndex === 'content' ? false : true,
        key: column.displayIndex || column.dataIndex,
        render: (_value: unknown, row: AskCoreWorkbenchRecord) => {
          if (resource === 'questions' && column.dataIndex === 'content') {
            return (
              <div className={styles.questionPreviewCell}>
                <QuestionSummaryPreview preview={buildQuestionPreviewDataFromPayload(row)} />
              </div>
            );
          }
          const primary = column.displayIndex
            ? row[column.displayIndex] || row[column.dataIndex]
            : row[column.dataIndex];
          const secondary = column.displayIndex
            ? row[column.dataIndex]
            : column.secondaryIndex
              ? row[column.secondaryIndex]
              : undefined;
          return (
            <span>
              {formatCellValue(primary, column)}
              {secondary && primary !== secondary ? (
                <span className={styles.muted}> #{String(secondary)}</span>
              ) : null}
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
              navigate(
                routeFor(resource as AskCoreWorkbenchTab, buildResourceEntityPath(resource, id)),
              );
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
                  onChange={(value) =>
                    setFilterForm((current) => ({ ...current, [field.key]: value || '' }))
                  }
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
            <Button
              className={styles.secondary}
              onClick={() => {
                setPage(1);
                void reloadListOrDashboard();
              }}
            >
              筛选
            </Button>
          </div>
          <Space wrap>
            {resource === 'assignments' ? (
              <>
                <Button
                  className={styles.secondary}
                  onClick={() => navigate(routeFor('assignments', '/assignments/new/ocr'))}
                >
                  OCR 创建
                </Button>
                <Button
                  className={styles.primary}
                  icon={<Plus size={14} />}
                  onClick={() => navigate(routeFor('assignments', '/assignments/new/manual'))}
                >
                  手动创建
                </Button>
              </>
            ) : resource === 'submissions' ? (
              <Button
                className={styles.primary}
                icon={<FileScan size={14} />}
                onClick={() => navigate(routeFor('submissions', '/submissions/new/ocr'))}
              >
                OCR 录入
              </Button>
            ) : (
              <Button
                className={styles.primary}
                icon={<Plus size={14} />}
                onClick={() =>
                  navigate(
                    routeFor(
                      resource as AskCoreWorkbenchTab,
                      `${buildResourceBasePath(resource)}/new`,
                    ),
                  )
                }
              >
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
                  const result =
                    await askCoreWorkbenchClient.downloadSubmissionReportsZip(selectedIds);
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
                if (id)
                  navigate(
                    routeFor(
                      resource as AskCoreWorkbenchTab,
                      buildResourceEntityPath(resource, id),
                    ),
                  );
              },
            })}
          />
        </div>

        <div className={styles.footer}>
          <span>
            共 {list?.total ?? filteredItems.length} 条，当前第 {page} 页。
          </span>
          <Space>
            <Button
              className={styles.secondary}
              disabled={page <= 1}
              size="small"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              上一页
            </Button>
            <Button
              className={styles.secondary}
              disabled={!list?.has_more && page * PAGE_SIZE >= (list?.total || 0)}
              size="small"
              onClick={() => setPage((current) => current + 1)}
            >
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
        subtitle={
          mode === 'create'
            ? RESOURCE_LABELS[resource].description
            : `编辑 ${getRecordTitle(resource, detail?.item || {})}`
        }
        title={
          mode === 'create'
            ? `新建${RESOURCE_LABELS[resource].singular}`
            : `编辑${RESOURCE_LABELS[resource].singular}`
        }
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
              navigate(
                routeFor(
                  resource as AskCoreWorkbenchTab,
                  id ? buildResourceEntityPath(resource, id) : buildResourceBasePath(resource),
                ),
              );
            } else if (currentRoute.kind === 'edit') {
              await askCoreWorkbenchClient.updateResource(resource, currentRoute.entityId, payload);
              message.success('保存成功');
              navigate(
                routeFor(
                  resource as AskCoreWorkbenchTab,
                  buildResourceEntityPath(resource, currentRoute.entityId),
                ),
              );
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
      return (
        <AssignmentManualCreateView
          client={askCoreWorkbenchClient}
          lookups={lookups}
          onBack={backToList}
        />
      );
    }
    if (currentRoute.kind === 'assignment-ocr') {
      return (
        <AssignmentOcrCreateView
          client={askCoreWorkbenchClient}
          lookups={lookups}
          onBack={backToList}
        />
      );
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
