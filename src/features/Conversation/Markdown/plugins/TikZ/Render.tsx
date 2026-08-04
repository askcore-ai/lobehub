'use client';

import { memo, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { type MarkdownElementProps } from '../type';
import { compileTikz, type TikzCompileResult } from './runtime';

interface TikzProperties {
  source: string;
}

const Render = memo<MarkdownElementProps<TikzProperties>>(({ node }) => {
  const { t } = useTranslation('chat');
  const source = node.properties.source;
  const [result, setResult] = useState<TikzCompileResult>();

  useEffect(() => {
    let current = true;
    setResult(undefined);
    void compileTikz(source).then((nextResult) => {
      if (current) setResult(nextResult);
    });

    return () => {
      current = false;
    };
  }, [source]);

  if (!result) return <div role="status">{t('tikz.rendering')}</div>;

  if (result.status === 'failed') {
    return (
      <div role="alert">
        <strong>{t('tikz.renderFailed')}</strong>
        <pre
          aria-label={t('tikz.sourceLabel')}
          style={{ overflowX: 'auto', whiteSpace: 'pre-wrap' }}
        >
          <code>{source}</code>
        </pre>
      </div>
    );
  }

  return (
    <div
      aria-label={t('tikz.diagramLabel')}
      dangerouslySetInnerHTML={{ __html: result.svg }}
      data-testid="tikz-diagram-canvas"
      role="img"
      style={{
        backgroundColor: '#fff',
        color: '#000',
        maxWidth: '100%',
        overflowX: 'auto',
        padding: 12,
      }}
    />
  );
});

Render.displayName = 'TikzDiagramRender';

export default Render;
