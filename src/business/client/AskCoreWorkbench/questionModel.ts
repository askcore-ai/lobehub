'use client';

import type { JsonRecord, JsonValue } from './types';

const QUESTION_CONTENT_VERSION = 'question.content@v1';
const QUESTION_ANSWER_VERSION = 'question.answer@v1';
const QUESTION_THINKING_VERSION = 'question.thinking@v1';
const SUB_QUESTION_ID_PATTERN = /^sq(\d+)$/i;
const CHOICE_QUESTION_TYPES = new Set(['single_choice', 'multiple_choice']);
const QUESTION_TYPES = [
  'single_choice',
  'multiple_choice',
  'fill_in_blank',
  'problem_solving',
] as const;

export type QuestionType = (typeof QUESTION_TYPES)[number];

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
  stemMarkdown: string;
  subQuestions: QuestionPreviewSubQuestion[];
  summaryMarkdown: string;
  thinkingMarkdown: string;
};

export const isJsonRecord = (value: unknown): value is JsonRecord =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const normalizeQuestionType = (value: unknown): QuestionType => {
  const normalized = String(value || '').trim();
  return QUESTION_TYPES.includes(normalized as QuestionType)
    ? (normalized as QuestionType)
    : 'problem_solving';
};

const isChoiceQuestionType = (value: string) => CHOICE_QUESTION_TYPES.has(value);

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

const richText = (text: string): JsonRecord => ({
  nodes: [{ kind: 'text', text }],
});

const legacyFirstText = (value: unknown) => {
  if (typeof value === 'string') return value;
  if (!isJsonRecord(value)) return '';
  const candidateKeys = [
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
  if (typeof value.text === 'string' && value.text.trim()) return value.text;
  if (typeof value.value === 'string' && value.value.trim()) return value.value;
  if (Array.isArray(value.choices) && value.choices.length) {
    return value.choices.map((entry) => String(entry)).join(', ');
  }
  if (Array.isArray(value.labels) && value.labels.length) {
    return value.labels.map((entry) => String(entry)).join(', ');
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
  const questionType = normalizeQuestionType(overrides.questionType || 'problem_solving');
  const { questionType: _questionType, ...restOverrides } = overrides;
  return {
    answerText: '',
    difficulty: '',
    extraData: {},
    gradeId: '',
    knowledgePoints: [],
    options: isChoiceQuestionType(questionType) ? createDefaultChoiceOptions() : [],
    points: '',
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
  const versionedSubQuestions = Array.isArray(content.sub_questions)
    ? content.sub_questions.filter(isJsonRecord)
    : [];
  const answerRows = Array.isArray(answer.sub_answers)
    ? answer.sub_answers.filter(isJsonRecord)
    : [];
  const thinkingRows =
    thinking && Array.isArray(thinking.sub_thinking)
      ? thinking.sub_thinking.filter(isJsonRecord)
      : [];

  const answerBySubId = new Map<string, JsonRecord>();
  answerRows.forEach((row) => {
    const subQuestionId = String(row.sub_question_id || '').trim();
    if (!subQuestionId) return;
    answerBySubId.set(subQuestionId, isJsonRecord(row.value) ? row.value : {});
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
      points: row.points === undefined || row.points === null ? '' : String(row.points),
      prompt: readRichText(row.prompt),
      thinking: thinkingText,
    };
  });

  const options =
    Array.isArray(content.options) && content.options.length
      ? content.options.filter(isJsonRecord).map((option, index) => ({
          content: readRichText(option.content),
          id: String(option.id || String.fromCharCode(65 + index)),
          label: String(option.label || String.fromCharCode(65 + index)),
        }))
      : isChoiceQuestionType(questionType)
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
    points: content.points === undefined || content.points === null ? '' : String(content.points),
    questionType,
    stem:
      content.version === QUESTION_CONTENT_VERSION
        ? readRichText(content.stem)
        : readRichText(payload.content) || legacyFirstText(content) || legacyFirstText(payload),
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
  const subQuestions = normalized.subQuestions.map((row, index) => ({
    id: row.id || `sq${index + 1}`,
    points: parseOptionalNumber(row.points),
    prompt: richText(row.prompt.trim()),
  }));
  const answerText = normalized.answerText.trim();
  const topLevelChoices = splitTags(answerText.toUpperCase());

  const content = cleanJsonRecord({
    assets: [],
    options:
      normalized.questionType === 'single_choice' || normalized.questionType === 'multiple_choice'
        ? normalized.options
            .filter((option) => option.content.trim())
            .map((option) => ({
              content: richText(option.content.trim()),
              id: option.id.trim(),
              label: option.label.trim(),
            }))
        : undefined,
    points: !hasSubQuestions ? parseOptionalNumber(normalized.points) : undefined,
    stem: richText(normalized.stem.trim()),
    sub_questions: hasSubQuestions ? subQuestions : undefined,
    version: QUESTION_CONTENT_VERSION,
  });

  const answer = hasSubQuestions
    ? {
        sub_answers: normalized.subQuestions.map((row, index) => {
          const subQuestionId = row.id || `sq${index + 1}`;
          const choices = splitTags(row.answerText.toUpperCase());
          return {
            sub_question_id: subQuestionId,
            value:
              normalized.questionType === 'single_choice' ||
              normalized.questionType === 'multiple_choice'
                ? cleanJsonRecord({
                    choices,
                    text: row.answerText.trim(),
                  })
                : cleanJsonRecord({
                    text: row.answerText.trim(),
                  }),
          };
        }),
        version: QUESTION_ANSWER_VERSION,
      }
    : cleanJsonRecord({
        selected_option_id:
          normalized.questionType === 'single_choice' && topLevelChoices.length
            ? topLevelChoices[0]
            : undefined,
        selected_option_ids:
          normalized.questionType === 'multiple_choice' && topLevelChoices.length
            ? topLevelChoices
            : undefined,
        text: answerText,
        version: QUESTION_ANSWER_VERSION,
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
  const stemMarkdown = normalizeMarkdown(model.stem);
  const options = isChoiceQuestionType(model.questionType)
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
    stemMarkdown,
    subQuestions,
    summaryMarkdown,
    thinkingMarkdown,
  };
};

export const buildQuestionPreviewDataFromPayload = (
  payload: JsonRecord | null | undefined,
): QuestionPreviewData => buildQuestionPreviewDataFromModel(deserializeQuestionPayload(payload));
