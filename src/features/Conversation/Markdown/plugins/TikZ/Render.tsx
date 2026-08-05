'use client';

import { createStaticStyles } from 'antd-style';
import { memo, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { type MarkdownElementProps } from '../type';
import { useScientificContentRenderEnabled } from './context';
import { compileTikz, type TikzCompileResult } from './runtime';
import { stableScientificCanvas } from './tokens';

interface TikzProperties {
  source: string;
}

const styles = createStaticStyles(({ css }) => ({
  canvas: css`
    overflow-x: auto;

    max-width: 100%;
    padding: 12px;

    color: ${stableScientificCanvas.foregroundColor};

    background-color: ${stableScientificCanvas.backgroundColor};
  `,
  source: css`
    overflow-x: auto;
    white-space: pre-wrap;
  `,
}));

const Render = memo<MarkdownElementProps<TikzProperties>>(({ node }) => {
  const { t } = useTranslation('chat');
  const enabled = useScientificContentRenderEnabled();
  const source = node.properties.source;
  const [result, setResult] = useState<TikzCompileResult>();

  useEffect(() => {
    if (!enabled) return;

    let current = true;
    setResult(undefined);
    void compileTikz(source).then((nextResult) => {
      if (current) setResult(nextResult);
    });

    return () => {
      current = false;
    };
  }, [enabled, source]);

  if (!enabled) {
    return (
      <pre className={styles.source}>
        <code className="language-tikz">{source}</code>
      </pre>
    );
  }

  if (!result) return <div role="status">{t('tikz.rendering')}</div>;

  if (result.status === 'failed') {
    return (
      <div role="alert">
        <strong>{t('tikz.renderFailed')}</strong>
        <pre aria-label={t('tikz.sourceLabel')} className={styles.source}>
          <code>{source}</code>
        </pre>
      </div>
    );
  }

  return (
    <div
      aria-label={t('tikz.diagramLabel')}
      className={styles.canvas}
      dangerouslySetInnerHTML={{ __html: result.svg }}
      data-testid="tikz-diagram-canvas"
      role="img"
    />
  );
});

Render.displayName = 'TikzDiagramRender';

export default Render;
