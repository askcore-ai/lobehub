'use client';

import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  DeleteOutlined,
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { Flexbox, Markdown } from '@lobehub/ui';
import {
  App,
  Button,
  Collapse,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Tag,
  Typography,
} from 'antd';
import { memo, useMemo, useState } from 'react';

import { useChatStore } from '@/store/chat';
import { PortalViewType } from '@/store/chat/slices/portal/initialState';

type Props = {
  artifactId: string;
  conversationId: string;
  initialContent: Record<string, unknown>;
  onClose: () => void;
};

type StartInvocationResponse = { invocation_id: string; run_id: number };

type QuestionType = 'single_choice' | 'multiple_choice' | 'fill_in_blank' | 'problem_solving';

type DraftQuestionForm = {
  answerText: string;
  explanationText: string;
  optionsText: string;
  orderIndex: number;
  points: number | null;
  questionId: number | null;
  questionType: QuestionType;
  stemText: string;
  uid: string;
};

const QUESTION_CONTENT_VERSION = 'question.content@v1';
const QUESTION_ANSWER_VERSION = 'question.answer@v1';
const QUESTION_THINKING_VERSION = 'question.thinking@v1';
const QUESTION_TYPE_OPTIONS: Array<{ label: string; value: QuestionType }> = [
  { label: '单选题', value: 'single_choice' },
  { label: '多选题', value: 'multiple_choice' },
  { label: '填空题', value: 'fill_in_blank' },
  { label: '解答题', value: 'problem_solving' },
];

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const asNumberOrNull = (value: unknown): number | null => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const normalizeQuestionType = (value: unknown): QuestionType => {
  const raw = String(value || '').trim();
  if (
    raw === 'single_choice' ||
    raw === 'multiple_choice' ||
    raw === 'fill_in_blank' ||
    raw === 'problem_solving'
  ) {
    return raw;
  }
  return 'problem_solving';
};

const textFromNodes = (value: unknown): string => {
  const nodes = Array.isArray(asRecord(value).nodes) ? (asRecord(value).nodes as unknown[]) : [];
  return nodes
    .map((node) => {
      const obj = asRecord(node);
      if (obj.kind === 'text') return String(obj.text || '');
      if (obj.kind === 'blank') return `[[${String(obj.blank_id || 'blank')}]]`;
      if (obj.kind === 'asset') return `[asset:${String(obj.asset_id || '')}]`;
      return '';
    })
    .filter(Boolean)
    .join('\n')
    .trim();
};

const richTextFromString = (text: string): Record<string, unknown> => ({
  nodes: [{ kind: 'text', text }],
});

const splitOptions = (text: string): string[] =>
  text
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);

const splitAnswers = (text: string): string[] =>
  text
    .split(/[\s,;，；]+/)
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);

const optionLabel = (idx: number): string => String.fromCharCode(65 + idx);

const questionFromPayload = (
  rawQuestion: Record<string, unknown>,
  idx: number,
  fallbackPoints?: number | null,
): DraftQuestionForm => {
  const content = asRecord(rawQuestion.content);
  const answer = asRecord(rawQuestion.answer);
  const thinking = asRecord(rawQuestion.thinking);
  const subQuestions = Array.isArray(content.sub_questions)
    ? (content.sub_questions as unknown[])
    : [];
  const firstSubQuestion = asRecord(subQuestions[0]);
  const subQuestionId = String(firstSubQuestion.id || 'sq1');

  const stemText =
    textFromNodes(content.stem) ||
    textFromNodes(asRecord(firstSubQuestion.prompt)) ||
    String(rawQuestion.stem || '').trim();

  const options = Array.isArray(content.options) ? (content.options as unknown[]) : [];
  const optionsText = options
    .map((item) => {
      const optionObj = asRecord(item);
      const optionContent = textFromNodes(optionObj.content);
      if (optionContent) return optionContent;
      return String(optionObj.label || optionObj.id || '').trim();
    })
    .filter(Boolean)
    .join('\n');

  const subAnswers = Array.isArray(answer.sub_answers) ? (answer.sub_answers as unknown[]) : [];
  const selectedSubAnswer = asRecord(
    subAnswers.find((item) => String(asRecord(item).sub_question_id || '') === subQuestionId) ||
      subAnswers[0],
  );
  const answerValue = asRecord(selectedSubAnswer.value);
  let answerText = '';
  if (Array.isArray(answerValue.selected_option_ids)) {
    answerText = (answerValue.selected_option_ids as unknown[])
      .map((item) => String(item || '').trim())
      .filter(Boolean)
      .join(', ');
  } else if (typeof answerValue.raw_text === 'string') {
    answerText = answerValue.raw_text.trim();
  } else if (Object.keys(answerValue).length > 0) {
    answerText = JSON.stringify(answerValue);
  } else if (typeof rawQuestion.answer === 'string') {
    answerText = String(rawQuestion.answer).trim();
  }

  const subThinking = Array.isArray(thinking.sub_thinking)
    ? (thinking.sub_thinking as unknown[])
    : [];
  const selectedThinking = asRecord(
    subThinking.find((item) => String(asRecord(item).sub_question_id || '') === subQuestionId) ||
      subThinking[0],
  );
  const explanationText =
    typeof selectedThinking.explanation === 'string'
      ? selectedThinking.explanation.trim()
      : String(rawQuestion.explanation || '').trim();

  const points =
    asNumberOrNull(content.points) ??
    asNumberOrNull(firstSubQuestion.points) ??
    asNumberOrNull(fallbackPoints) ??
    null;

  return {
    answerText,
    explanationText,
    optionsText,
    orderIndex: asNumberOrNull(rawQuestion.order_index) || idx + 1,
    points,
    questionId: asNumberOrNull(rawQuestion.question_id),
    questionType: normalizeQuestionType(rawQuestion.question_type),
    stemText,
    uid: crypto.randomUUID(),
  };
};

const emptyQuestion = (idx: number): DraftQuestionForm => ({
  answerText: '',
  explanationText: '',
  optionsText: '',
  orderIndex: idx + 1,
  points: 5,
  questionId: null,
  questionType: 'problem_solving',
  stemText: '',
  uid: crypto.randomUUID(),
});

const normalizeOrder = (items: DraftQuestionForm[]): DraftQuestionForm[] =>
  items.map((item, idx) => ({ ...item, orderIndex: idx + 1 }));

const AssignmentDraftEditor = memo<Props>(
  ({ artifactId, conversationId, initialContent, onClose }) => {
    const { message } = App.useApp();

    const initialTitle = String((initialContent as any)?.title || '').trim();
    const initialDueDate = String((initialContent as any)?.due_date || '').trim();
    const subjectId = Number((initialContent as any)?.subject_id || 0);
    const gradeId = Number((initialContent as any)?.grade_id || 0);

    const initialQuestionsRaw = Array.isArray((initialContent as any)?.questions)
      ? ((initialContent as any).questions as unknown[])
      : [];
    const initialQuestionRefs = Array.isArray((initialContent as any)?.question_refs)
      ? ((initialContent as any).question_refs as unknown[])
      : [];

    const [title, setTitle] = useState(initialTitle);
    const [dueDate, setDueDate] = useState(initialDueDate);
    const [questions, setQuestions] = useState<DraftQuestionForm[]>(() => {
      if (initialQuestionsRaw.length > 0) {
        return normalizeOrder(
          initialQuestionsRaw.map((raw, idx) =>
            questionFromPayload(asRecord(raw), idx, asNumberOrNull(asRecord(raw).points)),
          ),
        );
      }
      if (initialQuestionRefs.length > 0) {
        return normalizeOrder(
          initialQuestionRefs.map((raw, idx) =>
            questionFromPayload(
              {
                answer: {
                  sub_answers: [{ sub_question_id: 'sq1', value: { raw_text: '' } }],
                  version: QUESTION_ANSWER_VERSION,
                },
                content: {
                  assets: [],
                  stem: { nodes: [] },
                  sub_questions: [{ id: 'sq1', prompt: { nodes: [{ kind: 'text', text: '' }] } }],
                  version: QUESTION_CONTENT_VERSION,
                },
                order_index: asRecord(raw).order_index,
                points: asRecord(raw).points,
                question_id: asRecord(raw).question_id,
                question_type: 'problem_solving',
              },
              idx,
              asNumberOrNull(asRecord(raw).points),
            ),
          ),
        );
      }
      return [emptyQuestion(0)];
    });
    const [saving, setSaving] = useState(false);
    const [advancedJson, setAdvancedJson] = useState(() => {
      const initialList =
        initialQuestionsRaw.length > 0 ? initialQuestionsRaw : initialQuestionRefs;
      return JSON.stringify(initialList, null, 2);
    });

    const draftPreview = useMemo(() => {
      return questions.map((question, idx) => {
        const options = splitOptions(question.optionsText);
        return {
          ...question,
          options,
          previewOrder: idx + 1,
        };
      });
    }, [questions]);

    const updateQuestion = (uid: string, patch: Partial<DraftQuestionForm>) => {
      setQuestions((prev) => prev.map((item) => (item.uid === uid ? { ...item, ...patch } : item)));
    };

    const addQuestion = () => {
      setQuestions((prev) => normalizeOrder([...prev, emptyQuestion(prev.length)]));
    };

    const removeQuestion = (uid: string) => {
      setQuestions((prev) => {
        const next = prev.filter((item) => item.uid !== uid);
        return normalizeOrder(next.length > 0 ? next : [emptyQuestion(0)]);
      });
    };

    const moveQuestion = (uid: string, direction: -1 | 1) => {
      setQuestions((prev) => {
        const index = prev.findIndex((item) => item.uid === uid);
        if (index < 0) return prev;
        const target = index + direction;
        if (target < 0 || target >= prev.length) return prev;
        const next = prev.slice();
        const [current] = next.splice(index, 1);
        next.splice(target, 0, current);
        return normalizeOrder(next);
      });
    };

    const refreshAdvancedJson = () => {
      const payload = questions.map((question, idx) => ({
        answer: question.answerText,
        explanation: question.explanationText,
        options: splitOptions(question.optionsText),
        order_index: idx + 1,
        points: question.points,
        question_id: question.questionId,
        question_type: question.questionType,
        stem: question.stemText,
      }));
      setAdvancedJson(JSON.stringify(payload, null, 2));
    };

    const applyAdvancedJson = () => {
      try {
        const parsed = JSON.parse(advancedJson);
        if (!Array.isArray(parsed)) {
          throw new Error('JSON 顶层必须是数组');
        }
        const next = normalizeOrder(
          parsed.map((row, idx) => questionFromPayload(asRecord(row), idx)),
        );
        setQuestions(next.length > 0 ? next : [emptyQuestion(0)]);
        message.success('已根据高级 JSON 覆盖编辑器内容。');
      } catch (error) {
        message.error(error instanceof Error ? error.message : '高级 JSON 解析失败');
      }
    };

    const buildQuestionPayload = (
      question: DraftQuestionForm,
      idx: number,
    ): Record<string, unknown> => {
      const questionType = question.questionType;
      const stemText = question.stemText.trim();
      if (!stemText) {
        throw new Error(`题目 ${idx + 1}: 题干不能为空`);
      }

      const subQuestionId = 'sq1';
      const options = splitOptions(question.optionsText);
      const answerTokens = splitAnswers(question.answerText);
      const answerRaw = question.answerText.trim();

      const content: Record<string, unknown> = {
        assets: [],
        stem: richTextFromString(stemText),
        sub_questions: [{ id: subQuestionId, prompt: richTextFromString(stemText) }],
        version: QUESTION_CONTENT_VERSION,
      };
      if (
        typeof question.points === 'number' &&
        Number.isFinite(question.points) &&
        question.points >= 0
      ) {
        content.points = Number(question.points);
      }

      let answerValue: Record<string, unknown>;
      if (questionType === 'single_choice' || questionType === 'multiple_choice') {
        if (options.length < 2) {
          throw new Error(`题目 ${idx + 1}: 选择题至少需要 2 个选项`);
        }

        const optionIds = new Set(options.map((_, optionIdx) => optionLabel(optionIdx)));
        content.options = options.map((optionText, optionIdx) => ({
          content: richTextFromString(optionText),
          id: optionLabel(optionIdx),
          label: optionLabel(optionIdx),
        }));

        const selected = answerTokens.filter((token) => optionIds.has(token));
        if (selected.length === 0) {
          throw new Error(`题目 ${idx + 1}: 选择题答案必须引用选项编号（例如 A 或 A,B）`);
        }
        if (questionType === 'single_choice' && selected.length !== 1) {
          throw new Error(`题目 ${idx + 1}: 单选题只能有一个答案`);
        }

        answerValue = {
          selected_option_ids: questionType === 'single_choice' ? [selected[0]] : selected,
        };
      } else {
        answerValue = { raw_text: answerRaw };
      }

      const answer = {
        sub_answers: [{ sub_question_id: subQuestionId, value: answerValue }],
        version: QUESTION_ANSWER_VERSION,
      };

      const explanation = question.explanationText.trim();
      const thinking = explanation
        ? {
            sub_thinking: [{ explanation, sub_question_id: subQuestionId }],
            version: QUESTION_THINKING_VERSION,
          }
        : null;

      const payload: Record<string, unknown> = {
        answer,
        content,
        grade_id: gradeId,
        order_index: idx + 1,
        question_type: questionType,
        subject_id: subjectId,
      };
      if (question.questionId && question.questionId > 0) payload.question_id = question.questionId;
      if (thinking) payload.thinking = thinking;
      return payload;
    };

    const onSave = async () => {
      const normalizedTitle = title.trim();
      if (!normalizedTitle) {
        message.error('标题不能为空');
        return;
      }
      if (!(subjectId > 0) || !(gradeId > 0)) {
        message.error('草稿缺少有效的 subject_id / grade_id');
        return;
      }

      let draftQuestions: Array<Record<string, unknown>>;
      try {
        draftQuestions = questions.map((question, idx) => buildQuestionPayload(question, idx));
      } catch (error) {
        message.error(error instanceof Error ? error.message : '题目校验失败');
        return;
      }

      const normalizedDueDate = dueDate.trim();

      Modal.confirm({
        content: '保存后会创建新的 assignment.draft 版本，是否继续？',
        okText: 'Confirm',
        onOk: async () => {
          setSaving(true);
          try {
            const res = await fetch('/api/workbench/invocations', {
              body: JSON.stringify({
                action_id: 'assignment.draft.save',
                confirmation_id: null,
                conversation_id: conversationId,
                params: {
                  draft_artifact_id: artifactId,
                  due_date: normalizedDueDate || undefined,
                  questions: draftQuestions,
                  title: normalizedTitle,
                },
                plugin_id: 'admin.ops.v1',
              }),
              headers: {
                'Content-Type': 'application/json',
                'Idempotency-Key': `assignment-draft-save:${artifactId}:${Date.now()}`,
              },
              method: 'POST',
            });

            if (!res.ok) {
              const text = await res.text();
              message.error(text || `Save failed (${res.status})`);
              return;
            }

            const data = (await res.json()) as StartInvocationResponse;
            message.success(`Save started (run ${data.run_id}).`);
            useChatStore.getState().pushPortalView({
              conversationId,
              runId: data.run_id,
              type: PortalViewType.Workbench,
            });
            onClose();
          } finally {
            setSaving(false);
          }
        },
        title: 'Confirm save',
      });
    };

    return (
      <Flexbox gap={12}>
        <Typography.Title level={5} style={{ margin: 0 }}>
          编辑作业草稿
        </Typography.Title>

        <Flexbox
          gap={8}
          style={{ border: '1px solid rgba(0,0,0,0.08)', borderRadius: 8, padding: 12 }}
        >
          <Typography.Text strong>元信息</Typography.Text>
          <Space size={8} wrap>
            <Input
              onChange={(e) => setTitle(e.target.value)}
              placeholder="作业标题"
              style={{ minWidth: 260 }}
              value={title}
            />
            <Input
              onChange={(e) => setDueDate(e.target.value)}
              placeholder="截止时间 (RFC3339，可选)"
              style={{ minWidth: 280 }}
              value={dueDate}
            />
            <Tag>subject_id: {subjectId > 0 ? subjectId : 'N/A'}</Tag>
            <Tag>grade_id: {gradeId > 0 ? gradeId : 'N/A'}</Tag>
          </Space>
        </Flexbox>

        <Flexbox
          gap={10}
          style={{ border: '1px solid rgba(0,0,0,0.08)', borderRadius: 8, padding: 12 }}
        >
          <Flexbox align={'center'} horizontal justify={'space-between'}>
            <Typography.Text strong>题目卡片</Typography.Text>
            <Button icon={<PlusOutlined />} onClick={addQuestion} size="small" type="primary">
              新增题目
            </Button>
          </Flexbox>

          {questions.map((question, idx) => (
            <Flexbox
              gap={8}
              key={question.uid}
              style={{ background: 'rgba(0,0,0,0.02)', borderRadius: 8, padding: 12 }}
            >
              <Flexbox align={'center'} horizontal justify={'space-between'}>
                <Space size={8}>
                  <Tag>#{idx + 1}</Tag>
                  {question.questionId ? (
                    <Tag color="blue">question_id {question.questionId}</Tag>
                  ) : null}
                </Space>
                <Space size={6}>
                  <Button
                    disabled={idx === 0}
                    icon={<ArrowUpOutlined />}
                    onClick={() => moveQuestion(question.uid, -1)}
                    size="small"
                  />
                  <Button
                    disabled={idx === questions.length - 1}
                    icon={<ArrowDownOutlined />}
                    onClick={() => moveQuestion(question.uid, 1)}
                    size="small"
                  />
                  <Button
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => removeQuestion(question.uid)}
                    size="small"
                  />
                </Space>
              </Flexbox>

              <Space size={8} wrap>
                <Select<QuestionType>
                  onChange={(value) => {
                    updateQuestion(question.uid, {
                      optionsText:
                        value === 'single_choice' || value === 'multiple_choice'
                          ? question.optionsText || '选项1\n选项2'
                          : '',
                      questionType: value,
                    });
                  }}
                  options={QUESTION_TYPE_OPTIONS}
                  style={{ minWidth: 180 }}
                  value={question.questionType}
                />
                <InputNumber
                  min={0}
                  onChange={(value) =>
                    updateQuestion(question.uid, {
                      points: typeof value === 'number' ? value : null,
                    })
                  }
                  placeholder="分值"
                  style={{ width: 120 }}
                  value={question.points}
                />
              </Space>

              <Input.TextArea
                autoSize={{ maxRows: 8, minRows: 3 }}
                onChange={(e) => updateQuestion(question.uid, { stemText: e.target.value })}
                placeholder="题干（支持 Markdown）"
                value={question.stemText}
              />

              {question.questionType === 'single_choice' ||
              question.questionType === 'multiple_choice' ? (
                <Input.TextArea
                  autoSize={{ maxRows: 6, minRows: 3 }}
                  onChange={(e) => updateQuestion(question.uid, { optionsText: e.target.value })}
                  placeholder={'选项（换行或逗号分隔）\n例如：A 选项\nB 选项'}
                  value={question.optionsText}
                />
              ) : null}

              <Input
                onChange={(e) => updateQuestion(question.uid, { answerText: e.target.value })}
                placeholder={
                  question.questionType === 'single_choice'
                    ? '参考答案（例如 A）'
                    : question.questionType === 'multiple_choice'
                      ? '参考答案（例如 A,B）'
                      : '参考答案'
                }
                value={question.answerText}
              />

              <Input.TextArea
                autoSize={{ maxRows: 6, minRows: 2 }}
                onChange={(e) => updateQuestion(question.uid, { explanationText: e.target.value })}
                placeholder="解析（可选）"
                value={question.explanationText}
              />
            </Flexbox>
          ))}
        </Flexbox>

        <Flexbox
          gap={8}
          style={{ border: '1px solid rgba(0,0,0,0.08)', borderRadius: 8, padding: 12 }}
        >
          <Typography.Text strong>预览</Typography.Text>
          {draftPreview.map((question) => (
            <Flexbox
              gap={6}
              key={question.uid}
              style={{ background: 'rgba(0,0,0,0.02)', borderRadius: 8, padding: 10 }}
            >
              <Typography.Text>
                {question.previewOrder}.{' '}
                {QUESTION_TYPE_OPTIONS.find((x) => x.value === question.questionType)?.label}
                {typeof question.points === 'number' ? ` · ${question.points} 分` : ''}
              </Typography.Text>
              <Markdown style={{ overflow: 'unset' }} variant={'chat'}>
                {question.stemText || '*（暂无题干）*'}
              </Markdown>
              {question.options.length > 0 ? (
                <Typography.Text type="secondary">
                  选项：
                  {question.options.map((opt, idx) => `${optionLabel(idx)}. ${opt}`).join('  |  ')}
                </Typography.Text>
              ) : null}
              {question.answerText ? (
                <Typography.Text type="secondary">答案：{question.answerText}</Typography.Text>
              ) : null}
              {question.explanationText ? (
                <Markdown style={{ overflow: 'unset' }} variant={'chat'}>
                  {`解析：${question.explanationText}`}
                </Markdown>
              ) : null}
            </Flexbox>
          ))}
        </Flexbox>

        <Collapse
          items={[
            {
              children: (
                <Flexbox gap={8}>
                  <Typography.Text type="secondary">
                    用于运维调试。可直接粘贴数组 JSON 并应用到当前编辑器。
                  </Typography.Text>
                  <Input.TextArea
                    autoSize={{ maxRows: 18, minRows: 8 }}
                    onChange={(e) => setAdvancedJson(e.target.value)}
                    value={advancedJson}
                  />
                  <Space>
                    <Button icon={<ReloadOutlined />} onClick={refreshAdvancedJson} size="small">
                      刷新 JSON
                    </Button>
                    <Button onClick={applyAdvancedJson} size="small">
                      应用 JSON
                    </Button>
                  </Space>
                </Flexbox>
              ),
              key: 'advanced',
              label: '高级 JSON（运维调试）',
            },
          ]}
          size="small"
        />

        <Space>
          <Button loading={saving} onClick={onSave} type="primary">
            Save draft
          </Button>
          <Button onClick={onClose}>Cancel</Button>
        </Space>
      </Flexbox>
    );
  },
);

AssignmentDraftEditor.displayName = 'AssignmentDraftEditor';

export default AssignmentDraftEditor;
