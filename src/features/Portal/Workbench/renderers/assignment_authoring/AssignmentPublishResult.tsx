'use client';

import { Flexbox } from '@lobehub/ui';
import { Tag, Typography } from 'antd';
import { memo } from 'react';

export interface AssignmentPublishResultContent {
  assignment_id?: number;
  draft_artifact_id?: string;
  errors?: string[];
  message?: string;
  question_ids?: number[];
  status?: string;
}

export const AssignmentPublishResultList = memo<{ content: AssignmentPublishResultContent }>(
  ({ content }) => {
    const status = String(content.status || '').trim() || 'unknown';
    const qCount = Array.isArray(content.question_ids) ? content.question_ids.length : 0;
    return (
      <Typography.Text type="secondary">
        {status} · {qCount} questions
      </Typography.Text>
    );
  },
);

export const AssignmentPublishResultDetail = memo<{ content: AssignmentPublishResultContent }>(
  ({ content }) => {
    const status = String(content.status || '').trim() || 'unknown';
    const message = String(content.message || '').trim();
    const errors = Array.isArray(content.errors) ? content.errors.filter(Boolean) : [];
    const qCount = Array.isArray(content.question_ids) ? content.question_ids.length : 0;

    const statusTag =
      status === 'succeeded' ? (
        <Tag color="success">{status}</Tag>
      ) : status === 'failed' ? (
        <Tag color="error">{status}</Tag>
      ) : (
        <Tag>{status}</Tag>
      );

    return (
      <Flexbox gap={8}>
        <Typography.Title level={5} style={{ margin: 0 }}>
          Publish Result
        </Typography.Title>
        <Flexbox gap={8} horizontal wrap="wrap">
          {statusTag}
          <Tag>{qCount} questions</Tag>
          {content.assignment_id ? <Tag>assignment #{content.assignment_id}</Tag> : null}
        </Flexbox>
        {message ? (
          <Typography.Paragraph style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
            {message}
          </Typography.Paragraph>
        ) : null}
        {errors.length > 0 ? (
          <Flexbox gap={4}>
            <Typography.Text type="secondary">Errors</Typography.Text>
            <Flexbox
              style={{
                border: '1px solid rgba(0,0,0,0.08)',
                borderRadius: 8,
                maxHeight: 180,
                overflow: 'auto',
                padding: 12,
              }}
            >
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {errors.join('\n')}
              </pre>
            </Flexbox>
          </Flexbox>
        ) : null}
      </Flexbox>
    );
  },
);

export default AssignmentPublishResultDetail;
