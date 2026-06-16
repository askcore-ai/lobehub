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
  Modal,
  Popconfirm,
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
  Building2,
  Download,
  ExternalLink,
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
  type Dispatch,
  type DragEvent,
  type Key,
  memo,
  type ReactNode,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import type { AskCoreWorkbenchApiClient, BlobDownloadProgress } from './api';
import {
  askCoreWorkbenchClient,
  emptyAskCoreWorkbenchDashboard,
  emptyAskCoreWorkbenchList,
  isAskCoreWorkbenchDeleteNotFound,
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
  mergeResourceItems,
  RESOURCE_FILTER_FIELDS,
  RESOURCE_FORM_FIELDS,
  RESOURCE_LABELS,
  toFormState,
} from './resourceMeta';
import {
  type AskCoreOrganizationState,
  type AskCoreWorkbenchColumn,
  type AskCoreWorkbenchDashboardPayload,
  type AskCoreWorkbenchListPayload,
  type AskCoreWorkbenchRecord,
  type AskCoreWorkbenchTab,
  type AssignmentDetailResponse,
  type FileDescriptor,
  type JsonRecord,
  type PluginArtifact,
  type PluginInvocation,
  type PrinterDevice,
  type ResourceKey,
  type RunState,
  type ScannerDevice,
  type StudentDetailResponse,
  type SubmissionDetailResponse,
} from './types';
import {
  askCoreWorkbenchTabFromRoute,
  buildAskCoreWorkbenchUrl,
  normalizeAskCoreWorkbenchTab,
} from './utils';

const PAGE_SIZE = 100;
const OCR_INPUT_MODE_OPTIONS: Array<{ label: string; value: 'scan' | 'upload' }> = [
  { label: '上传图片', value: 'upload' },
  { label: '调用扫描仪', value: 'scan' },
];
const OCR_SCAN_MEDIA_OPTIONS = ['A3', 'A4', 'B4', 'B5'] as const;
const PERSONALIZED_QUESTION_COUNT_DEFAULT = 3;
const PERSONALIZED_QUESTION_COUNT_MIN = 1;
const PERSONALIZED_QUESTION_COUNT_MAX = 10;
const DEFAULT_PROVINCE_LABEL = '未设置省份';
const DEFAULT_CITY_LABEL = '未设置城市';
const DEFAULT_SCHOOL_LABEL = '未命名学校';
const DEFAULT_CLASS_LABEL = '未命名班级';
const DEFAULT_STUDENT_LABEL = '未命名学生';
const TERMINAL_INVOCATION_STATES = new Set(['cancelled', 'failed', 'succeeded']);

export const SUBMISSION_OCR_LAYOUT_BREAKPOINTS = {
  compactPageMaxWidth: 900,
  controlSingleColumnMaxWidth: 980,
  minimumUsableWidth: 420,
  splitWorkspaceStackMaxWidth: 1440,
} as const;

export const RESOURCE_LIST_LAYOUT = {
  cardFlexBasis: 'clamp(280px, 32vw, 420px)',
  flow: 'horizontal',
  mobileCardFlexBasis: 'min(86vw, 360px)',
  overflowAxis: 'x',
} as const;

const lookupResources: Array<keyof LookupCollections> = [
  'teachers',
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
    min-width: 0;
    padding-block: 16px 32px;
    padding-inline: clamp(14px, 2vw, 32px);

    @media (width <= 900px) {
      padding-block: 12px 24px;
      padding-inline: 12px;
    }
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
  assignmentSelectOption: css`
    display: flex;
    flex-direction: column;
    gap: 3px;

    min-width: 0;
    padding-block: 3px;
  `,
  assignmentSelectOptionMeta: css`
    font-size: 12px;
    line-height: 1.4;
    color: ${cssVar.colorTextDescription};
    overflow-wrap: anywhere;
  `,
  assignmentSelectOptionTitle: css`
    font-size: 13px;
    font-weight: 600;
    line-height: 1.45;
    color: ${cssVar.colorText};
    overflow-wrap: anywhere;
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
    min-width: 0;
    padding: 18px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 8px;

    background: ${cssVar.colorBgContainer};

    @media (width <= 900px) {
      padding: 14px;
    }
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
  organizationAction: css`
    display: flex;
    flex-shrink: 0;
    gap: 8px;
    align-items: center;
  `,
  organizationBanner: css`
    display: flex;
    flex-wrap: wrap;
    gap: 18px;
    align-items: center;
    justify-content: space-between;

    padding-block: 20px;
    padding-inline: 22px;
    border: 1px solid ${cssVar.colorPrimaryBorder};
    border-radius: 8px;

    background: linear-gradient(
      135deg,
      ${cssVar.colorBgContainer} 0%,
      ${cssVar.colorPrimaryBg} 100%
    );
    box-shadow: 0 10px 28px rgb(0 0 0 / 4%);
  `,
  organizationContent: css`
    display: flex;
    gap: 14px;
    align-items: center;
    min-width: 0;
  `,
  organizationIcon: css`
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;

    width: 44px;
    height: 44px;
    border: 1px solid ${cssVar.colorPrimaryBorder};
    border-radius: 8px;

    color: ${cssVar.colorPrimary};

    background: ${cssVar.colorBgContainer};
  `,
  organizationKicker: css`
    margin-block-end: 4px;
    font-size: 12px;
    font-weight: 600;
    color: ${cssVar.colorTextSecondary};
  `,
  organizationMeta: css`
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;

    margin-block-start: 8px;

    font-size: 13px;
    color: ${cssVar.colorTextSecondary};
  `,
  organizationName: css`
    margin: 0;

    font-size: clamp(24px, 3vw, 34px);
    font-weight: 720;
    line-height: 1.1;
    color: ${cssVar.colorText};
    overflow-wrap: anywhere;
  `,
  page: css`
    overflow: auto;
    min-width: ${SUBMISSION_OCR_LAYOUT_BREAKPOINTS.minimumUsableWidth}px;
    height: 100%;
    background: ${cssVar.colorBgLayout};
  `,
  panel: css`
    min-width: 0;
    padding: 16px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 8px;

    background: ${cssVar.colorBgContainer};
  `,
  progressFill: css`
    height: 100%;
    border-radius: inherit;
    background: ${cssVar.colorText};
    transition: width 0.2s ease;
  `,
  progressRail: css`
    overflow: hidden;
    height: 8px;
    border-radius: 999px;
    background: ${cssVar.colorFillSecondary};
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
  submissionOcrFieldGrid: css`
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr));
    gap: 18px 10px;
    align-items: start;

    > .ant-form-item {
      min-width: 0;
    }

    @container (width <= ${SUBMISSION_OCR_LAYOUT_BREAKPOINTS.controlSingleColumnMaxWidth}px) {
      grid-template-columns: 1fr;
    }
  `,
  submissionOcrFormPanel: css`
    .ant-form-item {
      min-width: 0;
    }

    .ant-form-item-row {
      min-width: 0;
    }

    .ant-form-item-label {
      min-width: 0;
      max-width: 100%;
    }

    .ant-form-item-label > label {
      height: auto;
      min-height: 24px;
      white-space: normal;
    }

    .ant-form-item-control {
      min-width: 0;
      max-width: 100%;
    }

    .ant-form-item-extra {
      line-height: 1.45;
      overflow-wrap: anywhere;
    }

    .ant-segmented {
      max-width: 100%;
    }

    @container (width <= ${SUBMISSION_OCR_LAYOUT_BREAKPOINTS.splitWorkspaceStackMaxWidth}px) {
      .ant-form-item {
        margin-block-end: 60px;
      }

      .ant-form-item-row {
        flex-direction: column;
        align-items: stretch;
      }

      .ant-form-item-label {
        padding-block-end: 6px;
        text-align: start;
      }
    }
  `,
  splitWorkspace: css`
    display: grid;
    grid-template-columns: minmax(0, 1.35fr) minmax(min(100%, 340px), 0.85fr);
    gap: 16px;
    align-items: start;

    @media (width <= 1100px) {
      grid-template-columns: 1fr;
    }

    @container (width <= ${SUBMISSION_OCR_LAYOUT_BREAKPOINTS.splitWorkspaceStackMaxWidth}px) {
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
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 140px), 1fr));
    gap: 12px;

    @media (width <= 1080px) {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    @container (width <= 560px) {
      grid-template-columns: 1fr;
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
  resourceMasonry: css`
    scrollbar-gutter: stable;
    scroll-snap-type: ${RESOURCE_LIST_LAYOUT.overflowAxis} proximity;

    overflow: auto hidden;
    overscroll-behavior-x: contain;
    display: flex;
    gap: 14px;
    align-items: flex-start;

    padding-block-end: 8px;
  `,
  resourceCard: css`
    cursor: pointer;
    scroll-snap-align: start;

    flex: 0 0 ${RESOURCE_LIST_LAYOUT.cardFlexBasis};

    min-width: 0;
    padding: 14px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 8px;

    background: ${cssVar.colorBgContainer};
    box-shadow: 0 1px 2px rgb(0 0 0 / 3%);

    transition:
      border-color 0.15s ease,
      box-shadow 0.15s ease,
      transform 0.15s ease;

    &:hover {
      transform: translateY(-1px);
      border-color: ${cssVar.colorPrimaryBorder};
      box-shadow: 0 6px 18px rgb(0 0 0 / 5%);
    }

    @media (width <= 640px) {
      flex-basis: ${RESOURCE_LIST_LAYOUT.mobileCardFlexBasis};
    }
  `,
  resourceCardSelected: css`
    border-color: ${cssVar.colorPrimary};
    box-shadow: 0 0 0 1px ${cssVar.colorPrimaryBorder};
  `,
  resourceCardHeader: css`
    display: flex;
    gap: 10px;
    align-items: flex-start;
  `,
  resourceCardBody: css`
    flex: 1;
    min-width: 0;
  `,
  resourceCardTitle: css`
    font-size: 14px;
    font-weight: 650;
    line-height: 1.5;
    color: ${cssVar.colorText};
    overflow-wrap: anywhere;
  `,
  resourceCardMeta: css`
    margin-block-start: 2px;
    font-size: 12px;
    color: ${cssVar.colorTextDescription};
    overflow-wrap: anywhere;
  `,
  resourceCardFields: css`
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-block-start: 12px;
  `,
  resourceFieldChip: css`
    display: inline-flex;
    gap: 5px;
    align-items: center;

    max-width: 100%;
    padding-block: 4px;
    padding-inline: 8px;
    border-radius: 8px;

    font-size: 12px;
    line-height: 1.45;
    overflow-wrap: anywhere;

    background: ${cssVar.colorFillQuaternary};

    span {
      color: ${cssVar.colorTextDescription};
    }

    strong {
      min-width: 0;
      font-weight: 500;
      color: ${cssVar.colorText};
    }
  `,
  resourcePreviewBlock: css`
    overflow: hidden;
    width: 100%;
    margin-block-start: 10px;
  `,
  resultCard: css`
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
    justify-content: space-between;

    padding: 12px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 8px;

    background: ${cssVar.colorFillQuaternary};
  `,
  resultCardBody: css`
    min-width: 0;
  `,
  listStatusBar: css`
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
    justify-content: space-between;

    margin-block-end: 12px;
    padding-block: 10px;
    padding-inline: 12px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 8px;

    font-size: 13px;
    color: ${cssVar.colorTextSecondary};

    background: ${cssVar.colorBgContainer};
  `,
  loadMoreStatus: css`
    margin-block-start: 12px;
    padding-block: 10px;
    padding-inline: 12px;
    border: 1px dashed ${cssVar.colorBorderSecondary};
    border-radius: 8px;

    font-size: 13px;
    color: ${cssVar.colorTextSecondary};
    text-align: center;

    background: ${cssVar.colorBgContainer};
  `,
  scrollSentinel: css`
    height: 12px;
  `,
  tightTable: css`
    .ant-table-tbody > tr > td {
      vertical-align: top;
    }
  `,
  tabs: css`
    overflow-x: auto;

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

    .ant-segmented-group {
      min-width: max-content;
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
    container-type: inline-size;
    display: flex;
    flex-direction: column;
    gap: 16px;

    min-width: 0;
  `,
}));

type WorkbenchRoute =
  | { kind: 'dashboard'; path: string }
  | { kind: 'list'; path: string; resource: ResourceKey }
  | { kind: 'new'; path: string; resource: ResourceKey }
  | { entityId: number; kind: 'detail'; path: string; resource: ResourceKey }
  | { entityId: number; kind: 'edit'; path: string; resource: ResourceKey }
  | { invocationId: string; kind: 'invocation'; path: string }
  | { kind: 'assignment-manual'; path: string }
  | { kind: 'assignment-ocr'; path: string }
  | { kind: 'question-ocr'; path: string }
  | { kind: 'submission-ocr'; path: string };

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

const invocationActionLabelMap: Record<string, string> = {
  'assignment.draft.create_from_ocr': 'OCR 创建作业',
  'assignment.draft.create_manual': '手动创建作业',
  'assignment.draft.publish': '发布作业',
  'document.generate.docx': '生成文档',
  'ops.import.classes': '导入班级',
  'ops.import.grades': '导入年级',
  'ops.import.schools': '导入学校',
  'ops.import.students': '导入学生',
  'ops.import.subjects': '导入科目',
  'ops.import.teachers': '导入教师',
  'question.create_from_ocr': '题库 OCR 录入',
  'submission.create_from_ocr': '批量导入学生提交',
  'submission.explanation.regenerate': '重新生成讲解',
  'submission.explanation.save': '保存讲解',
  'submission.grade.retry': '重新批改提交',
  'submission.grade.run': '批改提交',
  'submission.report.generate': '生成提交报告',
  'submission.report.print': '打印提交报告',
  'submission.report.print_batch': '批量打印提交报告',
};

const invocationStageLabelMap: Record<string, string> = {
  building_draft: '正在生成作业',
  cancelled: '已取消',
  cancelling: '正在取消',
  failed: '失败',
  finalizing_batch: '正在汇总批次结果',
  grading_questions: '正在批改题目',
  indexing: '正在准备 OCR',
  pending: '待处理',
  preparing_batch: '正在切分提交',
  queued: '排队中',
  recognizing_questions: '正在识别题目',
  running: '处理中',
  running_submission_ocr: '正在识别并批改提交',
  starting: '正在启动',
  succeeded: '已完成',
  waiting_for_input: '等待输入',
};

const completedInvocationStageLabelMap: Record<string, string> = {
  building_draft: '已生成作业',
  finalizing_batch: '已汇总批次结果',
  grading_questions: '已完成批改',
  indexing: '已完成 OCR 准备',
  preparing_batch: '已完成提交切分',
  recognizing_questions: '已识别题目',
  running_submission_ocr: '已完成提交处理',
};

const organizationRoleLabelMap: Record<string, string> = {
  admin: '组织管理员',
  member: '组织成员',
  owner: '组织所有者',
};

const formatOrganizationRoleLabel = (value: unknown) => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  if (!normalized) return '组织身份未确认';
  return organizationRoleLabelMap[normalized] || normalized;
};

const shortOrganizationId = (value: unknown) => {
  const id = String(value || '').trim();
  if (!id) return '';
  return id.length > 10 ? id.slice(-8) : id;
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

type InvocationDisplayRecord =
  | AskCoreWorkbenchRecord
  | Pick<
      PluginInvocation,
      | 'action_id'
      | 'artifact_count'
      | 'question_failed'
      | 'question_succeeded'
      | 'question_total'
      | 'progress_stage'
      | 'state'
      | 'workflow_name'
    >;

const normalizedInvocationAction = (record?: InvocationDisplayRecord | null) =>
  String(record?.action_id || record?.workflow_name || '').trim();

const formatInvocationActionLabel = (record?: InvocationDisplayRecord | null) => {
  const action = normalizedInvocationAction(record);
  if (!action) return '后台任务';
  if (invocationActionLabelMap[action]) return invocationActionLabelMap[action];
  if (action.startsWith('ops.import.')) return '批量导入';
  if (action.startsWith('assignment.')) return '作业任务';
  if (action.startsWith('submission.')) return '提交任务';
  return '后台任务';
};

const formatInvocationStageLabel = (value: unknown, stateValue?: unknown) => {
  const stage = String(value || '')
    .trim()
    .toLowerCase();
  const state = String(stateValue || '')
    .trim()
    .toLowerCase();
  if (state === 'succeeded' || state === 'completed') {
    if (!stage) return '已完成';
    return completedInvocationStageLabelMap[stage] || '已完成';
  }
  if (state === 'failed') return '处理失败';
  if (state === 'cancelled' || state === 'canceled') return '已取消';
  if (!stage) return '阶段未上报';
  return invocationStageLabelMap[stage] || '处理中';
};

const formatInvocationStageLabelForRecord = (record?: InvocationDisplayRecord | null) =>
  formatInvocationStageLabel(record?.progress_stage || record?.state, record?.state);

const nonNegativeCount = (value: unknown) => {
  const count = Number(value);
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
};

const isSubmissionOcrInvocation = (record?: InvocationDisplayRecord | null) =>
  normalizedInvocationAction(record) === 'submission.create_from_ocr';

const getCompletedProgressCounts = (record?: InvocationDisplayRecord | null) => {
  const total = nonNegativeCount(record?.question_total);
  const succeeded = nonNegativeCount(record?.question_succeeded);
  const failed = nonNegativeCount(record?.question_failed);
  const completed = total > 0 ? Math.min(total, succeeded + failed) : succeeded + failed;
  const remaining = total > 0 ? Math.max(total - completed, 0) : 0;
  return { completed, remaining, total };
};

const invocationProgressLabel = (record?: InvocationDisplayRecord | null) => {
  const action = normalizedInvocationAction(record);
  if (action === 'submission.create_from_ocr') return '提交处理进度';
  if (action === 'submission.grade.run' || action === 'submission.grade.retry') return '批改进度';
  if (action === 'assignment.draft.create_from_ocr') return '题目录入进度';
  if (action === 'question.create_from_ocr') return '题库录入进度';
  return '任务进度';
};

const formatSubmissionOcrProgressSummary = (record?: InvocationDisplayRecord | null) => {
  const { completed, remaining, total } = getCompletedProgressCounts(record);
  if (total <= 0) return '等待后端进度';
  return `已完成处理 ${completed}/${total} 份提交，剩余 ${remaining} 份`;
};

const formatCompletedInvocationResult = (
  record: InvocationDisplayRecord | null | undefined,
  total: number,
) => {
  const action = normalizedInvocationAction(record);
  if (action === 'submission.create_from_ocr') return `处理 ${total} 份提交`;
  if (action === 'submission.grade.run' || action === 'submission.grade.retry')
    return `批改 ${total} 道题`;
  if (action === 'assignment.draft.create_from_ocr') return `识别 ${total} 道题`;
  if (action === 'question.create_from_ocr') return `处理 ${total} 道题`;
  return `完成 ${total} 项任务`;
};

const invocationArtifactNoun = (record?: InvocationDisplayRecord | null) => {
  const action = normalizedInvocationAction(record);
  if (action.startsWith('submission.report.')) return '报告';
  if (action.startsWith('submission.explanation.')) return '讲解';
  if (action === 'assignment.draft.create_from_ocr' || action === 'assignment.draft.create_manual')
    return '作业草稿';
  if (action === 'question.create_from_ocr') return '题库录入结果';
  if (action === 'assignment.draft.publish') return '作业发布结果';
  if (action.startsWith('ops.import.')) return '导入结果';
  if (action === 'document.generate.docx') return '文档';
  return '运行结果';
};

const formatInvocationResultSummary = (record?: InvocationDisplayRecord | null) => {
  const state = String(record?.state || '').toLowerCase();
  const { completed, total } = getCompletedProgressCounts(record);
  if (!isTerminalInvocationState(state)) {
    if (total > 0) return `${invocationProgressLabel(record)} ${completed}/${total}`;
    return '处理中，等待进度上报';
  }
  if (state === 'succeeded' && total > 0) return formatCompletedInvocationResult(record, total);
  if (total > 0) return `已处理 ${completed}/${total}`;
  const artifactCount = nonNegativeCount(record?.artifact_count);
  if (artifactCount > 0) return `生成 ${artifactCount} 个${invocationArtifactNoun(record)}`;
  return '未生成内容';
};

const runPanelVariantForInvocation = (
  invocation: RunState['invocation'],
): 'assignment-ocr' | 'default' | 'question-ocr' | 'submission-ocr' => {
  const action = String(invocation?.action_id || '').trim();
  if (action === 'assignment.draft.create_from_ocr' || action === 'assignment.draft.publish') {
    return 'assignment-ocr';
  }
  if (action === 'question.create_from_ocr') return 'question-ocr';
  if (action === 'submission.create_from_ocr') return 'submission-ocr';
  return 'default';
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

const delay = (ms: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });

const compactJsonRecord = (value: Record<string, unknown>): JsonRecord =>
  Object.fromEntries(
    Object.entries(value).filter(
      ([, entry]) => entry !== undefined && entry !== null && entry !== '',
    ),
  ) as JsonRecord;

const createConfirmationId = () => {
  const suffix =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `confirm-${suffix}`;
};

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

const positiveId = (value: unknown) => {
  const parsed = Number(value || 0);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
};

const readPositiveIdArray = (value: unknown): number[] =>
  Array.isArray(value) ? value.map(positiveId).filter((id) => id > 0) : [];

const normalizeOcrInputType = (value: unknown): 'scan' | 'upload' =>
  String(value || '')
    .trim()
    .toLowerCase() === 'scan'
    ? 'scan'
    : 'upload';

const sortScopeLabels = (values: string[]) =>
  Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean))).sort(
    (left, right) => left.localeCompare(right, 'zh-Hans-CN'),
  );

const scopeText = (value: unknown, fallback: string) => {
  const normalized = String(value || '').trim();
  return normalized || fallback;
};

export type SubmissionOcrAssignmentSelectOption = {
  assignmentMeta: string;
  assignmentTitle: string;
  label: string;
  searchText: string;
  title: string;
  value: number;
};

export const buildSubmissionOcrAssignmentSelectOption = (
  item: JsonRecord,
): SubmissionOcrAssignmentSelectOption => {
  const value = positiveId(item.assignment_id || item.id);
  const assignmentTitle = scopeText(item.title || value, '未命名作业');
  const metaParts = [
    item.subject_name || item.subject_id
      ? `科目 ${scopeText(item.subject_name || item.subject_id, '--')}`
      : null,
    item.grade_name || item.grade_id
      ? `教学年级 ${scopeText(item.grade_name || item.grade_id, '--')}`
      : null,
    value ? `ID ${value}` : null,
  ].filter(Boolean) as string[];
  const assignmentMeta = metaParts.join(' · ');
  const label = [assignmentTitle, assignmentMeta].filter(Boolean).join(' · ');

  return {
    assignmentMeta,
    assignmentTitle,
    label,
    searchText: [assignmentTitle, assignmentMeta].filter(Boolean).join(' '),
    title: label,
    value,
  };
};

const normalizePersonalizedQuestionCount = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return PERSONALIZED_QUESTION_COUNT_DEFAULT;
  return Math.min(
    PERSONALIZED_QUESTION_COUNT_MAX,
    Math.max(PERSONALIZED_QUESTION_COUNT_MIN, parsed),
  );
};

const parsePersonalizedQuestionCountOrThrow = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error('个性化作业题目数量必须是整数（1-10）。');
  }
  if (parsed < PERSONALIZED_QUESTION_COUNT_MIN || parsed > PERSONALIZED_QUESTION_COUNT_MAX) {
    throw new Error('个性化作业题目数量必须在 1-10 之间。');
  }
  return parsed;
};

const toIsoDateTime = (value: string) => {
  const raw = value.trim();
  if (!raw) return '';
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) throw new Error(`时间格式无效：${raw}`);
  return parsed.toISOString();
};

const emptyRunState = (): RunState => ({
  artifacts: [],
  busy: false,
  error: null,
  invocation: null,
  notice: null,
  tracking: null,
});

const isTerminalInvocationState = (value: unknown) =>
  TERMINAL_INVOCATION_STATES.has(String(value || '').toLowerCase());

const extractDraftArtifactId = (artifacts: PluginArtifact[]) => {
  const artifact = artifacts.find((item) => item.type === 'assignment.draft');
  return artifact?.artifact_id ? String(artifact.artifact_id) : null;
};

const extractPublishedAssignmentId = (artifacts: PluginArtifact[]) => {
  const artifact = artifacts.find((item) => item.type === 'assignment.publish.result');
  const assignmentId = Number(artifact?.content?.assignment_id || 0) || 0;
  return assignmentId > 0 ? assignmentId : null;
};

const artifactTitle = (artifact: PluginArtifact) =>
  String(artifact.title || artifact.summary || artifact.type || artifact.artifact_id);

type AssignmentOcrRunSummaryTone = 'danger' | 'info' | 'success' | 'warning';

type AssignmentOcrRunSummaryItem = {
  actionLabel?: string;
  assignmentId?: number | null;
  description: string;
  title: string;
};

type AssignmentOcrRunSummary = {
  emptyResultText: string;
  hiddenArtifacts: PluginArtifact[];
  progressLabel: string;
  progressPercent: number | null;
  resultItems: AssignmentOcrRunSummaryItem[];
  statusDescription: string;
  statusTitle: string;
  statusTone: AssignmentOcrRunSummaryTone;
  technicalItems: Array<{ label: string; value: string }>;
  trackingLabel: string | null;
  visibleArtifacts: PluginArtifact[];
};

const assignmentOcrVisibleArtifactTypes = new Set([
  'assignment.draft',
  'assignment.publish.result',
]);
const assignmentOcrRelatedActions = new Set([
  'assignment.draft.create_from_ocr',
  'assignment.draft.publish',
]);
const submissionOcrVisibleArtifactTypes = new Set(['submission.ocr.batch.result']);
const submissionOcrRelatedActions = new Set(['submission.create_from_ocr']);
const questionOcrVisibleArtifactTypes = new Set(['question.ocr.import.result']);
const questionOcrRelatedActions = new Set(['question.create_from_ocr']);

const getProcessingProgressVerb = (invocation: RunState['invocation']) =>
  isTerminalInvocationState(invocation?.state) ? '已处理' : '正在处理';

const formatInvocationRunNotice = (invocation: RunState['invocation']) => {
  if (!invocation) return '任务正在运行…';
  if (isSubmissionOcrInvocation(invocation)) return formatSubmissionOcrProgressSummary(invocation);
  return formatInvocationStageLabel(invocation.progress_stage || invocation.state);
};

const getTrackingLabel = (tracking?: RunState['tracking']) =>
  tracking === 'stream'
    ? '实时跟踪'
    : tracking === 'polling'
      ? '轮询跟踪'
      : tracking === 'degraded'
        ? '跟踪降级'
        : null;

const clampPercent = (value: number) => Math.max(0, Math.min(100, value));

const getArtifactQuestionCount = (artifact: PluginArtifact, invocation: RunState['invocation']) => {
  const content = artifact.content || {};
  if (Array.isArray(content.questions)) return content.questions.length;
  const explicitCount = Number(content.question_count || content.questions_count || 0) || 0;
  if (explicitCount > 0) return explicitCount;
  return Number(invocation?.question_total || invocation?.question_succeeded || 0) || 0;
};

const assignmentOcrToneColor = (tone: AssignmentOcrRunSummaryTone) => {
  if (tone === 'success') return 'green';
  if (tone === 'danger') return 'red';
  if (tone === 'warning') return 'gold';
  return 'blue';
};

const getAssignmentOcrStatus = ({
  hasDraft,
  hasPublishedAssignment,
  invocation,
  progressStage,
}: {
  hasDraft: boolean;
  hasPublishedAssignment: boolean;
  invocation: RunState['invocation'];
  progressStage: string;
}): Pick<AssignmentOcrRunSummary, 'statusDescription' | 'statusTitle' | 'statusTone'> => {
  const actionId = String(invocation?.action_id || '').trim();
  const state = String(invocation?.state || '').toLowerCase();
  const normalizedStage = String(progressStage || state || '').toLowerCase();
  const failed = TERMINAL_INVOCATION_STATES.has(state) && state !== 'succeeded';

  if (!invocation) {
    return {
      statusDescription: '上传扫描件或调用扫描仪后，系统会开始识别题目并生成作业草稿。',
      statusTitle: '等待开始 OCR',
      statusTone: 'info',
    };
  }

  if (actionId === 'assignment.draft.publish') {
    if (failed) {
      return {
        statusDescription: invocation.failure_reason || '草稿已生成，但自动发布作业失败。',
        statusTitle: '发布失败',
        statusTone: 'danger',
      };
    }
    if (state === 'succeeded' || hasPublishedAssignment) {
      return {
        statusDescription: '作业已经创建，可以进入作业详情继续检查发布对象和题目。',
        statusTitle: '作业已创建并发布',
        statusTone: 'success',
      };
    }
    return {
      statusDescription: '草稿已生成，正在根据发布范围创建作业。',
      statusTitle: '正在发布作业',
      statusTone: 'info',
    };
  }

  if (failed) {
    return {
      statusDescription: invocation.failure_reason || '本次 OCR 没有生成可校对的作业草稿。',
      statusTitle: 'OCR 失败',
      statusTone: 'danger',
    };
  }
  if (state === 'succeeded' || normalizedStage === 'succeeded') {
    return hasDraft
      ? {
          statusDescription: '作业草稿已经生成，系统会继续按发布范围自动创建作业。',
          statusTitle: '作业草稿已生成',
          statusTone: 'success',
        }
      : {
          statusDescription: '任务已结束，但这次没有返回作业草稿。',
          statusTitle: 'OCR 已完成',
          statusTone: 'warning',
        };
  }
  if (normalizedStage === 'recognizing_questions') {
    return {
      statusDescription: '正在把扫描件解析成题目结构，完成后会生成作业草稿。',
      statusTitle: '正在识别题目',
      statusTone: 'info',
    };
  }
  if (normalizedStage === 'building_draft') {
    return {
      statusDescription: '题目已识别，正在写入作业草稿。',
      statusTitle: '正在生成作业草稿',
      statusTone: 'info',
    };
  }
  if (normalizedStage === 'indexing') {
    return {
      statusDescription: '正在整理扫描件并建立 OCR 识别上下文。',
      statusTitle: '正在准备 OCR',
      statusTone: 'info',
    };
  }
  return {
    statusDescription: '后台正在处理 OCR，完成后会在运行结果里显示作业草稿。',
    statusTitle: 'OCR 处理中',
    statusTone: 'info',
  };
};

export const buildAssignmentOcrRunSummary = (run: RunState): AssignmentOcrRunSummary => {
  const invocation = run.invocation;
  const actionId = String(invocation?.action_id || '').trim();
  const isRelatedAction = !actionId || assignmentOcrRelatedActions.has(actionId);
  const visibleArtifacts = isRelatedAction
    ? run.artifacts.filter((artifact) => assignmentOcrVisibleArtifactTypes.has(artifact.type))
    : [];
  const hiddenArtifactIds = new Set(visibleArtifacts.map((artifact) => artifact.artifact_id));
  const hiddenArtifacts = run.artifacts.filter(
    (artifact) => !hiddenArtifactIds.has(artifact.artifact_id),
  );
  const questionTotal = Number(invocation?.question_total || 0) || 0;
  const questionSucceeded = Number(invocation?.question_succeeded || 0) || 0;
  const questionFailed = Number(invocation?.question_failed || 0) || 0;
  const currentQuestion = Number(invocation?.current_question_order_index || 0) || 0;
  const processedQuestions = questionTotal
    ? Math.min(questionTotal, Math.max(questionSucceeded + questionFailed, currentQuestion))
    : 0;
  const progressLabel = questionTotal
    ? `${getProcessingProgressVerb(invocation)} ${processedQuestions}/${questionTotal}`
    : '等待后端进度';
  const progressPercent = questionTotal
    ? clampPercent((processedQuestions / questionTotal) * 100)
    : null;
  const hasDraft = visibleArtifacts.some((artifact) => artifact.type === 'assignment.draft');
  const hasPublishedAssignment = visibleArtifacts.some(
    (artifact) =>
      artifact.type === 'assignment.publish.result' && positiveId(artifact.content.assignment_id),
  );
  const progressStage = String(invocation?.progress_stage || invocation?.state || '').trim();
  const status = isRelatedAction
    ? getAssignmentOcrStatus({
        hasDraft,
        hasPublishedAssignment,
        invocation,
        progressStage,
      })
    : {
        statusDescription: '当前跟踪的不是作业草稿 OCR 任务。',
        statusTitle: '正在跟踪其他任务',
        statusTone: 'warning' as const,
      };
  const resultItems = visibleArtifacts.map((artifact) => {
    if (artifact.type === 'assignment.publish.result') {
      const assignmentId = positiveId(artifact.content.assignment_id);
      return {
        actionLabel: assignmentId ? '打开作业' : undefined,
        assignmentId: assignmentId || null,
        description: assignmentId ? `作业 ${assignmentId}` : '作业已创建',
        title: '作业已创建并发布',
      };
    }
    const questionCount = getArtifactQuestionCount(artifact, invocation);
    const draftTitle = String(artifact.content.title || artifact.title || '').trim();
    const shortId = artifact.artifact_id.slice(0, 8);
    const description = [
      draftTitle || null,
      questionCount > 0 ? `识别题目 ${questionCount} 道` : null,
      `草稿 ${shortId}`,
    ]
      .filter(Boolean)
      .join(' · ');
    return {
      description,
      title: '已生成作业草稿',
    };
  });

  return {
    emptyResultText:
      invocation &&
      TERMINAL_INVOCATION_STATES.has(String(invocation.state || '').toLowerCase()) &&
      invocation.state !== 'succeeded'
        ? '本次没有生成作业草稿。'
        : '识别完成后会在这里生成作业草稿。',
    hiddenArtifacts,
    progressLabel,
    progressPercent,
    resultItems,
    ...status,
    technicalItems: [
      { label: 'Invocation', value: invocation?.invocation_id || '--' },
      { label: '状态', value: invocation?.state || '--' },
      { label: '阶段', value: progressStage || '--' },
      { label: '跟踪方式', value: getTrackingLabel(run.tracking || undefined) || '--' },
      { label: '结果数', value: String(invocation?.artifact_count ?? run.artifacts.length) },
    ],
    trackingLabel: getTrackingLabel(run.tracking || undefined),
    visibleArtifacts,
  };
};

const getSubmissionOcrStatus = ({
  hasBatchResult,
  invocation,
  progressStage,
}: {
  hasBatchResult: boolean;
  invocation: RunState['invocation'];
  progressStage: string;
}): Pick<AssignmentOcrRunSummary, 'statusDescription' | 'statusTitle' | 'statusTone'> => {
  const state = String(invocation?.state || '').toLowerCase();
  const normalizedStage = String(progressStage || state || '').toLowerCase();
  const failed = TERMINAL_INVOCATION_STATES.has(state) && state !== 'succeeded';

  if (!invocation) {
    return {
      statusDescription: '选择作业和扫描件后，系统会切分学生提交、识别答案并自动批改。',
      statusTitle: '等待开始 OCR',
      statusTone: 'info',
    };
  }

  if (failed) {
    return {
      statusDescription: invocation.failure_reason || '本次提交 OCR 没有生成可用的批量处理结果。',
      statusTitle: '提交 OCR 失败',
      statusTone: 'danger',
    };
  }
  if (state === 'succeeded' || normalizedStage === 'succeeded') {
    return hasBatchResult
      ? {
          statusDescription: '学生提交已完成 OCR、匹配和批改汇总，可继续处理未自动绑定的提交。',
          statusTitle: '学生提交处理完成',
          statusTone: 'success',
        }
      : {
          statusDescription: '任务已结束，但这次没有返回学生提交批量处理结果。',
          statusTitle: '提交 OCR 已完成',
          statusTone: 'warning',
        };
  }
  if (normalizedStage === 'finalizing_batch') {
    return {
      statusDescription: '每份提交已处理完成，正在汇总自动绑定、待处理和失败项。',
      statusTitle: '正在汇总批次结果',
      statusTone: 'info',
    };
  }
  if (normalizedStage === 'running_submission_ocr') {
    return {
      statusDescription: '正在逐份识别学生答案、匹配发布对象并生成批改结果。',
      statusTitle: '正在识别并批改提交',
      statusTone: 'info',
    };
  }
  if (normalizedStage === 'preparing_batch') {
    return {
      statusDescription: '正在按每生页数切分扫描件并创建学生提交。',
      statusTitle: '正在切分提交',
      statusTone: 'info',
    };
  }
  return {
    statusDescription: '后台正在处理学生提交 OCR，完成后会显示批量处理结果。',
    statusTitle: '提交 OCR 处理中',
    statusTone: 'info',
  };
};

export const buildSubmissionOcrRunSummary = (run: RunState): AssignmentOcrRunSummary => {
  const invocation = run.invocation;
  const actionId = String(invocation?.action_id || '').trim();
  const isRelatedAction = !actionId || submissionOcrRelatedActions.has(actionId);
  const visibleArtifacts = isRelatedAction
    ? run.artifacts.filter((artifact) => submissionOcrVisibleArtifactTypes.has(artifact.type))
    : [];
  const hiddenArtifactIds = new Set(visibleArtifacts.map((artifact) => artifact.artifact_id));
  const hiddenArtifacts = run.artifacts.filter(
    (artifact) => !hiddenArtifactIds.has(artifact.artifact_id),
  );
  const { completed: processedSubmissions, total: submissionTotal } =
    getCompletedProgressCounts(invocation);
  const progressLabel = formatSubmissionOcrProgressSummary(invocation);
  const progressPercent = submissionTotal
    ? clampPercent((processedSubmissions / submissionTotal) * 100)
    : null;
  const hasBatchResult = visibleArtifacts.some(
    (artifact) => artifact.type === 'submission.ocr.batch.result',
  );
  const progressStage = String(invocation?.progress_stage || invocation?.state || '').trim();
  const status = isRelatedAction
    ? getSubmissionOcrStatus({
        hasBatchResult,
        invocation,
        progressStage,
      })
    : {
        statusDescription: '当前跟踪的不是学生提交 OCR 任务。',
        statusTitle: '正在跟踪其他任务',
        statusTone: 'warning' as const,
      };
  const resultItems = visibleArtifacts.map((artifact) => {
    const content = artifact.content || {};
    const autoBound = readRecordArray(content.auto_bound);
    const needsBinding = readRecordArray(content.needs_binding);
    const failed = readRecordArray(content.failed);
    const createdCount =
      Number(content.created_count || 0) || autoBound.length + needsBinding.length + failed.length;
    const gradedCount = Number(content.graded_count || 0) || 0;
    const assignmentTitle = String(content.assignment_title || artifact.title || '').trim();
    const description = [
      assignmentTitle || null,
      `创建 ${createdCount} 份`,
      `自动绑定 ${autoBound.length}`,
      `待处理 ${needsBinding.length}`,
      `失败 ${failed.length}`,
      gradedCount > 0 ? `已批改 ${gradedCount}` : null,
    ]
      .filter(Boolean)
      .join(' · ');
    return {
      description,
      title: '学生提交批量处理结果',
    };
  });

  return {
    emptyResultText:
      invocation &&
      TERMINAL_INVOCATION_STATES.has(String(invocation.state || '').toLowerCase()) &&
      invocation.state !== 'succeeded'
        ? '本次没有生成学生提交批量处理结果。'
        : '识别完成后会在这里显示学生提交批量处理结果。',
    hiddenArtifacts,
    progressLabel,
    progressPercent,
    resultItems,
    ...status,
    technicalItems: [
      { label: 'Invocation', value: invocation?.invocation_id || '--' },
      { label: '状态', value: invocation?.state || '--' },
      { label: '阶段', value: progressStage || '--' },
      { label: '跟踪方式', value: getTrackingLabel(run.tracking || undefined) || '--' },
      { label: '结果数', value: String(invocation?.artifact_count ?? run.artifacts.length) },
    ],
    trackingLabel: getTrackingLabel(run.tracking || undefined),
    visibleArtifacts,
  };
};

export const buildQuestionOcrRunSummary = (run: RunState): AssignmentOcrRunSummary => {
  const invocation = run.invocation;
  const actionId = String(invocation?.action_id || '').trim();
  const isRelatedAction = !actionId || questionOcrRelatedActions.has(actionId);
  const visibleArtifacts = isRelatedAction
    ? run.artifacts.filter((artifact) => questionOcrVisibleArtifactTypes.has(artifact.type))
    : [];
  const hiddenArtifactIds = new Set(visibleArtifacts.map((artifact) => artifact.artifact_id));
  const hiddenArtifacts = run.artifacts.filter(
    (artifact) => !hiddenArtifactIds.has(artifact.artifact_id),
  );
  const questionTotal = Number(invocation?.question_total || 0) || 0;
  const questionSucceeded = Number(invocation?.question_succeeded || 0) || 0;
  const questionFailed = Number(invocation?.question_failed || 0) || 0;
  const processedQuestions = questionTotal
    ? Math.min(questionTotal, questionSucceeded + questionFailed)
    : questionSucceeded + questionFailed;
  const progressLabel = questionTotal
    ? `${getProcessingProgressVerb(invocation)} ${processedQuestions}/${questionTotal}`
    : '等待后端进度';
  const progressPercent = questionTotal
    ? clampPercent((processedQuestions / questionTotal) * 100)
    : null;
  const artifact = visibleArtifacts[0];
  const content = artifact?.content || {};
  const createdIds = readPositiveIdArray(content.created_question_ids);
  const reusedIds = readPositiveIdArray(content.reused_question_ids);
  const generatedAnswerIds = readPositiveIdArray(content.generated_answer_question_ids);
  const skippedDuplicates = readRecordArray(content.skipped_duplicates);
  const failedQuestions = readRecordArray(content.failed_questions);
  const similarityDecisions = readRecordArray(content.similarity_decisions);
  const progressStage = String(invocation?.progress_stage || invocation?.state || '').trim();
  const state = String(invocation?.state || '').toLowerCase();
  const failed = TERMINAL_INVOCATION_STATES.has(state) && state !== 'succeeded';
  const hasImportResult = Boolean(artifact);
  const status = !isRelatedAction
    ? {
        statusDescription: '当前跟踪的不是题库 OCR 录入任务。',
        statusTitle: '正在跟踪其他任务',
        statusTone: 'warning' as const,
      }
    : !invocation
      ? {
          statusDescription: '上传扫描件或调用扫描仪后，系统会识别题目、补全缺失答案并写入题库。',
          statusTitle: '等待开始 OCR',
          statusTone: 'info' as const,
        }
      : failed
        ? {
            statusDescription: invocation.failure_reason || '本次题库 OCR 录入失败。',
            statusTitle: '题库 OCR 失败',
            statusTone: 'danger' as const,
          }
        : state === 'succeeded'
          ? hasImportResult
            ? {
                statusDescription: `新建 ${createdIds.length} 道，复用 ${reusedIds.length} 道，补全答案 ${generatedAnswerIds.length} 道。`,
                statusTitle: '题库 OCR 已完成',
                statusTone: failedQuestions.length ? ('warning' as const) : ('success' as const),
              }
            : {
                statusDescription: '任务已结束，但这次没有返回题库导入结果。',
                statusTitle: '题库 OCR 已完成',
                statusTone: 'warning' as const,
              }
          : {
              statusDescription: '后台正在识别题目、补全答案并做相似度去重。',
              statusTitle: '题库 OCR 处理中',
              statusTone: 'info' as const,
            };

  const resultItems = visibleArtifacts.map((item) => {
    const itemContent = item.content || {};
    const itemCreatedIds = readPositiveIdArray(itemContent.created_question_ids);
    const itemReusedIds = readPositiveIdArray(itemContent.reused_question_ids);
    const itemGeneratedAnswerIds = readPositiveIdArray(itemContent.generated_answer_question_ids);
    const itemFailed = readRecordArray(itemContent.failed_questions);
    const itemSkipped = readRecordArray(itemContent.skipped_duplicates);
    const itemDecisions = readRecordArray(itemContent.similarity_decisions);
    return {
      description: [
        `新建 ${itemCreatedIds.length}`,
        `复用 ${itemReusedIds.length}`,
        `补全答案 ${itemGeneratedAnswerIds.length}`,
        `跳过重复 ${itemSkipped.length}`,
        `失败 ${itemFailed.length}`,
        `相似度判定 ${itemDecisions.length}`,
      ].join(' · '),
      title: '题库导入结果',
    };
  });

  return {
    emptyResultText:
      invocation && TERMINAL_INVOCATION_STATES.has(state) && state !== 'succeeded'
        ? '本次没有生成题库导入结果。'
        : '识别完成后会在这里显示创建、复用、答案补全和相似度判定结果。',
    hiddenArtifacts,
    progressLabel,
    progressPercent,
    resultItems,
    ...status,
    technicalItems: [
      { label: 'Invocation', value: invocation?.invocation_id || '--' },
      { label: '状态', value: invocation?.state || '--' },
      { label: '阶段', value: progressStage || '--' },
      { label: '跟踪方式', value: getTrackingLabel(run.tracking || undefined) || '--' },
      { label: '结果数', value: String(invocation?.artifact_count ?? run.artifacts.length) },
      { label: '跳过重复', value: String(skippedDuplicates.length) },
      { label: '失败题目', value: String(failedQuestions.length) },
      { label: '相似度判定', value: String(similarityDecisions.length) },
    ],
    trackingLabel: getTrackingLabel(run.tracking || undefined),
    visibleArtifacts,
  };
};

const runNoticeForUploadProgress =
  (prefix: string) =>
  (progress: {
    completed: number;
    fileName: string;
    index: number;
    phase: string;
    total: number;
  }) => {
    if (progress.phase === 'uploaded') {
      return `${prefix} ${progress.completed}/${progress.total} 张图片，正在继续处理…`;
    }
    return `${prefix} ${progress.completed}/${progress.total}：${progress.fileName || `第 ${progress.index + 1} 张`}`;
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
    return {
      kind: 'list',
      path: buildResourceBasePath(activeTab as ResourceKey),
      resource: activeTab as ResourceKey,
    };
  }
  if (path === '/dashboard') return { kind: 'dashboard', path };
  if (path === '/assignments/new/manual') return { kind: 'assignment-manual', path };
  if (path === '/assignments/new/ocr') return { kind: 'assignment-ocr', path };
  if (path === '/questions/new/ocr') return { kind: 'question-ocr', path };
  if (path === '/submissions/new/ocr') return { kind: 'submission-ocr', path };

  const parts = path.replace(/^\/+/, '').split('/').filter(Boolean);
  if (parts[0] === 'invocations') {
    const invocationId = decodeURIComponent(parts[1] || '').trim();
    if (invocationId) return { invocationId, kind: 'invocation', path };
    return { kind: 'dashboard', path: '/dashboard' };
  }
  const resource = routeResourceAliases[parts[0]];
  if (!resource) return { kind: 'dashboard', path: '/dashboard' };
  if (parts.length === 1) return { kind: 'list', path, resource };
  if (parts[1] === 'new') return { kind: 'new', path, resource };
  const entityId = Number(parts[1] || 0) || 0;
  if (!entityId) return { kind: 'list', path: buildResourceBasePath(resource), resource };
  if (parts[2] === 'edit') return { entityId, kind: 'edit', path, resource };
  return { entityId, kind: 'detail', path, resource };
};

const routeFor = (tab: AskCoreWorkbenchTab | string, route?: string | null) =>
  buildAskCoreWorkbenchUrl({ route, tab });

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

const buildInvocationColumns = (
  onOpenInvocation: (record: AskCoreWorkbenchRecord) => void,
): ColumnsType<AskCoreWorkbenchRecord> => [
  {
    dataIndex: 'action_id',
    key: 'action_id',
    render: (_, row) => formatInvocationActionLabel(row),
    title: '任务',
    width: 220,
  },
  {
    dataIndex: 'state',
    key: 'state',
    render: (value) =>
      formatCellValue(value, { dataIndex: 'state', isStatus: true, title: '状态' }),
    title: '状态',
    width: 110,
  },
  {
    dataIndex: 'progress_stage',
    key: 'progress_stage',
    render: (_, row) => formatInvocationStageLabelForRecord(row),
    title: '阶段',
    width: 180,
  },
  {
    dataIndex: 'artifact_count',
    key: 'artifact_count',
    render: (_, row) => formatInvocationResultSummary(row),
    title: '进度/结果',
    width: 190,
  },
  {
    dataIndex: 'created_at',
    key: 'created_at',
    render: (value) => formatCellValue(value),
    title: '创建时间',
    width: 170,
  },
  {
    dataIndex: 'finished_at',
    key: 'finished_at',
    render: (value) => formatCellValue(value),
    title: '结束时间',
    width: 170,
  },
  {
    key: 'operation',
    render: (_, row) => {
      const invocationId = String(row.invocation_id || '').trim();
      if (!invocationId) return <span className={styles.muted}>--</span>;
      return (
        <Button className={styles.secondary} size="small" onClick={() => onOpenInvocation(row)}>
          查看任务
        </Button>
      );
    },
    title: '操作',
    width: 110,
  },
];

const DetailHeader = ({
  actions,
  backLabel = '返回列表',
  onBack,
  subtitle,
  title,
}: {
  actions?: ReactNode;
  backLabel?: string;
  onBack: () => void;
  subtitle?: string;
  title: string;
}) => (
  <div className={styles.detailHeader}>
    <Space align="start">
      <Button className={styles.secondary} icon={<ArrowLeft size={14} />} onClick={onBack}>
        {backLabel}
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

type ScopeNode = {
  city?: string;
  classId?: number | null;
  id: number;
  name: string;
  province?: string;
  schoolId?: number | null;
};

const selectOptionsFromLabels = (values: string[]) =>
  values.map((value) => ({ label: value, value }));

const PublishScopeSelector = ({
  classIds,
  lookups,
  onClassIdsChange,
  onStudentIdsChange,
  studentIds,
}: {
  classIds: number[];
  lookups: LookupCollections;
  onClassIdsChange: (value: number[]) => void;
  onStudentIdsChange: (value: number[]) => void;
  studentIds: number[];
}) => {
  const schools = useMemo<ScopeNode[]>(
    () =>
      lookups.schools
        .map((item): ScopeNode | null => {
          const id = positiveId(item.school_id || item.id);
          if (!id) return null;
          return {
            city: scopeText(item.city, DEFAULT_CITY_LABEL),
            id,
            name: scopeText(item.name, `${DEFAULT_SCHOOL_LABEL} ${id}`),
            province: scopeText(item.province, DEFAULT_PROVINCE_LABEL),
          };
        })
        .filter((item): item is ScopeNode => Boolean(item)),
    [lookups.schools],
  );

  const classes = useMemo<ScopeNode[]>(
    () =>
      lookups.classes
        .map((item): ScopeNode | null => {
          const id = positiveId(item.class_id || item.id);
          if (!id) return null;
          return {
            id,
            name: scopeText(item.name, `${DEFAULT_CLASS_LABEL} ${id}`),
            schoolId: positiveId(item.school_id) || null,
          };
        })
        .filter((item): item is ScopeNode => Boolean(item)),
    [lookups.classes],
  );

  const students = useMemo<ScopeNode[]>(
    () =>
      lookups.students
        .map((item): ScopeNode | null => {
          const id = positiveId(item.student_id || item.id);
          if (!id) return null;
          return {
            classId: positiveId(item.org_unit_id || item.class_id) || null,
            id,
            name: scopeText(item.name || item.student_number, `${DEFAULT_STUDENT_LABEL} ${id}`),
          };
        })
        .filter((item): item is ScopeNode => Boolean(item)),
    [lookups.students],
  );

  const schoolNameById = useMemo(
    () => new Map(schools.map((item) => [item.id, item.name])),
    [schools],
  );
  const classNameById = useMemo(
    () => new Map(classes.map((item) => [item.id, item.name])),
    [classes],
  );
  const classSchoolIdById = useMemo(
    () => new Map(classes.map((item) => [item.id, item.schoolId || null])),
    [classes],
  );
  const [classProvince, setClassProvince] = useState('');
  const [classCity, setClassCity] = useState('');
  const [classSchoolId, setClassSchoolId] = useState<number | null>(null);
  const [studentProvince, setStudentProvince] = useState('');
  const [studentCity, setStudentCity] = useState('');
  const [studentSchoolId, setStudentSchoolId] = useState<number | null>(null);
  const [studentClassId, setStudentClassId] = useState<number | null>(null);

  const classProvinceOptions = useMemo(
    () => selectOptionsFromLabels(sortScopeLabels(schools.map((item) => item.province || ''))),
    [schools],
  );
  const classCityOptions = useMemo(
    () =>
      selectOptionsFromLabels(
        sortScopeLabels(
          schools
            .filter((item) => !classProvince || item.province === classProvince)
            .map((item) => item.city || ''),
        ),
      ),
    [classProvince, schools],
  );
  const classSchoolOptions = useMemo(
    () =>
      schools
        .filter(
          (item) =>
            (!classProvince || item.province === classProvince) &&
            (!classCity || item.city === classCity),
        )
        .map((item) => ({ label: `${item.name}（ID ${item.id}）`, value: item.id })),
    [classCity, classProvince, schools],
  );
  const classScopedSchoolIds = useMemo(
    () => new Set(classSchoolOptions.map((option) => option.value)),
    [classSchoolOptions],
  );
  const classLeafOptions = useMemo(
    () =>
      classes
        .filter((item) => {
          if (classSchoolId) return item.schoolId === classSchoolId;
          if (classProvince || classCity) {
            return item.schoolId != null && classScopedSchoolIds.has(item.schoolId);
          }
          return true;
        })
        .map((item) => ({
          label: `${item.name}（ID ${item.id} · ${
            item.schoolId ? schoolNameById.get(item.schoolId) || DEFAULT_SCHOOL_LABEL : '未绑定学校'
          }）`,
          value: item.id,
        })),
    [classCity, classProvince, classSchoolId, classScopedSchoolIds, classes, schoolNameById],
  );

  useEffect(() => {
    if (classCity && !classCityOptions.some((option) => option.value === classCity)) {
      setClassCity('');
    }
  }, [classCity, classCityOptions]);

  useEffect(() => {
    if (classSchoolId && !classSchoolOptions.some((option) => option.value === classSchoolId)) {
      setClassSchoolId(null);
    }
  }, [classSchoolId, classSchoolOptions]);

  const studentProvinceOptions = useMemo(
    () => selectOptionsFromLabels(sortScopeLabels(schools.map((item) => item.province || ''))),
    [schools],
  );
  const studentCityOptions = useMemo(
    () =>
      selectOptionsFromLabels(
        sortScopeLabels(
          schools
            .filter((item) => !studentProvince || item.province === studentProvince)
            .map((item) => item.city || ''),
        ),
      ),
    [schools, studentProvince],
  );
  const studentSchoolOptions = useMemo(
    () =>
      schools
        .filter(
          (item) =>
            (!studentProvince || item.province === studentProvince) &&
            (!studentCity || item.city === studentCity),
        )
        .map((item) => ({ label: `${item.name}（ID ${item.id}）`, value: item.id })),
    [schools, studentCity, studentProvince],
  );
  const studentClassOptions = useMemo(() => {
    const scopedSchoolIds = new Set(studentSchoolOptions.map((option) => option.value));
    return classes
      .filter((item) => {
        if (studentClassId && item.id === studentClassId) return true;
        if (studentSchoolId) return item.schoolId === studentSchoolId;
        if (studentProvince || studentCity) {
          return item.schoolId != null && scopedSchoolIds.has(item.schoolId);
        }
        return true;
      })
      .map((item) => ({
        label: `${item.name}（ID ${item.id} · ${
          item.schoolId ? schoolNameById.get(item.schoolId) || DEFAULT_SCHOOL_LABEL : '未绑定学校'
        }）`,
        value: item.id,
      }));
  }, [
    classes,
    schoolNameById,
    studentCity,
    studentClassId,
    studentProvince,
    studentSchoolId,
    studentSchoolOptions,
  ]);
  const studentScopedClassIds = useMemo(
    () => new Set(studentClassOptions.map((option) => option.value)),
    [studentClassOptions],
  );
  const studentLeafOptions = useMemo(
    () =>
      students
        .filter((item) => {
          if (studentClassId) return item.classId === studentClassId;
          if (studentSchoolId || studentProvince || studentCity) {
            return item.classId != null && studentScopedClassIds.has(item.classId);
          }
          return true;
        })
        .map((item) => {
          const className = item.classId
            ? classNameById.get(item.classId) || DEFAULT_CLASS_LABEL
            : '未绑定班级';
          const schoolId = item.classId ? classSchoolIdById.get(item.classId) : null;
          const schoolName = schoolId
            ? schoolNameById.get(schoolId) || DEFAULT_SCHOOL_LABEL
            : '未绑定学校';
          return {
            label: `${item.name}（ID ${item.id} · ${className} · ${schoolName}）`,
            value: item.id,
          };
        }),
    [
      classNameById,
      classSchoolIdById,
      schoolNameById,
      studentCity,
      studentClassId,
      studentProvince,
      studentSchoolId,
      studentScopedClassIds,
      students,
    ],
  );

  useEffect(() => {
    if (studentCity && !studentCityOptions.some((option) => option.value === studentCity)) {
      setStudentCity('');
    }
  }, [studentCity, studentCityOptions]);

  useEffect(() => {
    if (
      studentSchoolId &&
      !studentSchoolOptions.some((option) => option.value === studentSchoolId)
    ) {
      setStudentSchoolId(null);
    }
  }, [studentSchoolId, studentSchoolOptions]);

  useEffect(() => {
    if (studentClassId && !studentClassOptions.some((option) => option.value === studentClassId)) {
      setStudentClassId(null);
    }
  }, [studentClassId, studentClassOptions]);

  return (
    <div className={styles.editorGrid}>
      <div className={styles.previewBox}>
        <h4 className={styles.panelTitle}>发布班级</h4>
        <div className={styles.stack}>
          <Select
            allowClear
            options={classProvinceOptions}
            placeholder="全部省份"
            value={classProvince || undefined}
            onChange={(value) => setClassProvince(value || '')}
          />
          <Select
            allowClear
            options={classCityOptions}
            placeholder="全部城市"
            value={classCity || undefined}
            onChange={(value) => setClassCity(value || '')}
          />
          <Select
            allowClear
            options={classSchoolOptions}
            placeholder="全部学校"
            value={classSchoolId || undefined}
            onChange={(value) => setClassSchoolId(value || null)}
          />
          <Select
            mode="multiple"
            options={classLeafOptions}
            placeholder="选择班级"
            value={classIds}
            onChange={(value) => onClassIdsChange(value.map(Number).filter(Boolean))}
          />
          <div className={styles.muted}>已选 {classIds.length} 个班级。</div>
        </div>
      </div>
      <div className={styles.previewBox}>
        <h4 className={styles.panelTitle}>发布学生</h4>
        <div className={styles.stack}>
          <Select
            allowClear
            options={studentProvinceOptions}
            placeholder="全部省份"
            value={studentProvince || undefined}
            onChange={(value) => setStudentProvince(value || '')}
          />
          <Select
            allowClear
            options={studentCityOptions}
            placeholder="全部城市"
            value={studentCity || undefined}
            onChange={(value) => setStudentCity(value || '')}
          />
          <Select
            allowClear
            options={studentSchoolOptions}
            placeholder="全部学校"
            value={studentSchoolId || undefined}
            onChange={(value) => setStudentSchoolId(value || null)}
          />
          <Select
            allowClear
            options={studentClassOptions}
            placeholder="全部班级"
            value={studentClassId || undefined}
            onChange={(value) => setStudentClassId(value || null)}
          />
          <Select
            mode="multiple"
            options={studentLeafOptions}
            placeholder="选择学生"
            value={studentIds}
            onChange={(value) => onStudentIdsChange(value.map(Number).filter(Boolean))}
          />
          <div className={styles.muted}>已选 {studentIds.length} 个学生。</div>
        </div>
      </div>
    </div>
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
                  style={{ width: '100%' }}
                  value={model.subjectId || undefined}
                  options={fieldOptions(
                    { key: 'subject_id', kind: 'select', label: '科目', optionsFrom: 'subjects' },
                    lookups,
                  )}
                  onChange={(value) => setModel({ subjectId: value || '' })}
                />
              </label>
              <label>
                <div className={styles.muted}>教学年级</div>
                <Select
                  allowClear
                  style={{ width: '100%' }}
                  value={model.gradeId || undefined}
                  options={fieldOptions(
                    { key: 'grade_id', kind: 'select', label: '教学年级', optionsFrom: 'grades' },
                    lookups,
                  )}
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

type RunStateSetter = Dispatch<SetStateAction<RunState>>;

type SubmissionListBatchStatus = {
  busy: boolean;
  completed: number;
  current: string | null;
  error: string | null;
  failed: number;
  phase: string;
  percent: number | null;
  title: string;
  total: number;
};

const createSubmissionListBatchStatus = ({
  phase,
  title,
  total,
}: {
  phase: string;
  title: string;
  total: number;
}): SubmissionListBatchStatus => ({
  busy: true,
  completed: 0,
  current: null,
  error: null,
  failed: 0,
  percent: total > 0 ? 0 : null,
  phase,
  title,
  total,
});

const submissionListBatchPercent = (completed: number, total: number) =>
  total > 0 ? Math.round(clampPercent((completed / total) * 100)) : null;

const runWithLimitedConcurrency = async <T,>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>,
) => {
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        await worker(items[index], index);
      }
    }),
  );
};

const formatDownloadProgressLabel = (progress: BlobDownloadProgress) => {
  if (progress.percent != null) return `正在下载 ${progress.percent}%`;
  const loadedMb = progress.loaded / 1024 / 1024;
  return `正在下载 ${loadedMb >= 0.1 ? `${loadedMb.toFixed(1)} MB` : `${progress.loaded} B`}`;
};

const loadInvocationArtifacts = async (client: AskCoreWorkbenchApiClient, invocationId: string) => {
  const response = await client.listInvocationArtifacts(invocationId);
  return Promise.all(
    response.artifacts.map(async (summary) => {
      try {
        return await client.getArtifact(summary.artifact_id);
      } catch {
        return {
          artifact_id: summary.artifact_id,
          content: {},
          created_at: summary.created_at,
          redaction: {},
          references: [],
          run_id: summary.run_id,
          schema_version: summary.schema_version,
          summary: summary.summary,
          title: summary.title,
          type: summary.type,
        } satisfies PluginArtifact;
      }
    }),
  );
};

const waitForInvocation = async ({
  client,
  invocationId,
  setRun,
}: {
  client: AskCoreWorkbenchApiClient;
  invocationId: string;
  setRun: RunStateSetter;
}) => {
  let lastRun = emptyRunState();
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const invocation = await client.getInvocation(invocationId);
    const artifacts = await loadInvocationArtifacts(client, invocationId).catch(() => []);
    const terminal = isTerminalInvocationState(invocation.state);
    lastRun = {
      artifacts,
      busy: !terminal,
      error:
        terminal && String(invocation.state).toLowerCase() === 'failed'
          ? invocation.failure_reason || '任务失败'
          : null,
      invocation,
      notice: terminal ? '任务已结束。' : formatInvocationRunNotice(invocation),
      tracking: 'polling',
    };
    setRun(lastRun);
    if (terminal) return lastRun;
    await delay(1500);
  }

  const degraded = {
    ...lastRun,
    busy: false,
    notice: '任务仍在后台运行，可稍后刷新查看结果。',
    tracking: 'degraded',
  } satisfies RunState;
  setRun(degraded);
  return degraded;
};

const autoPublishDraft = async ({
  client,
  draftArtifactId,
  onPublishedAssignment,
  personalized,
  setRun,
  target,
}: {
  client: AskCoreWorkbenchApiClient;
  draftArtifactId: string;
  onPublishedAssignment: (assignmentId: number) => void;
  personalized: { enabled: boolean; questionCount: number };
  setRun: RunStateSetter;
  target: { classIds: number[]; studentIds: number[] };
}) => {
  setRun((current) => ({
    ...current,
    busy: true,
    error: null,
    notice: '草稿已生成，正在自动发布作业…',
  }));
  const publish = await client.invokeAction(
    'assignment.draft.publish',
    {
      draft_artifact_id: draftArtifactId,
      personalized: {
        enabled: personalized.enabled,
        question_count: personalized.questionCount,
      },
      target: {
        class_ids: target.classIds,
        student_ids: target.studentIds,
      },
    },
    createConfirmationId(),
  );
  const finalRun = await waitForInvocation({
    client,
    invocationId: publish.invocation_id,
    setRun,
  });
  const assignmentId = extractPublishedAssignmentId(finalRun.artifacts);
  if (!assignmentId) throw new Error('发布完成，但未返回 assignment_id。');
  message.success('作业已创建并发布');
  onPublishedAssignment(assignmentId);
};

const BatchResultTable = ({
  onOpenSubmission,
  rows,
}: {
  onOpenSubmission?: (submissionId: number) => void;
  rows: JsonRecord[];
}) => (
  <Table
    dataSource={rows}
    pagination={false}
    rowKey={(row, index) => String(row.submission_id || row.id || index)}
    size="small"
    columns={[
      {
        key: 'student',
        render: (_, row) =>
          String(row.student_name || row.student_number || row.assignment_student_id || '--'),
        title: '学生',
      },
      {
        key: 'submission',
        render: (_, row) => {
          const submissionId = positiveId(row.submission_id || row.id);
          return submissionId ? (
            <Button
              className={styles.secondary}
              size="small"
              onClick={() => onOpenSubmission?.(submissionId)}
            >
              打开提交 {submissionId}
            </Button>
          ) : (
            '--'
          );
        },
        title: '提交',
        width: 150,
      },
      {
        key: 'reason',
        render: (_, row) => String(row.reason || row.error || row.status || '--'),
        title: '说明',
      },
    ]}
  />
);

const RunStatusPanel = ({
  onOpenAssignment,
  onOpenSubmission,
  run,
  title = '运行状态',
  variant = 'default',
}: {
  onOpenAssignment?: (assignmentId: number) => void;
  onOpenSubmission?: (submissionId: number) => void;
  run: RunState;
  title?: string;
  variant?: 'assignment-ocr' | 'default' | 'question-ocr' | 'submission-ocr';
}) => {
  if (variant === 'assignment-ocr' || variant === 'question-ocr' || variant === 'submission-ocr') {
    const summary =
      variant === 'assignment-ocr'
        ? buildAssignmentOcrRunSummary(run)
        : variant === 'question-ocr'
          ? buildQuestionOcrRunSummary(run)
          : buildSubmissionOcrRunSummary(run);
    const batchArtifact = summary.visibleArtifacts.find(
      (artifact) => artifact.type === 'submission.ocr.batch.result',
    );
    const batchContent = batchArtifact?.content || {};
    const autoBound = readRecordArray(batchContent.auto_bound);
    const needsBinding = readRecordArray(batchContent.needs_binding);
    const failed = readRecordArray(batchContent.failed);
    return (
      <div className={styles.stack}>
        <div className={styles.panel}>
          <div className={styles.actionBar}>
            <h3 className={styles.panelTitle}>运行状态</h3>
            <Tag color={assignmentOcrToneColor(summary.statusTone)}>
              {summary.statusTone === 'success'
                ? '已完成'
                : summary.statusTone === 'danger'
                  ? '失败'
                  : summary.statusTone === 'warning'
                    ? '注意'
                    : '运行中'}
            </Tag>
          </div>
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 650, lineHeight: 1.35 }}>
                {summary.statusTitle}
              </div>
              <div className={styles.muted} style={{ marginTop: 4 }}>
                {summary.statusDescription}
              </div>
            </div>
            <div>
              <div className={styles.actionBar} style={{ marginBottom: 8 }}>
                <span>{summary.progressLabel}</span>
                {summary.trackingLabel ? (
                  <span className={styles.muted}>{summary.trackingLabel}</span>
                ) : null}
              </div>
              <div aria-label="OCR 进度" className={styles.progressRail}>
                {summary.progressPercent == null ? null : (
                  <div
                    className={styles.progressFill}
                    style={{ width: `${summary.progressPercent}%` }}
                  />
                )}
              </div>
            </div>
            {run.notice ? <Alert showIcon message={run.notice} type="info" /> : null}
            {run.error ? <Alert showIcon message={run.error} type="error" /> : null}
            {run.invocation ? (
              <details>
                <summary className={styles.muted} style={{ cursor: 'pointer' }}>
                  技术信息
                </summary>
                <Descriptions
                  column={1}
                  size="small"
                  style={{ marginTop: 8 }}
                  items={summary.technicalItems.map((item) => ({
                    children: item.value,
                    label: item.label,
                  }))}
                />
              </details>
            ) : null}
          </Space>
        </div>

        <div className={styles.panel}>
          <h3 className={styles.panelTitle}>运行结果</h3>
          {summary.resultItems.length ? (
            <Space direction="vertical" style={{ width: '100%' }}>
              {summary.resultItems.map((item) => (
                <div className={styles.resultCard} key={`${item.title}-${item.description}`}>
                  <div className={styles.resultCardBody}>
                    <div style={{ fontWeight: 600 }}>{item.title}</div>
                    <div className={styles.muted} style={{ marginTop: 4 }}>
                      {item.description}
                    </div>
                  </div>
                  {item.assignmentId && item.actionLabel ? (
                    <Button
                      className={styles.secondary}
                      size="small"
                      onClick={() => onOpenAssignment?.(item.assignmentId!)}
                    >
                      {item.actionLabel}
                    </Button>
                  ) : null}
                </div>
              ))}
            </Space>
          ) : (
            <Empty description={summary.emptyResultText} image={Empty.PRESENTED_IMAGE_SIMPLE} />
          )}
        </div>

        {variant === 'submission-ocr' && batchArtifact ? (
          <div className={styles.panel}>
            <h3 className={styles.panelTitle}>学生提交批量处理结果</h3>
            <Descriptions
              column={2}
              size="small"
              items={[
                {
                  children: String(
                    batchContent.created_count ||
                      autoBound.length + needsBinding.length + failed.length,
                  ),
                  label: '已创建提交',
                },
                { children: String(autoBound.length), label: '自动绑定' },
                { children: String(needsBinding.length), label: '待人工处理' },
                { children: String(batchContent.graded_count || 0), label: '已批改' },
                { children: String(batchContent.explained_count || 0), label: '已生成讲解' },
                {
                  children: String(batchContent.ocr_failed_count || failed.length),
                  label: 'OCR 失败',
                },
              ]}
            />
            <Tabs
              items={[
                {
                  children: autoBound.length ? (
                    <BatchResultTable rows={autoBound} onOpenSubmission={onOpenSubmission} />
                  ) : (
                    <Empty description="暂无自动绑定提交" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                  ),
                  key: 'auto_bound',
                  label: `自动绑定 (${autoBound.length})`,
                },
                {
                  children: needsBinding.length ? (
                    <BatchResultTable rows={needsBinding} onOpenSubmission={onOpenSubmission} />
                  ) : (
                    <Empty description="暂无待人工处理提交" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                  ),
                  key: 'needs_binding',
                  label: `待人工处理 (${needsBinding.length})`,
                },
                {
                  children: failed.length ? (
                    <BatchResultTable rows={failed} />
                  ) : (
                    <Empty description="暂无失败项" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                  ),
                  key: 'failed',
                  label: `失败 (${failed.length})`,
                },
              ]}
            />
          </div>
        ) : null}
      </div>
    );
  }

  const invocation = run.invocation;
  const batchArtifact = run.artifacts.find(
    (artifact) => artifact.type === 'submission.ocr.batch.result',
  );
  const batchContent = batchArtifact?.content || {};
  const autoBound = readRecordArray(batchContent.auto_bound);
  const needsBinding = readRecordArray(batchContent.needs_binding);
  const failed = readRecordArray(batchContent.failed);

  return (
    <div className={styles.stack}>
      <div className={styles.panel}>
        <div className={styles.actionBar}>
          <h3 className={styles.panelTitle}>{title}</h3>
          {run.busy ? <Tag color="blue">运行中</Tag> : null}
        </div>
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
              { children: formatInvocationStageLabelForRecord(invocation), label: '阶段' },
              { children: invocation.failure_reason || run.error || '--', label: '错误' },
              { children: run.tracking || '--', label: '跟踪方式' },
              { children: String(run.artifacts.length), label: '结果数' },
            ]}
          />
        ) : (
          <Empty description="尚未开始运行" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        )}
        {run.notice && !invocation ? <Alert showIcon message={run.notice} type="info" /> : null}
        {run.error && !invocation ? <Alert showIcon message={run.error} type="error" /> : null}
      </div>

      {run.artifacts.length ? (
        <div className={styles.panel}>
          <h3 className={styles.panelTitle}>运行结果</h3>
          <Space direction="vertical" style={{ width: '100%' }}>
            {run.artifacts.map((artifact) => (
              <div className={styles.actionBar} key={artifact.artifact_id}>
                <Space wrap>
                  <Tag bordered={false}>{artifact.type}</Tag>
                  <span>{artifactTitle(artifact)}</span>
                </Space>
                <span className={styles.muted}>{artifact.artifact_id}</span>
              </div>
            ))}
          </Space>
        </div>
      ) : null}

      {batchArtifact ? (
        <div className={styles.panel}>
          <h3 className={styles.panelTitle}>批次结果</h3>
          <Descriptions
            column={2}
            size="small"
            items={[
              {
                children: String(
                  batchContent.created_count || autoBound.length + needsBinding.length,
                ),
                label: '已创建',
              },
              { children: String(autoBound.length), label: '自动绑定' },
              { children: String(needsBinding.length), label: '待人工处理' },
              { children: String(batchContent.graded_count || 0), label: '已批改' },
              { children: String(batchContent.explained_count || 0), label: '已生成讲解' },
              {
                children: String(batchContent.ocr_failed_count || failed.length),
                label: 'OCR 失败',
              },
            ]}
          />
          <Tabs
            items={[
              {
                children: autoBound.length ? (
                  <BatchResultTable rows={autoBound} onOpenSubmission={onOpenSubmission} />
                ) : (
                  <Empty description="暂无自动绑定提交" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                ),
                key: 'auto_bound',
                label: `自动绑定 (${autoBound.length})`,
              },
              {
                children: needsBinding.length ? (
                  <BatchResultTable rows={needsBinding} onOpenSubmission={onOpenSubmission} />
                ) : (
                  <Empty description="暂无待人工处理提交" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                ),
                key: 'needs_binding',
                label: `待人工处理 (${needsBinding.length})`,
              },
              {
                children: failed.length ? (
                  <BatchResultTable rows={failed} />
                ) : (
                  <Empty description="暂无失败项" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                ),
                key: 'failed',
                label: `失败 (${failed.length})`,
              },
            ]}
          />
        </div>
      ) : null}
    </div>
  );
};

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
      recipientItems
        .map((row) => {
          const student = isJsonRecord(row.student) ? row.student : {};
          return positiveId(student.student_id || student.id);
        })
        .filter((id) => id > 0),
    );

    if (!selectedClassId && !selectedStudentId) {
      message.info('请选择班级或单个学生');
      return;
    }

    setRecipientBusy(true);
    try {
      if (selectedStudentId) {
        const studentId = positiveId(selectedStudentId);
        if (!studentId || existingStudentIds.has(studentId)) {
          message.info('没有新的发布对象可添加');
          return;
        }
        const result = await client.createAssignmentDetailResource('assignment-students', {
          assignment_id: assignmentId,
          student_id: studentId,
        });
        setRecipientItems((items) => [...items, result.item]);
        message.success('已新增 1 个发布对象');
      } else {
        const result = await client.createAssignmentDetailResource('assignment-students', {
          assignment_id: assignmentId,
          org_unit_id: positiveId(selectedClassId),
        });
        const createdCount = Number(result.item.created_count || 0) || 0;
        const skippedCount = Number(result.item.skipped_count || 0) || 0;
        message.success(
          `已新增 ${createdCount} 个发布对象${skippedCount ? `，跳过 ${skippedCount} 个已有学生` : ''}`,
        );
      }
      setSelectedClassId('');
      setSelectedStudentId('');
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
    const removed = new Set<number>();
    const failures: string[] = [];
    try {
      for (const id of ids) {
        try {
          await client.deleteAssignmentDetailResource('assignment-students', id);
          removed.add(id);
        } catch (reason) {
          failures.push(`ID ${id}: ${asError(reason)}`);
        }
      }
      setRecipientItems((items) =>
        items.filter((row) => !removed.has(Number(row.assignment_student_id || row.id || 0) || 0)),
      );
      setRecipientSelectedIds((current) => current.filter((id) => !removed.has(id)));
      if (failures.length) {
        message.error(
          `已移除 ${removed.size} 个发布对象，失败 ${failures.length} 个：${failures[0]}`,
        );
      } else {
        message.success(`已移除 ${removed.size} 个发布对象`);
      }
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
              label: '教学年级',
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
              placeholder="选择班级"
              style={{ width: 180 }}
              value={selectedClassId || undefined}
              options={fieldOptions(
                { key: 'org_unit_id', kind: 'select', label: '班级', optionsFrom: 'classes' },
                lookups,
              )}
              onChange={(value) => setSelectedClassId(value || '')}
            />
            <Select
              allowClear
              placeholder="或选择单个学生"
              style={{ width: 180 }}
              value={selectedStudentId || undefined}
              options={fieldOptions(
                { key: 'student_id', kind: 'select', label: '学生', optionsFrom: 'students' },
                lookups,
              )}
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
                key: 'student',
                render: (_, row) => {
                  const student = isJsonRecord(row.student) ? row.student : {};
                  return displayNode(student.name);
                },
                title: '学生',
              },
              {
                key: 'classroom',
                render: (_, row) => {
                  const classroom = isJsonRecord(row.classroom) ? row.classroom : {};
                  return displayNode(classroom.name);
                },
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
  const isNeedsBinding = String(submission.status || '').toLowerCase() === 'needs_binding';
  const hasSubmissionImages = useMemo(
    () =>
      detail.files.some((file) => {
        const mediaType = String(file.media_type || '').toLowerCase();
        if (mediaType.startsWith('image/')) return true;
        const name = `${file.name || ''} ${file.object_key || ''}`.toLowerCase();
        return /\.(?:jpe?g|png|webp|heic|heif|bmp|tiff?)(?:$|\?)/.test(name);
      }),
    [detail.files],
  );
  const bindingOptions = useMemo(
    () =>
      readRecordArray(detail.students)
        .map((row) => {
          const assignmentStudentId = positiveId(row.assignment_student_id || row.id);
          const status = String(row.status || 'assigned').toLowerCase();
          if (!assignmentStudentId || status !== 'assigned') return null;
          const student = isJsonRecord(row.student) ? row.student : {};
          const classroom = isJsonRecord(row.classroom) ? row.classroom : {};
          const studentName = String(
            student.name || student.student_number || student.student_id || DEFAULT_STUDENT_LABEL,
          );
          const studentNumber = String(student.student_number || '').trim();
          const className = String(classroom.name || '').trim();
          const label = [
            studentName,
            studentNumber ? `学号 ${studentNumber}` : '',
            className ? `班级 ${className}` : '',
            `作业学生 #${assignmentStudentId}`,
          ]
            .filter(Boolean)
            .join(' · ');
          return { label, value: String(assignmentStudentId) };
        })
        .filter((option): option is { label: string; value: string } => Boolean(option)),
    [detail.students],
  );

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

  useEffect(() => {
    setBinding(String(submission.assignment_student_id || ''));
  }, [submission.assignment_student_id]);

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

  const rerunSubmissionOcr = async () => {
    if (!submissionId || !hasSubmissionImages) return;
    setBusy(true);
    try {
      await client.invokeAction(
        'submission.ocr.rerun',
        { submission_id: submissionId },
        createConfirmationId(),
      );
      message.success('重新 OCR 任务已提交');
      void onReload();
    } catch (reason) {
      message.error(asError(reason));
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
                      subResults={item.subResults}
                      referencePreview={
                        item.question ? buildQuestionPreviewDataFromPayload(item.question) : null
                      }
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
            <Popconfirm
              description="会使用当前上传图片覆盖题目结果，并按本次 OCR 重新识别学生归属。"
              disabled={busy || !submissionId || !hasSubmissionImages}
              title="重新 OCR 并批改该提交？"
              onConfirm={rerunSubmissionOcr}
            >
              <Button
                className={styles.secondary}
                disabled={busy || !submissionId || !hasSubmissionImages}
                icon={<RefreshCw size={14} />}
              >
                重新 OCR 并批改
              </Button>
            </Popconfirm>
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

      {isNeedsBinding ? (
        <div className={styles.panel}>
          <h3 className={styles.panelTitle}>学生归属</h3>
          <Space wrap>
            <Select
              allowClear
              showSearch
              disabled={!bindingOptions.length || busy}
              notFoundContent="当前作业没有可绑定的已发布学生"
              optionFilterProp="label"
              options={bindingOptions}
              placeholder="选择已发布学生"
              style={{ minWidth: 360 }}
              value={binding || undefined}
              onChange={(value) => setBinding(value || '')}
            />
            <Button
              className={styles.secondary}
              disabled={!submissionId || !binding || busy}
              loading={busy}
              onClick={async () => {
                if (!binding) return;
                setBusy(true);
                try {
                  await client.updateResource('submissions', submissionId, {
                    assignment_student_id: Number(binding),
                  });
                  message.success('绑定已更新');
                  await onReload();
                } catch (reason) {
                  message.error(asError(reason));
                } finally {
                  setBusy(false);
                }
              }}
            >
              保存绑定
            </Button>
          </Space>
          <div className={styles.muted} style={{ marginTop: 8 }}>
            仅待绑定提交需要手工确认学生归属；保存后会写入 assignment_student_id。
          </div>
        </div>
      ) : null}

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
  onOpenAssignment,
}: {
  client: AskCoreWorkbenchApiClient;
  lookups: LookupCollections;
  onBack: () => void;
  onOpenAssignment: (assignmentId: number) => void;
}) => {
  const [form] = Form.useForm();
  const [classIds, setClassIds] = useState<number[]>([]);
  const [studentIds, setStudentIds] = useState<number[]>([]);
  const [personalizedEnabled, setPersonalizedEnabled] = useState(true);
  const [personalizedQuestionCount, setPersonalizedQuestionCount] = useState(
    PERSONALIZED_QUESTION_COUNT_DEFAULT,
  );
  const [run, setRun] = useState<RunState>(() => emptyRunState());

  return (
    <div className={styles.view}>
      <DetailHeader
        subtitle="创建草稿后自动发布，并进入作业详情。"
        title="手动创建作业"
        onBack={onBack}
      />
      <div className={styles.splitWorkspace}>
        <div className={styles.formPanel}>
          <Form
            form={form}
            layout="vertical"
            onFinish={async (values) => {
              setRun({ ...emptyRunState(), busy: true, notice: '正在创建作业草稿…' });
              try {
                const questionCount =
                  parsePersonalizedQuestionCountOrThrow(personalizedQuestionCount);
                const result = await client.invokeAction(
                  'assignment.draft.create_manual',
                  compactJsonRecord({
                    due_date: values.due_date ? toIsoDateTime(String(values.due_date)) : undefined,
                    grade_id: Number(values.grade_id),
                    subject_id: Number(values.subject_id),
                    title: String(values.title || '').trim(),
                  }),
                );
                const finalRun = await waitForInvocation({
                  client,
                  invocationId: result.invocation_id,
                  setRun,
                });
                const draftArtifactId = extractDraftArtifactId(finalRun.artifacts);
                if (!draftArtifactId) throw new Error('草稿创建完成，但未返回 draft artifact。');
                await autoPublishDraft({
                  client,
                  draftArtifactId,
                  onPublishedAssignment: onOpenAssignment,
                  personalized: {
                    enabled: personalizedEnabled,
                    questionCount,
                  },
                  setRun,
                  target: { classIds, studentIds },
                });
              } catch (reason) {
                const error = asError(reason);
                setRun((current) => ({ ...current, busy: false, error, notice: null }));
              }
            }}
          >
            <div className={styles.fieldGrid}>
              <Form.Item label="标题" name="title" rules={[{ required: true }]}>
                <Input placeholder="例如 高一物理每日练习" />
              </Form.Item>
              <Form.Item label="科目" name="subject_id" rules={[{ required: true }]}>
                <Select
                  placeholder="选择科目"
                  options={fieldOptions(
                    { key: 'subject_id', kind: 'select', label: '科目', optionsFrom: 'subjects' },
                    lookups,
                  )}
                />
              </Form.Item>
              <Form.Item label="教学年级" name="grade_id" rules={[{ required: true }]}>
                <Select
                  placeholder="选择教学年级"
                  options={fieldOptions(
                    { key: 'grade_id', kind: 'select', label: '教学年级', optionsFrom: 'grades' },
                    lookups,
                  )}
                />
              </Form.Item>
              <Form.Item label="截止时间" name="due_date">
                <Input type="datetime-local" />
              </Form.Item>
            </div>

            <div className={styles.stack}>
              <h3 className={styles.panelTitle}>发布范围</h3>
              <PublishScopeSelector
                classIds={classIds}
                lookups={lookups}
                studentIds={studentIds}
                onClassIdsChange={setClassIds}
                onStudentIdsChange={setStudentIds}
              />
              <div className={styles.previewBox}>
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Checkbox
                    checked={personalizedEnabled}
                    onChange={(event) => setPersonalizedEnabled(event.target.checked)}
                  >
                    错题变式训练
                  </Checkbox>
                  <label>
                    <div className={styles.muted}>个性化作业题目数量</div>
                    <InputNumber
                      disabled={!personalizedEnabled}
                      max={PERSONALIZED_QUESTION_COUNT_MAX}
                      min={PERSONALIZED_QUESTION_COUNT_MIN}
                      value={personalizedQuestionCount}
                      onChange={(value) =>
                        setPersonalizedQuestionCount(
                          normalizePersonalizedQuestionCount(
                            value ?? PERSONALIZED_QUESTION_COUNT_DEFAULT,
                          ),
                        )
                      }
                    />
                  </label>
                </Space>
              </div>
            </div>

            <Button className={styles.primary} htmlType="submit" loading={run.busy}>
              创建并发布作业
            </Button>
          </Form>
        </div>
        <RunStatusPanel run={run} />
      </div>
    </div>
  );
};

const AssignmentOcrCreateView = ({
  client,
  lookups,
  onBack,
  onOpenAssignment,
}: {
  client: AskCoreWorkbenchApiClient;
  lookups: LookupCollections;
  onBack: () => void;
  onOpenAssignment: (assignmentId: number) => void;
}) => {
  const [form] = Form.useForm();
  const [inputType, setInputType] = useState<'scan' | 'upload'>('upload');
  const [files, setFiles] = useState<File[]>([]);
  const [scanners, setScanners] = useState<ScannerDevice[]>([]);
  const [scannersLoading, setScannersLoading] = useState(false);
  const [scannersError, setScannersError] = useState<string | null>(null);
  const [scanScannerId, setScanScannerId] = useState<string>('');
  const [scanMedia, setScanMedia] = useState<string>('A4');
  const [scanDuplex, setScanDuplex] = useState(true);
  const [scanPages, setScanPages] = useState<number | null>(null);
  const [classIds, setClassIds] = useState<number[]>([]);
  const [studentIds, setStudentIds] = useState<number[]>([]);
  const [personalizedEnabled, setPersonalizedEnabled] = useState(true);
  const [personalizedQuestionCount, setPersonalizedQuestionCount] = useState(
    PERSONALIZED_QUESTION_COUNT_DEFAULT,
  );
  const [run, setRun] = useState<RunState>(() => emptyRunState());

  useEffect(() => {
    let cancelled = false;
    setScannersLoading(true);
    setScannersError(null);
    client
      .listScannerDevices()
      .then((response) => {
        if (cancelled) return;
        setScanners(response.items || []);
        setScanScannerId(response.default_scanner_id || response.items[0]?.scanner_id || '');
        setScannersLoading(false);
      })
      .catch((reason) => {
        if (cancelled) return;
        setScanners([]);
        setScannersError(asError(reason));
        setScannersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  return (
    <div className={styles.view}>
      <DetailHeader
        subtitle="上传扫描件或调用在线扫描仪，生成作业草稿后自动发布。"
        title="OCR 创建作业"
        onBack={onBack}
      />
      <div className={styles.splitWorkspace}>
        <div className={styles.formPanel}>
          <Form
            form={form}
            layout="vertical"
            onFinish={async (values) => {
              const subjectId = Number(values.subject_id || 0);
              const gradeId = Number(values.grade_id || 0);
              if (!subjectId || !gradeId) {
                message.warning('请先选择科目和教学年级');
                return;
              }
              if (inputType === 'upload' && !files.length) {
                message.warning('请先选择扫描图片');
                return;
              }
              if (inputType === 'scan' && !scanScannerId) {
                message.warning('请先选择在线扫描仪');
                return;
              }
              setRun({
                ...emptyRunState(),
                busy: true,
                notice:
                  inputType === 'upload'
                    ? `正在上传扫描件 0/${files.length}…`
                    : '正在调用在线扫描仪并启动 OCR…',
              });
              try {
                const questionCount =
                  parsePersonalizedQuestionCountOrThrow(personalizedQuestionCount);
                const result =
                  inputType === 'upload'
                    ? await client
                        .uploadScanFiles(files, {
                          onProgress: (progress) =>
                            setRun((current) => ({
                              ...current,
                              busy: true,
                              error: null,
                              notice: runNoticeForUploadProgress('正在上传扫描件')(progress),
                            })),
                        })
                        .then((scanRefs) =>
                          client.invokeAction(
                            'assignment.draft.create_from_ocr',
                            {
                              grade_id: gradeId,
                              input_type: 'upload',
                              scan_refs: scanRefs,
                              subject_id: subjectId,
                            },
                            createConfirmationId(),
                          ),
                        )
                    : await client.invokeAction(
                        'assignment.draft.create_from_ocr',
                        compactJsonRecord({
                          grade_id: gradeId,
                          input_type: 'scan',
                          scan_duplex: scanDuplex,
                          scan_media: scanMedia,
                          scan_pages: scanPages || undefined,
                          scan_scanner_id: scanScannerId,
                          subject_id: subjectId,
                        }),
                        createConfirmationId(),
                      );
                const finalRun = await waitForInvocation({
                  client,
                  invocationId: result.invocation_id,
                  setRun,
                });
                const draftArtifactId = extractDraftArtifactId(finalRun.artifacts);
                if (!draftArtifactId) throw new Error('OCR 完成，但未返回 draft artifact。');
                await autoPublishDraft({
                  client,
                  draftArtifactId,
                  onPublishedAssignment: onOpenAssignment,
                  personalized: { enabled: personalizedEnabled, questionCount },
                  setRun,
                  target: { classIds, studentIds },
                });
              } catch (reason) {
                const error = asError(reason);
                setRun((current) => ({ ...current, busy: false, error, notice: null }));
              }
            }}
          >
            <div className={styles.fieldGrid}>
              <Form.Item label="科目" name="subject_id" rules={[{ required: true }]}>
                <Select
                  placeholder="选择科目"
                  options={fieldOptions(
                    { key: 'subject_id', kind: 'select', label: '科目', optionsFrom: 'subjects' },
                    lookups,
                  )}
                />
              </Form.Item>
              <Form.Item label="教学年级" name="grade_id" rules={[{ required: true }]}>
                <Select
                  placeholder="选择教学年级"
                  options={fieldOptions(
                    { key: 'grade_id', kind: 'select', label: '教学年级', optionsFrom: 'grades' },
                    lookups,
                  )}
                />
              </Form.Item>
              <Form.Item label="录入方式">
                <Segmented
                  options={OCR_INPUT_MODE_OPTIONS}
                  value={inputType}
                  onChange={(value) => setInputType(normalizeOcrInputType(value))}
                />
              </Form.Item>
            </div>

            {inputType === 'upload' ? (
              <Form.Item
                extra="图片会先通过 presigned direct PUT 上传到对象存储。"
                label="扫描图片"
              >
                <Upload
                  multiple
                  accept="image/*"
                  beforeUpload={() => false}
                  onChange={(info) => {
                    setFiles(
                      info.fileList.map((file) => file.originFileObj).filter(Boolean) as File[],
                    );
                  }}
                >
                  <Button icon={<UploadCloud size={14} />}>选择图片</Button>
                </Upload>
              </Form.Item>
            ) : (
              <div className={styles.fieldGrid}>
                <Form.Item
                  label="在线扫描仪"
                  extra={
                    scannersLoading
                      ? '正在读取当前用户在线的 Windows 设备助手。'
                      : scanners.length
                        ? `当前检测到 ${scanners.length} 台在线扫描仪。`
                        : '当前没有在线扫描仪，请先在 Windows 设备助手里完成绑定。'
                  }
                >
                  <Select
                    loading={scannersLoading}
                    placeholder="选择扫描仪"
                    value={scanScannerId || undefined}
                    options={scanners.map((scanner) => ({
                      label: scanner.display_name,
                      value: scanner.scanner_id,
                    }))}
                    onChange={setScanScannerId}
                  />
                </Form.Item>
                <Form.Item label="纸张">
                  <Select
                    options={OCR_SCAN_MEDIA_OPTIONS.map((value) => ({ label: value, value }))}
                    value={scanMedia}
                    onChange={setScanMedia}
                  />
                </Form.Item>
                <Form.Item label="单双面">
                  <Segmented
                    value={scanDuplex ? 'true' : 'false'}
                    options={[
                      { label: '双面', value: 'true' },
                      { label: '单面', value: 'false' },
                    ]}
                    onChange={(value) => setScanDuplex(value === 'true')}
                  />
                </Form.Item>
                <Form.Item extra="留空则使用后端默认上限。" label="最多扫描页数">
                  <InputNumber
                    min={1}
                    style={{ width: '100%' }}
                    value={scanPages}
                    onChange={(value) => setScanPages(value == null ? null : Number(value))}
                  />
                </Form.Item>
              </div>
            )}

            {files.length ? (
              <Space wrap>
                {files.map((file) => (
                  <Tag key={`${file.name}-${file.size}-${file.lastModified}`}>{file.name}</Tag>
                ))}
              </Space>
            ) : null}

            <div className={styles.stack}>
              <h3 className={styles.panelTitle}>发布范围</h3>
              <PublishScopeSelector
                classIds={classIds}
                lookups={lookups}
                studentIds={studentIds}
                onClassIdsChange={setClassIds}
                onStudentIdsChange={setStudentIds}
              />
              <div className={styles.previewBox}>
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Checkbox
                    checked={personalizedEnabled}
                    onChange={(event) => setPersonalizedEnabled(event.target.checked)}
                  >
                    错题变式训练
                  </Checkbox>
                  <label>
                    <div className={styles.muted}>个性化作业题目数量</div>
                    <InputNumber
                      disabled={!personalizedEnabled}
                      max={PERSONALIZED_QUESTION_COUNT_MAX}
                      min={PERSONALIZED_QUESTION_COUNT_MIN}
                      value={personalizedQuestionCount}
                      onChange={(value) =>
                        setPersonalizedQuestionCount(
                          normalizePersonalizedQuestionCount(
                            value ?? PERSONALIZED_QUESTION_COUNT_DEFAULT,
                          ),
                        )
                      }
                    />
                  </label>
                </Space>
              </div>
            </div>

            {scannersError ? (
              <Alert showIcon message={`加载扫描仪失败：${scannersError}`} type="warning" />
            ) : null}

            <Button
              className={styles.primary}
              htmlType="submit"
              icon={<FileScan size={14} />}
              loading={run.busy}
            >
              {inputType === 'upload' ? '开始 OCR 创建并发布' : '开始扫描、OCR 并发布'}
            </Button>
          </Form>
        </div>
        <RunStatusPanel run={run} variant="assignment-ocr" onOpenAssignment={onOpenAssignment} />
      </div>
    </div>
  );
};

const QuestionOcrCreateView = ({
  client,
  lookups,
  onBack,
}: {
  client: AskCoreWorkbenchApiClient;
  lookups: LookupCollections;
  onBack: () => void;
}) => {
  const [form] = Form.useForm();
  const [inputType, setInputType] = useState<'scan' | 'upload'>('upload');
  const [files, setFiles] = useState<File[]>([]);
  const [scanners, setScanners] = useState<ScannerDevice[]>([]);
  const [scannersLoading, setScannersLoading] = useState(false);
  const [scannersError, setScannersError] = useState<string | null>(null);
  const [scanScannerId, setScanScannerId] = useState<string>('');
  const [scanMedia, setScanMedia] = useState<string>('A4');
  const [scanDuplex, setScanDuplex] = useState(true);
  const [scanPages, setScanPages] = useState<number | null>(null);
  const [run, setRun] = useState<RunState>(() => emptyRunState());

  useEffect(() => {
    let cancelled = false;
    setScannersLoading(true);
    setScannersError(null);
    client
      .listScannerDevices()
      .then((response) => {
        if (cancelled) return;
        setScanners(response.items || []);
        setScanScannerId(response.default_scanner_id || response.items[0]?.scanner_id || '');
        setScannersLoading(false);
      })
      .catch((reason) => {
        if (cancelled) return;
        setScanners([]);
        setScannersError(asError(reason));
        setScannersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  return (
    <div className={styles.view}>
      <DetailHeader
        subtitle="上传扫描件或调用在线扫描仪，只录入题目到题库。"
        title="OCR 录入题库"
        onBack={onBack}
      />
      <div className={styles.splitWorkspace}>
        <div className={styles.formPanel}>
          <Form
            form={form}
            layout="vertical"
            onFinish={async (values) => {
              const subjectId = Number(values.subject_id || 0);
              const gradeId = Number(values.grade_id || 0);
              if (!subjectId || !gradeId) {
                message.warning('请先选择科目和教学年级');
                return;
              }
              if (inputType === 'upload' && !files.length) {
                message.warning('请先选择扫描图片');
                return;
              }
              if (inputType === 'scan' && !scanScannerId) {
                message.warning('请先选择在线扫描仪');
                return;
              }
              setRun({
                ...emptyRunState(),
                busy: true,
                notice:
                  inputType === 'upload'
                    ? `正在上传扫描件 0/${files.length}…`
                    : '正在调用在线扫描仪并启动题库 OCR…',
              });
              try {
                const result =
                  inputType === 'upload'
                    ? await client
                        .uploadScanFiles(files, {
                          onProgress: (progress) =>
                            setRun((current) => ({
                              ...current,
                              busy: true,
                              error: null,
                              notice: runNoticeForUploadProgress('正在上传扫描件')(progress),
                            })),
                        })
                        .then((scanRefs) =>
                          client.invokeAction('question.create_from_ocr', {
                            grade_id: gradeId,
                            input_type: 'upload',
                            scan_refs: scanRefs,
                            subject_id: subjectId,
                          }),
                        )
                    : await client.invokeAction(
                        'question.create_from_ocr',
                        compactJsonRecord({
                          grade_id: gradeId,
                          input_type: 'scan',
                          scan_duplex: scanDuplex,
                          scan_media: scanMedia,
                          scan_pages: scanPages || undefined,
                          scan_scanner_id: scanScannerId,
                          subject_id: subjectId,
                        }),
                      );
                await waitForInvocation({
                  client,
                  invocationId: result.invocation_id,
                  setRun,
                });
                message.success('题库 OCR 录入完成');
              } catch (reason) {
                const error = asError(reason);
                setRun((current) => ({ ...current, busy: false, error, notice: null }));
              }
            }}
          >
            <div className={styles.fieldGrid}>
              <Form.Item label="科目" name="subject_id" rules={[{ required: true }]}>
                <Select
                  placeholder="选择科目"
                  options={fieldOptions(
                    { key: 'subject_id', kind: 'select', label: '科目', optionsFrom: 'subjects' },
                    lookups,
                  )}
                />
              </Form.Item>
              <Form.Item label="教学年级" name="grade_id" rules={[{ required: true }]}>
                <Select
                  placeholder="选择教学年级"
                  options={fieldOptions(
                    { key: 'grade_id', kind: 'select', label: '教学年级', optionsFrom: 'grades' },
                    lookups,
                  )}
                />
              </Form.Item>
              <Form.Item label="录入方式">
                <Segmented
                  options={OCR_INPUT_MODE_OPTIONS}
                  value={inputType}
                  onChange={(value) => setInputType(normalizeOcrInputType(value))}
                />
              </Form.Item>
            </div>

            {inputType === 'upload' ? (
              <Form.Item
                extra="图片会先通过 presigned direct PUT 上传到对象存储。"
                label="扫描图片"
              >
                <Upload
                  multiple
                  accept="image/*"
                  beforeUpload={() => false}
                  onChange={(info) => {
                    setFiles(
                      info.fileList.map((file) => file.originFileObj).filter(Boolean) as File[],
                    );
                  }}
                >
                  <Button icon={<UploadCloud size={14} />}>选择图片</Button>
                </Upload>
              </Form.Item>
            ) : (
              <div className={styles.fieldGrid}>
                <Form.Item
                  label="在线扫描仪"
                  extra={
                    scannersLoading
                      ? '正在读取当前用户在线的 Windows 设备助手。'
                      : scanners.length
                        ? `当前检测到 ${scanners.length} 台在线扫描仪。`
                        : '当前没有在线扫描仪，请先在 Windows 设备助手里完成绑定。'
                  }
                >
                  <Select
                    loading={scannersLoading}
                    placeholder="选择扫描仪"
                    value={scanScannerId || undefined}
                    options={scanners.map((scanner) => ({
                      label: scanner.display_name,
                      value: scanner.scanner_id,
                    }))}
                    onChange={setScanScannerId}
                  />
                </Form.Item>
                <Form.Item label="纸张">
                  <Select
                    options={OCR_SCAN_MEDIA_OPTIONS.map((value) => ({ label: value, value }))}
                    value={scanMedia}
                    onChange={setScanMedia}
                  />
                </Form.Item>
                <Form.Item label="单双面">
                  <Segmented
                    value={scanDuplex ? 'true' : 'false'}
                    options={[
                      { label: '双面', value: 'true' },
                      { label: '单面', value: 'false' },
                    ]}
                    onChange={(value) => setScanDuplex(value === 'true')}
                  />
                </Form.Item>
                <Form.Item extra="留空则使用后端默认上限。" label="最多扫描页数">
                  <InputNumber
                    min={1}
                    style={{ width: '100%' }}
                    value={scanPages}
                    onChange={(value) => setScanPages(value == null ? null : Number(value))}
                  />
                </Form.Item>
              </div>
            )}

            {files.length ? (
              <Space wrap>
                {files.map((file) => (
                  <Tag key={`${file.name}-${file.size}-${file.lastModified}`}>{file.name}</Tag>
                ))}
              </Space>
            ) : null}

            {scannersError ? (
              <Alert showIcon message={`加载扫描仪失败：${scannersError}`} type="warning" />
            ) : null}

            <Button
              className={styles.primary}
              htmlType="submit"
              icon={<FileScan size={14} />}
              loading={run.busy}
            >
              {inputType === 'upload' ? '开始 OCR 录入题库' : '开始扫描、OCR 录入题库'}
            </Button>
          </Form>
        </div>
        <RunStatusPanel run={run} title="题库录入状态" variant="question-ocr" />
      </div>
    </div>
  );
};

const SubmissionOcrCreateView = ({
  client,
  onOpenAssignment,
  onOpenSubmission,
  onBack,
}: {
  client: AskCoreWorkbenchApiClient;
  onOpenAssignment: (assignmentId: number) => void;
  onOpenSubmission: (submissionId: number) => void;
  onBack: () => void;
}) => {
  const [assignmentId, setAssignmentId] = useState<number | null>(null);
  const [pagesPerStudent, setPagesPerStudent] = useState(2);
  const [inputType, setInputType] = useState<'scan' | 'upload'>('upload');
  const [files, setFiles] = useState<File[]>([]);
  const [scanners, setScanners] = useState<ScannerDevice[]>([]);
  const [scannersLoading, setScannersLoading] = useState(false);
  const [scannersError, setScannersError] = useState<string | null>(null);
  const [scanScannerId, setScanScannerId] = useState('');
  const [scanMedia, setScanMedia] = useState('A4');
  const [scanDuplex, setScanDuplex] = useState(true);
  const [scanPages, setScanPages] = useState<number | null>(null);
  const [assignments, setAssignments] = useState<JsonRecord[]>([]);
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);
  const [assignmentsError, setAssignmentsError] = useState<string | null>(null);
  const [assignmentDetail, setAssignmentDetail] = useState<AssignmentDetailResponse | null>(null);
  const [assignmentDetailLoading, setAssignmentDetailLoading] = useState(false);
  const [assignmentDetailError, setAssignmentDetailError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [run, setRun] = useState<RunState>(() => emptyRunState());

  useEffect(() => {
    let cancelled = false;
    setScannersLoading(true);
    setScannersError(null);
    client
      .listScannerDevices()
      .then((response) => {
        if (cancelled) return;
        setScanners(response.items || []);
        setScanScannerId(response.default_scanner_id || response.items[0]?.scanner_id || '');
        setScannersLoading(false);
      })
      .catch((reason) => {
        if (cancelled) return;
        setScanners([]);
        setScannersError(asError(reason));
        setScannersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  useEffect(() => {
    let cancelled = false;
    setAssignmentsLoading(true);
    setAssignmentsError(null);
    client
      .listAllResource('assignments')
      .then((items) => {
        if (cancelled) return;
        setAssignments(items.filter((item) => positiveId(item.assignment_id || item.id) > 0));
        setAssignmentsLoading(false);
      })
      .catch((reason) => {
        if (cancelled) return;
        setAssignments([]);
        setAssignmentsError(asError(reason));
        setAssignmentsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  useEffect(() => {
    const normalizedAssignmentId = positiveId(assignmentId);
    if (!normalizedAssignmentId) {
      setAssignmentDetail(null);
      setAssignmentDetailError(null);
      setAssignmentDetailLoading(false);
      return;
    }
    let cancelled = false;
    setAssignmentDetailLoading(true);
    setAssignmentDetailError(null);
    client
      .getAssignmentDetail(normalizedAssignmentId)
      .then((detail) => {
        if (cancelled) return;
        setAssignmentDetail(detail);
        setAssignmentDetailLoading(false);
      })
      .catch((reason) => {
        if (cancelled) return;
        setAssignmentDetail(null);
        setAssignmentDetailError(asError(reason));
        setAssignmentDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [assignmentId, client]);

  const fileCount = files.length;
  const splitCount =
    pagesPerStudent > 0 && fileCount > 0 ? Math.floor(fileCount / pagesPerStudent) : 0;
  const splitRemainder = pagesPerStudent > 0 && fileCount > 0 ? fileCount % pagesPerStudent : 0;
  const recipientCount = assignmentDetail?.students.length || 0;
  const estimatedScanSubmissionCount =
    inputType === 'scan' && pagesPerStudent > 0 && positiveId(scanPages) > 0
      ? Math.floor(positiveId(scanPages) / pagesPerStudent)
      : 0;
  const validationMessage = !positiveId(assignmentId)
    ? '请先选择一条作业。'
    : pagesPerStudent <= 0
      ? '请填写每生页数。'
      : inputType === 'upload'
        ? fileCount <= 0
          ? '请先上传答题图片。'
          : splitRemainder !== 0
            ? '上传图片数量必须能被每生页数整除。'
            : null
        : !scanScannerId
          ? '请先选择在线扫描仪。'
          : null;

  const startBatchOcr = async () => {
    setSubmitError(null);
    if (validationMessage) {
      setSubmitError(validationMessage);
      return;
    }
    const normalizedAssignmentId = positiveId(assignmentId);
    setRun({
      ...emptyRunState(),
      busy: true,
      notice:
        inputType === 'upload'
          ? `正在上传图片 0/${files.length}…`
          : '正在调用在线扫描仪并启动批量 OCR、批改与讲解…',
    });
    try {
      const result =
        inputType === 'upload'
          ? await client
              .uploadScanFiles(files, {
                onProgress: (progress) =>
                  setRun((current) => ({
                    ...current,
                    busy: true,
                    error: null,
                    notice: runNoticeForUploadProgress('正在上传图片')(progress),
                  })),
              })
              .then((scanRefs) =>
                client.invokeAction('submission.create_from_ocr', {
                  assignment_id: normalizedAssignmentId,
                  input_type: 'upload',
                  pages_per_student: pagesPerStudent,
                  scan_refs: scanRefs,
                }),
              )
          : await client.invokeAction(
              'submission.create_from_ocr',
              compactJsonRecord({
                assignment_id: normalizedAssignmentId,
                input_type: 'scan',
                pages_per_student: pagesPerStudent,
                scan_duplex: scanDuplex,
                scan_media: scanMedia,
                scan_pages: scanPages || undefined,
                scan_scanner_id: scanScannerId,
              }),
            );
      await waitForInvocation({ client, invocationId: result.invocation_id, setRun });
    } catch (reason) {
      const error = asError(reason);
      setSubmitError(error);
      setRun((current) => ({ ...current, busy: false, error, notice: null }));
    }
  };

  const selectedAssignment = assignmentDetail?.assignment || {};
  const assignmentOptions = useMemo(
    () => assignments.map(buildSubmissionOcrAssignmentSelectOption),
    [assignments],
  );

  return (
    <div className={styles.view}>
      <DetailHeader
        subtitle="选择作业后上传整批答题图片或调用扫描仪，按每生页数切分并自动创建 submissions。"
        title="提交 OCR 录入"
        onBack={onBack}
      />
      <div className={styles.splitWorkspace}>
        <div className={cx(styles.formPanel, styles.submissionOcrFormPanel)}>
          <div className={styles.stack}>
            <div className={styles.submissionOcrFieldGrid}>
              <Form.Item
                required
                label="选择作业"
                extra={
                  assignmentsLoading
                    ? '正在加载作业列表…'
                    : `系统会在所选作业的发布对象范围内自动匹配学生。当前可选 ${assignments.length} 条作业。`
                }
              >
                <Select
                  showSearch
                  loading={assignmentsLoading}
                  optionFilterProp="searchText"
                  options={assignmentOptions}
                  placeholder="选择作业"
                  popupMatchSelectWidth={560}
                  value={assignmentId || undefined}
                  optionRender={(option) => {
                    const data = option.data as SubmissionOcrAssignmentSelectOption;
                    return (
                      <div className={styles.assignmentSelectOption}>
                        <div className={styles.assignmentSelectOptionTitle}>
                          {data.assignmentTitle}
                        </div>
                        {data.assignmentMeta ? (
                          <div className={styles.assignmentSelectOptionMeta}>
                            {data.assignmentMeta}
                          </div>
                        ) : null}
                      </div>
                    );
                  }}
                  onChange={(value) => setAssignmentId(Number(value))}
                />
              </Form.Item>
              <Form.Item label="录入方式">
                <Segmented
                  options={OCR_INPUT_MODE_OPTIONS}
                  value={inputType}
                  onChange={(value) => setInputType(normalizeOcrInputType(value))}
                />
              </Form.Item>
              <Form.Item extra="系统会按顺序每 n 张切成一份 submission。" label="每生页数">
                <InputNumber
                  min={1}
                  style={{ width: '100%' }}
                  value={pagesPerStudent}
                  onChange={(value) => setPagesPerStudent(Math.max(1, Number(value || 1)))}
                />
              </Form.Item>
            </div>

            {inputType === 'upload' ? (
              <Form.Item extra="上传后会按每生页数切分，再进入 OCR、批改和讲解。" label="上传图片">
                <Upload
                  multiple
                  accept="image/*"
                  beforeUpload={() => false}
                  onChange={(info) => {
                    setFiles(
                      info.fileList.map((file) => file.originFileObj).filter(Boolean) as File[],
                    );
                  }}
                >
                  <Button icon={<UploadCloud size={14} />}>选择图片</Button>
                </Upload>
              </Form.Item>
            ) : (
              <div className={styles.fieldGrid}>
                <Form.Item
                  label="在线扫描仪"
                  extra={
                    scannersLoading
                      ? '正在读取当前用户在线的 Windows 设备助手。'
                      : scanners.length
                        ? `当前检测到 ${scanners.length} 台在线扫描仪。`
                        : '当前没有在线扫描仪，请先在 Windows 设备助手里完成绑定。'
                  }
                >
                  <Select
                    loading={scannersLoading}
                    placeholder="选择扫描仪"
                    value={scanScannerId || undefined}
                    options={scanners.map((scanner) => ({
                      label: scanner.display_name,
                      value: scanner.scanner_id,
                    }))}
                    onChange={setScanScannerId}
                  />
                </Form.Item>
                <Form.Item label="纸张">
                  <Select
                    options={OCR_SCAN_MEDIA_OPTIONS.map((value) => ({ label: value, value }))}
                    value={scanMedia}
                    onChange={setScanMedia}
                  />
                </Form.Item>
                <Form.Item label="单双面">
                  <Segmented
                    value={scanDuplex ? 'true' : 'false'}
                    options={[
                      { label: '双面', value: 'true' },
                      { label: '单面', value: 'false' },
                    ]}
                    onChange={(value) => setScanDuplex(value === 'true')}
                  />
                </Form.Item>
                <Form.Item extra="达到上限或扫描仪返回结束时停止采集。" label="最多扫描页数">
                  <InputNumber
                    min={1}
                    style={{ width: '100%' }}
                    value={scanPages}
                    onChange={(value) => setScanPages(value == null ? null : Number(value))}
                  />
                </Form.Item>
              </div>
            )}

            {assignmentDetailLoading ? <Skeleton active paragraph={{ rows: 2 }} /> : null}
            {assignmentDetail ? (
              <div className={styles.previewBox}>
                <div className={styles.actionBar}>
                  <h3 className={styles.panelTitle}>作业概览</h3>
                  <Button
                    className={styles.secondary}
                    size="small"
                    onClick={() => onOpenAssignment(positiveId(assignmentId))}
                  >
                    打开作业详情
                  </Button>
                </div>
                <Descriptions
                  column={2}
                  size="small"
                  items={[
                    {
                      children: scopeText(
                        selectedAssignment.assignment_id || selectedAssignment.id,
                        '--',
                      ),
                      label: '作业编号',
                    },
                    { children: scopeText(selectedAssignment.title, '--'), label: '标题' },
                    {
                      children: scopeText(
                        assignmentDetail.subject?.name ||
                          selectedAssignment.subject_name ||
                          selectedAssignment.subject_id,
                        '--',
                      ),
                      label: '科目',
                    },
                    {
                      children: scopeText(
                        assignmentDetail.grade?.name ||
                          selectedAssignment.grade_name ||
                          selectedAssignment.grade_id,
                        '--',
                      ),
                      label: '教学年级',
                    },
                    { children: String(recipientCount), label: '发布对象' },
                    {
                      children: selectedAssignment.due_date
                        ? compactDate(String(selectedAssignment.due_date))
                        : '--',
                      label: '截止时间',
                    },
                  ]}
                />
              </div>
            ) : null}

            <div className={styles.previewBox}>
              <h3 className={styles.panelTitle}>切分预览</h3>
              <div className={styles.statGrid}>
                <div className={styles.statItem}>
                  <div className={styles.statTitle}>
                    {inputType === 'upload' ? '已选图片' : '扫描页数上限'}
                  </div>
                  <div className={styles.statValue}>
                    {inputType === 'upload' ? fileCount : scanPages || '--'}
                  </div>
                </div>
                <div className={styles.statItem}>
                  <div className={styles.statTitle}>每生页数</div>
                  <div className={styles.statValue}>{pagesPerStudent || '--'}</div>
                </div>
                <div className={styles.statItem}>
                  <div className={styles.statTitle}>
                    {inputType === 'upload' ? '将生成' : '预计最多生成'}
                  </div>
                  <div className={styles.statValue}>
                    {inputType === 'upload'
                      ? splitCount || '--'
                      : estimatedScanSubmissionCount || '--'}
                  </div>
                </div>
                <div className={styles.statItem}>
                  <div className={styles.statTitle}>发布对象</div>
                  <div className={styles.statValue}>{recipientCount || '--'}</div>
                </div>
              </div>
              <div className={styles.muted} style={{ marginTop: 10 }}>
                本次只创建切分得到的 submission，不会为未覆盖学生自动补建 submission。
                未匹配、歧义匹配或重复命中的 submission 会保留并标记为待人工处理。
                {recipientCount > 0 &&
                ((inputType === 'upload' && splitCount > recipientCount) ||
                  (inputType === 'scan' && estimatedScanSubmissionCount > recipientCount))
                  ? ` 当前作业有 ${recipientCount} 个发布对象，超出的分块会进入待人工处理。`
                  : ''}
                {inputType === 'upload' && fileCount > 0 && splitRemainder !== 0
                  ? ' 当前图片数与每生页数不整除，无法启动。'
                  : ''}
                {inputType === 'scan' && positiveId(scanPages) > 0 && pagesPerStudent > 0
                  ? ' 扫描页数上限只控制采集停止点，实际生成数量取决于扫描仪返回页数。'
                  : ''}
              </div>
            </div>

            {files.length ? (
              <Space wrap>
                {files.map((file) => (
                  <Tag key={`${file.name}-${file.size}-${file.lastModified}`}>{file.name}</Tag>
                ))}
              </Space>
            ) : null}

            {assignmentsError ? (
              <Alert showIcon message={`加载作业列表失败：${assignmentsError}`} type="warning" />
            ) : null}
            {assignmentDetailError ? (
              <Alert
                showIcon
                message={`加载作业详情失败：${assignmentDetailError}`}
                type="warning"
              />
            ) : null}
            {scannersError ? (
              <Alert showIcon message={`加载扫描仪失败：${scannersError}`} type="warning" />
            ) : null}
            {submitError ? <Alert showIcon message={submitError} type="error" /> : null}

            <Space wrap>
              <Button
                className={styles.primary}
                disabled={Boolean(validationMessage)}
                icon={<FileScan size={14} />}
                loading={run.busy}
                onClick={() => void startBatchOcr()}
              >
                {inputType === 'upload' ? '开始 OCR 创建并自动批改' : '开始扫描、OCR 并自动批改'}
              </Button>
              {validationMessage ? <span className={styles.muted}>{validationMessage}</span> : null}
            </Space>
          </div>
        </div>
        <RunStatusPanel run={run} variant="submission-ocr" onOpenSubmission={onOpenSubmission} />
      </div>
    </div>
  );
};

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
  const [organizationState, setOrganizationState] = useState<AskCoreOrganizationState | null>(null);
  const [list, setList] = useState<AskCoreWorkbenchListPayload | null>(null);
  const [lookups, setLookups] = useState<LookupCollections>(EMPTY_LOOKUPS);
  const [loading, setLoading] = useState(true);
  const [organizationLoading, setOrganizationLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<DetailState | null>(null);
  const [invocationDetailLoading, setInvocationDetailLoading] = useState(false);
  const [invocationDetailRun, setInvocationDetailRun] = useState<RunState>(() => emptyRunState());
  const [error, setError] = useState<string>();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterForm, setFilterForm] = useState<Record<string, string>>({});
  const [selectedRowKeysByResource, setSelectedRowKeysByResource] = useState<
    Partial<Record<ResourceKey, Key[]>>
  >({});
  const [submissionListBatchStatus, setSubmissionListBatchStatus] =
    useState<SubmissionListBatchStatus | null>(null);
  const listVersionRef = useRef(0);
  const loadMoreTriggerRef = useRef<HTMLDivElement | null>(null);

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

    let schools: JsonRecord[];
    let classes: JsonRecord[];
    try {
      const { units } = await askCoreWorkbenchClient.getOrganizationUnits();
      const unitById = new Map<number, JsonRecord>(
        units
          .map((unit): [number, JsonRecord] => [positiveId(unit.id), unit])
          .filter(([id]) => id > 0),
      );
      const schoolIdFor = (unit: JsonRecord) => {
        const seen = new Set<number>();
        let current: JsonRecord | undefined = unit;
        while (current) {
          const id = positiveId(current.id);
          if (!id || seen.has(id)) break;
          seen.add(id);
          if (current.unit_type === 'school') return id;
          current = unitById.get(positiveId(current.parent_id));
        }
        return null;
      };

      schools = units
        .filter((unit) => unit.unit_type === 'school')
        .map((unit) => {
          const id = positiveId(unit.id);
          return { ...unit, id, school_id: id };
        });
      classes = units
        .filter((unit) => unit.unit_type === 'class')
        .map((unit) => {
          const id = positiveId(unit.id);
          return { ...unit, class_id: id, id, school_id: schoolIdFor(unit) };
        });
    } catch {
      schools = [];
      classes = [];
    }

    setLookups({
      ...EMPTY_LOOKUPS,
      ...Object.fromEntries(entries),
      classes,
      schools,
    } as LookupCollections);
  }, []);

  const loadOrganizationState = useCallback(async () => {
    setOrganizationLoading(true);
    try {
      setOrganizationState(await askCoreWorkbenchClient.getOrganizationState());
    } catch {
      setOrganizationState(null);
    } finally {
      setOrganizationLoading(false);
    }
  }, []);

  const reloadListOrDashboard = useCallback(async () => {
    const requestVersion = listVersionRef.current + 1;
    listVersionRef.current = requestVersion;
    setError(undefined);
    if (currentRoute.kind !== 'list' && currentRoute.kind !== 'dashboard') {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadingMore(false);
    try {
      if (currentRoute.kind === 'dashboard' || !activeConfig.resource) {
        const payload = await askCoreWorkbenchClient.getDashboard();
        if (listVersionRef.current !== requestVersion) return;
        setDashboard(payload || emptyAskCoreWorkbenchDashboard());
        setList(null);
        return;
      }

      const filters = filtersFromFormState(currentRoute.resource, filterForm);
      const payload = await askCoreWorkbenchClient.listResource(currentRoute.resource, filters, {
        pageSize: PAGE_SIZE,
      });
      if (listVersionRef.current !== requestVersion) return;
      setList({
        ...payload,
        items: payload.items.map((item) => hydrateLookupLabels(item, lookups)),
      });
    } catch (err) {
      if (listVersionRef.current !== requestVersion) return;
      setError(err instanceof Error ? err.message : '加载失败');
      if (currentRoute.kind === 'list') {
        setList(emptyAskCoreWorkbenchList(currentRoute.resource, 1, PAGE_SIZE));
      }
    } finally {
      if (listVersionRef.current === requestVersion) setLoading(false);
    }
  }, [activeConfig.resource, currentRoute, filterForm, lookups]);

  const loadMoreListItems = useCallback(async () => {
    if (
      currentRoute.kind !== 'list' ||
      loading ||
      loadingMore ||
      !list?.has_more ||
      !list.next_after_id
    )
      return;
    const requestVersion = listVersionRef.current;
    const requestedAfterId = list.next_after_id;
    setLoadingMore(true);
    setError(undefined);
    try {
      const filters = filtersFromFormState(currentRoute.resource, filterForm);
      const payload = await askCoreWorkbenchClient.listResource(currentRoute.resource, filters, {
        afterId: requestedAfterId,
        includeTotal: false,
        pageSize: PAGE_SIZE,
      });
      if (listVersionRef.current !== requestVersion) return;
      const incoming = payload.items.map((item) => hydrateLookupLabels(item, lookups));
      setList((current) => {
        if (!current) return { ...payload, items: incoming };
        return {
          ...current,
          has_more: payload.has_more,
          items: mergeResourceItems(currentRoute.resource, current.items, incoming),
          next_after_id: payload.next_after_id ?? null,
          total: current.total ?? payload.total ?? null,
        };
      });
    } catch (err) {
      if (listVersionRef.current === requestVersion) {
        setError(err instanceof Error ? err.message : '加载更多失败');
      }
    } finally {
      if (listVersionRef.current === requestVersion) setLoadingMore(false);
    }
  }, [
    currentRoute,
    filterForm,
    list?.has_more,
    list?.next_after_id,
    loading,
    loadingMore,
    lookups,
  ]);

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

  const reloadInvocationDetail = useCallback(async () => {
    if (currentRoute.kind !== 'invocation') return;
    setError(undefined);
    setInvocationDetailLoading(true);
    try {
      const invocation = await askCoreWorkbenchClient.getInvocation(currentRoute.invocationId);
      const artifacts = await loadInvocationArtifacts(
        askCoreWorkbenchClient,
        currentRoute.invocationId,
      ).catch(() => []);
      const terminal = isTerminalInvocationState(invocation.state);
      setInvocationDetailRun({
        artifacts,
        busy: !terminal,
        error:
          terminal && String(invocation.state).toLowerCase() === 'failed'
            ? invocation.failure_reason || '任务失败'
            : null,
        invocation,
        notice: terminal ? '任务已结束。' : formatInvocationRunNotice(invocation),
        tracking: 'polling',
      });
    } catch (err) {
      setInvocationDetailRun(emptyRunState());
      setError(err instanceof Error ? err.message : '任务内容加载失败');
    } finally {
      setInvocationDetailLoading(false);
    }
  }, [currentRoute]);

  useEffect(() => {
    void loadLookups();
  }, [loadLookups]);

  useEffect(() => {
    void loadOrganizationState();
  }, [loadOrganizationState]);

  useEffect(() => {
    setSearchQuery('');
    setSelectedRowKeysByResource({});
  }, [activeTab]);

  useEffect(() => {
    void reloadListOrDashboard();
  }, [reloadListOrDashboard]);

  useEffect(() => {
    void reloadDetail();
  }, [reloadDetail]);

  useEffect(() => {
    void reloadInvocationDetail();
  }, [reloadInvocationDetail]);

  useEffect(() => {
    const target = loadMoreTriggerRef.current;
    if (
      currentRoute.kind !== 'list' ||
      !target ||
      loading ||
      loadingMore ||
      !list?.has_more ||
      !list.next_after_id
    )
      return;
    if (typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadMoreListItems();
      },
      { rootMargin: '260px 0px' },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [
    currentRoute.kind,
    list?.has_more,
    list?.next_after_id,
    loading,
    loadingMore,
    loadMoreListItems,
  ]);

  const filteredItems = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();
    const items = list?.items || [];
    if (!keyword) return items;
    return items.filter((item) => JSON.stringify(item).toLowerCase().includes(keyword));
  }, [list?.items, searchQuery]);

  const renderOrganizationBanner = () => {
    const organization = organizationState?.organization || null;
    const roleLabel = formatOrganizationRoleLabel(
      organization?.role || organizationState?.organization_role,
    );
    const visibleOrganizationCount = organizationState?.organizations?.length || 0;
    const organizationIdTail = shortOrganizationId(organization?.organization_id);

    if (organizationLoading && !organization) {
      return (
        <div className={styles.organizationBanner}>
          <div className={styles.organizationContent}>
            <span className={styles.organizationIcon}>
              <Building2 size={22} />
            </span>
            <div>
              <div className={styles.organizationKicker}>当前组织</div>
              <Skeleton.Button active block style={{ height: 32, width: 260 }} />
            </div>
          </div>
          <Skeleton.Button active style={{ height: 34, width: 112 }} />
        </div>
      );
    }

    return (
      <div className={styles.organizationBanner}>
        <div className={styles.organizationContent}>
          <span className={styles.organizationIcon}>
            <Building2 size={22} />
          </span>
          <div>
            <div className={styles.organizationKicker}>当前组织</div>
            <h2 className={styles.organizationName}>
              {organization?.name || '未获取到当前激活组织'}
            </h2>
            <div className={styles.organizationMeta}>
              {organization ? (
                <>
                  <Tag color="blue" style={{ borderRadius: 999, margin: 0 }}>
                    {roleLabel}
                  </Tag>
                  {organizationIdTail ? <span>ID 尾号 {organizationIdTail}</span> : null}
                  <span>{visibleOrganizationCount || 1} 个可用组织</span>
                  {organizationState?.is_super_admin ? <span>系统管理员视图</span> : null}
                </>
              ) : (
                <span>工作台数据已继续加载，请打开组织管理确认当前组织。</span>
              )}
            </div>
          </div>
        </div>
        <div className={styles.organizationAction}>
          <Link aria-label="打开组织管理" to="/organization">
            <Button className={styles.primary} icon={<ExternalLink size={14} />} size="small">
              打开组织管理
            </Button>
          </Link>
        </div>
      </div>
    );
  };

  const renderDashboard = () => {
    const recent = dashboard.recent_invocations || [];
    const counts = dashboard.counts || {};
    const invocationColumns = buildInvocationColumns((record) => {
      const invocationId = String(record.invocation_id || '').trim();
      if (!invocationId) return;
      navigate(routeFor('overview', `/invocations/${encodeURIComponent(invocationId)}`));
    });
    const stats = [
      { key: 'submissions', label: '提交', value: counts.submissions || 0 },
      { key: 'assignments', label: '作业', value: counts.assignments || 0 },
      { key: 'questions', label: '题目', value: counts.questions || 0 },
    ];

    return (
      <div className={styles.view}>
        {renderOrganizationBanner()}
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
            dataSource={recent}
            locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
            pagination={false}
            rowKey={(record) => String(record.invocation_id || record.run_id)}
            scroll={{ x: 1150 }}
            size="middle"
          />
        </div>
      </div>
    );
  };

  const renderResourceList = (resource: ResourceKey) => {
    const config = ASKCORE_WORKBENCH_TABS.find((tab) => tab.resource === resource)!;
    const filters = RESOURCE_FILTER_FIELDS[resource] || [];
    const listPending = loading && !loadingMore;
    const displayedItems = listPending ? [] : filteredItems;
    const visibleIds = new Set(
      displayedItems.map((item) => getRecordId(resource, item)).filter((id) => id > 0),
    );
    const selectedRowKeys = selectedRowKeysByResource[resource] || [];
    const setResourceSelectedRowKeys = (keys: Key[]) =>
      setSelectedRowKeysByResource((current) => ({ ...current, [resource]: keys }));
    const selectedKeySet = new Set(
      selectedRowKeys.map((key) => Number(key)).filter((id) => id > 0),
    );
    const selectedIds = [...visibleIds].filter((id) => selectedKeySet.has(id));
    const allVisibleSelected =
      visibleIds.size > 0 && [...visibleIds].every((id) => selectedKeySet.has(id));
    const submissionBatchBusy = Boolean(submissionListBatchStatus?.busy);
    const updateSubmissionBatchProgress = (
      updater: (current: SubmissionListBatchStatus) => SubmissionListBatchStatus,
    ) => {
      setSubmissionListBatchStatus((current) => (current ? updater(current) : current));
    };
    const markSubmissionBatchItemDone = ({
      failed,
      message: failureMessage,
    }: {
      failed: boolean;
      message?: string;
    }) => {
      updateSubmissionBatchProgress((current) => {
        const completed = Math.min(current.total, current.completed + 1);
        return {
          ...current,
          completed,
          error: failureMessage || current.error,
          failed: failed ? current.failed + 1 : current.failed,
          percent: submissionListBatchPercent(completed, current.total),
        };
      });
    };
    const runSubmissionDurableBatch = async ({
      action,
      confirmation,
      concurrency,
      paramsForId,
      prepare,
      title,
    }: {
      action: string;
      confirmation?: boolean;
      concurrency: number;
      paramsForId: (submissionId: number) => JsonRecord;
      prepare?: (submissionId: number) => Promise<void>;
      title: string;
    }) => {
      const targets = [...selectedIds];
      if (!targets.length || submissionBatchBusy) return;
      const failures: string[] = [];
      setSubmissionListBatchStatus(
        createSubmissionListBatchStatus({
          phase: '正在提交后台任务',
          title,
          total: targets.length,
        }),
      );

      await runWithLimitedConcurrency(targets, concurrency, async (submissionId, index) => {
        const label = `提交 ${submissionId}`;
        updateSubmissionBatchProgress((current) => ({
          ...current,
          current: `${label} (${index + 1}/${targets.length})`,
          phase: '正在准备',
        }));
        try {
          await prepare?.(submissionId);
          const result = await askCoreWorkbenchClient.invokeAction(
            action,
            paramsForId(submissionId),
            confirmation ? createConfirmationId() : undefined,
          );
          const finalRun = await waitForInvocation({
            client: askCoreWorkbenchClient,
            invocationId: result.invocation_id,
            setRun: (value) => {
              const nextRun = typeof value === 'function' ? value(emptyRunState()) : value;
              updateSubmissionBatchProgress((current) => ({
                ...current,
                current: label,
                phase: nextRun.invocation
                  ? `${formatInvocationStageLabelForRecord(nextRun.invocation)} · ${formatInvocationRunNotice(nextRun.invocation)}`
                  : '后台任务运行中',
              }));
            },
          });
          if (finalRun.error) throw new Error(finalRun.error);
          markSubmissionBatchItemDone({ failed: false });
        } catch (reason) {
          const error = asError(reason);
          failures.push(`${label}: ${error}`);
          markSubmissionBatchItemDone({ failed: true, message: error });
        }
      });

      const failedCount = failures.length;
      setSubmissionListBatchStatus((current) =>
        current
          ? {
              ...current,
              busy: false,
              current: null,
              error: failedCount ? failures[0] : null,
              failed: failedCount,
              phase: failedCount
                ? `已完成 ${targets.length - failedCount} 条，失败 ${failedCount} 条`
                : '全部完成',
              percent: 100,
            }
          : current,
      );
      if (failedCount) {
        message.error(`批量任务完成，失败 ${failedCount} 条：${failures[0]}`);
      } else {
        message.success(`${title}完成`);
        setResourceSelectedRowKeys([]);
      }
      await reloadListOrDashboard();
    };
    const runSubmissionOcrBatch = () =>
      runSubmissionDurableBatch({
        action: 'submission.ocr.rerun',
        concurrency: 1,
        confirmation: true,
        paramsForId: (submissionId) => ({ submission_id: submissionId }),
        prepare: async (submissionId) => {
          const payload = await askCoreWorkbenchClient.getSubmissionDetail(submissionId);
          if (!payload.files.some(isImageFile)) throw new Error('该提交没有可用于 OCR 的上传图片');
        },
        title: '批量重新 OCR 并批改',
      });
    const runSubmissionGradeBatch = () =>
      runSubmissionDurableBatch({
        action: 'submission.grade.run',
        concurrency: 2,
        paramsForId: (submissionId) => ({ submission_id: submissionId }),
        title: '批量批改/讲解',
      });
    const runSubmissionReportGenerateBatch = () =>
      runSubmissionDurableBatch({
        action: 'submission.report.generate',
        concurrency: 2,
        paramsForId: (submissionId) => ({ force: true, submission_id: submissionId }),
        title: '批量生成报告',
      });
    const runSubmissionReportDownloadBatch = async () => {
      const targets = [...selectedIds];
      if (!targets.length || submissionBatchBusy) return;
      setSubmissionListBatchStatus(
        createSubmissionListBatchStatus({
          phase: '正在打包报告',
          title: '批量下载报告',
          total: targets.length,
        }),
      );
      try {
        const result = await askCoreWorkbenchClient.downloadSubmissionReportsZip(targets, {
          onProgress: (progress) => {
            setSubmissionListBatchStatus((current) =>
              current
                ? {
                    ...current,
                    completed: progress.phase === 'completed' ? targets.length : current.completed,
                    phase:
                      progress.phase === 'completed'
                        ? '下载完成'
                        : formatDownloadProgressLabel(progress),
                    percent:
                      progress.phase === 'completed' ? 100 : (progress.percent ?? current.percent),
                  }
                : current,
            );
          },
        });
        downloadBlob(result.blob, result.filename || 'submission-reports.zip');
        setSubmissionListBatchStatus((current) =>
          current
            ? {
                ...current,
                busy: false,
                completed: targets.length,
                current: null,
                error: null,
                failed: 0,
                phase: '下载完成',
                percent: 100,
              }
            : current,
        );
        message.success('批量报告下载完成');
        setResourceSelectedRowKeys([]);
      } catch (reason) {
        const error = asError(reason);
        setSubmissionListBatchStatus((current) =>
          current
            ? {
                ...current,
                busy: false,
                current: null,
                error,
                failed: targets.length,
                phase: '下载失败',
              }
            : current,
        );
        message.error(`批量报告下载失败：${error}`);
      }
    };
    const selectPrinterForSubmissionBatch = async (): Promise<PrinterDevice | null> => {
      const payload = await askCoreWorkbenchClient.listPrinterDevices();
      const printers = payload.items.filter((printer) => printer.online);
      if (!printers.length) {
        message.error('没有在线打印机');
        return null;
      }
      let selectedPrinterId =
        printers.find((printer) => printer.printer_id === payload.default_printer_id)?.printer_id ||
        printers[0].printer_id;
      return new Promise((resolve) => {
        Modal.confirm({
          cancelText: '取消',
          content: (
            <Select
              defaultValue={selectedPrinterId}
              style={{ width: '100%' }}
              options={printers.map((printer) => ({
                label: printer.display_name || printer.printer_id,
                value: printer.printer_id,
              }))}
              onChange={(value) => {
                selectedPrinterId = value;
              }}
            />
          ),
          okText: '开始打印',
          onCancel: () => resolve(null),
          onOk: () =>
            resolve(
              printers.find((printer) => printer.printer_id === selectedPrinterId) || printers[0],
            ),
          title: '选择打印机',
        });
      });
    };
    const runSubmissionReportPrintBatch = async () => {
      const targets = [...selectedIds];
      if (!targets.length || submissionBatchBusy) return;
      let printer: PrinterDevice | null = null;
      try {
        printer = await selectPrinterForSubmissionBatch();
      } catch (reason) {
        message.error(`加载打印机失败：${asError(reason)}`);
        return;
      }
      if (!printer) return;
      setSubmissionListBatchStatus(
        createSubmissionListBatchStatus({
          phase: '正在提交批量打印任务',
          title: '批量打印报告',
          total: targets.length,
        }),
      );
      try {
        const result = await askCoreWorkbenchClient.invokeAction('submission.report.print_batch', {
          duplex: true,
          media: 'iso_a4_210x297mm',
          printer_id: printer.printer_id,
          submission_ids: targets,
        });
        const finalRun = await waitForInvocation({
          client: askCoreWorkbenchClient,
          invocationId: result.invocation_id,
          setRun: (value) => {
            const nextRun = typeof value === 'function' ? value(emptyRunState()) : value;
            setSubmissionListBatchStatus((current) =>
              current
                ? {
                    ...current,
                    current: printer?.display_name || printer?.printer_id || null,
                    phase: nextRun.invocation
                      ? `${formatInvocationStageLabelForRecord(nextRun.invocation)} · ${formatInvocationRunNotice(nextRun.invocation)}`
                      : '后台任务运行中',
                  }
                : current,
            );
          },
        });
        if (finalRun.error) throw new Error(finalRun.error);
        setSubmissionListBatchStatus((current) =>
          current
            ? {
                ...current,
                busy: false,
                completed: targets.length,
                current: null,
                error: null,
                failed: 0,
                phase: '打印任务已提交',
                percent: 100,
              }
            : current,
        );
        message.success('批量打印任务已提交');
        setResourceSelectedRowKeys([]);
        await reloadListOrDashboard();
      } catch (reason) {
        const error = asError(reason);
        setSubmissionListBatchStatus((current) =>
          current
            ? {
                ...current,
                busy: false,
                current: null,
                error,
                failed: targets.length,
                phase: '打印失败',
              }
            : current,
        );
        message.error(`批量打印失败：${error}`);
      }
    };

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
                setResourceSelectedRowKeys([]);
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
            ) : resource === 'questions' ? (
              <>
                <Button
                  className={styles.secondary}
                  icon={<FileScan size={14} />}
                  onClick={() => navigate(routeFor('questions', '/questions/new/ocr'))}
                >
                  OCR 录入
                </Button>
                <Button
                  className={styles.primary}
                  icon={<Plus size={14} />}
                  onClick={() => navigate(routeFor('questions', '/questions/new'))}
                >
                  {config.newLabel || '手动新建'}
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
              disabled={!selectedIds.length || submissionBatchBusy}
              title={`批量删除 ${selectedIds.length} 条记录？`}
              onConfirm={async () => {
                const deleted: number[] = [];
                const failed: string[] = [];
                for (const id of selectedIds) {
                  try {
                    await askCoreWorkbenchClient.deleteResource(resource, id);
                    deleted.push(id);
                  } catch (error) {
                    if (isAskCoreWorkbenchDeleteNotFound(error)) {
                      deleted.push(id);
                    } else {
                      failed.push(`ID ${id}: ${asError(error)}`);
                    }
                  }
                }
                if (failed.length) {
                  message.error(
                    `已删除 ${deleted.length} 条，失败 ${failed.length} 条：${failed[0]}`,
                  );
                } else {
                  message.success('批量删除完成');
                }
                setResourceSelectedRowKeys([]);
                await reloadListOrDashboard();
              }}
            >
              <Button
                danger
                disabled={!selectedIds.length || submissionBatchBusy}
                icon={<Trash2 size={14} />}
              >
                批量删除
              </Button>
            </Popconfirm>
            {resource === 'submissions' ? (
              <>
                <Popconfirm
                  description="会使用各提交已有图片覆盖 OCR、批改和学生归属结果；没有图片的提交会记录为失败。"
                  disabled={!selectedIds.length || submissionBatchBusy}
                  title={`重新 OCR 并批改 ${selectedIds.length} 份提交？`}
                  onConfirm={() => void runSubmissionOcrBatch()}
                >
                  <Button
                    className={styles.secondary}
                    disabled={!selectedIds.length || submissionBatchBusy}
                    icon={<RefreshCw size={14} />}
                  >
                    重新 OCR 并批改
                  </Button>
                </Popconfirm>
                <Button
                  className={styles.secondary}
                  disabled={!selectedIds.length || submissionBatchBusy}
                  onClick={() => void runSubmissionGradeBatch()}
                >
                  批改/讲解
                </Button>
                <Button
                  className={styles.secondary}
                  disabled={!selectedIds.length || submissionBatchBusy}
                  onClick={() => void runSubmissionReportGenerateBatch()}
                >
                  生成报告
                </Button>
                <Button
                  className={styles.secondary}
                  disabled={!selectedIds.length || submissionBatchBusy}
                  icon={<Download size={14} />}
                  onClick={() => void runSubmissionReportDownloadBatch()}
                >
                  下载报告
                </Button>
                <Button
                  className={styles.secondary}
                  disabled={!selectedIds.length || submissionBatchBusy}
                  icon={<Printer size={14} />}
                  onClick={() => void runSubmissionReportPrintBatch()}
                >
                  打印报告
                </Button>
              </>
            ) : null}
          </Space>
          <span className={styles.muted}>
            已选 {selectedIds.length} 条。详情页将占用整个工作区，不再打开右侧抽屉。
          </span>
        </div>

        {resource === 'submissions' && submissionListBatchStatus ? (
          <div className={styles.panel}>
            <div className={styles.actionBar} style={{ marginBottom: 8 }}>
              <Space wrap>
                <strong>{submissionListBatchStatus.title}</strong>
                <Tag
                  color={
                    submissionListBatchStatus.busy
                      ? 'blue'
                      : submissionListBatchStatus.error
                        ? 'red'
                        : 'green'
                  }
                >
                  {submissionListBatchStatus.busy
                    ? '运行中'
                    : submissionListBatchStatus.error
                      ? '有失败'
                      : '完成'}
                </Tag>
              </Space>
              <span className={styles.muted}>
                已处理 {submissionListBatchStatus.completed}/{submissionListBatchStatus.total}
                {submissionListBatchStatus.failed
                  ? `，失败 ${submissionListBatchStatus.failed}`
                  : ''}
              </span>
            </div>
            <div className={styles.actionBar} style={{ marginBottom: 8 }}>
              <span>{submissionListBatchStatus.phase}</span>
              {submissionListBatchStatus.current ? (
                <span className={styles.muted}>{submissionListBatchStatus.current}</span>
              ) : null}
            </div>
            <div aria-label="批量任务进度" className={styles.progressRail}>
              {submissionListBatchStatus.percent == null ? null : (
                <div
                  className={styles.progressFill}
                  style={{ width: `${submissionListBatchStatus.percent}%` }}
                />
              )}
            </div>
            {submissionListBatchStatus.error ? (
              <Alert
                showIcon
                style={{ marginTop: 10 }}
                title={submissionListBatchStatus.error}
                type="error"
              />
            ) : null}
          </div>
        ) : null}

        <div className={styles.listStatusBar}>
          <Checkbox
            checked={allVisibleSelected}
            disabled={!visibleIds.size || loading}
            indeterminate={Boolean(selectedIds.length) && !allVisibleSelected}
            onChange={(event) => {
              setResourceSelectedRowKeys(event.target.checked ? [...visibleIds] : []);
            }}
          >
            全选当前显示记录
          </Checkbox>
          <span>
            {listPending
              ? '正在加载…'
              : `已加载 ${list?.items.length ?? 0} 条${
                  list?.total != null ? ` / ${list.total} 条` : ''
                }，当前显示 ${displayedItems.length} 条。`}
          </span>
        </div>

        {listPending ? (
          <Skeleton active paragraph={{ rows: 6 }} />
        ) : displayedItems.length ? (
          <div className={styles.resourceMasonry}>
            {displayedItems.map((record) => {
              const id = getRecordId(resource, record);
              const selected = id > 0 && selectedKeySet.has(id);
              const detailRoute = id ? buildResourceEntityPath(resource, id) : null;
              return (
                <article
                  className={cx(styles.resourceCard, selected && styles.resourceCardSelected)}
                  key={`${resource}-${id || JSON.stringify(record)}`}
                  onClick={() => {
                    if (!detailRoute) return;
                    navigate(routeFor(resource as AskCoreWorkbenchTab, detailRoute));
                  }}
                >
                  <div className={styles.resourceCardHeader}>
                    <Checkbox
                      checked={selected}
                      disabled={id <= 0 || loading}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) => {
                        if (id <= 0) return;
                        setResourceSelectedRowKeys(
                          event.target.checked
                            ? [...new Set([...selectedRowKeys.map(Number), id])]
                            : selectedRowKeys.map(Number).filter((key) => key !== id),
                        );
                      }}
                    />
                    <div className={styles.resourceCardBody}>
                      <div className={styles.resourceCardTitle}>
                        {getRecordTitle(resource, record)}
                      </div>
                      <div className={styles.resourceCardMeta}>
                        {buildResourceEntityPath(resource, id || 0)}
                      </div>
                    </div>
                    <Button
                      size="small"
                      type="link"
                      onClick={(event) => {
                        event.stopPropagation();
                        if (!detailRoute) return;
                        navigate(routeFor(resource as AskCoreWorkbenchTab, detailRoute));
                      }}
                    >
                      管理
                    </Button>
                  </div>

                  <div className={styles.resourceCardFields}>
                    {(config.columns || []).slice(0, 5).map((column) => {
                      if (resource === 'questions' && column.dataIndex === 'content') {
                        return (
                          <div className={styles.resourcePreviewBlock} key={column.dataIndex}>
                            <QuestionSummaryPreview
                              preview={buildQuestionPreviewDataFromPayload(record)}
                            />
                          </div>
                        );
                      }
                      const primary = column.displayIndex
                        ? record[column.displayIndex] || record[column.dataIndex]
                        : record[column.dataIndex];
                      const secondary = column.displayIndex
                        ? record[column.dataIndex]
                        : column.secondaryIndex
                          ? record[column.secondaryIndex]
                          : undefined;
                      return (
                        <div
                          className={styles.resourceFieldChip}
                          key={column.displayIndex || column.dataIndex}
                        >
                          <span>{column.title}</span>
                          <strong>
                            {formatCellValue(primary, column)}
                            {secondary && primary !== secondary ? (
                              <span className={styles.muted}> #{String(secondary)}</span>
                            ) : null}
                          </strong>
                        </div>
                      );
                    })}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className={styles.panel}>
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />
          </div>
        )}

        {list?.has_more ? <div className={styles.scrollSentinel} ref={loadMoreTriggerRef} /> : null}
        <div className={styles.loadMoreStatus}>
          {listPending
            ? '正在加载当前结果…'
            : loadingMore
              ? '正在加载更多…'
              : list?.has_more
                ? '滚动到底部会自动加载更多记录。'
                : '已加载完当前结果。'}
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
          try {
            await askCoreWorkbenchClient.deleteResource(
              currentRoute.resource,
              currentRoute.entityId,
            );
          } catch (error) {
            if (!isAskCoreWorkbenchDeleteNotFound(error)) throw error;
          }
          message.success('删除成功');
          backToList();
        }}
      />
    );
  };

  const renderInvocationDetail = () => {
    if (currentRoute.kind !== 'invocation') {
      return <Empty description="未找到任务" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
    }
    if (invocationDetailLoading) return <Skeleton active paragraph={{ rows: 6 }} />;
    const invocation = invocationDetailRun.invocation;
    if (!invocation) return <Empty description="未找到任务" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
    return (
      <div className={styles.view}>
        <DetailHeader
          backLabel="返回总览"
          subtitle={formatInvocationActionLabel(invocation)}
          title="任务内容"
          actions={
            <Button
              className={styles.secondary}
              icon={<RefreshCw size={14} />}
              onClick={() => void reloadInvocationDetail()}
            >
              刷新
            </Button>
          }
          onBack={() => navigate(routeFor('overview', '/dashboard'))}
        />
        <div className={styles.panel}>
          <h3 className={styles.panelTitle}>任务信息</h3>
          <Descriptions
            column={2}
            size="small"
            items={[
              { children: formatInvocationActionLabel(invocation), label: '任务' },
              {
                children: formatCellValue(invocation.state, {
                  dataIndex: 'state',
                  isStatus: true,
                  title: '状态',
                }),
                label: '状态',
              },
              { children: formatInvocationStageLabelForRecord(invocation), label: '阶段' },
              { children: formatInvocationResultSummary(invocation), label: '进度/结果' },
              { children: formatCellValue(invocation.created_at), label: '创建时间' },
              { children: formatCellValue(invocation.started_at), label: '开始时间' },
              { children: formatCellValue(invocation.finished_at), label: '结束时间' },
              { children: invocation.failure_reason || '--', label: '失败原因' },
            ]}
          />
        </div>
        <RunStatusPanel
          run={invocationDetailRun}
          variant={runPanelVariantForInvocation(invocation)}
          onOpenAssignment={(assignmentId) =>
            navigate(routeFor('assignments', buildResourceEntityPath('assignments', assignmentId)))
          }
          onOpenSubmission={(submissionId) =>
            navigate(routeFor('submissions', buildResourceEntityPath('submissions', submissionId)))
          }
        />
      </div>
    );
  };

  const renderMain = () => {
    if (currentRoute.kind === 'dashboard') return renderDashboard();
    if (currentRoute.kind === 'invocation') return renderInvocationDetail();
    if (currentRoute.kind === 'list') return renderResourceList(currentRoute.resource);
    if (currentRoute.kind === 'new') return renderEditOrCreate(currentRoute.resource, 'create');
    if (currentRoute.kind === 'detail' || currentRoute.kind === 'edit') return renderDetail();
    if (currentRoute.kind === 'assignment-manual') {
      return (
        <AssignmentManualCreateView
          client={askCoreWorkbenchClient}
          lookups={lookups}
          onBack={backToList}
          onOpenAssignment={(assignmentId) =>
            navigate(routeFor('assignments', buildResourceEntityPath('assignments', assignmentId)))
          }
        />
      );
    }
    if (currentRoute.kind === 'assignment-ocr') {
      return (
        <AssignmentOcrCreateView
          client={askCoreWorkbenchClient}
          lookups={lookups}
          onBack={backToList}
          onOpenAssignment={(assignmentId) =>
            navigate(routeFor('assignments', buildResourceEntityPath('assignments', assignmentId)))
          }
        />
      );
    }
    if (currentRoute.kind === 'question-ocr') {
      return (
        <QuestionOcrCreateView
          client={askCoreWorkbenchClient}
          lookups={lookups}
          onBack={() => navigate(routeFor('questions', buildResourceBasePath('questions')))}
        />
      );
    }
    if (currentRoute.kind === 'submission-ocr') {
      return (
        <SubmissionOcrCreateView
          client={askCoreWorkbenchClient}
          onBack={backToList}
          onOpenAssignment={(assignmentId) =>
            navigate(routeFor('assignments', buildResourceEntityPath('assignments', assignmentId)))
          }
          onOpenSubmission={(submissionId) =>
            navigate(routeFor('submissions', buildResourceEntityPath('submissions', submissionId)))
          }
        />
      );
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
                  void reloadInvocationDetail();
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
