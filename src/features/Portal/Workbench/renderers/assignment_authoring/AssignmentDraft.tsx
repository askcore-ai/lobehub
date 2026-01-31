'use client';

import { Flexbox } from '@lobehub/ui';
import { Table, Tag, Typography } from 'antd';
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
  const refRows = refs.map((ref, idx) => ({
    _rowKey: `${ref.order_index ?? 'x'}:${ref.question_id ?? 'x'}:${idx}`,
    ...ref,
  }));

  const columns = useMemo<ColumnsType<AssignmentDraftQuestionRef>>(
    () => [
      { dataIndex: 'order_index', key: 'order_index', title: '#' },
      { dataIndex: 'question_id', key: 'question_id', title: 'Question ID' },
      { dataIndex: 'points', key: 'points', title: 'Points' },
    ],
    [],
  );

  return (
    <Flexbox gap={8}>
      <Typography.Title level={5} style={{ margin: 0 }}>
        {title}
      </Typography.Title>
      <Flexbox gap={8} horizontal wrap="wrap">
        <Tag>{source}</Tag>
        {dueDate ? <Tag color="blue">due {dueDate}</Tag> : null}
        {content.updated_at ? (
          <Tag color="default">updated {String(content.updated_at)}</Tag>
        ) : null}
      </Flexbox>

      {refs.length > 0 ? (
        <Table
          columns={columns}
          dataSource={refRows}
          pagination={false}
          rowKey={(r) => String((r as any)._rowKey)}
          size="small"
        />
      ) : (
        <Typography.Text type="secondary">No questions yet.</Typography.Text>
      )}
    </Flexbox>
  );
});

export default AssignmentDraftDetail;
