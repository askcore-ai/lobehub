'use client';

import {
  createEmptyQuestionForm,
  deserializeQuestionPayload,
  serializeQuestionForm,
} from './questionModel';
import { type JsonRecord, type ResourceKey } from './types';

export type FieldKind =
  | 'boolean'
  | 'datetime'
  | 'json'
  | 'number'
  | 'select'
  | 'tags'
  | 'text'
  | 'textarea';

export type LookupCollectionKey =
  | 'classes'
  | 'grades'
  | 'schools'
  | 'students'
  | 'subjects'
  | 'teachers';
export type EditableResourceKey = ResourceKey;

export type FieldDefinition = {
  help?: string;
  key: string;
  kind: FieldKind;
  label: string;
  numeric?: boolean;
  options?: Array<{ label: string; value: string }>;
  optionsFrom?: LookupCollectionKey;
  placeholder?: string;
  required?: boolean;
  rows?: number;
};

export type LookupCollections = Record<LookupCollectionKey, JsonRecord[]>;

const LOOKUP_ID_KEYS: Record<LookupCollectionKey, string> = {
  classes: 'class_id',
  grades: 'grade_id',
  schools: 'school_id',
  students: 'student_id',
  subjects: 'subject_id',
  teachers: 'teacher_id',
};

const LOOKUP_LABEL_RESOLVERS: Record<LookupCollectionKey, (item: JsonRecord) => string> = {
  classes: (item) => String(item.name || item.class_id || item.id || '').trim(),
  grades: (item) => String(item.name || item.grade_id || item.id || '').trim(),
  schools: (item) => String(item.name || item.school_id || item.id || '').trim(),
  students: (item) =>
    String(item.name || item.student_number || item.student_id || item.id || '').trim(),
  subjects: (item) => String(item.name || item.subject_id || item.id || '').trim(),
  teachers: (item) =>
    String(item.real_name || item.username || item.teacher_id || item.id || '').trim(),
};

export const EMPTY_LOOKUPS: LookupCollections = {
  classes: [],
  grades: [],
  schools: [],
  students: [],
  subjects: [],
  teachers: [],
};

const isRecord = (value: unknown): value is JsonRecord =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const lookupItemId = (lookup: LookupCollectionKey, item: JsonRecord) => {
  const idKey = LOOKUP_ID_KEYS[lookup];
  return Number(item[idKey] || item.id || 0) || 0;
};

export const resolveLookupLabel = (
  lookups: LookupCollections,
  lookup: LookupCollectionKey,
  entityId: unknown,
) => {
  const normalizedId = Number(entityId || 0) || 0;
  if (normalizedId <= 0) return null;
  const match = lookups[lookup].find((item) => lookupItemId(lookup, item) === normalizedId);
  if (!match) return null;
  return LOOKUP_LABEL_RESOLVERS[lookup](match) || null;
};

export const hydrateLookupLabels = (item: JsonRecord, lookups: LookupCollections): JsonRecord => {
  const next = { ...item };

  const assignResolvedLabel = (
    sourceIdKey: string,
    targetLabelKey: string,
    lookup: LookupCollectionKey,
  ) => {
    if (String(next[targetLabelKey] || '').trim()) return;
    const resolved = resolveLookupLabel(lookups, lookup, next[sourceIdKey]);
    if (resolved) next[targetLabelKey] = resolved;
  };

  assignResolvedLabel('school_id', 'school_name', 'schools');
  assignResolvedLabel('org_unit_id', 'class_name', 'classes');
  assignResolvedLabel('class_id', 'class_name', 'classes');
  assignResolvedLabel('grade_id', 'grade_name', 'grades');
  assignResolvedLabel('subject_id', 'subject_name', 'subjects');
  assignResolvedLabel('teacher_id', 'teacher_name', 'teachers');
  assignResolvedLabel('student_id', 'student_name', 'students');

  return next;
};

export const mergeResourceItems = (
  resource: ResourceKey,
  current: JsonRecord[],
  incoming: JsonRecord[],
) => {
  const idKey = getResourceIdKey(resource);
  const merged = [...current];
  const seen = new Set(
    current.map((item) => Number(item[idKey] || item.id || 0) || 0).filter((value) => value > 0),
  );

  incoming.forEach((item) => {
    const normalizedId = Number(item[idKey] || item.id || 0) || 0;
    if (normalizedId > 0 && seen.has(normalizedId)) return;
    if (normalizedId > 0) seen.add(normalizedId);
    merged.push(item);
  });

  return merged;
};

export const RESOURCE_LABELS: Record<
  ResourceKey,
  { description: string; label: string; singular: string }
> = {
  'assignments': {
    description: '作业列表承接草稿入口、详情、发布对象与后续维护。',
    label: '作业',
    singular: '作业',
  },
  'classes': {
    description: '班级列表支持学校和教学年级筛选，并展示推导出的教学年级标签。',
    label: '班级',
    singular: '班级',
  },
  'grades': {
    description: '教学年级页支持学段筛选、导入和批量删除。',
    label: '教学年级',
    singular: '教学年级',
  },
  'questions': {
    description: '题目页提供结构化题干、答案和解析编辑。',
    label: '题目',
    singular: '题目',
  },
  'schools': {
    description: '学校信息支持直接 CRUD、导入和批量清理。',
    label: '学校',
    singular: '学校',
  },
  'students': {
    description: '学生页保留列表、详情、编辑、导入和批量删除。',
    label: '学生',
    singular: '学生',
  },
  'subjects': {
    description: '科目页支持分类筛选、导入和批量删除。',
    label: '科目',
    singular: '科目',
  },
  'submission-questions': {
    description: '提交题目结果仍归属于提交域，支持详情与修订。',
    label: '提交题目',
    singular: '提交题目',
  },
  'submissions': {
    description: '提交记录提供详情聚合、原图预览和题目结果。',
    label: '提交',
    singular: '提交',
  },
  'teachers': {
    description: '教师页支持完整 CRUD 与导入。',
    label: '教师',
    singular: '教师',
  },
};

export const RESOURCE_FILTER_FIELDS: Record<ResourceKey, FieldDefinition[]> = {
  'assignments': [
    { key: 'query', kind: 'text', label: '标题搜索', placeholder: '输入作业标题关键字' },
    { key: 'subject_id', kind: 'select', label: '科目', numeric: true, optionsFrom: 'subjects' },
    { key: 'grade_id', kind: 'select', label: '教学年级', numeric: true, optionsFrom: 'grades' },
  ],
  'classes': [
    { key: 'school_id', kind: 'select', label: '学校', numeric: true, optionsFrom: 'schools' },
    { key: 'grade', kind: 'text', label: '教学年级筛选', placeholder: '如 高一 / 七年级' },
  ],
  'grades': [
    { key: 'education_level', kind: 'text', label: '学段', placeholder: '小学 / 初中 / 高中' },
  ],
  'questions': [
    { key: 'subject_id', kind: 'select', label: '科目', numeric: true, optionsFrom: 'subjects' },
    { key: 'grade_id', kind: 'select', label: '教学年级', numeric: true, optionsFrom: 'grades' },
    { key: 'question_type', kind: 'text', label: '题型', placeholder: '选择题 / 填空题 / 解答题' },
  ],
  'schools': [
    { key: 'province', kind: 'text', label: '省份', placeholder: '输入省份' },
    { key: 'city', kind: 'text', label: '城市', placeholder: '输入城市' },
  ],
  'students': [
    { key: 'org_unit_id', kind: 'select', label: '班级', numeric: true, optionsFrom: 'classes' },
  ],
  'subjects': [
    { key: 'subject_category', kind: 'text', label: '科目分类', placeholder: 'core / elective' },
  ],
  'submission-questions': [
    { key: 'submission_id', kind: 'number', label: '提交 ID' },
    { key: 'question_id', kind: 'number', label: '题目 ID' },
  ],
  'submissions': [
    { key: 'assignment_id', kind: 'number', label: '作业 ID' },
    { key: 'org_unit_id', kind: 'select', label: '班级', numeric: true, optionsFrom: 'classes' },
    { key: 'student_id', kind: 'select', label: '学生', numeric: true, optionsFrom: 'students' },
    { key: 'grade_id', kind: 'select', label: '教学年级', numeric: true, optionsFrom: 'grades' },
    { key: 'subject_id', kind: 'select', label: '科目', numeric: true, optionsFrom: 'subjects' },
    {
      key: 'status',
      kind: 'text',
      label: '状态',
      placeholder: '已提交 / 已批改 / 待绑定',
    },
  ],
  'teachers': [
    { key: 'role', kind: 'text', label: '角色', placeholder: 'TEACHER / ADMIN / PRINCIPAL' },
  ],
};

export const RESOURCE_FORM_FIELDS: Record<EditableResourceKey, FieldDefinition[]> = {
  'assignments': [
    { key: 'title', kind: 'text', label: '标题', required: true },
    {
      key: 'subject_id',
      kind: 'select',
      label: '科目',
      numeric: true,
      optionsFrom: 'subjects',
      required: true,
    },
    {
      key: 'grade_id',
      kind: 'select',
      label: '教学年级',
      numeric: true,
      optionsFrom: 'grades',
      required: true,
    },
    {
      key: 'creation_type',
      kind: 'select',
      label: '创建方式',
      options: [
        { label: '教师录入', value: 'teacher' },
        { label: 'OCR', value: 'ocr' },
      ],
    },
    { key: 'assign_date', kind: 'datetime', label: '布置时间', required: true },
    { key: 'due_date', kind: 'datetime', label: '截止时间' },
    { key: 'file_keys', kind: 'tags', label: '文件键', placeholder: 'uploads/org-id/scan/...' },
  ],
  'classes': [
    { key: 'name', kind: 'text', label: '班级名称', required: true },
    { key: 'school_id', kind: 'select', label: '学校', numeric: true, optionsFrom: 'schools' },
    { key: 'admission_year', kind: 'number', label: '入学年份', required: true },
    { key: 'graduation_year', kind: 'number', label: '毕业年份', required: true },
    {
      key: 'education_level',
      kind: 'select',
      label: '学段',
      options: [
        { label: '小学', value: '小学' },
        { label: '初中', value: '初中' },
        { label: '高中', value: '高中' },
      ],
    },
  ],
  'grades': [
    { key: 'name', kind: 'text', label: '教学年级名称', required: true },
    {
      key: 'education_level',
      kind: 'select',
      label: '学段',
      options: [
        { label: '小学', value: '小学' },
        { label: '初中', value: '初中' },
        { label: '高中', value: '高中' },
      ],
      required: true,
    },
    { key: 'grade_order', kind: 'number', label: '排序值', required: true },
    {
      key: 'is_graduation_grade',
      kind: 'select',
      label: '毕业教学年级',
      options: [
        { label: '否', value: 'false' },
        { label: '是', value: 'true' },
      ],
      required: true,
    },
  ],
  'questions': [
    { key: 'content', kind: 'textarea', label: '题干', required: true, rows: 5 },
    { key: 'question_type', kind: 'text', label: '题型', required: true },
    { key: 'subject_id', kind: 'select', label: '科目', numeric: true, optionsFrom: 'subjects' },
    { key: 'grade_id', kind: 'select', label: '教学年级', numeric: true, optionsFrom: 'grades' },
    { key: 'difficulty', kind: 'number', label: '难度' },
    { key: 'answer', kind: 'textarea', label: '答案', rows: 4 },
    { key: 'explanation', kind: 'textarea', label: '解析', rows: 4 },
    { key: 'knowledge_points', kind: 'tags', label: '知识点' },
  ],
  'schools': [
    { key: 'name', kind: 'text', label: '学校名称', required: true },
    { key: 'province', kind: 'text', label: '省份', required: true },
    { key: 'city', kind: 'text', label: '城市', required: true },
    { key: 'address', kind: 'textarea', label: '地址', rows: 3 },
    { key: 'contact_phone', kind: 'text', label: '联系电话' },
    { key: 'contact_email', kind: 'text', label: '联系邮箱' },
    { key: 'tags', kind: 'tags', label: '标签' },
  ],
  'students': [
    { key: 'student_number', kind: 'text', label: '学号', required: true },
    { key: 'name', kind: 'text', label: '姓名', required: true },
    { key: 'org_unit_id', kind: 'select', label: '班级', numeric: true, optionsFrom: 'classes' },
    { key: 'pinyin_name', kind: 'text', label: '拼音名' },
    {
      key: 'gender',
      kind: 'select',
      label: '性别',
      options: [
        { label: '女', value: 'female' },
        { label: '男', value: 'male' },
      ],
    },
  ],
  'subjects': [
    { key: 'name', kind: 'text', label: '科目名称', required: true },
    {
      key: 'is_core_subject',
      kind: 'select',
      label: '核心学科',
      options: [
        { label: '否', value: 'false' },
        { label: '是', value: 'true' },
      ],
      required: true,
    },
    { key: 'subject_category', kind: 'text', label: '科目分类', required: true },
  ],
  'submission-questions': [
    { key: 'submission_id', kind: 'number', label: '提交 ID', required: true },
    { key: 'order_index', kind: 'number', label: '题号顺序', required: true },
    { key: 'question_id', kind: 'number', label: '题目 ID' },
    { key: 'student_answer', kind: 'textarea', label: '学生作答', rows: 5 },
    { key: 'score', kind: 'number', label: '得分' },
    { key: 'max_score', kind: 'number', label: '满分' },
    {
      key: 'is_correct',
      kind: 'select',
      label: '是否正确',
      options: [
        { label: '未设置', value: '' },
        { label: '正确', value: 'true' },
        { label: '错误', value: 'false' },
      ],
    },
    { key: 'feedback', kind: 'textarea', label: '反馈', rows: 4 },
  ],
  'submissions': [
    { key: 'assignment_id', kind: 'number', label: '作业 ID' },
    { key: 'assignment_student_id', kind: 'number', label: '作业学生 ID' },
    { key: 'status', kind: 'text', label: '状态', required: true },
    { key: 'file_keys', kind: 'tags', label: '文件键' },
    { key: 'report_path', kind: 'text', label: '报告路径' },
    { key: 'ocr_meta', kind: 'json', label: 'OCR 元数据' },
    { key: 'score', kind: 'number', label: '得分' },
    { key: 'total_score', kind: 'number', label: '总分' },
    { key: 'submitted_at', kind: 'datetime', label: '提交时间', required: true },
    { key: 'graded_at', kind: 'datetime', label: '批改时间' },
    { key: 'graded_by', kind: 'text', label: '批改人', required: true },
  ],
  'teachers': [
    { key: 'username', kind: 'text', label: '用户名', required: true },
    { key: 'real_name', kind: 'text', label: '姓名', required: true },
    { key: 'new_password', kind: 'text', label: '新密码', help: '更新时留空表示不修改密码。' },
    { key: 'teacher_number', kind: 'text', label: '教师工号' },
    {
      key: 'role',
      kind: 'select',
      label: '角色',
      options: [
        { label: '教师', value: 'TEACHER' },
        { label: '管理员', value: 'ADMIN' },
        { label: '校长', value: 'PRINCIPAL' },
      ],
      required: true,
    },
  ],
};

const prettyJson = (value: unknown) => JSON.stringify(value, null, 2);

export const safeJsonParse = (value: string, fallback: JsonRecord = {}) => {
  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
};

const splitTags = (value: string) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const cleanObject = (value: JsonRecord) =>
  Object.fromEntries(
    Object.entries(value).filter(([, entry]) => {
      if (entry === undefined || entry === null || entry === '') return false;
      if (Array.isArray(entry) && entry.length === 0) return false;
      return true;
    }),
  ) as JsonRecord;

const formatDateTimeLocal = (value: unknown) => {
  if (!value) return '';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
};

const toIsoDateTime = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
};

export const fieldOptions = (field: FieldDefinition, lookups: LookupCollections) => {
  if (field.options) return field.options;
  if (!field.optionsFrom) return [];
  return lookups[field.optionsFrom].map((item) => ({
    label: String(
      item.name ||
        item.title ||
        item.real_name ||
        item.username ||
        item.student_number ||
        item.subject_id ||
        item.grade_id,
    ),
    value: String(
      item.id ||
        item.org_unit_id ||
        item.class_id ||
        item.school_id ||
        item.student_id ||
        item.teacher_id ||
        item.subject_id ||
        item.grade_id,
    ),
  }));
};

export const resourceDefaultPayload = (resource: EditableResourceKey): JsonRecord => {
  if (resource === 'assignments') {
    return {
      assign_date: new Date().toISOString(),
      creation_type: 'teacher',
      due_date: '',
      file_keys: [],
    };
  }
  if (resource === 'grades') return { is_graduation_grade: 'false' };
  if (resource === 'subjects') return { is_core_subject: 'false' };
  if (resource === 'submission-questions') {
    return {
      feedback: '',
      is_correct: '',
      max_score: 0,
      order_index: 1,
      score: 0,
      student_answer: '',
    };
  }
  if (resource === 'submissions') {
    return {
      file_keys: [],
      graded_by: 'ai',
      status: 'submitted',
      submitted_at: new Date().toISOString(),
    };
  }
  if (resource === 'teachers') return { role: 'TEACHER' };
  return {};
};

export const toFormState = (
  resource: EditableResourceKey,
  source: JsonRecord | null,
  draft: JsonRecord = {},
) => {
  if (resource === 'questions') {
    const model = deserializeQuestionPayload(source ? { ...source, ...draft } : draft);
    return {
      answer: model.answerText,
      content: model.stem,
      difficulty: model.difficulty,
      explanation: model.thinking,
      grade_id: model.gradeId,
      knowledge_points: model.knowledgePoints.join(', '),
      question_type: model.questionType,
      subject_id: model.subjectId,
    };
  }

  const merged = { ...resourceDefaultPayload(resource), ...source, ...draft };
  const state: Record<string, string> = {};

  RESOURCE_FORM_FIELDS[resource].forEach((field) => {
    const raw = merged[field.key];
    if (field.kind === 'json') {
      state[field.key] = raw === undefined || raw === null || raw === '' ? '' : prettyJson(raw);
      return;
    }
    if (field.kind === 'tags') {
      state[field.key] = Array.isArray(raw)
        ? raw.map((item) => String(item)).join(', ')
        : String(raw || '');
      return;
    }
    if (field.kind === 'datetime') {
      state[field.key] = formatDateTimeLocal(raw);
      return;
    }
    if (typeof raw === 'boolean') {
      state[field.key] = raw ? 'true' : 'false';
      return;
    }
    state[field.key] = raw === undefined || raw === null ? '' : String(raw);
  });

  return state;
};

export const fromFormState = (resource: EditableResourceKey, form: Record<string, string>) => {
  if (resource === 'questions') {
    return serializeQuestionForm(
      createEmptyQuestionForm({
        answerText: String(form.answer || ''),
        difficulty: String(form.difficulty || ''),
        gradeId: String(form.grade_id || ''),
        knowledgePoints: splitTags(String(form.knowledge_points || '')),
        questionType: String(form.question_type || ''),
        stem: String(form.content || ''),
        subjectId: String(form.subject_id || ''),
        thinking: String(form.explanation || ''),
      }),
    );
  }

  const payload: JsonRecord = {};
  RESOURCE_FORM_FIELDS[resource].forEach((field) => {
    const raw = form[field.key] ?? '';
    if (!raw.trim()) return;
    if (field.kind === 'json') {
      payload[field.key] = safeJsonParse(raw, {});
      return;
    }
    if (field.kind === 'tags') {
      payload[field.key] = splitTags(raw);
      return;
    }
    if (field.kind === 'number') {
      payload[field.key] = Number(raw);
      return;
    }
    if (field.kind === 'datetime') {
      payload[field.key] = toIsoDateTime(raw);
      return;
    }
    if (field.numeric) {
      payload[field.key] = Number(raw);
      return;
    }
    if (
      field.kind === 'boolean' ||
      field.key === 'is_graduation_grade' ||
      field.key === 'is_core_subject'
    ) {
      payload[field.key] = raw === 'true';
      return;
    }
    payload[field.key] = raw;
  });
  return cleanObject(payload);
};

export const filtersFromFormState = (resource: ResourceKey, form: Record<string, string>) => {
  const payload: JsonRecord = {};
  RESOURCE_FILTER_FIELDS[resource].forEach((field) => {
    const raw = form[field.key] ?? '';
    if (!raw.trim()) return;
    payload[field.key] = field.numeric || field.kind === 'number' ? Number(raw) : raw.trim();
  });
  return cleanObject(payload);
};

export const getResourceIdKey = (resource: ResourceKey) =>
  resource === 'submission-questions' ? 'submission_question_id' : `${resource.slice(0, -1)}_id`;

export const buildResourceBasePath = (resource: ResourceKey) =>
  resource === 'submission-questions' ? '/submissions/questions' : `/${resource}`;

export const buildResourceEntityPath = (
  resource: ResourceKey,
  entityId: number,
  mode: 'detail' | 'edit' = 'detail',
) => {
  const basePath = buildResourceBasePath(resource);
  return mode === 'edit' ? `${basePath}/${entityId}/edit` : `${basePath}/${entityId}`;
};

export const buildResourceSelection = (resource: ResourceKey, item: JsonRecord) => {
  const idKey = getResourceIdKey(resource);
  const title = String(
    item.name ||
      item.title ||
      item.real_name ||
      item.student_number ||
      item[idKey] ||
      RESOURCE_LABELS[resource].singular,
  );
  const entityId = Number(item[idKey] || item.id || 0);
  const path =
    entityId > 0 ? buildResourceEntityPath(resource, entityId) : buildResourceBasePath(resource);
  return { entityId, path, title };
};
