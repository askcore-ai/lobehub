'use client';

import { Flexbox } from '@lobehub/ui';
import { Tag, Typography } from 'antd';
import { memo } from 'react';

export type HelloNoteContent = {
  tags?: string[];
  text?: string;
};

export const HelloNoteList = memo<{ content: HelloNoteContent }>(({ content }) => {
  const text = String(content.text || '').slice(0, 80);
  return (
    <Typography.Text ellipsis type="secondary">
      {text || '—'}
    </Typography.Text>
  );
});

export const HelloNoteDetail = memo<{ content: HelloNoteContent }>(({ content }) => {
  const text = String(content.text || '');
  const tags = Array.isArray(content.tags) ? content.tags : [];

  return (
    <Flexbox gap={8}>
      <Typography.Title level={5} style={{ margin: 0 }}>
        Hello Note
      </Typography.Title>
      <Typography.Paragraph style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
        {text}
      </Typography.Paragraph>
      {tags.length > 0 ? (
        <Flexbox gap={8} horizontal wrap="wrap">
          {tags.map((tag) => (
            <Tag key={tag}>{tag}</Tag>
          ))}
        </Flexbox>
      ) : null}
    </Flexbox>
  );
});

export default HelloNoteDetail;
