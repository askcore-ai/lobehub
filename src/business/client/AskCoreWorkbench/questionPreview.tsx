'use client';

import { Markdown } from '@lobehub/ui';
import { createStaticStyles, cx } from 'antd-style';
import { memo } from 'react';

import type { QuestionPreviewData } from './questionModel';

const styles = createStaticStyles(({ css, cssVar }) => ({
  label: css`
    font-size: 11px;
    font-weight: 600;
    line-height: 1.4;
    color: ${cssVar.colorTextDescription};
    text-transform: uppercase;
  `,
  markdown: css`
    overflow: visible;
    color: ${cssVar.colorText};

    p {
      margin-block: 0 4px !important;
    }

    ul,
    ol {
      margin-block: 4px !important;
      padding-inline-start: 18px !important;
    }

    table {
      margin-block: 6px !important;
      font-size: 12px;
    }

    .katex-display {
      overflow: auto hidden;
      margin-block: 6px !important;
    }
  `,
  option: css`
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 8px;
  `,
  section: css`
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  `,
  subQuestion: css`
    display: flex;
    flex-direction: column;
    gap: 6px;

    padding-inline-start: 12px;
    border-inline-start: 1px solid ${cssVar.colorBorderSecondary};
  `,
}));

export const MarkdownPreview = memo<{
  className?: string;
  content: string;
  empty?: string;
}>(({ className, content, empty = '暂无内容' }) => {
  const normalized = String(content || '').trim();
  if (!normalized) {
    return <div className={cx(styles.markdown, className)}>{empty}</div>;
  }

  return (
    <Markdown
      enableLatex
      className={cx(styles.markdown, className)}
      enableImageGallery={false}
      enableMermaid={false}
      enableStream={false}
      fontSize={13}
      lineHeight={1.55}
      variant="chat"
    >
      {normalized}
    </Markdown>
  );
});

MarkdownPreview.displayName = 'MarkdownPreview';

export const QuestionSummaryPreview = memo<{
  className?: string;
  preview: QuestionPreviewData;
}>(({ className, preview }) => (
  <MarkdownPreview className={className} content={preview.summaryMarkdown} empty="暂无题目摘要" />
));

QuestionSummaryPreview.displayName = 'QuestionSummaryPreview';

export const QuestionCompactPreview = memo<{
  className?: string;
  preview: QuestionPreviewData;
}>(({ className, preview }) => {
  const hasTopLevelAnswer = preview.answerMarkdown || preview.thinkingMarkdown || preview.points;

  return (
    <div className={cx(className)} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className={styles.section}>
        <div className={styles.label}>题干</div>
        <MarkdownPreview content={preview.stemMarkdown} empty="暂无题干" />
      </div>

      {preview.options.length ? (
        <div className={styles.section}>
          <div className={styles.label}>选项</div>
          {preview.options.map((option) => (
            <div className={styles.option} key={`${option.id}-${option.label}`}>
              <div>{option.label || option.id}</div>
              <MarkdownPreview content={option.content} empty="暂无选项内容" />
            </div>
          ))}
        </div>
      ) : null}

      {preview.subQuestions.length ? (
        <div className={styles.section}>
          <div className={styles.label}>小问</div>
          {preview.subQuestions.map((subQuestion, index) => (
            <div className={styles.subQuestion} key={subQuestion.id || `sub-question-${index}`}>
              <div>
                第 {index + 1} 小问
                {subQuestion.points ? ` · ${subQuestion.points} 分` : ''}
              </div>
              <MarkdownPreview content={subQuestion.prompt} empty="暂无小问题干" />
              {subQuestion.answerText ? (
                <div className={styles.option}>
                  <div>答案</div>
                  <MarkdownPreview content={subQuestion.answerText} empty="暂无答案" />
                </div>
              ) : null}
              {subQuestion.thinking ? (
                <div className={styles.option}>
                  <div>解析</div>
                  <MarkdownPreview content={subQuestion.thinking} empty="暂无解析" />
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {hasTopLevelAnswer ? (
        <div className={styles.section}>
          {preview.points ? <div>分值：{preview.points}</div> : null}
          {preview.answerMarkdown ? (
            <div className={styles.option}>
              <div>答案</div>
              <MarkdownPreview content={preview.answerMarkdown} empty="暂无答案" />
            </div>
          ) : null}
          {preview.thinkingMarkdown ? (
            <div className={styles.option}>
              <div>解析</div>
              <MarkdownPreview content={preview.thinkingMarkdown} empty="暂无解析" />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
});

QuestionCompactPreview.displayName = 'QuestionCompactPreview';

export const QuestionMarkdownPreview = QuestionCompactPreview;
