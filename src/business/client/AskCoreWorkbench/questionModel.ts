'use client';

import type { JsonRecord, JsonValue } from './types';

const QUESTION_CONTENT_LEGACY_VERSION = 'question.content@v1';
const QUESTION_CONTENT_GAOKAO_VERSION = 'question.content@gaokao.v1';
const QUESTION_ANSWER_GAOKAO_VERSION = 'question.answer@gaokao.v1';
const QUESTION_THINKING_VERSION = 'question.thinking@v1';
const SUB_QUESTION_ID_PATTERN = /^sq(\d+)$/i;
const DEFAULT_QUESTION_TYPE = '解答题';
const DEFAULT_SCHEMA_REF = 'constructed_response_question';

const LEGACY_QUESTION_TYPE_LABELS: Record<string, string> = {
  fill_in_blank: '填空题',
  multiple_choice: '多项选择题',
  problem_solving: '解答题',
  single_choice: '选择题',
};

export const GAOKAO_QUESTION_TYPE_OPTIONS_BY_SUBJECT: Record<string, string[]> = {
  化学: [
    '选择题',
    '单项选择题',
    '不定项选择题',
    '非选择题',
    '解答题',
    '必考题',
    '加试题',
    '化学反应原理综合题',
    '化学实验综合题',
    '化工流程综合题',
    '有机化学基础综合题',
    '物质结构与性质综合题',
    '选考题',
    '化学——选修2：化学与技术',
    '化学——选修3：物质结构与性质',
    '化学——选修5：有机化学基础',
  ],
  历史: [
    '选择题',
    '单项选择题',
    '非选择题',
    '解答题',
    '材料分析题',
    '材料解析题',
    '开放性论述题',
    '综合题',
    '阅读材料，完成下列要求',
    '必考题',
    '选考题',
    '加试题',
    '历史——选修1：历史上重大改革回眸',
    '历史——选修3：20世纪的战争与和平',
    '历史——选修4：中外历史人物评说',
    '历史——选修6：世界文化遗产荟萃',
    '历史——选修5：探索历史的奥秘',
    '历史——选修2：近代社会的民主思想与实践',
  ],
  地理: [
    '选择题',
    '单项选择题',
    '双项选择题',
    '非选择题',
    '解答题',
    '综合题',
    '综合分析题',
    '阅读图文材料，完成下列要求',
    '必考题',
    '选考题',
    '加试题',
    '地理——选修3：旅游地理',
    '地理——选修2：海洋地理',
    '地理——选修4：城乡规划',
    '地理——选修5：自然灾害与防治',
    '地理——选修6：环境保护',
  ],
  政治: [
    '选择题',
    '单项选择题',
    '判断题',
    '非选择题',
    '综合题',
    '材料分析题',
    '解答题',
    '简答题',
    '简析题',
    '分析说明题',
    '辨析题',
    '探究题',
    '论述题',
    '阅读材料，完成下列要求',
    '必考题',
    '选考题',
    '加试题',
  ],
  数学: [
    '选择题',
    '多项选择题',
    '填空题',
    '解答题',
    '非选择题',
    '必考题',
    '必做题',
    '选考题',
    '选修4-4：坐标系与参数方程',
    '选修4-5：不等式选讲',
    '选修4-1：几何证明选讲',
    '附加题',
  ],
  物理: [
    '选择题',
    '单项选择题',
    '多项选择题',
    '实验题',
    '计算题',
    '解答题',
    '综合题',
    '简答题',
    '填空题',
    '非选择题',
    '必考题',
    '选考题',
    '加试题',
    '物理——选修3-3',
    '物理——选修3-4',
    '物理——选修3-5',
  ],
  生物: [
    '选择题',
    '单项选择题',
    '多项选择题',
    '不定项选择题',
    '非选择题',
    '综合题',
    '解答题',
    '简答题',
    '实验题',
    '必考题',
    '选考题',
    '加试题',
    '生物——选修1：生物技术实践',
    '生物——选修3：现代生物科技专题',
  ],
  英语: [
    '听力',
    '阅读理解',
    '七选五',
    '语言知识运用',
    '语法和词汇',
    '完形填空',
    '语法填空',
    '短文改错',
    '写作',
    '书面表达',
    '应用文写作',
    '读后续写',
    '概要写作',
    '指导性写作',
    '阅读表达',
    '单项填空',
    '翻译',
  ],
  语文: [
    '阅读题',
    '现代文阅读',
    '论述类文本阅读',
    '实用类文本阅读',
    '文学类文本阅读',
    '小说阅读',
    '散文阅读',
    '古代诗文阅读',
    '文言文阅读',
    '古代诗歌阅读',
    '传统文化经典阅读',
    '名篇名句默写',
    '语言文字运用',
    '综合读写',
    '表达题',
    '必考题',
    '选考题',
    '写作',
  ],
};

const GAOKAO_SCHEMA_REF_BY_QUESTION_TYPE: Record<string, string> = {
  '七选五': 'reading_passage_question',
  '不定项选择题': 'choice_question',
  '书面表达': 'writing_question',
  '传统文化经典阅读': 'reading_passage_question',
  '写作': 'writing_question',
  '分析说明题': 'constructed_response_question',
  '判断题': 'judgement_question',
  '加试题': 'constructed_response_question',
  '化学反应原理综合题': 'constructed_response_question',
  '化学实验综合题': 'experiment_question',
  '化工流程综合题': 'constructed_response_question',
  '单项填空': 'choice_question',
  '单项选择题': 'choice_question',
  '双项选择题': 'choice_question',
  '古代诗文阅读': 'reading_passage_question',
  '古代诗歌阅读': 'reading_passage_question',
  '名篇名句默写': 'fill_blank_question',
  '听力': 'listening_question',
  '填空题': 'fill_blank_question',
  '多项选择题': 'choice_question',
  '完形填空': 'cloze_question',
  '实用类文本阅读': 'reading_passage_question',
  '实验题': 'experiment_question',
  '小说阅读': 'reading_passage_question',
  '应用文写作': 'writing_question',
  '开放性论述题': 'constructed_response_question',
  '必做题': 'constructed_response_question',
  '必考题': 'constructed_response_question',
  '指导性写作': 'writing_question',
  '探究题': 'constructed_response_question',
  '散文阅读': 'reading_passage_question',
  '文学类文本阅读': 'reading_passage_question',
  '文言文阅读': 'reading_passage_question',
  '有机化学基础综合题': 'constructed_response_question',
  '材料分析题': 'constructed_response_question',
  '材料解析题': 'constructed_response_question',
  '概要写作': 'writing_question',
  '短文改错': 'correction_question',
  '简析题': 'constructed_response_question',
  '简答题': 'constructed_response_question',
  '综合分析题': 'constructed_response_question',
  '综合读写': 'constructed_response_question',
  '综合题': 'constructed_response_question',
  '翻译': 'translation_question',
  '表达题': 'constructed_response_question',
  '解答题': 'constructed_response_question',
  '计算题': 'calculation_question',
  '论述类文本阅读': 'reading_passage_question',
  '论述题': 'constructed_response_question',
  '语法和词汇': 'constructed_response_question',
  '语法填空': 'fill_blank_question',
  '语言文字运用': 'constructed_response_question',
  '语言知识运用': 'constructed_response_question',
  '读后续写': 'writing_question',
  '辨析题': 'constructed_response_question',
  '选择题': 'choice_question',
  '选考题': 'elective_module_question',
  '阅读图文材料，完成下列要求': 'constructed_response_question',
  '阅读材料，完成下列要求': 'constructed_response_question',
  '阅读理解': 'reading_passage_question',
  '阅读表达': 'reading_passage_question',
  '阅读题': 'reading_passage_question',
  '附加题': 'constructed_response_question',
  '非选择题': 'constructed_response_question',
};

const GAOKAO_ELECTIVE_PREFIXES = ['化学——', '历史——', '地理——', '物理——', '生物——', '选修'];

export type QuestionType = string;

export type QuestionFormOption = {
  content: string;
  id: string;
  label: string;
};

export type QuestionFormSubQuestion = {
  answerText: string;
  id: string;
  points: string;
  prompt: string;
  thinking: string;
};

export type QuestionFormModel = {
  answerText: string;
  difficulty: string;
  extraData: JsonRecord;
  gradeId: string;
  knowledgePoints: string[];
  options: QuestionFormOption[];
  points: string;
  questionType: QuestionType;
  schemaRef: string;
  stem: string;
  subjectId: string;
  subQuestions: QuestionFormSubQuestion[];
  thinking: string;
};

export type QuestionPreviewOption = {
  content: string;
  id: string;
  label: string;
};

export type QuestionPreviewSubQuestion = {
  answerText: string;
  id: string;
  points: string;
  prompt: string;
  thinking: string;
};

export type QuestionPreviewData = {
  answerMarkdown: string;
  options: QuestionPreviewOption[];
  points: string;
  questionType: QuestionType;
  schemaRef: string;
  stemMarkdown: string;
  subQuestions: QuestionPreviewSubQuestion[];
  summaryMarkdown: string;
  thinkingMarkdown: string;
};

export const isJsonRecord = (value: unknown): value is JsonRecord =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const normalizeQuestionType = (value: unknown): QuestionType => {
  const normalized = String(value || '').trim();
  if (!normalized) return DEFAULT_QUESTION_TYPE;
  return LEGACY_QUESTION_TYPE_LABELS[normalized] || normalized;
};

export const schemaRefForQuestionType = (questionType: unknown, fallback?: unknown) => {
  const normalizedFallback = String(fallback || '').trim();
  if (normalizedFallback) return normalizedFallback;
  const normalized = normalizeQuestionType(questionType);
  if (GAOKAO_SCHEMA_REF_BY_QUESTION_TYPE[normalized]) {
    return GAOKAO_SCHEMA_REF_BY_QUESTION_TYPE[normalized];
  }
  if (GAOKAO_ELECTIVE_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
    return 'elective_module_question';
  }
  return DEFAULT_SCHEMA_REF;
};

export const isChoiceQuestionSchemaRef = (schemaRef: unknown) =>
  String(schemaRef || '').trim() === 'choice_question';

export const questionTypeOptionsForSubjectName = (subjectName: unknown) => {
  const normalized = String(subjectName || '').trim();
  return GAOKAO_QUESTION_TYPE_OPTIONS_BY_SUBJECT[normalized] || [];
};

export const defaultQuestionTypeForSubjectName = (subjectName: unknown) =>
  questionTypeOptionsForSubjectName(subjectName)[0] || DEFAULT_QUESTION_TYPE;

const createDefaultChoiceOptions = (): QuestionFormOption[] => [
  { content: '', id: 'A', label: 'A' },
  { content: '', id: 'B', label: 'B' },
];

const splitTags = (value: string) =>
  value
    .split(/[,\n，、]/)
    .map((entry) => entry.trim())
    .filter(Boolean);

const cleanJsonRecord = (value: Record<string, unknown>): JsonRecord =>
  Object.fromEntries(
    Object.entries(value).filter(([, entry]) => {
      if (entry === undefined || entry === null) return false;
      if (typeof entry === 'string' && !entry.trim()) return false;
      return true;
    }),
  ) as JsonRecord;

const parseOptionalNumber = (value: string) => {
  const normalized = value.trim();
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const readRichText = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (!isJsonRecord(value)) return '';
  if (typeof value.text === 'string' && value.text.trim()) return value.text;
  const nodes = Array.isArray(value.nodes) ? value.nodes : [];
  return nodes
    .map((node) => {
      if (!isJsonRecord(node)) return '';
      if (node.kind === 'text') return String(node.text || '');
      if (node.kind === 'blank') return `【${String(node.blank_id || '空')}】`;
      return '';
    })
    .join('')
    .trim();
};

const readMarkdownText = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (!isJsonRecord(value)) return '';
  for (const key of [
    'content_markdown',
    'raw_markdown',
    'answer_markdown',
    'prompt_markdown',
    'body_markdown',
    'stem_markdown',
    'text',
    'value',
  ]) {
    const entry = value[key];
    if (typeof entry === 'string' && entry.trim()) return entry;
  }
  return readRichText(value);
};

const legacyFirstText = (value: unknown) => {
  if (typeof value === 'string') return value;
  if (!isJsonRecord(value)) return '';
  const candidateKeys = [
    'content_markdown',
    'raw_markdown',
    'answer_markdown',
    'body_markdown',
    'prompt_markdown',
    'stem_markdown',
    'body',
    'prompt',
    'stem',
    'text',
    'value',
    'explanation',
    'summary',
    'content',
  ];
  for (const key of candidateKeys) {
    const entry = value[key];
    if (typeof entry === 'string' && entry.trim()) return entry;
    const rich = readRichText(entry);
    if (rich) return rich;
  }
  return '';
};

const readAnswerText = (value: unknown): string => {
  if (!isJsonRecord(value)) return typeof value === 'string' ? value : '';
  if (typeof value.raw_markdown === 'string' && value.raw_markdown.trim()) {
    return value.raw_markdown;
  }
  if (typeof value.answer_markdown === 'string' && value.answer_markdown.trim()) {
    return value.answer_markdown;
  }
  if (typeof value.text === 'string' && value.text.trim()) return value.text;
  if (typeof value.value === 'string' && value.value.trim()) return value.value;
  if (Array.isArray(value.option_labels) && value.option_labels.length) {
    return value.option_labels.map((entry) => String(entry)).join(', ');
  }
  if (Array.isArray(value.acceptable_answers) && value.acceptable_answers.length) {
    return value.acceptable_answers.map((entry) => String(entry)).join(', ');
  }
  if (Array.isArray(value.choices) && value.choices.length) {
    return value.choices.map((entry) => String(entry)).join(', ');
  }
  if (Array.isArray(value.labels) && value.labels.length) {
    return value.labels.map((entry) => String(entry)).join(', ');
  }
  if (Array.isArray(value.subanswers)) {
    const first = value.subanswers.find(isJsonRecord);
    if (first) return readAnswerText(first);
  }
  if (Array.isArray(value.blanks)) {
    const first = value.blanks.find(isJsonRecord);
    if (first) return readAnswerText(first);
  }
  if (Array.isArray(value.sub_answers)) {
    const first = value.sub_answers.find(isJsonRecord);
    if (first && isJsonRecord(first.value)) return readAnswerText(first.value);
  }
  return legacyFirstText(value);
};

const readThinkingText = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (!isJsonRecord(value)) return '';
  if (typeof value.text === 'string' && value.text.trim()) return value.text;
  if (typeof value.explanation === 'string' && value.explanation.trim()) return value.explanation;
  if (Array.isArray(value.sub_thinking)) {
    const first = value.sub_thinking.find(isJsonRecord);
    if (first) return readThinkingText(first);
  }
  return legacyFirstText(value);
};

export const createEmptyQuestionForm = (
  overrides: Partial<QuestionFormModel> = {},
): QuestionFormModel => {
  const questionType = normalizeQuestionType(overrides.questionType || DEFAULT_QUESTION_TYPE);
  const schemaRef = schemaRefForQuestionType(questionType, overrides.schemaRef);
  const { questionType: _questionType, schemaRef: _schemaRef, ...restOverrides } = overrides;
  return {
    answerText: '',
    difficulty: '',
    extraData: {},
    gradeId: '',
    knowledgePoints: [],
    options: isChoiceQuestionSchemaRef(schemaRef) ? createDefaultChoiceOptions() : [],
    points: '',
    schemaRef,
    stem: '',
    subjectId: '',
    subQuestions: [],
    thinking: '',
    ...restOverrides,
    questionType,
  };
};

export const getNextSubQuestionId = (subQuestions: Array<Pick<QuestionFormSubQuestion, 'id'>>) => {
  const existingIds = new Set(subQuestions.map((row) => row.id.trim()).filter(Boolean));
  let maxIndex = 0;
  existingIds.forEach((value) => {
    const match = SUB_QUESTION_ID_PATTERN.exec(value);
    if (match) maxIndex = Math.max(maxIndex, Number(match[1]) || 0);
  });

  let nextIndex = maxIndex + 1;
  while (existingIds.has(`sq${nextIndex}`)) nextIndex += 1;
  return `sq${nextIndex}`;
};

export const deserializeQuestionPayload = (
  payload: JsonRecord | null | undefined,
): QuestionFormModel => {
  if (!payload) return createEmptyQuestionForm();

  const content = isJsonRecord(payload.content) ? payload.content : {};
  const answer = isJsonRecord(payload.answer) ? payload.answer : {};
  const thinking = isJsonRecord(payload.thinking) ? payload.thinking : null;
  const questionType = normalizeQuestionType(payload.question_type || payload.type);
  const schemaRef = schemaRefForQuestionType(questionType, content.schema_ref);
  const rawSubQuestions = Array.isArray(content.subquestions)
    ? content.subquestions
    : content.sub_questions;
  const versionedSubQuestions = Array.isArray(rawSubQuestions)
    ? rawSubQuestions.filter(isJsonRecord)
    : [];
  const rawAnswerRows = Array.isArray(answer.subanswers) ? answer.subanswers : answer.sub_answers;
  const answerRows = Array.isArray(rawAnswerRows) ? rawAnswerRows.filter(isJsonRecord) : [];
  const thinkingRows =
    thinking && Array.isArray(thinking.sub_thinking)
      ? thinking.sub_thinking.filter(isJsonRecord)
      : [];

  const answerBySubId = new Map<string, JsonRecord>();
  answerRows.forEach((row) => {
    const subQuestionId = String(row.subquestion_id || row.sub_question_id || '').trim();
    if (!subQuestionId) return;
    answerBySubId.set(subQuestionId, isJsonRecord(row.value) ? row.value : row);
  });

  const thinkingBySubId = new Map<string, JsonRecord>();
  thinkingRows.forEach((row) => {
    const subQuestionId = String(row.sub_question_id || '').trim();
    if (!subQuestionId) return;
    thinkingBySubId.set(subQuestionId, row);
  });

  const subQuestions: QuestionFormSubQuestion[] = versionedSubQuestions.map((row, index) => {
    const subQuestionId = String(row.id || `sq${index + 1}`);
    const answerValue = answerBySubId.get(subQuestionId) || {};
    const thinkingValue = thinkingBySubId.get(subQuestionId) || {};
    const thinkingText =
      typeof thinkingValue.text === 'string'
        ? thinkingValue.text
        : typeof thinkingValue.explanation === 'string'
          ? thinkingValue.explanation
          : typeof answerValue.explanation === 'string'
            ? answerValue.explanation
            : '';
    return {
      answerText: readAnswerText(answerValue),
      id: subQuestionId,
      points:
        row.score === undefined && row.points === undefined
          ? ''
          : String(row.score === undefined ? row.points : row.score),
      prompt: readMarkdownText(row.content_markdown) || readRichText(row.prompt),
      thinking: thinkingText,
    };
  });

  const options =
    Array.isArray(content.options) && content.options.length
      ? content.options.filter(isJsonRecord).map((option, index) => ({
          content: readMarkdownText(option.content_markdown) || readRichText(option.content),
          id: String(option.id || String.fromCharCode(65 + index)),
          label: String(option.label || String.fromCharCode(65 + index)),
        }))
      : isChoiceQuestionSchemaRef(schemaRef)
        ? createDefaultChoiceOptions()
        : [];

  return createEmptyQuestionForm({
    answerText: subQuestions.length ? '' : readAnswerText(answer),
    difficulty:
      payload.difficulty === undefined || payload.difficulty === null
        ? ''
        : String(payload.difficulty),
    extraData: isJsonRecord(payload.extra_data) ? payload.extra_data : {},
    gradeId:
      payload.grade_id === undefined || payload.grade_id === null ? '' : String(payload.grade_id),
    knowledgePoints: Array.isArray(payload.knowledge_points)
      ? payload.knowledge_points.map((entry) => String(entry)).filter(Boolean)
      : [],
    options,
    points:
      content.score === undefined && content.points === undefined
        ? ''
        : String(content.score === undefined ? content.points : content.score),
    questionType,
    schemaRef,
    stem:
      content.version === QUESTION_CONTENT_GAOKAO_VERSION
        ? readMarkdownText(content.content_markdown)
        : content.version === QUESTION_CONTENT_LEGACY_VERSION
          ? readRichText(content.stem)
          : readMarkdownText(payload.content) ||
            legacyFirstText(content) ||
            legacyFirstText(payload),
    subjectId:
      payload.subject_id === undefined || payload.subject_id === null
        ? ''
        : String(payload.subject_id),
    subQuestions,
    thinking:
      subQuestions.length > 0
        ? ''
        : readThinkingText(thinking) ||
          (typeof answer.explanation === 'string' ? answer.explanation : ''),
  });
};

export const serializeQuestionForm = (model: QuestionFormModel): JsonRecord => {
  const normalized = createEmptyQuestionForm(model);
  const hasSubQuestions = normalized.subQuestions.length > 0;
  const schemaRef = schemaRefForQuestionType(normalized.questionType, normalized.schemaRef);
  const isChoice = isChoiceQuestionSchemaRef(schemaRef);
  const subQuestions = normalized.subQuestions.map((row, index) => ({
    id: row.id || `sq${index + 1}`,
    content_markdown: row.prompt.trim(),
    question_no: String(index + 1),
    score: parseOptionalNumber(row.points),
  }));
  const answerText = normalized.answerText.trim();
  const topLevelChoices = splitTags(answerText.toUpperCase());
  const subAnswerMarkdown = normalized.subQuestions
    .map((row) => row.answerText.trim())
    .filter(Boolean)
    .join('\n\n');
  const rawAnswerMarkdown = answerText || subAnswerMarkdown || '未提供';

  const content = cleanJsonRecord({
    assets: [],
    blanks: [],
    content_markdown: normalized.stem.trim(),
    materials: [],
    options: isChoice
      ? normalized.options
          .filter((option) => option.content.trim() || option.label.trim())
          .map((option) => ({
            content_markdown: option.content.trim(),
            id: option.id.trim(),
            label: option.label.trim(),
          }))
      : [],
    schema_ref: schemaRef,
    score: !hasSubQuestions ? parseOptionalNumber(normalized.points) : undefined,
    subquestions: hasSubQuestions ? subQuestions : [],
    version: QUESTION_CONTENT_GAOKAO_VERSION,
  });

  const answer = cleanJsonRecord({
    option_labels: isChoice && topLevelChoices.length ? topLevelChoices : undefined,
    raw_markdown: rawAnswerMarkdown,
    subanswers: hasSubQuestions
      ? normalized.subQuestions.map((row, index) => ({
          answer_markdown: row.answerText.trim() || rawAnswerMarkdown,
          question_no: String(index + 1),
          subquestion_id: row.id || `sq${index + 1}`,
        }))
      : undefined,
    version: QUESTION_ANSWER_GAOKAO_VERSION,
  });

  const thinkingRows = normalized.subQuestions
    .map((row, index) => ({
      sub_question_id: row.id || `sq${index + 1}`,
      text: row.thinking.trim(),
    }))
    .filter((row) => row.text);

  return cleanJsonRecord({
    answer: answer as JsonValue,
    content,
    difficulty: parseOptionalNumber(normalized.difficulty),
    extra_data: normalized.extraData,
    grade_id: parseOptionalNumber(normalized.gradeId),
    knowledge_points: normalized.knowledgePoints,
    question_type: normalized.questionType,
    subject_id: parseOptionalNumber(normalized.subjectId),
    thinking: hasSubQuestions
      ? thinkingRows.length
        ? {
            sub_thinking: thinkingRows,
            version: QUESTION_THINKING_VERSION,
          }
        : undefined
      : normalized.thinking.trim()
        ? {
            text: normalized.thinking.trim(),
            version: QUESTION_THINKING_VERSION,
          }
        : undefined,
  });
};

const normalizeMarkdown = (value: unknown) =>
  typeof value === 'string' ? value.replaceAll(/\r\n?/g, '\n').trim() : '';

const hasMeaningfulMarkdown = (value: string) =>
  value.replaceAll(/[`#>*_\-[\]()|:\s]/g, '').trim().length > 0;

export const extractFirstMeaningfulMarkdownBlock = (value: unknown, fallback = '--') => {
  const normalized = normalizeMarkdown(value);
  if (!normalized) return fallback;
  const blocks = normalized
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);
  return blocks.find(hasMeaningfulMarkdown) || blocks[0] || fallback;
};

export const buildQuestionPreviewDataFromModel = (
  model: QuestionFormModel,
): QuestionPreviewData => {
  const schemaRef = schemaRefForQuestionType(model.questionType, model.schemaRef);
  const stemMarkdown = normalizeMarkdown(model.stem);
  const options = isChoiceQuestionSchemaRef(schemaRef)
    ? model.options
        .map((option) => ({
          content: normalizeMarkdown(option.content),
          id: option.id.trim(),
          label: option.label.trim(),
        }))
        .filter((option) => option.content || option.label)
    : [];
  const answerMarkdown = normalizeMarkdown(model.answerText);
  const thinkingMarkdown = normalizeMarkdown(model.thinking);
  const subQuestions = model.subQuestions.map((subQuestion) => ({
    answerText: normalizeMarkdown(subQuestion.answerText),
    id: subQuestion.id.trim(),
    points: subQuestion.points.trim(),
    prompt: normalizeMarkdown(subQuestion.prompt),
    thinking: normalizeMarkdown(subQuestion.thinking),
  }));
  const summaryMarkdown = extractFirstMeaningfulMarkdownBlock(
    stemMarkdown ||
      subQuestions.map((row) => row.prompt).find(Boolean) ||
      options.map((row) => row.content).find(Boolean) ||
      answerMarkdown,
    '--',
  );

  return {
    answerMarkdown,
    options,
    points: model.points.trim(),
    questionType: model.questionType,
    schemaRef,
    stemMarkdown,
    subQuestions,
    summaryMarkdown,
    thinkingMarkdown,
  };
};

export const buildQuestionPreviewDataFromPayload = (
  payload: JsonRecord | null | undefined,
): QuestionPreviewData => buildQuestionPreviewDataFromModel(deserializeQuestionPayload(payload));
