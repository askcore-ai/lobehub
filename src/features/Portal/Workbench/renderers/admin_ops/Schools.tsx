'use client';

import { DeleteOutlined, PlusOutlined, ReloadOutlined, UploadOutlined } from '@ant-design/icons';
import { Flexbox } from '@lobehub/ui';
import {
  App,
  Button,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  TreeSelect,
  Typography,
  Upload,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { RcFile } from 'antd/es/upload';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useChatStore } from '@/store/chat';
import { PortalViewType } from '@/store/chat/slices/portal/initialState';

type WorkbenchRun = {
  failure_reason: string | null;
  run_id: number;
  state: string;
};

type WorkbenchArtifact = {
  artifact_id: string;
  content: any;
  schema_version: string;
  summary?: string | null;
  title?: string | null;
  type: string;
};

type WorkbenchMutationResult = {
  content: {
    entity_id: number;
    entity_type: string;
    error_code?: string | null;
    message?: string | null;
    operation: 'create' | 'update' | 'delete';
    status: 'succeeded' | 'failed';
  };
  schema_version: string;
  type: string;
};

type StartInvocationResponse = { invocation_id: string; run_id: number };
type PresignUploadResponse = {
  expires_at: string;
  object_key: string;
  required_headers: Record<string, string>;
  upload_url: string;
};

type SchoolItem = {
  address?: string | null;
  city: string;
  contact_email?: string | null;
  contact_phone?: string | null;
  name: string;
  province: string;
  school_id: number;
  tags: string[];
};

type ClassItem = {
  admission_year: number;
  class_id: number;
  education_level: string;
  grade_label?: string | null;
  graduation_year: number;
  name: string;
  school_id: number | null;
};

type TeacherItem = {
  last_login?: string | null;
  real_name: string;
  role: string;
  school_id?: number | null;
  teacher_id: number;
  teacher_number?: string | null;
  username: string;
};

type StudentItem = {
  class_id?: number | null;
  gender?: string | null;
  name: string;
  pinyin_name?: string | null;
  student_id: number;
  student_number: string;
};

type GradeItem = {
  education_level: string;
  grade_id: number;
  grade_order: number;
  is_graduation_grade: boolean;
  name: string;
};

type SubjectItem = {
  is_core_subject: boolean;
  name: string;
  subject_category?: string | null;
  subject_id: number;
};

type AssignmentItem = {
  assign_date: string;
  assignment_id: number;
  created_by_teachers: number[];
  creation_type: string;
  due_date?: string | null;
  file_keys: string[];
  grade_id: number;
  subject_id: number;
  title: string;
};

type QuestionItem = {
  content_preview: string;
  difficulty?: number | null;
  grade_id: number;
  knowledge_points: string[];
  question_id: number;
  question_type: string;
  subject_id: number;
};

type SubmissionItem = {
  assignment_id?: number | null;
  assignment_student_id: number;
  file_keys_count: number;
  graded_at?: string | null;
  graded_by: string;
  report_path?: string | null;
  score?: number | null;
  status: string;
  student_id?: number | null;
  submission_id: number;
  submitted_at: string;
  total_score?: number | null;
};

type SubmissionQuestionItem = {
  assignment_id?: number | null;
  feedback_preview?: string | null;
  is_correct?: boolean | null;
  max_score?: number | null;
  order_index: number;
  question_id?: number | null;
  score?: number | null;
  student_answer_preview?: string | null;
  student_id?: number | null;
  submission_id: number;
  submission_question_id: number;
};

type AdminEntityType =
  | 'school'
  | 'teacher'
  | 'class'
  | 'student'
  | 'grade'
  | 'subject'
  | 'assignment'
  | 'question'
  | 'submission'
  | 'submission_question';

type AdminEntityListContent = {
  entity_type: AdminEntityType;
  filters: Record<string, unknown>;
  has_more?: boolean;
  ids: number[];
  items?: unknown[];
  next_after_id?: number | null;
  page: number;
  page_size: number;
  total: number | null;
};

type SchoolTreeNode = {
  children?: SchoolTreeNode[];
  key: string;
  selectable?: boolean;
  title: string;
  value: number | string;
};

type Props = {
  artifactId: string;
  content: AdminEntityListContent;
  conversationId: string;
};

const LIST_TIMEOUT_MS = 15_000;
const MUTATION_TIMEOUT_MS = 15_000;
const BULK_DELETE_TIMEOUT_MS = 25_000;
const IMPORT_TIMEOUT_MS = 35 * 60_000;

type CsvColumnRequirement = 'conditional' | 'optional' | 'required';

type CsvColumnHintRow = {
  headers: string[];
  meaning: string;
  note?: string;
  requirement: CsvColumnRequirement;
};

type CsvHintSpec = {
  notes: string[];
  rows: CsvColumnHintRow[];
  title: string;
};

const renderCsvHeaders = (headers: string[]) => (
  <Space size={4} wrap>
    {headers.map((h) => (
      <Typography.Text code key={h}>
        {h}
      </Typography.Text>
    ))}
  </Space>
);

const renderCsvRequirement = (row: CsvColumnHintRow) => {
  const tag =
    row.requirement === 'required' ? (
      <Tag color="red">必填</Tag>
    ) : row.requirement === 'conditional' ? (
      <Tag color="gold">条件必填</Tag>
    ) : (
      <Tag>可选</Tag>
    );

  return (
    <Flexbox gap={4}>
      {tag}
      {row.note ? <Typography.Text type="secondary">{row.note}</Typography.Text> : null}
    </Flexbox>
  );
};

const EDUCATION_LEVEL_OPTIONS = [
  { label: '小学', value: '小学' },
  { label: '初中', value: '初中' },
  { label: '高中', value: '高中' },
];

const buildCsvHintSpec = (params: {
  defaultClassId?: number | null;
  defaultEducationLevel?: string | null;
  defaultSchoolCity?: string | null;
  defaultSchoolId?: number | null;
  defaultSchoolProvince?: string | null;
  entityType: AdminEntityType;
}): CsvHintSpec | null => {
  const baseNotes = [
    '第一行必须是表头；表头不区分大小写，会自动去除前后空格。',
    '编码支持 UTF-8（推荐）/ UTF-8 with BOM / GBK。',
    '列名支持中文或英文（见下表）；建议优先使用英文列名，便于复用模板。',
  ];

  if (params.entityType === 'grade') {
    return {
      notes: [...baseNotes],
      rows: [
        {
          headers: ['name', '年级'],
          meaning: '年级名称（例如：小学1年级 / 高中3年级）。同名年级会跳过。',
          requirement: 'required',
        },
        {
          headers: ['education_level', '学段'],
          meaning: '学段（建议：小学/初中/高中；兼容 primary/junior/senior）。',
          requirement: 'required',
        },
        {
          headers: ['grade_order', '序号', '顺序'],
          meaning: '排序序号（整数）。同序号冲突会报错。',
          requirement: 'required',
        },
        {
          headers: ['is_graduation_grade', '毕业年级', '毕业班'],
          meaning: '是否毕业年级（true/false 或 1/0 或 是/否）。',
          requirement: 'optional',
        },
      ],
      title: '年级 CSV 格式',
    };
  }

  if (params.entityType === 'subject') {
    return {
      notes: [...baseNotes],
      rows: [
        {
          headers: ['name', '学科'],
          meaning: '学科名称（例如：数学）。同名学科会跳过。',
          requirement: 'required',
        },
        {
          headers: ['is_core_subject', '核心学科'],
          meaning: '是否核心学科（true/false 或 1/0 或 是/否）。',
          requirement: 'optional',
        },
        {
          headers: ['subject_category', '分类'],
          meaning: '学科分类（可选，例如：文科/理科）。',
          requirement: 'optional',
        },
      ],
      title: '学科 CSV 格式',
    };
  }

  if (params.entityType === 'school') {
    const hasDefaultProvince = Boolean(params.defaultSchoolProvince?.trim());
    const hasDefaultCity = Boolean(params.defaultSchoolCity?.trim());

    return {
      notes: [
        ...baseNotes,
        '如果上方填写了“默认省/默认市”，则 CSV 每行可以不写 province/city；否则每行必须提供。',
      ],
      rows: [
        {
          headers: ['name', '学校'],
          meaning: '学校名称。用于去重（同租户同名学校会跳过）。',
          requirement: 'required',
        },
        {
          headers: ['province', '省份'],
          meaning: '学校所在省/直辖市。',
          note: hasDefaultProvince ? '已设置默认省，可不在 CSV 中提供' : '未设置默认省时必填',
          requirement: hasDefaultProvince ? 'optional' : 'conditional',
        },
        {
          headers: ['city', '城市'],
          meaning: '学校所在城市。',
          note: hasDefaultCity ? '已设置默认市，可不在 CSV 中提供' : '未设置默认市时必填',
          requirement: hasDefaultCity ? 'optional' : 'conditional',
        },
        { headers: ['address', '地址'], meaning: '学校详细地址。', requirement: 'optional' },
        { headers: ['contact_phone', '电话'], meaning: '联系电话。', requirement: 'optional' },
        { headers: ['contact_email', '邮箱'], meaning: '联系邮箱。', requirement: 'optional' },
      ],
      title: '学校 CSV 格式',
    };
  }

  if (params.entityType === 'teacher') {
    return {
      notes: [
        ...baseNotes,
        'role 支持：TEACHER / ADMIN / PRINCIPAL；未提供时默认 TEACHER。',
        'school_id 不填也可导入，但教师将不会绑定到学校（不推荐）。',
      ],
      rows: [
        {
          headers: ['username', '账号', '工号'],
          meaning: '教师登录账号（同系统内全局唯一）。',
          requirement: 'required',
        },
        {
          headers: ['password', '密码'],
          meaning: '初始密码（会被安全地哈希存储）。',
          requirement: 'required',
        },
        { headers: ['real_name', '姓名'], meaning: '教师姓名。', requirement: 'required' },
        {
          headers: ['teacher_number', '教师编号', '教工号'],
          meaning: '教师编号/工号（可选）。',
          requirement: 'optional',
        },
        {
          headers: ['school_id', '学校id'],
          meaning: '学校 ID（整数）。用于绑定学校。',
          requirement: 'optional',
        },
        {
          headers: ['role', '角色'],
          meaning: '角色枚举：TEACHER / ADMIN / PRINCIPAL。',
          requirement: 'optional',
        },
      ],
      title: '教师 CSV 格式',
    };
  }

  if (params.entityType === 'class') {
    const hasDefaultSchoolId =
      typeof params.defaultSchoolId === 'number' && Number.isFinite(params.defaultSchoolId);
    const hasDefaultEducationLevel = Boolean(params.defaultEducationLevel?.trim());

    return {
      notes: [
        ...baseNotes,
        'school_id 用于按学校筛选班级。若不想在 CSV 每行填写，可在上方选择默认值。',
        'education_level（学段）建议使用：小学 / 初中 / 高中（兼容 primary / junior / senior）。',
      ],
      rows: [
        { headers: ['name', '班级'], meaning: '班级名称（例如：1班）。', requirement: 'required' },
        {
          headers: ['school_id', '学校id'],
          meaning: '学校 ID（整数）。用于把班级绑定到学校。',
          note: hasDefaultSchoolId
            ? '已选择默认学校，可不在 CSV 中提供'
            : '未选择默认学校时建议在 CSV 中提供',
          requirement: hasDefaultSchoolId ? 'optional' : 'conditional',
        },
        {
          headers: ['admission_year', '入学年份'],
          meaning: '入学年份（整数，例如 2024）。',
          requirement: 'required',
        },
        {
          headers: ['graduation_year', '毕业年份'],
          meaning: '毕业年份（整数，例如 2027）。',
          requirement: 'required',
        },
        {
          headers: ['education_level', '学段'],
          meaning: '学段（用于年级推导）。推荐：小学 / 初中 / 高中。',
          note: hasDefaultEducationLevel
            ? '已设置默认学段，可不在 CSV 中提供'
            : '未设置默认学段时必填',
          requirement: hasDefaultEducationLevel ? 'optional' : 'conditional',
        },
      ],
      title: '班级 CSV 格式',
    };
  }

  if (params.entityType === 'student') {
    const hasDefaultClassId =
      typeof params.defaultClassId === 'number' && Number.isFinite(params.defaultClassId);

    return {
      notes: [
        ...baseNotes,
        '如果上方选择了“默认班级”，则 CSV 每行可以不写 class_id；否则每行必须提供。',
        'birth_date 若提供，格式必须为 YYYY-MM-DD（仅用于校验，不会写入数据库）。',
      ],
      rows: [
        { headers: ['name', '姓名'], meaning: '学生姓名。', requirement: 'required' },
        {
          headers: ['student_number', '学号'],
          meaning: '学号（用于去重/跳过）。',
          requirement: 'required',
        },
        {
          headers: ['class_id', '班级', '班级id'],
          meaning: '班级 ID（整数）。用于把学生加入班级。',
          note: hasDefaultClassId ? '已选择默认班级，可不在 CSV 中提供' : '未选择默认班级时必填',
          requirement: hasDefaultClassId ? 'optional' : 'conditional',
        },
        {
          headers: ['pinyin_name', '拼音', '拼音名'],
          meaning: '姓名拼音（可选）。',
          requirement: 'optional',
        },
        {
          headers: ['gender', '性别'],
          meaning: '性别（自由文本，建议：男/女）。',
          requirement: 'optional',
        },
        {
          headers: ['birth_date', '出生日期', '生日'],
          meaning: '出生日期（YYYY-MM-DD；仅校验）。',
          requirement: 'optional',
        },
      ],
      title: '学生 CSV 格式',
    };
  }

  return null;
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

type FetchInit = Parameters<typeof fetch>[1];

const fetchJson = async <T,>(url: string, init?: FetchInit): Promise<T> => {
  const res = await fetch(url, {
    ...init,
    headers: {
      ...init?.headers,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed (${res.status})`);
  }

  return res.json() as Promise<T>;
};

const sha256Hex = async (buffer: ArrayBuffer): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

const waitForRunCompletion = async (
  runId: number,
  options: { timeoutMs: number },
): Promise<{ ok: true; run: WorkbenchRun } | { error: string; ok: false; timedOut: boolean }> => {
  const startMs = Date.now();
  const terminalStates = new Set(['succeeded', 'failed', 'cancelled']);
  let pollMs = 200;

  for (;;) {
    const run = await fetchJson<WorkbenchRun>(
      `/api/workbench/runs/${encodeURIComponent(String(runId))}`,
    );
    if (terminalStates.has(String(run.state))) return { ok: true, run };

    if (Date.now() - startMs > options.timeoutMs) {
      return { error: `Timed out after ${options.timeoutMs}ms`, ok: false, timedOut: true };
    }

    await sleep(pollMs);
    pollMs = Math.min(1000, Math.floor(pollMs * 1.3));
  }
};

const listRunArtifacts = async (runId: number): Promise<WorkbenchArtifact[]> => {
  return fetchJson<WorkbenchArtifact[]>(
    `/api/workbench/runs/${encodeURIComponent(String(runId))}/artifacts`,
  );
};

const mutationResultFromArtifacts = (
  artifacts: WorkbenchArtifact[],
): WorkbenchMutationResult | null => {
  const latest = artifacts[0];
  if (!latest) return null;
  if (latest.type !== 'admin.mutation.result') return null;
  if (latest.schema_version !== 'v1') return null;
  if (!latest.content || typeof latest.content !== 'object') return null;
  return latest as unknown as WorkbenchMutationResult;
};

const startInvocation = async (options: {
  actionId: string;
  conversationId: string;
  params: Record<string, unknown>;
  requireConfirmation: boolean;
}): Promise<StartInvocationResponse> => {
  const idempotencyKey = `ui:${options.actionId}:${crypto.randomUUID()}`;
  const confirmationId = options.requireConfirmation
    ? `ui-confirm:${crypto.randomUUID()}`
    : undefined;

  return fetchJson<StartInvocationResponse>('/api/workbench/invocations', {
    body: JSON.stringify({
      action_id: options.actionId,
      confirmation_id: confirmationId,
      conversation_id: options.conversationId,
      params: options.params,
      plugin_id: 'admin.ops.v1',
    }),
    headers: {
      'Idempotency-Key': idempotencyKey,
    },
    method: 'POST',
  });
};

const presignUpload = async (payload: Record<string, unknown>): Promise<PresignUploadResponse> => {
  return fetchJson<PresignUploadResponse>('/api/workbench/object-store/presign-upload', {
    body: JSON.stringify(payload),
    method: 'POST',
  });
};

const entityTitle = (entityType: AdminEntityType): string => {
  if (entityType === 'school') return '学校';
  if (entityType === 'teacher') return '教师';
  if (entityType === 'class') return '班级';
  if (entityType === 'student') return '学生';
  if (entityType === 'grade') return '年级';
  if (entityType === 'subject') return '学科';
  if (entityType === 'assignment') return '作业';
  if (entityType === 'question') return '题目';
  if (entityType === 'submission') return '提交';
  if (entityType === 'submission_question') return '作答题目';
  return entityType;
};

const listActionIdForEntity = (entityType: AdminEntityType): string => {
  if (entityType === 'school') return 'admin.list.schools';
  if (entityType === 'teacher') return 'admin.list.teachers';
  if (entityType === 'class') return 'admin.list.classes';
  if (entityType === 'student') return 'admin.list.students';
  if (entityType === 'grade') return 'admin.list.grades';
  if (entityType === 'subject') return 'admin.list.subjects';
  if (entityType === 'assignment') return 'admin.list.assignments';
  if (entityType === 'question') return 'admin.list.questions';
  if (entityType === 'submission') return 'admin.list.submissions';
  if (entityType === 'submission_question') return 'admin.list.submission_questions';
  return 'admin.list.schools';
};

const importActionIdForEntity = (entityType: AdminEntityType): string | null => {
  if (entityType === 'school') return 'admin.import.schools';
  if (entityType === 'teacher') return 'admin.import.teachers';
  if (entityType === 'class') return 'admin.import.classes';
  if (entityType === 'student') return 'admin.import.students';
  if (entityType === 'grade') return 'admin.import.grades';
  if (entityType === 'subject') return 'admin.import.subjects';
  return null;
};

const importCsvSensitivityForEntity = (entityType: AdminEntityType): string => {
  if (entityType === 'student') return 'student_personal';
  if (entityType === 'submission' || entityType === 'submission_question') return 'student_work';
  return 'restricted';
};

const entityIdKeyForEntity = (entityType: AdminEntityType): string => {
  if (entityType === 'school') return 'school_id';
  if (entityType === 'grade') return 'grade_id';
  if (entityType === 'subject') return 'subject_id';
  if (entityType === 'teacher') return 'teacher_id';
  if (entityType === 'class') return 'class_id';
  if (entityType === 'student') return 'student_id';
  if (entityType === 'assignment') return 'assignment_id';
  if (entityType === 'question') return 'question_id';
  if (entityType === 'submission') return 'submission_id';
  if (entityType === 'submission_question') return 'submission_question_id';
  return 'id';
};

const createActionIdForEntity = (entityType: AdminEntityType): string | null => {
  if (entityType === 'school') return 'admin.create.school';
  if (entityType === 'class') return 'admin.create.class';
  if (entityType === 'teacher') return 'admin.create.teacher';
  if (entityType === 'student') return 'admin.create.student';
  if (entityType === 'grade') return 'admin.create.grade';
  if (entityType === 'subject') return 'admin.create.subject';
  if (entityType === 'assignment') return 'admin.create.assignment';
  if (entityType === 'question') return 'admin.create.question';
  if (entityType === 'submission') return 'admin.create.submission';
  if (entityType === 'submission_question') return 'admin.create.submission_question';
  return null;
};

const updateActionIdForEntity = (entityType: AdminEntityType): string | null => {
  if (entityType === 'school') return 'admin.update.school';
  if (entityType === 'class') return 'admin.update.class';
  if (entityType === 'teacher') return 'admin.update.teacher';
  if (entityType === 'student') return 'admin.update.student';
  if (entityType === 'grade') return 'admin.update.grade';
  if (entityType === 'subject') return 'admin.update.subject';
  if (entityType === 'assignment') return 'admin.update.assignment';
  if (entityType === 'question') return 'admin.update.question';
  if (entityType === 'submission') return 'admin.update.submission';
  if (entityType === 'submission_question') return 'admin.update.submission_question';
  return null;
};

const deleteActionIdForEntity = (entityType: AdminEntityType): string | null => {
  if (entityType === 'school') return 'admin.delete.school';
  if (entityType === 'class') return 'admin.delete.class';
  if (entityType === 'teacher') return 'admin.delete.teacher';
  if (entityType === 'student') return 'admin.delete.student';
  if (entityType === 'grade') return 'admin.delete.grade';
  if (entityType === 'subject') return 'admin.delete.subject';
  if (entityType === 'assignment') return 'admin.delete.assignment';
  if (entityType === 'question') return 'admin.delete.question';
  if (entityType === 'submission') return 'admin.delete.submission';
  if (entityType === 'submission_question') return 'admin.delete.submission_question';
  return null;
};

const bulkDeleteConfigForEntity = (
  entityType: AdminEntityType,
): { executeActionId: string; previewActionId: string; requestedIdsKey: string } | null => {
  if (entityType === 'school') {
    return {
      executeActionId: 'admin.bulk_delete.schools.execute',
      previewActionId: 'admin.bulk_delete.schools.preview',
      requestedIdsKey: 'school_ids',
    };
  }
  if (entityType === 'grade') {
    return {
      executeActionId: 'admin.bulk_delete.grades.execute',
      previewActionId: 'admin.bulk_delete.grades.preview',
      requestedIdsKey: 'grade_ids',
    };
  }
  if (entityType === 'subject') {
    return {
      executeActionId: 'admin.bulk_delete.subjects.execute',
      previewActionId: 'admin.bulk_delete.subjects.preview',
      requestedIdsKey: 'subject_ids',
    };
  }
  return null;
};

const buildSchoolTreeData = (schools: SchoolItem[]): SchoolTreeNode[] => {
  const byProvince = new Map<string, Map<string, SchoolItem[]>>();

  for (const row of schools) {
    const province = String(row.province || '').trim() || '未知省份';
    const city = String(row.city || '').trim() || '未知城市';

    let cityMap = byProvince.get(province);
    if (!cityMap) {
      cityMap = new Map<string, SchoolItem[]>();
      byProvince.set(province, cityMap);
    }

    const list = cityMap.get(city) ?? [];
    list.push(row);
    cityMap.set(city, list);
  }

  return Array.from(byProvince.entries())
    .sort(([a], [b]) => a.localeCompare(b, 'zh-CN'))
    .map(([province, cities]) => {
      const cityNodes: SchoolTreeNode[] = Array.from(cities.entries())
        .sort(([a], [b]) => a.localeCompare(b, 'zh-CN'))
        .map(([city, items]) => {
          const schoolNodes: SchoolTreeNode[] = items
            .slice()
            .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN'))
            .map((s) => ({
              key: `school:${s.school_id}`,
              title: `${s.name} (ID=${s.school_id})`,
              value: Number(s.school_id),
            }));

          return {
            children: schoolNodes,
            key: `city:${province}:${city}`,
            selectable: false,
            title: city,
            value: `city:${province}:${city}`,
          };
        });

      return {
        children: cityNodes,
        key: `prov:${province}`,
        selectable: false,
        title: province,
        value: `prov:${province}`,
      };
    });
};

const buildSchoolTreeDataForClassSelect = (schools: SchoolItem[]): SchoolTreeNode[] => {
  const byProvince = new Map<string, Map<string, SchoolItem[]>>();

  for (const row of schools) {
    const province = String(row.province || '').trim() || '未知省份';
    const city = String(row.city || '').trim() || '未知城市';

    let cityMap = byProvince.get(province);
    if (!cityMap) {
      cityMap = new Map<string, SchoolItem[]>();
      byProvince.set(province, cityMap);
    }

    const list = cityMap.get(city) ?? [];
    list.push(row);
    cityMap.set(city, list);
  }

  return Array.from(byProvince.entries())
    .sort(([a], [b]) => a.localeCompare(b, 'zh-CN'))
    .map(([province, cities]) => {
      const cityNodes: SchoolTreeNode[] = Array.from(cities.entries())
        .sort(([a], [b]) => a.localeCompare(b, 'zh-CN'))
        .map(([city, items]) => {
          const schoolNodes: SchoolTreeNode[] = items
            .slice()
            .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN'))
            .map((s) => ({
              key: `schoolnode:${s.school_id}`,
              selectable: false,
              title: `${s.name} (ID=${s.school_id})`,
              value: `schoolnode:${s.school_id}`,
            }));

          return {
            children: schoolNodes,
            key: `citynode:${province}:${city}`,
            selectable: false,
            title: city,
            value: `citynode:${province}:${city}`,
          };
        });

      return {
        children: cityNodes,
        key: `provnode:${province}`,
        selectable: false,
        title: province,
        value: `provnode:${province}`,
      };
    });
};

const setTreeChildrenByKey = (
  nodes: SchoolTreeNode[],
  targetKey: string,
  children: SchoolTreeNode[],
): SchoolTreeNode[] => {
  return nodes.map((node) => {
    if (node.key === targetKey) return { ...node, children };
    if (!node.children?.length) return node;
    return { ...node, children: setTreeChildrenByKey(node.children, targetKey, children) };
  });
};

const SchoolsRenderer = memo<Props>(({ artifactId, content, conversationId }) => {
  const { message } = App.useApp();
  const isSchool = content.entity_type === 'school';
  const supportsCreate = [
    'school',
    'teacher',
    'class',
    'student',
    'grade',
    'subject',
    'assignment',
    'question',
    'submission',
    'submission_question',
  ].includes(content.entity_type);
  const supportsEditDelete = [
    'school',
    'grade',
    'subject',
    'assignment',
    'question',
    'submission',
    'submission_question',
  ].includes(content.entity_type);
  const supportsBulkDelete = ['school', 'grade', 'subject'].includes(content.entity_type);
  const supportsImport = importActionIdForEntity(content.entity_type) !== null;
  const title = entityTitle(content.entity_type);

  const [selectedRowKeys, setSelectedRowKeys] = useState<number[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit'>('create');
  const [editingRow, setEditingRow] = useState<any | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<RcFile | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [schoolTreeData, setSchoolTreeData] = useState<SchoolTreeNode[]>([]);
  const [schoolTreeLoading, setSchoolTreeLoading] = useState(false);
  const [classTreeData, setClassTreeData] = useState<SchoolTreeNode[]>([]);
  const [classTreeLoading, setClassTreeLoading] = useState(false);
  const classTreeLoadedKeysRef = useRef<Set<string>>(new Set());
  const classTreeClassesBySchoolIdRef = useRef<Map<number, ClassItem[]>>(new Map());

  const [form] = Form.useForm<any>();
  const [importForm] = Form.useForm<any>();

  const defaultSchoolProvince = Form.useWatch('province', importForm);
  const defaultSchoolCity = Form.useWatch('city', importForm);
  const rawDefaultSchoolId = Form.useWatch('school_id', importForm);
  const defaultEducationLevel = Form.useWatch('education_level', importForm);
  const defaultClassId = Form.useWatch('class_id', importForm);

  const defaultSchoolId =
    typeof rawDefaultSchoolId === 'number' && Number.isFinite(rawDefaultSchoolId)
      ? rawDefaultSchoolId
      : null;

  const csvHintSpec = useMemo(
    () =>
      buildCsvHintSpec({
        defaultClassId: typeof defaultClassId === 'number' ? defaultClassId : null,
        defaultEducationLevel:
          typeof defaultEducationLevel === 'string' ? defaultEducationLevel : null,
        defaultSchoolCity: typeof defaultSchoolCity === 'string' ? defaultSchoolCity : null,
        defaultSchoolId,
        defaultSchoolProvince:
          typeof defaultSchoolProvince === 'string' ? defaultSchoolProvince : null,
        entityType: content.entity_type,
      }),
    [
      content.entity_type,
      defaultClassId,
      defaultEducationLevel,
      defaultSchoolCity,
      defaultSchoolId,
      defaultSchoolProvince,
    ],
  );

  const [listIds, setListIds] = useState<number[]>(() =>
    Array.isArray(content.ids) ? content.ids.map(Number).filter((id) => Number.isFinite(id)) : [],
  );
  const [listItems, setListItems] = useState<any[]>(() =>
    Array.isArray(content.items) ? (content.items as any[]) : [],
  );
  const [listHasMore, setListHasMore] = useState<boolean>(() => Boolean(content.has_more));
  const [listNextAfterId, setListNextAfterId] = useState<number | null>(() =>
    typeof content.next_after_id === 'number' ? content.next_after_id : null,
  );
  const [listLoadingMore, setListLoadingMore] = useState(false);

  const schoolRows: SchoolItem[] = useMemo(() => {
    if (!isSchool) return [];
    return listItems as SchoolItem[];
  }, [isSchool, listItems]);

  const teacherRows: TeacherItem[] = useMemo(() => {
    if (content.entity_type !== 'teacher') return [];
    return listItems as TeacherItem[];
  }, [content.entity_type, listItems]);

  const classRows: ClassItem[] = useMemo(() => {
    if (content.entity_type !== 'class') return [];
    return listItems as ClassItem[];
  }, [content.entity_type, listItems]);

  const studentRows: StudentItem[] = useMemo(() => {
    if (content.entity_type !== 'student') return [];
    return listItems as StudentItem[];
  }, [content.entity_type, listItems]);

  const gradeRows: GradeItem[] = useMemo(() => {
    if (content.entity_type !== 'grade') return [];
    return listItems as GradeItem[];
  }, [content.entity_type, listItems]);

  const subjectRows: SubjectItem[] = useMemo(() => {
    if (content.entity_type !== 'subject') return [];
    return listItems as SubjectItem[];
  }, [content.entity_type, listItems]);

  const assignmentRows: AssignmentItem[] = useMemo(() => {
    if (content.entity_type !== 'assignment') return [];
    return listItems as AssignmentItem[];
  }, [content.entity_type, listItems]);

  const questionRows: QuestionItem[] = useMemo(() => {
    if (content.entity_type !== 'question') return [];
    return listItems as QuestionItem[];
  }, [content.entity_type, listItems]);

  const submissionRows: SubmissionItem[] = useMemo(() => {
    if (content.entity_type !== 'submission') return [];
    return listItems as SubmissionItem[];
  }, [content.entity_type, listItems]);

  const submissionQuestionRows: SubmissionQuestionItem[] = useMemo(() => {
    if (content.entity_type !== 'submission_question') return [];
    return listItems as SubmissionQuestionItem[];
  }, [content.entity_type, listItems]);

  useEffect(() => {
    setSelectedRowKeys([]);
    setListIds(
      Array.isArray(content.ids) ? content.ids.map(Number).filter((id) => Number.isFinite(id)) : [],
    );
    setListItems(Array.isArray(content.items) ? content.items : []);
    setListHasMore(Boolean(content.has_more));
    setListNextAfterId(typeof content.next_after_id === 'number' ? content.next_after_id : null);
  }, [artifactId, content.has_more, content.ids, content.items, content.next_after_id]);

  const openListRun = useCallback(
    async (params: { filters: Record<string, unknown>; page: number; page_size: number }) => {
      const { run_id } = await startInvocation({
        actionId: listActionIdForEntity(content.entity_type),
        conversationId,
        params: {
          filters: params.filters || {},
          include_total: false,
          page: params.page,
          page_size: params.page_size,
        },
        requireConfirmation: false,
      });

      const waited = await waitForRunCompletion(run_id, { timeoutMs: LIST_TIMEOUT_MS });
      if (!waited.ok) {
        useChatStore
          .getState()
          .pushPortalView({ conversationId, runId: run_id, type: PortalViewType.Workbench });
        if (waited.timedOut) {
          message.info(`列表刷新已发起（run=${run_id}），仍在执行中。`);
          return;
        }
        throw new Error(waited.error);
      }

      if (waited.run.state !== 'succeeded') {
        useChatStore
          .getState()
          .pushPortalView({ conversationId, runId: run_id, type: PortalViewType.Workbench });
        throw new Error(`Run finished: ${waited.run.state}`);
      }

      const artifacts = await listRunArtifacts(run_id);
      const latest = artifacts[0];
      if (!latest) {
        useChatStore
          .getState()
          .pushPortalView({ conversationId, runId: run_id, type: PortalViewType.Workbench });
        message.error('List run finished but produced no artifacts.');
        return;
      }
      useChatStore.getState().pushPortalView({
        artifactId: latest?.artifact_id,
        conversationId,
        runId: run_id,
        type: PortalViewType.Workbench,
      });
    },
    [content.entity_type, conversationId, message],
  );

  const refresh = useCallback(async () => {
    await openListRun({
      filters: (content.filters as Record<string, unknown>) || {},
      page: 1,
      page_size: Math.max(1, Number(content.page_size) || 50),
    });
  }, [content.filters, content.page_size, openListRun]);

  const handleRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await refresh();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '列表刷新失败');
    } finally {
      setRefreshing(false);
    }
  }, [message, refresh, refreshing]);

  const loadMore = useCallback(async () => {
    if (listLoadingMore) return;
    if (!listHasMore) return;
    if (listNextAfterId === null) return;

    setListLoadingMore(true);
    try {
      const { run_id } = await startInvocation({
        actionId: listActionIdForEntity(content.entity_type),
        conversationId,
        params: {
          after_id: listNextAfterId,
          filters: (content.filters as Record<string, unknown>) || {},
          include_total: false,
          page: 1,
          page_size: Math.max(1, Number(content.page_size) || 50),
        },
        requireConfirmation: false,
      });

      const waited = await waitForRunCompletion(run_id, { timeoutMs: LIST_TIMEOUT_MS });
      if (!waited.ok) {
        if (waited.timedOut) {
          message.info(`加载更多已发起（run=${run_id}），仍在执行中。`);
          return;
        }
        throw new Error(waited.error);
      }
      if (waited.run.state !== 'succeeded')
        throw new Error(waited.run.failure_reason || waited.run.state);

      const artifacts = await listRunArtifacts(run_id);
      const latest = artifacts[0];
      if (!latest) throw new Error('加载更多失败：run 无 artifacts');
      if (latest.type !== 'admin.entity.list' || latest.schema_version !== 'v1') {
        throw new Error(
          `加载更多失败：unexpected artifact ${latest.type}@${latest.schema_version}`,
        );
      }

      const list = latest.content as AdminEntityListContent;
      if (String(list.entity_type) !== String(content.entity_type))
        throw new Error('加载更多失败：entity_type mismatch');

      const newIds = Array.isArray(list.ids)
        ? list.ids.map(Number).filter((id) => Number.isFinite(id))
        : [];
      setListIds((prev) => (newIds.length ? [...prev, ...newIds] : prev));

      const newItems = Array.isArray(list.items) ? list.items : [];
      setListItems((prev) => (newItems.length ? [...prev, ...newItems] : prev));

      setListHasMore(Boolean(list.has_more));
      setListNextAfterId(typeof list.next_after_id === 'number' ? list.next_after_id : null);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载更多失败');
    } finally {
      setListLoadingMore(false);
    }
  }, [
    content.entity_type,
    content.filters,
    content.page_size,
    conversationId,
    listHasMore,
    listLoadingMore,
    listNextAfterId,
    message,
  ]);

  const loadSchoolTreeForTeacherImport = useCallback(async () => {
    setSchoolTreeLoading(true);
    try {
      const pageSize = 200;
      let afterId: number | null = null;
      let guard = 0;
      const schools: SchoolItem[] = [];

      for (;;) {
        guard += 1;
        if (guard > 200) break;

        const params: Record<string, unknown> = {
          filters: {},
          include_total: false,
          page: 1,
          page_size: pageSize,
        };
        if (afterId !== null) params.after_id = afterId;

        const { run_id } = await startInvocation({
          actionId: 'admin.list.schools',
          conversationId,
          params,
          requireConfirmation: false,
        });

        const waited = await waitForRunCompletion(run_id, { timeoutMs: LIST_TIMEOUT_MS });
        if (!waited.ok)
          throw new Error(waited.timedOut ? '加载学校列表超时，请稍后重试' : waited.error);
        if (waited.run.state !== 'succeeded')
          throw new Error(waited.run.failure_reason || waited.run.state);

        const artifacts = await listRunArtifacts(run_id);
        const latest = artifacts[0];
        if (!latest) throw new Error('加载学校列表失败：run 无 artifacts');
        if (latest.type !== 'admin.entity.list' || latest.schema_version !== 'v1') {
          throw new Error(
            `加载学校列表失败：unexpected artifact ${latest.type}@${latest.schema_version}`,
          );
        }

        const list = latest.content as AdminEntityListContent;
        if (String(list.entity_type) !== 'school')
          throw new Error('加载学校列表失败：entity_type mismatch');

        const items = Array.isArray(list.items) ? (list.items as SchoolItem[]) : [];
        schools.push(...items);

        const hasMore = Boolean(list.has_more);
        const nextAfterId = typeof list.next_after_id === 'number' ? list.next_after_id : null;
        if (!hasMore || nextAfterId === null) break;
        afterId = nextAfterId;
      }

      setSchoolTreeData(buildSchoolTreeData(schools));
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载学校列表失败');
      setSchoolTreeData([]);
    } finally {
      setSchoolTreeLoading(false);
    }
  }, [conversationId, message]);

  const loadClassTreeForStudentImport = useCallback(async () => {
    setClassTreeLoading(true);
    try {
      const pageSize = 200;
      let afterId: number | null = null;
      let guard = 0;
      const schools: SchoolItem[] = [];

      for (;;) {
        guard += 1;
        if (guard > 200) break;

        const params: Record<string, unknown> = {
          filters: {},
          include_total: false,
          page: 1,
          page_size: pageSize,
        };
        if (afterId !== null) params.after_id = afterId;

        const { run_id } = await startInvocation({
          actionId: 'admin.list.schools',
          conversationId,
          params,
          requireConfirmation: false,
        });

        const waited = await waitForRunCompletion(run_id, { timeoutMs: LIST_TIMEOUT_MS });
        if (!waited.ok)
          throw new Error(waited.timedOut ? '加载学校列表超时，请稍后重试' : waited.error);
        if (waited.run.state !== 'succeeded')
          throw new Error(waited.run.failure_reason || waited.run.state);

        const artifacts = await listRunArtifacts(run_id);
        const latest = artifacts[0];
        if (!latest) throw new Error('加载学校列表失败：run 无 artifacts');
        if (latest.type !== 'admin.entity.list' || latest.schema_version !== 'v1') {
          throw new Error(
            `加载学校列表失败：unexpected artifact ${latest.type}@${latest.schema_version}`,
          );
        }

        const list = latest.content as AdminEntityListContent;
        if (String(list.entity_type) !== 'school')
          throw new Error('加载学校列表失败：entity_type mismatch');

        const items = Array.isArray(list.items) ? (list.items as SchoolItem[]) : [];
        schools.push(...items);

        const hasMore = Boolean(list.has_more);
        const nextAfterId = typeof list.next_after_id === 'number' ? list.next_after_id : null;
        if (!hasMore || nextAfterId === null) break;
        afterId = nextAfterId;
      }

      classTreeLoadedKeysRef.current.clear();
      classTreeClassesBySchoolIdRef.current.clear();
      setClassTreeData(buildSchoolTreeDataForClassSelect(schools));
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载班级下拉失败');
      setClassTreeData([]);
    } finally {
      setClassTreeLoading(false);
    }
  }, [conversationId, message]);

  const loadClassTreeNodeData = useCallback(
    async (node: any) => {
      const key = String(node?.key || node?.value || '').trim();
      if (!key) return;

      const schoolMatch = /^schoolnode:(\d+)$/.exec(key);
      const admissionMatch = /^admissionnode:(\d+):(\d+)$/.exec(key);
      if (!schoolMatch && !admissionMatch) return;
      if (classTreeLoadedKeysRef.current.has(key)) return;

      classTreeLoadedKeysRef.current.add(key);
      try {
        if (schoolMatch) {
          const schoolId = Number(schoolMatch[1]);

          let classes = classTreeClassesBySchoolIdRef.current.get(schoolId);
          if (!classes) {
            classes = [];
            const pageSize = 200;
            let afterId: number | null = null;
            let guard = 0;

            for (;;) {
              guard += 1;
              if (guard > 200) break;

              const params: Record<string, unknown> = {
                filters: { school_id: schoolId },
                include_total: false,
                page: 1,
                page_size: pageSize,
              };
              if (afterId !== null) params.after_id = afterId;

              const { run_id } = await startInvocation({
                actionId: 'admin.list.classes',
                conversationId,
                params,
                requireConfirmation: false,
              });

              const waited = await waitForRunCompletion(run_id, { timeoutMs: LIST_TIMEOUT_MS });
              if (!waited.ok)
                throw new Error(waited.timedOut ? '加载班级列表超时，请稍后重试' : waited.error);
              if (waited.run.state !== 'succeeded')
                throw new Error(waited.run.failure_reason || waited.run.state);

              const artifacts = await listRunArtifacts(run_id);
              const latest = artifacts[0];
              if (!latest) throw new Error('加载班级列表失败：run 无 artifacts');
              if (latest.type !== 'admin.entity.list' || latest.schema_version !== 'v1') {
                throw new Error(
                  `加载班级列表失败：unexpected artifact ${latest.type}@${latest.schema_version}`,
                );
              }

              const list = latest.content as AdminEntityListContent;
              if (String(list.entity_type) !== 'class')
                throw new Error('加载班级列表失败：entity_type mismatch');

              const items = Array.isArray(list.items) ? (list.items as ClassItem[]) : [];
              classes.push(...items);

              const hasMore = Boolean(list.has_more);
              const nextAfterId =
                typeof list.next_after_id === 'number' ? list.next_after_id : null;
              if (!hasMore || nextAfterId === null) break;
              afterId = nextAfterId;
            }

            classTreeClassesBySchoolIdRef.current.set(schoolId, classes);
          }

          const admissionYears = Array.from(
            new Set(classes.map((c) => Number(c.admission_year)).filter((v) => Number.isFinite(v))),
          ).sort((a, b) => b - a);

          const yearNodes: SchoolTreeNode[] = admissionYears.map((year) => ({
            key: `admissionnode:${schoolId}:${year}`,
            selectable: false,
            title: `入学 ${year}`,
            value: `admissionnode:${schoolId}:${year}`,
          }));

          setClassTreeData((prev) => setTreeChildrenByKey(prev, key, yearNodes));
          return;
        }

        if (admissionMatch) {
          const schoolId = Number(admissionMatch[1]);
          const admissionYear = Number(admissionMatch[2]);
          const classes = classTreeClassesBySchoolIdRef.current.get(schoolId);
          if (!classes) {
            classTreeLoadedKeysRef.current.delete(key);
            throw new Error('班级列表尚未加载完成，请先展开学校节点');
          }

          const classNodes: SchoolTreeNode[] = classes
            .filter((c) => Number(c.admission_year) === admissionYear)
            .map((c) => {
              const grade = String(c.grade_label || '').trim();
              const suffix = grade ? ` · ${grade}` : '';
              return {
                key: `class:${c.class_id}`,
                title: `${c.name} (ID=${c.class_id})${suffix}`,
                value: Number(c.class_id),
              };
            });
          setClassTreeData((prev) => setTreeChildrenByKey(prev, key, classNodes));
          return;
        }
      } catch (error) {
        classTreeLoadedKeysRef.current.delete(key);
        message.error(error instanceof Error ? error.message : '加载下拉失败');
      }
    },
    [conversationId, message],
  );

  useEffect(() => {
    if (!importOpen && !drawerOpen) return;
    if (!['teacher', 'class'].includes(content.entity_type)) return;
    if (schoolTreeLoading) return;
    if (schoolTreeData.length > 0) return;
    void loadSchoolTreeForTeacherImport();
  }, [
    content.entity_type,
    drawerOpen,
    importOpen,
    loadSchoolTreeForTeacherImport,
    schoolTreeData.length,
    schoolTreeLoading,
  ]);

  useEffect(() => {
    if (!importOpen && !drawerOpen) return;
    if (content.entity_type !== 'student') return;
    if (classTreeLoading) return;
    if (classTreeData.length > 0) return;
    void loadClassTreeForStudentImport();
  }, [
    classTreeData.length,
    classTreeLoading,
    content.entity_type,
    drawerOpen,
    importOpen,
    loadClassTreeForStudentImport,
  ]);

  const openCreate = () => {
    if (!supportsCreate) return;
    setDrawerMode('create');
    setEditingRow(null);
    form.resetFields();
    if (content.entity_type === 'school') {
      form.setFieldsValue({ tags: [] } as any);
    }
    if (content.entity_type === 'teacher') {
      form.setFieldsValue({ role: 'TEACHER' } as any);
    }
    if (content.entity_type === 'subject') {
      form.setFieldsValue({ is_core_subject: true } as any);
    }
    if (content.entity_type === 'assignment') {
      form.setFieldsValue({ creation_type: 'teacher' } as any);
    }
    if (content.entity_type === 'question') {
      form.setFieldsValue({
        answer_json:
          '{"version":"question.answer@v1","sub_answers":[{"sub_question_id":"sq1","value":{"raw_text":""}}]}',
        content_json:
          '{"version":"question.content@v1","stem":{"nodes":[{"kind":"text","text":""}]},"assets":[],"sub_questions":[{"id":"sq1","prompt":{"nodes":[{"kind":"text","text":""}]}}]}',
        creation_type: 'teacher',
        question_type: 'problem_solving',
      } as any);
    }
    if (content.entity_type === 'submission') {
      form.setFieldsValue({ graded_by: 'ai', status: 'submitted' } as any);
    }
    setDrawerOpen(true);
  };

  const openEdit = (row: any) => {
    if (!supportsEditDelete) return;
    setDrawerMode('edit');
    setEditingRow(row);
    form.resetFields();
    if (content.entity_type === 'school') {
      form.setFieldsValue({ ...row, tags: row.tags || [] } as any);
    } else if (content.entity_type === 'question') {
      form.setFieldsValue({
        ...row,
        answer_json: '',
        content_json: '',
        thinking_json: '',
      } as any);
    } else {
      form.setFieldsValue({ ...row } as any);
    }
    setDrawerOpen(true);
  };

  const buildCrudPayload = useCallback(
    (entityType: AdminEntityType, values: any): Record<string, unknown> => {
      if (entityType === 'school') {
        return {
          address: values.address || undefined,
          city: String(values.city || '').trim(),
          contact_email: values.contact_email || undefined,
          contact_phone: values.contact_phone || undefined,
          name: String(values.name || '').trim(),
          province: String(values.province || '').trim(),
          tags: Array.isArray(values.tags)
            ? values.tags.map((t: any) => String(t).trim()).filter(Boolean)
            : [],
        };
      }
      if (entityType === 'teacher') {
        const schoolId = Number(values.school_id);
        const teacherNumber = String(values.teacher_number || '').trim();
        const role = String(values.role || '').trim();
        return {
          new_password: String(values.new_password || '').trim(),
          real_name: String(values.real_name || '').trim(),
          role: role || 'TEACHER',
          school_id: Number.isFinite(schoolId) && schoolId > 0 ? schoolId : undefined,
          teacher_number: teacherNumber || undefined,
          username: String(values.username || '').trim(),
        };
      }
      if (entityType === 'class') {
        const schoolId = Number(values.school_id);
        return {
          admission_year: Number(values.admission_year),
          education_level: String(values.education_level || '').trim(),
          graduation_year: Number(values.graduation_year),
          name: String(values.name || '').trim(),
          school_id: Number.isFinite(schoolId) && schoolId > 0 ? schoolId : undefined,
        };
      }
      if (entityType === 'student') {
        const classId = Number(values.class_id);
        const pinyinName = String(values.pinyin_name || '').trim();
        const gender = String(values.gender || '').trim();
        return {
          class_id: Number.isFinite(classId) && classId > 0 ? classId : undefined,
          gender: gender || undefined,
          name: String(values.name || '').trim(),
          pinyin_name: pinyinName || undefined,
          student_number: String(values.student_number || '').trim(),
        };
      }
      if (entityType === 'grade') {
        return {
          education_level: String(values.education_level || '').trim(),
          grade_order: Number(values.grade_order),
          is_graduation_grade: Boolean(values.is_graduation_grade),
          name: String(values.name || '').trim(),
        };
      }
      if (entityType === 'subject') {
        const subjectCategory = String(values.subject_category || '').trim();
        return {
          is_core_subject:
            typeof values.is_core_subject === 'boolean' ? values.is_core_subject : true,
          name: String(values.name || '').trim(),
          subject_category: subjectCategory ? subjectCategory : undefined,
        };
      }
      if (entityType === 'assignment') {
        const createdByTeachers = String(values.created_by_teachers || '')
          .split(',')
          .map((v) => Number(v.trim()))
          .filter((v) => Number.isFinite(v) && v > 0);
        const fileKeys = String(values.file_keys || '')
          .split(',')
          .map((v) => String(v).trim())
          .filter(Boolean);
        const assignDate = String(values.assign_date || '').trim();
        const dueDate = String(values.due_date || '').trim();
        return {
          assign_date: assignDate || undefined,
          created_by_teachers: createdByTeachers,
          creation_type: String(values.creation_type || 'teacher').trim() || 'teacher',
          due_date: dueDate || undefined,
          file_keys: fileKeys,
          grade_id: Number(values.grade_id),
          subject_id: Number(values.subject_id),
          title: String(values.title || '').trim(),
        };
      }
      if (entityType === 'question') {
        const contentJson = String(values.content_json || '').trim();
        const answerJson = String(values.answer_json || '').trim();
        const thinkingJson = String(values.thinking_json || '').trim();
        let contentObj: Record<string, unknown> = {};
        let answerObj: Record<string, unknown> = {};
        let thinkingObj: Record<string, unknown> | null = null;
        try {
          contentObj = contentJson ? (JSON.parse(contentJson) as Record<string, unknown>) : {};
        } catch {
          throw new Error('content_json 必须是合法 JSON');
        }
        try {
          answerObj = answerJson ? (JSON.parse(answerJson) as Record<string, unknown>) : {};
        } catch {
          throw new Error('answer_json 必须是合法 JSON');
        }
        if (thinkingJson) {
          try {
            thinkingObj = JSON.parse(thinkingJson) as Record<string, unknown>;
          } catch {
            throw new Error('thinking_json 必须是合法 JSON');
          }
        }
        const knowledgePoints = String(values.knowledge_points || '')
          .split(',')
          .map((v) => String(v).trim())
          .filter(Boolean);
        const createdByTeachers = String(values.created_by_teachers || '')
          .split(',')
          .map((v) => Number(v.trim()))
          .filter((v) => Number.isFinite(v) && v > 0);
        const difficultyRaw = Number(values.difficulty);
        return {
          answer: answerObj,
          content: contentObj,
          created_by_teachers: createdByTeachers,
          creation_type: String(values.creation_type || 'teacher').trim() || 'teacher',
          difficulty: Number.isFinite(difficultyRaw) ? difficultyRaw : undefined,
          extra_data: {},
          grade_id: Number(values.grade_id),
          knowledge_points: knowledgePoints,
          question_type: String(values.question_type || '').trim(),
          subject_id: Number(values.subject_id),
          thinking: thinkingObj,
        };
      }
      if (entityType === 'submission') {
        const fileKeys = String(values.file_keys || '')
          .split(',')
          .map((v) => String(v).trim())
          .filter(Boolean);
        const score = Number(values.score);
        const totalScore = Number(values.total_score);
        const submittedAt = String(values.submitted_at || '').trim();
        const gradedAt = String(values.graded_at || '').trim();
        const gradedBy = String(values.graded_by || '').trim();
        const reportPath = String(values.report_path || '').trim();
        const status = String(values.status || '').trim();
        return {
          assignment_student_id: Number(values.assignment_student_id),
          file_keys: fileKeys,
          graded_at: gradedAt || undefined,
          graded_by: gradedBy || undefined,
          report_path: reportPath || undefined,
          score: Number.isFinite(score) ? score : undefined,
          status: status || undefined,
          submitted_at: submittedAt || undefined,
          total_score: Number.isFinite(totalScore) ? totalScore : undefined,
        };
      }
      if (entityType === 'submission_question') {
        const questionId = Number(values.question_id);
        const score = Number(values.score);
        const maxScore = Number(values.max_score);
        const studentAnswer = String(values.student_answer || '').trim();
        const feedback = String(values.feedback || '').trim();
        return {
          feedback: feedback || undefined,
          is_correct: typeof values.is_correct === 'boolean' ? values.is_correct : undefined,
          max_score: Number.isFinite(maxScore) ? maxScore : undefined,
          order_index: Number(values.order_index),
          question_id: Number.isFinite(questionId) && questionId > 0 ? questionId : undefined,
          score: Number.isFinite(score) ? score : undefined,
          student_answer: studentAnswer || undefined,
          submission_id: Number(values.submission_id),
        };
      }
      return {};
    },
    [],
  );

  const handleSubmit = async () => {
    if (!supportsCreate) return;
    const values = await form.validateFields();
    const entityType = content.entity_type;
    const payload = buildCrudPayload(entityType, values);
    const createActionId = createActionIdForEntity(entityType);
    const updateActionId = updateActionIdForEntity(entityType);
    const idKey = entityIdKeyForEntity(entityType);
    if (!createActionId) return;
    if (drawerMode === 'edit' && !updateActionId) return;

    setSubmitting(true);
    try {
      if (drawerMode === 'create') {
        const { run_id } = await startInvocation({
          actionId: createActionId,
          conversationId,
          params: { payload },
          requireConfirmation: true,
        });
        const waited = await waitForRunCompletion(run_id, { timeoutMs: MUTATION_TIMEOUT_MS });
        if (!waited.ok) {
          if (waited.timedOut) {
            useChatStore
              .getState()
              .pushPortalView({ conversationId, runId: run_id, type: PortalViewType.Workbench });
            message.info(`已提交创建（run=${run_id}），仍在执行中。`);
            setDrawerOpen(false);
            return;
          }
          throw new Error(waited.error);
        }
        if (waited.run.state !== 'succeeded')
          throw new Error(waited.run.failure_reason || waited.run.state);
        const artifacts = await listRunArtifacts(run_id);
        const result = mutationResultFromArtifacts(artifacts);
        if (result?.content?.status === 'failed') {
          throw new Error(
            String(result.content.message || result.content.error_code || 'Create failed'),
          );
        }
        message.success(`${title}已创建`);
      } else {
        if (!updateActionId) return;
        const entityId = Number(editingRow?.[idKey]);
        if (!entityId) throw new Error(`Missing ${idKey}`);
        const { run_id } = await startInvocation({
          actionId: updateActionId,
          conversationId,
          params: { [idKey]: entityId, patch: payload },
          requireConfirmation: true,
        });
        const waited = await waitForRunCompletion(run_id, { timeoutMs: MUTATION_TIMEOUT_MS });
        if (!waited.ok) {
          if (waited.timedOut) {
            useChatStore
              .getState()
              .pushPortalView({ conversationId, runId: run_id, type: PortalViewType.Workbench });
            message.info(`已提交更新（run=${run_id}），仍在执行中。`);
            setDrawerOpen(false);
            return;
          }
          throw new Error(waited.error);
        }
        if (waited.run.state !== 'succeeded')
          throw new Error(waited.run.failure_reason || waited.run.state);
        const artifacts = await listRunArtifacts(run_id);
        const result = mutationResultFromArtifacts(artifacts);
        if (result?.content?.status === 'failed') {
          throw new Error(
            String(result.content.message || result.content.error_code || 'Update failed'),
          );
        }
        message.success(`${title}已更新`);
      }

      setDrawerOpen(false);
      await refresh();
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Operation failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteOne = (row: any) => {
    if (!supportsEditDelete) return;
    const entityType = content.entity_type;
    const deleteActionId = deleteActionIdForEntity(entityType);
    const idKey = entityIdKeyForEntity(entityType);
    const entityId = Number(row?.[idKey]);
    if (!deleteActionId || !entityId) return;
    const rawName = typeof row?.name === 'string' ? String(row.name).trim() : '';
    Modal.confirm({
      content: `删除${title}${rawName ? `“${rawName}”` : ''} (ID=${entityId})？此操作会真实删除数据库记录。`,
      okButtonProps: { danger: true },
      okText: 'Delete',
      onOk: async () => {
        setSubmitting(true);
        try {
          const { run_id } = await startInvocation({
            actionId: deleteActionId,
            conversationId,
            params: { [idKey]: entityId },
            requireConfirmation: true,
          });
          const waited = await waitForRunCompletion(run_id, { timeoutMs: MUTATION_TIMEOUT_MS });
          if (!waited.ok) {
            useChatStore
              .getState()
              .pushPortalView({ conversationId, runId: run_id, type: PortalViewType.Workbench });
            if (waited.timedOut) {
              message.info(`已提交删除（run=${run_id}），仍在执行中。`);
              return;
            }
            throw new Error(waited.error);
          }
          if (waited.run.state !== 'succeeded')
            throw new Error(waited.run.failure_reason || waited.run.state);
          const artifacts = await listRunArtifacts(run_id);
          const result = mutationResultFromArtifacts(artifacts);
          if (result?.content?.status === 'failed') {
            throw new Error(
              String(result.content.message || result.content.error_code || 'Delete failed'),
            );
          }
          message.success(`${title}已删除`);
          await refresh();
        } catch (error) {
          message.error(error instanceof Error ? error.message : 'Delete failed');
        } finally {
          setSubmitting(false);
        }
      },
      title: 'Confirm delete',
    });
  };

  const handleBulkDelete = async () => {
    if (!supportsBulkDelete) return;
    const config = bulkDeleteConfigForEntity(content.entity_type);
    if (!config) return;
    const ids = selectedRowKeys.slice();
    if (ids.length === 0) return;

    setSubmitting(true);
    try {
      const { run_id: previewRunId } = await startInvocation({
        actionId: config.previewActionId,
        conversationId,
        params: { [config.requestedIdsKey]: ids },
        requireConfirmation: false,
      });
      const previewWait = await waitForRunCompletion(previewRunId, { timeoutMs: LIST_TIMEOUT_MS });
      if (!previewWait.ok) {
        useChatStore
          .getState()
          .pushPortalView({ conversationId, runId: previewRunId, type: PortalViewType.Workbench });
        if (previewWait.timedOut) {
          message.info(`批量删除预览已提交（run=${previewRunId}），仍在执行中。`);
          return;
        }
        throw new Error(previewWait.error);
      }
      if (previewWait.run.state !== 'succeeded')
        throw new Error(previewWait.run.failure_reason || previewWait.run.state);
      const previewArtifacts = await listRunArtifacts(previewRunId);
      const preview = previewArtifacts[0]?.content || {};

      const existingIds = Array.isArray(preview.existing_ids) ? preview.existing_ids : [];
      const missingIds = Array.isArray(preview.missing_ids) ? preview.missing_ids : [];

      Modal.confirm({
        content: (
          <Flexbox gap={6}>
            <Typography.Text>
              Existing: {existingIds.length} · Missing: {missingIds.length}
            </Typography.Text>
            {missingIds.length ? (
              <Typography.Text type="secondary">
                Missing IDs: {missingIds.slice(0, 20).join(', ')}
                {missingIds.length > 20 ? '…' : ''}
              </Typography.Text>
            ) : null}
          </Flexbox>
        ),
        okButtonProps: { danger: true },
        okText: 'Delete',
        onOk: async () => {
          const { run_id: execRunId } = await startInvocation({
            actionId: config.executeActionId,
            conversationId,
            params: { [config.requestedIdsKey]: ids },
            requireConfirmation: true,
          });
          const execWait = await waitForRunCompletion(execRunId, {
            timeoutMs: BULK_DELETE_TIMEOUT_MS,
          });
          if (!execWait.ok) {
            useChatStore
              .getState()
              .pushPortalView({ conversationId, runId: execRunId, type: PortalViewType.Workbench });
            if (execWait.timedOut) {
              message.info(`批量删除已提交（run=${execRunId}），仍在执行中。`);
              return;
            }
            throw new Error(execWait.error);
          }
          if (execWait.run.state !== 'succeeded')
            throw new Error(execWait.run.failure_reason || execWait.run.state);
          const execArtifacts = await listRunArtifacts(execRunId);
          const execLatest = execArtifacts[0];
          if (
            execLatest?.type === 'admin.bulk_delete.result' &&
            execLatest?.schema_version === 'v1'
          ) {
            const results = Array.isArray(execLatest.content?.results)
              ? execLatest.content.results
              : [];
            const failed = results.filter((r: any) => r?.status === 'failed').length;
            if (failed > 0) {
              message.warning(`批量删除完成，但有 ${failed} 条失败。`);
            } else {
              message.success('批量删除完成');
            }
          } else {
            message.success('批量删除完成');
          }
          setSelectedRowKeys([]);
          await refresh();
        },
        title: `批量删除 ${ids.length} 条${title}？`,
      });
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Bulk delete failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartImport = async () => {
    if (!importFile) {
      message.error('Please select a CSV file first.');
      return;
    }

    setSubmitting(true);
    try {
      const rawDefaults = importForm.getFieldsValue() || {};
      const defaults: Record<string, unknown> = {};
      if (content.entity_type === 'school') {
        const province = String(rawDefaults.province || '').trim();
        const city = String(rawDefaults.city || '').trim();
        const tags = Array.isArray(rawDefaults.tags)
          ? rawDefaults.tags.map((t: any) => String(t).trim()).filter(Boolean)
          : [];
        if (province) defaults.province = province;
        if (city) defaults.city = city;
        if (tags.length > 0) defaults.tags = tags;
      }
      if (content.entity_type === 'teacher') {
        const school_id = Number(rawDefaults.school_id);
        const role = String(rawDefaults.role || '').trim();
        if (Number.isFinite(school_id) && school_id > 0) defaults.school_id = school_id;
        if (role) defaults.role = role;
      }
      if (content.entity_type === 'class') {
        const school_id = Number(rawDefaults.school_id);
        const education_level = String(rawDefaults.education_level || '').trim();
        if (Number.isFinite(school_id) && school_id > 0) defaults.school_id = school_id;
        if (education_level) defaults.education_level = education_level;
      }
      if (content.entity_type === 'student') {
        const class_id = Number(rawDefaults.class_id);
        if (Number.isFinite(class_id) && class_id > 0) defaults.class_id = class_id;
      }

      const buf = await importFile.arrayBuffer();
      const hash = await sha256Hex(buf);
      const presigned = await presignUpload({
        content_type: 'text/csv',
        filename: importFile.name,
        purpose: 'csv',
        sha256: hash,
      });

      const put = await fetch(presigned.upload_url, {
        body: importFile,
        headers: presigned.required_headers,
        method: 'PUT',
      });
      if (!put.ok) {
        const putText = await put.text();
        const preview = putText.slice(0, 500);
        throw new Error(`upload failed: ${put.status} ${preview}`);
      }

      const csvRef = {
        integrity: { sha256: hash },
        locator: { kind: 'object_store', object_key: presigned.object_key },
        media_type: 'text/csv',
        purpose: 'csv',
        sensitivity: importCsvSensitivityForEntity(content.entity_type),
      };

      const importActionId = importActionIdForEntity(content.entity_type);
      if (!importActionId) {
        throw new Error(`Import CSV is not supported for ${content.entity_type}`);
      }

      const { run_id } = await startInvocation({
        actionId: importActionId,
        conversationId,
        params: { csv_ref: csvRef, defaults },
        requireConfirmation: true,
      });

      message.success(`Import started (run=${run_id}). The list will refresh when it completes.`);
      setImportOpen(false);
      setImportFile(null);

      void (async () => {
        const waited = await waitForRunCompletion(run_id, { timeoutMs: IMPORT_TIMEOUT_MS });
        if (!waited.ok) {
          message.info(
            `Import is still running (run=${run_id}). You can open it from the run list if needed.`,
          );
          return;
        }

        if (waited.run.state !== 'succeeded') {
          message.error(`Import failed (run=${run_id}).`);
          useChatStore
            .getState()
            .pushPortalView({ conversationId, runId: run_id, type: PortalViewType.Workbench });
          return;
        }

        try {
          const artifacts = await listRunArtifacts(run_id);
          const latest = artifacts[0];
          if (latest?.type === 'admin.import.result' && latest?.schema_version === 'v1') {
            const counts = (latest.content as any)?.counts || {};
            const succeeded = Number(counts.rows_succeeded) || 0;
            const skipped = Number(counts.rows_skipped) || 0;
            const failed = Number(counts.rows_failed) || 0;

            if (failed > 0) {
              message.warning(
                `Import finished: succeeded=${succeeded} skipped=${skipped} failed=${failed}. Refreshing list…`,
              );
            } else {
              message.success(
                `Import finished: succeeded=${succeeded} skipped=${skipped}. Refreshing list…`,
              );
            }
          } else {
            message.success('Import finished. Refreshing list…');
          }
        } catch {
          message.success('Import finished. Refreshing list…');
        }

        try {
          await refresh();
        } catch (error) {
          message.error(error instanceof Error ? error.message : '列表刷新失败');
        }
      })();
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Import failed');
    } finally {
      setSubmitting(false);
    }
  };

  const columns = useMemo<ColumnsType<SchoolItem>>(
    () => [
      { dataIndex: 'school_id', key: 'school_id', title: 'ID', width: 80 },
      { dataIndex: 'name', key: 'name', title: '学校' },
      { dataIndex: 'province', key: 'province', title: '省', width: 120 },
      { dataIndex: 'city', key: 'city', title: '市', width: 120 },
      {
        dataIndex: 'tags',
        key: 'tags',
        render: (tags: string[]) =>
          Array.isArray(tags) && tags.length ? (
            <Space size={4} wrap>
              {tags.slice(0, 5).map((t) => (
                <Tag key={t}>{t}</Tag>
              ))}
              {tags.length > 5 ? <Tag>+{tags.length - 5}</Tag> : null}
            </Space>
          ) : (
            <Typography.Text type="secondary">—</Typography.Text>
          ),
        title: '标签',
      },
      {
        key: 'actions',
        render: (_, row) => (
          <Space>
            <Button onClick={() => openEdit(row)} size="small">
              Edit
            </Button>
            <Button danger onClick={() => handleDeleteOne(row)} size="small">
              Delete
            </Button>
          </Space>
        ),
        title: '操作',
        width: 150,
      },
    ],
    [handleDeleteOne, openEdit],
  );

  const teacherColumns = useMemo<ColumnsType<TeacherItem>>(
    () => [
      { dataIndex: 'teacher_id', key: 'teacher_id', title: 'ID', width: 80 },
      { dataIndex: 'real_name', key: 'real_name', title: '姓名', width: 140 },
      { dataIndex: 'username', key: 'username', title: '用户名', width: 140 },
      { dataIndex: 'teacher_number', key: 'teacher_number', title: '工号', width: 120 },
      { dataIndex: 'role', key: 'role', title: '角色', width: 120 },
      { dataIndex: 'school_id', key: 'school_id', title: '学校ID', width: 120 },
      { dataIndex: 'last_login', key: 'last_login', title: '最后登录', width: 180 },
    ],
    [],
  );

  const classColumns = useMemo<ColumnsType<ClassItem>>(
    () => [
      { dataIndex: 'class_id', key: 'class_id', title: 'ID', width: 90 },
      { dataIndex: 'name', key: 'name', title: '班级', width: 160 },
      { dataIndex: 'school_id', key: 'school_id', title: '学校ID', width: 120 },
      { dataIndex: 'education_level', key: 'education_level', title: '学段', width: 120 },
      { dataIndex: 'grade_label', key: 'grade_label', title: '年级', width: 140 },
      { dataIndex: 'admission_year', key: 'admission_year', title: '入学年', width: 120 },
      { dataIndex: 'graduation_year', key: 'graduation_year', title: '毕业年', width: 120 },
    ],
    [],
  );

  const studentColumns = useMemo<ColumnsType<StudentItem>>(
    () => [
      { dataIndex: 'student_id', key: 'student_id', title: 'ID', width: 90 },
      { dataIndex: 'name', key: 'name', title: '姓名', width: 140 },
      { dataIndex: 'student_number', key: 'student_number', title: '学号', width: 140 },
      {
        dataIndex: 'class_id',
        key: 'class_id',
        render: (v: number | null | undefined) =>
          v !== null && v !== undefined ? (
            <Typography.Text>{v}</Typography.Text>
          ) : (
            <Typography.Text type="secondary">—</Typography.Text>
          ),
        title: '班级ID',
        width: 120,
      },
      {
        dataIndex: 'gender',
        key: 'gender',
        render: (v: string | null | undefined) =>
          v ? (
            <Typography.Text>{v}</Typography.Text>
          ) : (
            <Typography.Text type="secondary">—</Typography.Text>
          ),
        title: '性别',
        width: 100,
      },
      {
        dataIndex: 'pinyin_name',
        key: 'pinyin_name',
        render: (v: string | null | undefined) =>
          v ? (
            <Typography.Text>{v}</Typography.Text>
          ) : (
            <Typography.Text type="secondary">—</Typography.Text>
          ),
        title: '拼音',
        width: 180,
      },
    ],
    [],
  );

  const gradeColumns = useMemo<ColumnsType<GradeItem>>(
    () => [
      { dataIndex: 'grade_id', key: 'grade_id', title: 'ID', width: 90 },
      { dataIndex: 'name', key: 'name', title: '年级', width: 180 },
      { dataIndex: 'education_level', key: 'education_level', title: '学段', width: 140 },
      { dataIndex: 'grade_order', key: 'grade_order', title: '序号', width: 100 },
      {
        dataIndex: 'is_graduation_grade',
        key: 'is_graduation_grade',
        render: (v: boolean) =>
          v ? (
            <Tag color="gold">毕业年级</Tag>
          ) : (
            <Typography.Text type="secondary">—</Typography.Text>
          ),
        title: '毕业年级',
        width: 120,
      },
      {
        key: 'actions',
        render: (_, row) => (
          <Space>
            <Button onClick={() => openEdit(row)} size="small">
              Edit
            </Button>
            <Button danger onClick={() => handleDeleteOne(row)} size="small">
              Delete
            </Button>
          </Space>
        ),
        title: '操作',
        width: 150,
      },
    ],
    [handleDeleteOne, openEdit],
  );

  const subjectColumns = useMemo<ColumnsType<SubjectItem>>(
    () => [
      { dataIndex: 'subject_id', key: 'subject_id', title: 'ID', width: 90 },
      { dataIndex: 'name', key: 'name', title: '学科', width: 180 },
      {
        dataIndex: 'subject_category',
        key: 'subject_category',
        render: (v: string | null | undefined) =>
          v ? (
            <Typography.Text>{v}</Typography.Text>
          ) : (
            <Typography.Text type="secondary">—</Typography.Text>
          ),
        title: '分类',
        width: 160,
      },
      {
        dataIndex: 'is_core_subject',
        key: 'is_core_subject',
        render: (v: boolean) =>
          v ? <Tag color="blue">核心</Tag> : <Typography.Text type="secondary">—</Typography.Text>,
        title: '核心学科',
        width: 120,
      },
      {
        key: 'actions',
        render: (_, row) => (
          <Space>
            <Button onClick={() => openEdit(row)} size="small">
              Edit
            </Button>
            <Button danger onClick={() => handleDeleteOne(row)} size="small">
              Delete
            </Button>
          </Space>
        ),
        title: '操作',
        width: 150,
      },
    ],
    [handleDeleteOne, openEdit],
  );

  const assignmentColumns = useMemo<ColumnsType<AssignmentItem>>(
    () => [
      { dataIndex: 'assignment_id', key: 'assignment_id', title: 'ID', width: 90 },
      { dataIndex: 'title', key: 'title', title: '标题', width: 220 },
      { dataIndex: 'subject_id', key: 'subject_id', title: '学科ID', width: 100 },
      { dataIndex: 'grade_id', key: 'grade_id', title: '年级ID', width: 100 },
      { dataIndex: 'creation_type', key: 'creation_type', title: '来源', width: 110 },
      {
        dataIndex: 'assign_date',
        key: 'assign_date',
        render: (v: string) =>
          v ? (
            <Typography.Text>{v}</Typography.Text>
          ) : (
            <Typography.Text type="secondary">—</Typography.Text>
          ),
        title: '发布时间',
        width: 180,
      },
      {
        dataIndex: 'due_date',
        key: 'due_date',
        render: (v: string | null | undefined) =>
          v ? (
            <Typography.Text>{v}</Typography.Text>
          ) : (
            <Typography.Text type="secondary">—</Typography.Text>
          ),
        title: '截止时间',
        width: 180,
      },
      {
        key: 'actions',
        render: (_, row) => (
          <Space>
            <Button onClick={() => openEdit(row)} size="small">
              Edit
            </Button>
            <Button danger onClick={() => handleDeleteOne(row)} size="small">
              Delete
            </Button>
          </Space>
        ),
        title: '操作',
        width: 150,
      },
    ],
    [handleDeleteOne, openEdit],
  );

  const questionColumns = useMemo<ColumnsType<QuestionItem>>(
    () => [
      { dataIndex: 'question_id', key: 'question_id', title: 'ID', width: 90 },
      { dataIndex: 'question_type', key: 'question_type', title: '题型', width: 130 },
      { dataIndex: 'subject_id', key: 'subject_id', title: '学科ID', width: 100 },
      { dataIndex: 'grade_id', key: 'grade_id', title: '年级ID', width: 100 },
      {
        dataIndex: 'difficulty',
        key: 'difficulty',
        render: (v: number | null | undefined) =>
          typeof v === 'number' ? (
            <Typography.Text>{v}</Typography.Text>
          ) : (
            <Typography.Text type="secondary">—</Typography.Text>
          ),
        title: '难度',
        width: 100,
      },
      {
        dataIndex: 'knowledge_points',
        key: 'knowledge_points',
        render: (v: string[] | null | undefined) =>
          Array.isArray(v) && v.length ? (
            <Typography.Text>{v.join(', ')}</Typography.Text>
          ) : (
            <Typography.Text type="secondary">—</Typography.Text>
          ),
        title: '知识点',
        width: 220,
      },
      {
        dataIndex: 'content_preview',
        key: 'content_preview',
        render: (v: string) =>
          v ? (
            <Typography.Text>{v}</Typography.Text>
          ) : (
            <Typography.Text type="secondary">—</Typography.Text>
          ),
        title: '题干预览',
      },
      {
        key: 'actions',
        render: (_, row) => (
          <Space>
            <Button onClick={() => openEdit(row)} size="small">
              Edit
            </Button>
            <Button danger onClick={() => handleDeleteOne(row)} size="small">
              Delete
            </Button>
          </Space>
        ),
        title: '操作',
        width: 150,
      },
    ],
    [handleDeleteOne, openEdit],
  );

  const submissionColumns = useMemo<ColumnsType<SubmissionItem>>(
    () => [
      { dataIndex: 'submission_id', key: 'submission_id', title: 'ID', width: 90 },
      {
        dataIndex: 'assignment_student_id',
        key: 'assignment_student_id',
        title: 'AssignmentStudent',
        width: 140,
      },
      { dataIndex: 'assignment_id', key: 'assignment_id', title: '作业ID', width: 110 },
      { dataIndex: 'student_id', key: 'student_id', title: '学生ID', width: 110 },
      { dataIndex: 'status', key: 'status', title: '状态', width: 120 },
      {
        key: 'score',
        render: (_, row) =>
          row.score !== null && row.score !== undefined ? (
            <Typography.Text>
              {row.score}
              {row.total_score !== null && row.total_score !== undefined
                ? ` / ${row.total_score}`
                : ''}
            </Typography.Text>
          ) : (
            <Typography.Text type="secondary">—</Typography.Text>
          ),
        title: '分数',
        width: 140,
      },
      { dataIndex: 'submitted_at', key: 'submitted_at', title: '提交时间', width: 180 },
      { dataIndex: 'graded_at', key: 'graded_at', title: '批改时间', width: 180 },
      {
        key: 'actions',
        render: (_, row) => (
          <Space>
            <Button onClick={() => openEdit(row)} size="small">
              Edit
            </Button>
            <Button danger onClick={() => handleDeleteOne(row)} size="small">
              Delete
            </Button>
          </Space>
        ),
        title: '操作',
        width: 150,
      },
    ],
    [handleDeleteOne, openEdit],
  );

  const submissionQuestionColumns = useMemo<ColumnsType<SubmissionQuestionItem>>(
    () => [
      {
        dataIndex: 'submission_question_id',
        key: 'submission_question_id',
        title: 'ID',
        width: 90,
      },
      { dataIndex: 'submission_id', key: 'submission_id', title: '提交ID', width: 110 },
      { dataIndex: 'assignment_id', key: 'assignment_id', title: '作业ID', width: 110 },
      { dataIndex: 'student_id', key: 'student_id', title: '学生ID', width: 110 },
      { dataIndex: 'order_index', key: 'order_index', title: '题序', width: 90 },
      { dataIndex: 'question_id', key: 'question_id', title: '题目ID', width: 100 },
      {
        key: 'score',
        render: (_, row) =>
          row.score !== null && row.score !== undefined ? (
            <Typography.Text>
              {row.score}
              {row.max_score !== null && row.max_score !== undefined ? ` / ${row.max_score}` : ''}
            </Typography.Text>
          ) : (
            <Typography.Text type="secondary">—</Typography.Text>
          ),
        title: '分数',
        width: 120,
      },
      {
        dataIndex: 'is_correct',
        key: 'is_correct',
        render: (v: boolean | null | undefined) =>
          v === true ? (
            <Tag color="green">正确</Tag>
          ) : v === false ? (
            <Tag color="red">错误</Tag>
          ) : (
            <Typography.Text type="secondary">—</Typography.Text>
          ),
        title: '判定',
        width: 100,
      },
      {
        dataIndex: 'student_answer_preview',
        key: 'student_answer_preview',
        render: (v: string | null | undefined) =>
          v ? (
            <Typography.Text>{v}</Typography.Text>
          ) : (
            <Typography.Text type="secondary">—</Typography.Text>
          ),
        title: '作答预览',
      },
      {
        key: 'actions',
        render: (_, row) => (
          <Space>
            <Button onClick={() => openEdit(row)} size="small">
              Edit
            </Button>
            <Button danger onClick={() => handleDeleteOne(row)} size="small">
              Delete
            </Button>
          </Space>
        ),
        title: '操作',
        width: 150,
      },
    ],
    [handleDeleteOne, openEdit],
  );

  const editingEntityId = useMemo(() => {
    const idKey = entityIdKeyForEntity(content.entity_type);
    const id = Number(editingRow?.[idKey]);
    return Number.isFinite(id) && id > 0 ? id : null;
  }, [content.entity_type, editingRow]);

  const drawerTitle =
    drawerMode === 'create'
      ? `新建${title}`
      : `编辑${title}${editingEntityId ? ` (ID=${editingEntityId})` : ''}`;

  return (
    <Flexbox gap={12}>
      <Flexbox align={'center'} horizontal justify={'space-between'}>
        <Typography.Title level={5} style={{ margin: 0 }}>
          {title}
        </Typography.Title>

        <Space wrap>
          <Button
            icon={<ReloadOutlined />}
            loading={submitting || refreshing}
            onClick={() => void handleRefresh()}
            size="small"
          >
            Refresh
          </Button>
          {supportsImport ? (
            <Button icon={<UploadOutlined />} onClick={() => setImportOpen(true)} size="small">
              Import CSV
            </Button>
          ) : null}
          {supportsCreate ? (
            <Button icon={<PlusOutlined />} onClick={openCreate} size="small" type="primary">
              New
            </Button>
          ) : null}
          {supportsBulkDelete ? (
            <Button
              danger
              disabled={selectedRowKeys.length === 0}
              icon={<DeleteOutlined />}
              loading={submitting}
              onClick={handleBulkDelete}
              size="small"
            >
              Delete selected
            </Button>
          ) : null}
        </Space>
      </Flexbox>

      {isSchool ? (
        schoolRows.length === 0 ? (
          <Empty
            description={
              <Flexbox gap={4}>
                <Typography.Text type="secondary">
                  No school rows in this artifact yet.
                </Typography.Text>
                <Typography.Text type="secondary">Artifact: {artifactId}</Typography.Text>
              </Flexbox>
            }
          />
        ) : (
          <>
            <Table
              columns={columns}
              dataSource={schoolRows}
              pagination={false}
              rowKey={(r) => r.school_id}
              rowSelection={{
                onChange: (keys) =>
                  setSelectedRowKeys(keys.map(Number).filter((v) => Number.isFinite(v))),
                selectedRowKeys,
              }}
              size="small"
            />
            <Flexbox align="center" horizontal justify="space-between">
              <Typography.Text type="secondary">
                已加载 {schoolRows.length} 条
                {typeof content.total === 'number' ? `（总数 ${content.total}）` : ''}
              </Typography.Text>
              {listHasMore ? (
                <Button loading={listLoadingMore} onClick={loadMore} size="small">
                  Load more
                </Button>
              ) : null}
            </Flexbox>
          </>
        )
      ) : listIds.length === 0 ? (
        <Empty
          description={
            <Flexbox gap={4}>
              <Typography.Text type="secondary">
                No {title} rows in this artifact yet.
              </Typography.Text>
              <Typography.Text type="secondary">Artifact: {artifactId}</Typography.Text>
            </Flexbox>
          }
        />
      ) : (
        <>
          {content.entity_type === 'teacher' && teacherRows.length ? (
            <Table
              columns={teacherColumns}
              dataSource={teacherRows}
              pagination={false}
              rowKey={(r) => r.teacher_id}
              size="small"
            />
          ) : content.entity_type === 'class' && classRows.length ? (
            <Table
              columns={classColumns}
              dataSource={classRows}
              pagination={false}
              rowKey={(r) => r.class_id}
              size="small"
            />
          ) : content.entity_type === 'student' && studentRows.length ? (
            <Table
              columns={studentColumns}
              dataSource={studentRows}
              pagination={false}
              rowKey={(r) => r.student_id}
              size="small"
            />
          ) : content.entity_type === 'grade' && gradeRows.length ? (
            <Table
              columns={gradeColumns}
              dataSource={gradeRows}
              pagination={false}
              rowKey={(r) => r.grade_id}
              rowSelection={{
                onChange: (keys) =>
                  setSelectedRowKeys(keys.map(Number).filter((v) => Number.isFinite(v))),
                selectedRowKeys,
              }}
              size="small"
            />
          ) : content.entity_type === 'subject' && subjectRows.length ? (
            <Table
              columns={subjectColumns}
              dataSource={subjectRows}
              pagination={false}
              rowKey={(r) => r.subject_id}
              rowSelection={{
                onChange: (keys) =>
                  setSelectedRowKeys(keys.map(Number).filter((v) => Number.isFinite(v))),
                selectedRowKeys,
              }}
              size="small"
            />
          ) : content.entity_type === 'assignment' && assignmentRows.length ? (
            <Table
              columns={assignmentColumns}
              dataSource={assignmentRows}
              pagination={false}
              rowKey={(r) => r.assignment_id}
              size="small"
            />
          ) : content.entity_type === 'question' && questionRows.length ? (
            <Table
              columns={questionColumns}
              dataSource={questionRows}
              pagination={false}
              rowKey={(r) => r.question_id}
              size="small"
            />
          ) : content.entity_type === 'submission' && submissionRows.length ? (
            <Table
              columns={submissionColumns}
              dataSource={submissionRows}
              pagination={false}
              rowKey={(r) => r.submission_id}
              size="small"
            />
          ) : content.entity_type === 'submission_question' && submissionQuestionRows.length ? (
            <Table
              columns={submissionQuestionColumns}
              dataSource={submissionQuestionRows}
              pagination={false}
              rowKey={(r) => r.submission_question_id}
              size="small"
            />
          ) : (
            <Table
              columns={[{ dataIndex: 'id', key: 'id', title: 'ID', width: 120 }]}
              dataSource={listIds
                .map((id) => ({ id: Number(id) }))
                .filter((r) => Number.isFinite(r.id))}
              pagination={false}
              rowKey={(r) => r.id}
              size="small"
            />
          )}
          <Flexbox align="center" horizontal justify="space-between">
            <Typography.Text type="secondary">
              已加载{' '}
              {content.entity_type === 'teacher' && teacherRows.length
                ? teacherRows.length
                : content.entity_type === 'class' && classRows.length
                  ? classRows.length
                  : content.entity_type === 'student' && studentRows.length
                    ? studentRows.length
                    : content.entity_type === 'grade' && gradeRows.length
                      ? gradeRows.length
                      : content.entity_type === 'subject' && subjectRows.length
                        ? subjectRows.length
                        : content.entity_type === 'assignment' && assignmentRows.length
                          ? assignmentRows.length
                          : content.entity_type === 'question' && questionRows.length
                            ? questionRows.length
                            : content.entity_type === 'submission' && submissionRows.length
                              ? submissionRows.length
                              : content.entity_type === 'submission_question' &&
                                  submissionQuestionRows.length
                                ? submissionQuestionRows.length
                                : listIds.length}{' '}
              条{typeof content.total === 'number' ? `（总数 ${content.total}）` : ''}
            </Typography.Text>
            {listHasMore ? (
              <Button loading={listLoadingMore} onClick={loadMore} size="small">
                Load more
              </Button>
            ) : null}
          </Flexbox>
        </>
      )}

      <Drawer
        onClose={() => setDrawerOpen(false)}
        open={drawerOpen}
        title={drawerTitle}
        width={420}
      >
        <Form disabled={!supportsCreate} form={form} layout="vertical">
          {content.entity_type === 'school' ? (
            <>
              <Form.Item label="学校名称" name="name" rules={[{ required: true }]}>
                <Input placeholder="例如：第一中学" />
              </Form.Item>
              <Form.Item label="省" name="province" rules={[{ required: true }]}>
                <Input placeholder="例如：北京市" />
              </Form.Item>
              <Form.Item label="市" name="city" rules={[{ required: true }]}>
                <Input placeholder="例如：北京市" />
              </Form.Item>
              <Form.Item label="地址" name="address">
                <Input.TextArea rows={3} />
              </Form.Item>
              <Form.Item label="联系电话" name="contact_phone">
                <Input />
              </Form.Item>
              <Form.Item label="联系邮箱" name="contact_email">
                <Input />
              </Form.Item>
              <Form.Item label="标签" name="tags">
                <Select mode="tags" placeholder="输入后回车" />
              </Form.Item>
            </>
          ) : null}

          {content.entity_type === 'teacher' ? (
            <>
              <Form.Item label="用户名" name="username" rules={[{ required: true }]}>
                <Input placeholder="例如：zhangsan" />
              </Form.Item>
              <Form.Item label="姓名" name="real_name" rules={[{ required: true }]}>
                <Input placeholder="例如：张三" />
              </Form.Item>
              <Form.Item label="初始密码" name="new_password" rules={[{ required: true }]}>
                <Input.Password placeholder="请输入初始密码" />
              </Form.Item>
              <Form.Item label="教师编号（可选）" name="teacher_number">
                <Input placeholder="例如：T1001" />
              </Form.Item>
              <Form.Item label="角色" name="role" rules={[{ required: true }]}>
                <Select
                  options={[
                    { label: 'TEACHER', value: 'TEACHER' },
                    { label: 'ADMIN', value: 'ADMIN' },
                    { label: 'PRINCIPAL', value: 'PRINCIPAL' },
                  ]}
                />
              </Form.Item>
              <Form.Item label="学校ID（可选）" name="school_id">
                <TreeSelect
                  allowClear
                  loading={schoolTreeLoading}
                  placeholder="请选择：省 / 市 / 学校"
                  showSearch
                  treeData={schoolTreeData}
                  treeDefaultExpandAll={false}
                  treeNodeFilterProp="title"
                />
              </Form.Item>
            </>
          ) : null}

          {content.entity_type === 'class' ? (
            <>
              <Form.Item label="班级名称" name="name" rules={[{ required: true }]}>
                <Input placeholder="例如：高三(1)班" />
              </Form.Item>
              <Form.Item label="学校ID（可选）" name="school_id">
                <TreeSelect
                  allowClear
                  loading={schoolTreeLoading}
                  placeholder="请选择：省 / 市 / 学校"
                  showSearch
                  treeData={schoolTreeData}
                  treeDefaultExpandAll={false}
                  treeNodeFilterProp="title"
                />
              </Form.Item>
              <Form.Item label="入学年份" name="admission_year" rules={[{ required: true }]}>
                <InputNumber min={1900} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item label="毕业年份" name="graduation_year" rules={[{ required: true }]}>
                <InputNumber min={1900} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item label="学段" name="education_level" rules={[{ required: true }]}>
                <Select options={EDUCATION_LEVEL_OPTIONS} placeholder="请选择学段" />
              </Form.Item>
            </>
          ) : null}

          {content.entity_type === 'student' ? (
            <>
              <Form.Item label="学号" name="student_number" rules={[{ required: true }]}>
                <Input placeholder="例如：20260001" />
              </Form.Item>
              <Form.Item label="姓名" name="name" rules={[{ required: true }]}>
                <Input placeholder="例如：李四" />
              </Form.Item>
              <Form.Item label="班级ID（可选）" name="class_id">
                <TreeSelect
                  allowClear
                  loadData={loadClassTreeNodeData}
                  loading={classTreeLoading}
                  placeholder="请选择：省 / 市 / 学校 / 入学年份 / 班级"
                  showSearch
                  treeData={classTreeData}
                  treeDefaultExpandAll={false}
                  treeNodeFilterProp="title"
                />
              </Form.Item>
              <Form.Item label="拼音（可选）" name="pinyin_name">
                <Input placeholder="例如：li si" />
              </Form.Item>
              <Form.Item label="性别（可选）" name="gender">
                <Input placeholder="例如：男 / 女" />
              </Form.Item>
            </>
          ) : null}

          {content.entity_type === 'grade' ? (
            <>
              <Form.Item label="年级名称" name="name" rules={[{ required: true }]}>
                <Input placeholder="例如：高中3年级" />
              </Form.Item>
              <Form.Item label="学段" name="education_level" rules={[{ required: true }]}>
                <Select options={EDUCATION_LEVEL_OPTIONS} placeholder="请选择学段" showSearch />
              </Form.Item>
              <Form.Item label="排序序号" name="grade_order" rules={[{ required: true }]}>
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item label="毕业年级" name="is_graduation_grade" valuePropName="checked">
                <Switch />
              </Form.Item>
            </>
          ) : null}

          {content.entity_type === 'subject' ? (
            <>
              <Form.Item label="学科名称" name="name" rules={[{ required: true }]}>
                <Input placeholder="例如：数学" />
              </Form.Item>
              <Form.Item label="分类（可选）" name="subject_category">
                <Input placeholder="例如：理科" />
              </Form.Item>
              <Form.Item label="核心学科" name="is_core_subject" valuePropName="checked">
                <Switch />
              </Form.Item>
            </>
          ) : null}

          {content.entity_type === 'assignment' ? (
            <>
              <Form.Item label="标题" name="title" rules={[{ required: true }]}>
                <Input placeholder="例如：高三物理练习1" />
              </Form.Item>
              <Form.Item label="学科ID" name="subject_id" rules={[{ required: true }]}>
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item label="年级ID" name="grade_id" rules={[{ required: true }]}>
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item label="创建来源（可选）" name="creation_type">
                <Input placeholder="teacher / ocr / imported" />
              </Form.Item>
              <Form.Item label="发布时间（可选，ISO）" name="assign_date">
                <Input placeholder="2026-02-09T12:00:00Z" />
              </Form.Item>
              <Form.Item label="截止时间（可选，ISO）" name="due_date">
                <Input placeholder="2026-02-16T23:59:59Z" />
              </Form.Item>
              <Form.Item label="创建教师ID（可选，逗号分隔）" name="created_by_teachers">
                <Input placeholder="1,2,3" />
              </Form.Item>
              <Form.Item label="文件 keys（可选，逗号分隔）" name="file_keys">
                <Input placeholder="assignments/a.pdf,assignments/b.png" />
              </Form.Item>
            </>
          ) : null}

          {content.entity_type === 'question' ? (
            <>
              <Form.Item label="学科ID" name="subject_id" rules={[{ required: true }]}>
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item label="年级ID" name="grade_id" rules={[{ required: true }]}>
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item label="题型" name="question_type" rules={[{ required: true }]}>
                <Select
                  options={[
                    { label: 'single_choice', value: 'single_choice' },
                    { label: 'multiple_choice', value: 'multiple_choice' },
                    { label: 'fill_in_blank', value: 'fill_in_blank' },
                    { label: 'problem_solving', value: 'problem_solving' },
                  ]}
                />
              </Form.Item>
              <Form.Item
                label="content_json"
                name="content_json"
                rules={drawerMode === 'create' ? [{ required: true }] : []}
                tooltip="符合 question.content@v1 结构"
              >
                <Input.TextArea placeholder='{"version":"question.content@v1", ...}' rows={6} />
              </Form.Item>
              <Form.Item
                label="answer_json"
                name="answer_json"
                rules={drawerMode === 'create' ? [{ required: true }] : []}
                tooltip="符合 question.answer@v1 结构"
              >
                <Input.TextArea placeholder='{"version":"question.answer@v1", ...}' rows={5} />
              </Form.Item>
              <Form.Item label="thinking_json（可选）" name="thinking_json">
                <Input.TextArea placeholder='{"version":"question.thinking@v1", ...}' rows={4} />
              </Form.Item>
              <Form.Item label="难度（可选 0~1）" name="difficulty">
                <InputNumber max={1} min={0} step={0.1} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item label="知识点（可选，逗号分隔）" name="knowledge_points">
                <Input placeholder="牛顿第二定律,受力分析" />
              </Form.Item>
              <Form.Item label="创建来源（可选）" name="creation_type">
                <Input placeholder="teacher / ocr / imported" />
              </Form.Item>
              <Form.Item label="创建教师ID（可选，逗号分隔）" name="created_by_teachers">
                <Input placeholder="1,2,3" />
              </Form.Item>
              {drawerMode === 'edit' ? (
                <Typography.Text type="secondary">
                  编辑模式下若留空 content_json/answer_json，将只更新其他字段。
                </Typography.Text>
              ) : null}
            </>
          ) : null}

          {content.entity_type === 'submission' ? (
            <>
              <Form.Item
                label="AssignmentStudent ID"
                name="assignment_student_id"
                rules={[{ required: true }]}
              >
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item label="状态（可选）" name="status">
                <Input placeholder="submitted / graded / processing" />
              </Form.Item>
              <Form.Item label="分数（可选）" name="score">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item label="总分（可选）" name="total_score">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item label="提交时间（可选，ISO）" name="submitted_at">
                <Input placeholder="2026-02-09T12:00:00Z" />
              </Form.Item>
              <Form.Item label="批改时间（可选，ISO）" name="graded_at">
                <Input placeholder="2026-02-09T13:00:00Z" />
              </Form.Item>
              <Form.Item label="批改人（可选）" name="graded_by">
                <Input placeholder="ai" />
              </Form.Item>
              <Form.Item label="报告路径（可选）" name="report_path">
                <Input placeholder="reports/submission-1.pdf" />
              </Form.Item>
              <Form.Item label="文件 keys（可选，逗号分隔）" name="file_keys">
                <Input placeholder="submissions/a.jpg,submissions/b.jpg" />
              </Form.Item>
            </>
          ) : null}

          {content.entity_type === 'submission_question' ? (
            <>
              <Form.Item label="提交ID" name="submission_id" rules={[{ required: true }]}>
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item label="题序" name="order_index" rules={[{ required: true }]}>
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item label="题目ID（可选）" name="question_id">
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item label="得分（可选）" name="score">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item label="满分（可选）" name="max_score">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item label="判定（可选）" name="is_correct">
                <Select
                  allowClear
                  options={[
                    { label: '正确', value: true },
                    { label: '错误', value: false },
                  ]}
                />
              </Form.Item>
              <Form.Item label="学生作答（可选）" name="student_answer">
                <Input.TextArea rows={3} />
              </Form.Item>
              <Form.Item label="反馈（可选）" name="feedback">
                <Input.TextArea rows={3} />
              </Form.Item>
            </>
          ) : null}

          <Space>
            <Button onClick={() => setDrawerOpen(false)}>Cancel</Button>
            <Button loading={submitting} onClick={handleSubmit} type="primary">
              {drawerMode === 'create' ? 'Create' : 'Save'}
            </Button>
          </Space>
        </Form>
      </Drawer>

      <Drawer
        onClose={() => setImportOpen(false)}
        open={importOpen}
        title={`Import ${title} CSV`}
        width={520}
      >
        <Flexbox gap={12}>
          <Typography.Text type="secondary">
            Upload a CSV file and start an import run. The run will open in this Workbench panel.
          </Typography.Text>

          <Form form={importForm} layout="vertical">
            {content.entity_type === 'school' ? (
              <>
                <Form.Item label="默认省（可选）" name="province">
                  <Input placeholder="例如：北京市" />
                </Form.Item>
                <Form.Item label="默认市（可选）" name="city">
                  <Input placeholder="例如：北京市" />
                </Form.Item>
                <Form.Item label="默认标签（可选）" name="tags">
                  <Select mode="tags" placeholder="输入后回车" />
                </Form.Item>
              </>
            ) : null}
            {content.entity_type === 'teacher' ? (
              <>
                <Form.Item
                  extra={
                    <Typography.Text type="secondary">
                      按 省 → 市 → 学校 选择（会自动带入学校ID）
                    </Typography.Text>
                  }
                  label="默认学校（可选）"
                  name="school_id"
                >
                  <TreeSelect
                    allowClear
                    loading={schoolTreeLoading}
                    placeholder="请选择：省 / 市 / 学校"
                    showSearch
                    treeData={schoolTreeData}
                    treeDefaultExpandAll={false}
                    treeNodeFilterProp="title"
                  />
                </Form.Item>
                <Form.Item label="默认角色（可选）" name="role">
                  <Select
                    allowClear
                    options={[
                      { label: 'TEACHER', value: 'TEACHER' },
                      { label: 'ADMIN', value: 'ADMIN' },
                      { label: 'PRINCIPAL', value: 'PRINCIPAL' },
                    ]}
                    placeholder="例如：TEACHER"
                  />
                </Form.Item>
              </>
            ) : null}
            {content.entity_type === 'class' ? (
              <>
                <Form.Item
                  extra={
                    <Typography.Text type="secondary">
                      按 省 → 市 → 学校 选择（会自动带入学校ID）
                    </Typography.Text>
                  }
                  label="默认学校（可选）"
                  name="school_id"
                >
                  <TreeSelect
                    allowClear
                    loading={schoolTreeLoading}
                    placeholder="请选择：省 / 市 / 学校"
                    showSearch
                    treeData={schoolTreeData}
                    treeDefaultExpandAll={false}
                    treeNodeFilterProp="title"
                  />
                </Form.Item>
                <Form.Item label="默认学段（可选）" name="education_level">
                  <Select
                    allowClear
                    options={EDUCATION_LEVEL_OPTIONS}
                    placeholder="请选择学段"
                    showSearch
                  />
                </Form.Item>
              </>
            ) : null}
            {content.entity_type === 'student' ? (
              <Form.Item
                extra={
                  <Typography.Text type="secondary">
                    按 省 → 市 → 学校 → 入学年份 → 班级 选择（会自动带入班级ID）
                  </Typography.Text>
                }
                label="默认班级（可选）"
                name="class_id"
              >
                <TreeSelect
                  allowClear
                  loadData={loadClassTreeNodeData}
                  loading={classTreeLoading}
                  placeholder="请选择：省 / 市 / 学校 / 入学年份 / 班级"
                  showSearch
                  treeData={classTreeData}
                  treeDefaultExpandAll={false}
                  treeNodeFilterProp="title"
                />
              </Form.Item>
            ) : null}
          </Form>

          {csvHintSpec ? (
            <Flexbox
              gap={8}
              style={{ border: '1px solid rgba(0,0,0,0.08)', borderRadius: 8, padding: 12 }}
            >
              <Typography.Title level={5} style={{ margin: 0 }}>
                {csvHintSpec.title}
              </Typography.Title>
              <Flexbox gap={4}>
                {csvHintSpec.notes.map((n) => (
                  <Typography.Text key={n} type="secondary">
                    • {n}
                  </Typography.Text>
                ))}
              </Flexbox>
              <Table<CsvColumnHintRow>
                columns={[
                  {
                    dataIndex: 'headers',
                    key: 'headers',
                    render: (headers: string[]) => renderCsvHeaders(headers),
                    title: '列（表头）',
                    width: 200,
                  },
                  {
                    key: 'required',
                    render: (_, row) => renderCsvRequirement(row),
                    title: '是否必填',
                    width: 120,
                  },
                  {
                    dataIndex: 'meaning',
                    key: 'meaning',
                    render: (v: string) => <Typography.Text>{v}</Typography.Text>,
                    title: '含义',
                  },
                ]}
                dataSource={csvHintSpec.rows}
                pagination={false}
                rowKey={(r) => r.headers.join('|')}
                size="small"
              />
            </Flexbox>
          ) : null}

          <Upload
            beforeUpload={(file) => {
              setImportFile(file);
              return false;
            }}
            fileList={importFile ? [importFile] : []}
            maxCount={1}
            onRemove={() => setImportFile(null)}
          >
            <Button icon={<UploadOutlined />}>Select CSV</Button>
          </Upload>

          <Space>
            <Button onClick={() => setImportOpen(false)}>Cancel</Button>
            <Button loading={submitting} onClick={handleStartImport} type="primary">
              Upload & Import
            </Button>
          </Space>
        </Flexbox>
      </Drawer>
    </Flexbox>
  );
});

SchoolsRenderer.displayName = 'SchoolsRenderer';

export default SchoolsRenderer;
