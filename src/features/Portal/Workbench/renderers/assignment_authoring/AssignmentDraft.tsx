'use client';

import { Flexbox, Markdown } from '@lobehub/ui';
import { Collapse, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { memo, useMemo } from 'react';

export interface AssignmentDraftQuestionRef {
  order_index?: number;
  points?: number;
  question_id?: number;
}

export interface AssignmentDraftQuestion {
  answer?: Record<string, unknown>;
  content?: Record<string, unknown>;
  grade_id?: number;
  order_index?: number;
  question_id?: number;
  question_type?: string;
  subject_id?: number;
  thinking?: Record<string, unknown> | null;
}

export interface AssignmentDraftContent {
  draft_id?: string;
  due_date?: string;
  grade_id?: number;
  question_refs?: AssignmentDraftQuestionRef[];
  questions?: AssignmentDraftQuestion[];
  source?: string;
  subject_id?: number;
  title?: string;
  updated_at?: string;
}

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const richTextToString = (value: unknown): string => {
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

const questionTypeLabel = (value?: string): string => {
  if (value === 'single_choice') return '单选题';
  if (value === 'multiple_choice') return '多选题';
  if (value === 'fill_in_blank') return '填空题';
  if (value === 'problem_solving') return '解答题';
  return value || '未设置';
};

export const AssignmentDraftList = memo<{ content: AssignmentDraftContent }>(({ content }) => {
  const title = String(content.title || '').trim();
  const source = String(content.source || '').trim() || 'manual';
  const questionsCount = Array.isArray(content.questions)
    ? content.questions.length
    : Array.isArray(content.question_refs)
      ? content.question_refs.length
      : 0;

  return (
    <Typography.Text type="secondary">
      {title ? `${title.slice(0, 60)} · ` : ''}
      {source} · {questionsCount} questions
    </Typography.Text>
  );
});

export const AssignmentDraftDetail = memo<{ content: AssignmentDraftContent }>(({ content }) => {
  const title = String(content.title || '').trim() || 'Untitled Draft';
  const source = String(content.source || '').trim() || 'manual';
  const dueDate = String(content.due_date || '').trim();
  const refs = Array.isArray(content.question_refs) ? content.question_refs : [];
  const questions = Array.isArray(content.questions) ? content.questions : [];

  const refRows = refs.map((ref, idx) => ({
    _rowKey: `${ref.order_index ?? 'x'}:${ref.question_id ?? 'x'}:${idx}`,
    ...ref,
  }));
  const refColumns = useMemo<ColumnsType<AssignmentDraftQuestionRef>>(
    () => [
      { dataIndex: 'order_index', key: 'order_index', title: '#' },
      { dataIndex: 'question_id', key: 'question_id', title: 'Question ID' },
      { dataIndex: 'points', key: 'points', title: 'Points' },
    ],
    [],
  );

  const questionPreviewItems = questions
    .slice()
    .sort((a, b) => Number(a.order_index || 0) - Number(b.order_index || 0))
    .map((question, idx) => {
      const contentObj = asRecord(question.content);
      const subQuestions = Array.isArray(contentObj.sub_questions)
        ? (contentObj.sub_questions as unknown[])
        : [];
      const firstSubQuestion = asRecord(subQuestions[0]);
      const stemText =
        richTextToString(contentObj.stem) ||
        richTextToString(asRecord(firstSubQuestion.prompt)) ||
        '';
      const answerObj = asRecord(question.answer);
      const subAnswers = Array.isArray(answerObj.sub_answers)
        ? (answerObj.sub_answers as unknown[])
        : [];
      const answerValue = asRecord(asRecord(subAnswers[0]).value);
      const answerText = Array.isArray(answerValue.selected_option_ids)
        ? (answerValue.selected_option_ids as unknown[])
            .map((item) => String(item || '').trim())
            .filter(Boolean)
            .join(', ')
        : String(answerValue.raw_text || '').trim();
      const thinkingObj = asRecord(question.thinking);
      const subThinking = Array.isArray(thinkingObj.sub_thinking)
        ? (thinkingObj.sub_thinking as unknown[])
        : [];
      const explanation = String(asRecord(subThinking[0]).explanation || '').trim();

      return {
        answerText,
        explanation,
        order: Number(question.order_index) || idx + 1,
        points:
          typeof contentObj.points === 'number'
            ? contentObj.points
            : typeof asRecord(firstSubQuestion).points === 'number'
              ? asRecord(firstSubQuestion).points
              : null,
        questionId: question.question_id,
        questionType: question.question_type,
        stemText,
      };
    });

  return (
    <Flexbox gap={8}>
      <Typography.Title level={5} style={{ margin: 0 }}>
        {title}
      </Typography.Title>
      <Flexbox gap={8} horizontal wrap="wrap">
        <Tag>{source}</Tag>
        {content.subject_id ? <Tag color="blue">subject {content.subject_id}</Tag> : null}
        {content.grade_id ? <Tag color="gold">grade {content.grade_id}</Tag> : null}
        {dueDate ? <Tag color="blue">due {dueDate}</Tag> : null}
        {content.updated_at ? (
          <Tag color="default">updated {String(content.updated_at)}</Tag>
        ) : null}
      </Flexbox>

      {refs.length > 0 ? (
        <Table
          columns={refColumns}
          dataSource={refRows}
          pagination={false}
          rowKey={(r) => String((r as any)._rowKey)}
          size="small"
        />
      ) : (
        <Typography.Text type="secondary">No question refs.</Typography.Text>
      )}

      {questionPreviewItems.length > 0 ? (
        <Collapse
          items={[
            {
              children: (
                <Flexbox gap={8}>
                  {questionPreviewItems.map((item) => (
                    <Flexbox
                      gap={6}
                      key={`${item.order}:${item.questionId ?? 'x'}`}
                      style={{
                        background: 'rgba(0,0,0,0.02)',
                        borderRadius: 8,
                        padding: 10,
                      }}
                    >
                      <Typography.Text>
                        {item.order}. {questionTypeLabel(item.questionType)}
                        {item.points !== null ? ` · ${item.points} 分` : ''}
                        {item.questionId ? ` · Q${item.questionId}` : ''}
                      </Typography.Text>
                      <Markdown style={{ overflow: 'unset' }} variant={'chat'}>
                        {item.stemText || '*（暂无题干）*'}
                      </Markdown>
                      {item.answerText ? (
                        <Typography.Text type="secondary">答案：{item.answerText}</Typography.Text>
                      ) : null}
                      {item.explanation ? (
                        <Markdown style={{ overflow: 'unset' }} variant={'chat'}>
                          {`解析：${item.explanation}`}
                        </Markdown>
                      ) : null}
                    </Flexbox>
                  ))}
                </Flexbox>
              ),
              key: 'questions',
              label: `题目预览（${questionPreviewItems.length}）`,
            },
          ]}
          size="small"
        />
      ) : null}
    </Flexbox>
  );
});

export default AssignmentDraftDetail;
