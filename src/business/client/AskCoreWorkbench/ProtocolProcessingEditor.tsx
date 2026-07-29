'use client';

import { Button, Checkbox, Empty, Input, InputNumber, Skeleton, Tag } from 'antd';
import { createStaticStyles, cssVar } from 'antd-style';
import {
  Check,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Pencil,
  RotateCcw,
  ScanText,
} from 'lucide-react';
import { type ReactNode, memo, useEffect, useMemo, useState } from 'react';

import { MarkdownPreview } from './questionPreview';
import type {
  JsonRecord,
  ProtocolProcessingInput,
  ProtocolProcessingQuestion,
  ProtocolProcessingQuestionEdit,
} from './types';

const styles = createStaticStyles(({ css }) => ({
  card: css`
    overflow: hidden;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 12px;
    background: ${cssVar.colorBgContainer};
    transition:
      border-color 160ms ease,
      box-shadow 160ms ease;

    &:focus-within {
      border-color: ${cssVar.colorPrimaryBorder};
      box-shadow: 0 0 0 3px ${cssVar.colorPrimaryBg};
    }

    @media (prefers-reduced-motion: reduce) {
      transition: none;
    }
  `,
  cardActions: css`
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    justify-content: flex-end;

    @media (width <= 760px) {
      .ant-btn {
        min-height: 44px;
      }
    }
  `,
  cardBody: css`
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding-block: 16px 18px;
    padding-inline: 18px;
  `,
  cardHeader: css`
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
    justify-content: space-between;

    min-height: 58px;
    padding-block: 10px;
    padding-inline: 16px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};

    background: ${cssVar.colorFillQuaternary};
  `,
  cardIdentity: css`
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    min-width: 0;
  `,
  cardTitle: css`
    font-size: 15px;
    font-weight: 650;
    color: ${cssVar.colorText};
  `,
  editorFields: css`
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;

    @media (width <= 680px) {
      grid-template-columns: 1fr;
    }
  `,
  emptyResult: css`
    display: grid;
    place-items: center;
    min-height: 360px;
    padding: 24px;
  `,
  field: css`
    display: flex;
    flex-direction: column;
    gap: 7px;
    min-width: 0;
  `,
  fieldLabel: css`
    font-size: 13px;
    font-weight: 600;
    color: ${cssVar.colorText};
  `,
  fieldWide: css`
    grid-column: 1 / -1;
  `,
  label: css`
    font-size: 12px;
    font-weight: 600;
    line-height: 1.4;
    color: ${cssVar.colorTextDescription};
  `,
  preview: css`
    min-height: 48px;
    padding: 12px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 8px;
    background: ${cssVar.colorFillQuaternary};
  `,
  previewCanvas: css`
    overflow: hidden;
    display: grid;
    place-items: center;

    aspect-ratio: 4 / 5;
    width: 100%;
    min-height: 520px;
    border-block: 1px solid ${cssVar.colorBorderSecondary};

    background: ${cssVar.colorFillQuaternary};

    @media (width <= 760px) {
      min-height: 420px;
    }
  `,
  previewFrame: css`
    display: block;
    width: 100%;
    height: 100%;
    min-height: 520px;
    border: 0;
    background: white;

    @media (width <= 760px) {
      min-height: 420px;
    }
  `,
  previewImage: css`
    display: block;
    width: 100%;
    height: 100%;
    max-height: 780px;
    object-fit: contain;
  `,
  previewMeta: css`
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
    justify-content: space-between;
    min-height: 54px;
    padding-block: 8px;
    padding-inline: 12px;

    @media (width <= 760px) {
      .ant-btn {
        min-height: 44px;
      }
    }
  `,
  questionList: css`
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 14px;
  `,
  readGrid: css`
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;

    @media (width <= 680px) {
      grid-template-columns: 1fr;
    }
  `,
  readSection: css`
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  `,
  readWide: css`
    grid-column: 1 / -1;
  `,
  resultHeader: css`
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
    justify-content: space-between;

    min-height: 64px;
    padding-block: 12px;
    padding-inline: 16px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};
  `,
  resultPanel: css`
    min-width: 0;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 12px;
    background: ${cssVar.colorBgContainer};
  `,
  sectionHeading: css`
    display: flex;
    gap: 8px;
    align-items: center;
    min-width: 0;
  `,
  sourceHeader: css`
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
    justify-content: space-between;
    min-height: 64px;
    padding-block: 12px;
    padding-inline: 14px;
  `,
  sourcePanel: css`
    position: sticky;
    top: 16px;

    overflow: hidden;
    min-width: 0;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 12px;

    background: ${cssVar.colorBgContainer};

    @media (width <= 1180px) {
      position: static;
    }
  `,
  sourceTabs: css`
    scrollbar-width: thin;
    overflow-x: auto;
    display: flex;
    gap: 8px;

    padding-block: 10px;
    padding-inline: 12px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};
  `,
  sourceTab: css`
    cursor: pointer;

    display: flex;
    flex: 0 0 auto;
    gap: 8px;
    align-items: center;

    min-height: 44px;
    padding-block: 8px;
    padding-inline: 10px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 8px;

    color: ${cssVar.colorTextDescription};

    background: ${cssVar.colorBgContainer};

    &:hover {
      color: ${cssVar.colorText};
      border-color: ${cssVar.colorBorder};
      background: ${cssVar.colorFillQuaternary};
    }

    &:focus-visible {
      outline: 2px solid ${cssVar.colorPrimary};
      outline-offset: 2px;
    }

    &[aria-pressed='true'] {
      color: ${cssVar.colorPrimary};
      border-color: ${cssVar.colorPrimaryBorder};
      background: ${cssVar.colorPrimaryBg};
    }
  `,
  workspace: css`
    display: grid;
    grid-template-columns: minmax(320px, 0.88fr) minmax(0, 1.3fr);
    gap: 18px;
    align-items: start;
    min-width: 0;

    @media (width <= 1180px) {
      grid-template-columns: minmax(0, 1fr);
    }
  `,
}));

type Translate = (key: string, options?: Record<string, unknown>) => string;

export const protocolQuestionText = (value: JsonRecord | string | null | undefined) => {
  if (typeof value === 'string') return value.trim();
  if (!value) return '';
  for (const key of ['text', 'content', 'value']) {
    const candidate = value[key];
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return '';
};

export const serializeProtocolQuestionEdits = (
  questions: ProtocolProcessingQuestion[],
  referenceMode: boolean,
): ProtocolProcessingQuestionEdit[] =>
  questions.map((question) =>
    referenceMode
      ? {
          max_score: question.max_score ?? null,
          order_index: question.order_index,
          question_content: protocolQuestionText(question.question_content),
          question_number: question.question_number ?? null,
          question_type: question.question_type ?? null,
          reference_answer: protocolQuestionText(question.reference_answer),
          reference_thinking: question.reference_thinking ?? null,
        }
      : {
          feedback: question.feedback ?? null,
          is_correct: question.is_correct ?? null,
          max_score: question.max_score ?? null,
          order_index: question.order_index,
          score: question.score ?? null,
          student_answer: question.student_answer ?? null,
        },
  );

const sameQuestion = (
  current: ProtocolProcessingQuestion,
  baseline: ProtocolProcessingQuestion | undefined,
) => Boolean(baseline) && JSON.stringify(current) === JSON.stringify(baseline);

const MarkdownField = ({
  ariaLabel,
  empty,
  label,
  onChange,
  previewLabel,
  value,
}: {
  ariaLabel: string;
  empty: string;
  label: string;
  onChange: (value: string) => void;
  previewLabel: string;
  value: string;
}) => (
  <div className={`${styles.field} ${styles.fieldWide}`}>
    <div className={styles.fieldLabel}>{label}</div>
    <Input.TextArea
      aria-label={ariaLabel}
      autoSize={{ maxRows: 14, minRows: 4 }}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
    <div className={styles.label}>{previewLabel}</div>
    <div className={styles.preview}>
      <MarkdownPreview content={value} empty={empty} />
    </div>
  </div>
);

const ReadSection = ({
  content,
  empty,
  label,
  wide = false,
}: {
  content: string;
  empty: string;
  label: string;
  wide?: boolean;
}) => (
  <div className={`${styles.readSection} ${wide ? styles.readWide : ''}`}>
    <div className={styles.label}>{label}</div>
    <MarkdownPreview content={content} empty={empty} />
  </div>
);

const SourceRail = ({
  inputs,
  referenceMode,
  t,
}: {
  inputs: ProtocolProcessingInput[];
  referenceMode: boolean;
  t: Translate;
}) => {
  const sourceKind = referenceMode ? 'reference' : 'response';
  const sources = useMemo(
    () =>
      [...inputs]
        .filter((input) => input.kind === sourceKind)
        .sort((left, right) => left.page_order - right.page_order),
    [inputs, sourceKind],
  );
  const [selectedSlot, setSelectedSlot] = useState('');

  useEffect(() => {
    if (!sources.length) {
      setSelectedSlot('');
      return;
    }
    if (!sources.some((source) => source.slot_id === selectedSlot)) {
      setSelectedSlot(sources[0].slot_id);
    }
  }, [selectedSlot, sources]);

  const selected = sources.find((source) => source.slot_id === selectedSlot) || sources[0];
  const labelFor = (source: ProtocolProcessingInput) =>
    t(
      referenceMode
        ? 'askcoreProcessing.editor.preview.referencePage'
        : 'askcoreProcessing.editor.preview.responsePage',
      { page: source.page_order },
    );

  return (
    <aside className={styles.sourcePanel}>
      <div className={styles.sourceHeader}>
        <div className={styles.sectionHeading}>
          <ImageIcon aria-hidden size={18} />
          <strong>{t('askcoreProcessing.editor.source.title')}</strong>
        </div>
        {sources.length ? (
          <Tag>
            {t('askcoreProcessing.editor.source.pageCount', {
              count: sources.length,
            })}
          </Tag>
        ) : null}
      </div>

      {sources.length ? (
        <div
          aria-label={t('askcoreProcessing.editor.preview.aria')}
          className={styles.sourceTabs}
          role="group"
        >
          {sources.map((source) => {
            const label = labelFor(source);
            return (
              <button
                aria-label={t('askcoreProcessing.editor.source.selectPage', {
                  page: source.page_order,
                })}
                aria-pressed={source.slot_id === selected?.slot_id}
                className={styles.sourceTab}
                key={source.slot_id}
                type="button"
                onClick={() => setSelectedSlot(source.slot_id)}
              >
                {source.content_type === 'application/pdf' ? (
                  <FileText aria-hidden size={16} />
                ) : (
                  <ImageIcon aria-hidden size={16} />
                )}
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      <div className={styles.previewCanvas}>
        {!selected ? (
          <Empty
            description={t('askcoreProcessing.editor.preview.empty')}
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        ) : selected.content_type === 'application/pdf' ? (
          <iframe
            className={styles.previewFrame}
            src={selected.preview_url}
            title={labelFor(selected)}
          />
        ) : (
          <img
            alt={labelFor(selected)}
            className={styles.previewImage}
            src={selected.preview_url}
          />
        )}
      </div>

      {selected ? (
        <div className={styles.previewMeta}>
          <span className={styles.label}>{labelFor(selected)}</span>
          <Button
            href={selected.preview_url}
            icon={<ExternalLink size={14} />}
            rel="noreferrer"
            size="small"
            target="_blank"
          >
            {t('askcoreProcessing.editor.source.open')}
          </Button>
        </div>
      ) : null}
    </aside>
  );
};

const ReferenceQuestionBody = ({
  editing,
  onChange,
  question,
  t,
}: {
  editing: boolean;
  onChange: (patch: Partial<ProtocolProcessingQuestion>) => void;
  question: ProtocolProcessingQuestion;
  t: Translate;
}) => {
  const number = question.question_number || question.order_index;
  if (!editing) {
    return (
      <div className={styles.readGrid}>
        <ReadSection
          content={protocolQuestionText(question.question_content)}
          empty={t('askcoreProcessing.editor.question.emptyContent')}
          label={t('askcoreProcessing.reference.columns.content')}
          wide
        />
        <ReadSection
          content={protocolQuestionText(question.reference_answer)}
          empty={t('askcoreProcessing.editor.question.emptyAnswer')}
          label={t('askcoreProcessing.reference.columns.answer')}
        />
        <ReadSection
          content={question.reference_thinking || ''}
          empty={t('askcoreProcessing.editor.question.emptyReasoning')}
          label={t('askcoreProcessing.reference.columns.thinking')}
        />
      </div>
    );
  }

  return (
    <div className={styles.editorFields}>
      <div className={styles.field}>
        <div className={styles.fieldLabel}>{t('askcoreProcessing.editor.question.number')}</div>
        <Input
          aria-label={t('askcoreProcessing.reference.aria.number', {
            number: question.order_index,
          })}
          value={question.question_number || ''}
          onChange={(event) => onChange({ question_number: event.target.value })}
        />
      </div>
      <div className={styles.field}>
        <div className={styles.fieldLabel}>{t('askcoreProcessing.editor.question.type')}</div>
        <Input
          aria-label={t('askcoreProcessing.reference.aria.type', { number })}
          value={question.question_type || ''}
          onChange={(event) => onChange({ question_type: event.target.value })}
        />
      </div>
      <MarkdownField
        ariaLabel={t('askcoreProcessing.reference.aria.content', { number })}
        empty={t('askcoreProcessing.editor.question.emptyContent')}
        label={t('askcoreProcessing.reference.columns.content')}
        previewLabel={t('askcoreProcessing.editor.question.livePreview')}
        value={protocolQuestionText(question.question_content)}
        onChange={(value) => onChange({ question_content: value })}
      />
      <MarkdownField
        ariaLabel={t('askcoreProcessing.reference.aria.answer', { number })}
        empty={t('askcoreProcessing.editor.question.emptyAnswer')}
        label={t('askcoreProcessing.reference.columns.answer')}
        previewLabel={t('askcoreProcessing.editor.question.livePreview')}
        value={protocolQuestionText(question.reference_answer)}
        onChange={(value) => onChange({ reference_answer: value })}
      />
      <MarkdownField
        ariaLabel={t('askcoreProcessing.reference.aria.thinking', { number })}
        empty={t('askcoreProcessing.editor.question.emptyReasoning')}
        label={t('askcoreProcessing.reference.columns.thinking')}
        previewLabel={t('askcoreProcessing.editor.question.livePreview')}
        value={question.reference_thinking || ''}
        onChange={(value) => onChange({ reference_thinking: value })}
      />
      <div className={styles.field}>
        <div className={styles.fieldLabel}>{t('askcoreProcessing.reference.columns.maximum')}</div>
        <InputNumber
          aria-label={t('askcoreProcessing.editor.aria.maximum', { number })}
          min={0}
          precision={2}
          value={question.max_score}
          onChange={(value) => onChange({ max_score: value })}
        />
      </div>
    </div>
  );
};

const SubmissionQuestionBody = ({
  editing,
  onChange,
  question,
  t,
}: {
  editing: boolean;
  onChange: (patch: Partial<ProtocolProcessingQuestion>) => void;
  question: ProtocolProcessingQuestion;
  t: Translate;
}) => {
  const number = question.question_number || question.order_index;
  if (!editing) {
    return (
      <div className={styles.readGrid}>
        {protocolQuestionText(question.question_content) ? (
          <ReadSection
            content={protocolQuestionText(question.question_content)}
            empty={t('askcoreProcessing.editor.question.emptyContent')}
            label={t('askcoreProcessing.editor.question.content')}
            wide
          />
        ) : null}
        <ReadSection
          content={question.student_answer || ''}
          empty={t('askcoreProcessing.editor.question.emptyAnswer')}
          label={t('askcoreProcessing.editor.columns.ocr')}
        />
        <ReadSection
          content={question.feedback || ''}
          empty={t('askcoreProcessing.editor.question.emptyFeedback')}
          label={t('askcoreProcessing.editor.columns.feedback')}
        />
      </div>
    );
  }

  return (
    <div className={styles.editorFields}>
      {protocolQuestionText(question.question_content) ? (
        <div className={`${styles.readSection} ${styles.fieldWide}`}>
          <div className={styles.fieldLabel}>{t('askcoreProcessing.editor.question.content')}</div>
          <div className={styles.preview}>
            <MarkdownPreview content={protocolQuestionText(question.question_content)} />
          </div>
        </div>
      ) : null}
      <MarkdownField
        ariaLabel={t('askcoreProcessing.editor.aria.ocr', { number })}
        empty={t('askcoreProcessing.editor.question.emptyAnswer')}
        label={t('askcoreProcessing.editor.columns.ocr')}
        previewLabel={t('askcoreProcessing.editor.question.livePreview')}
        value={question.student_answer || ''}
        onChange={(value) => onChange({ student_answer: value })}
      />
      <div className={styles.field}>
        <div className={styles.fieldLabel}>{t('askcoreProcessing.editor.question.score')}</div>
        <InputNumber
          aria-label={t('askcoreProcessing.editor.aria.score', { number })}
          min={0}
          precision={2}
          value={question.score}
          onChange={(value) => onChange({ score: value })}
        />
      </div>
      <div className={styles.field}>
        <div className={styles.fieldLabel}>{t('askcoreProcessing.editor.question.maximum')}</div>
        <InputNumber
          aria-label={t('askcoreProcessing.editor.aria.maximum', { number })}
          min={0}
          precision={2}
          value={question.max_score}
          onChange={(value) => onChange({ max_score: value })}
        />
      </div>
      <div className={styles.field}>
        <div className={styles.fieldLabel}>{t('askcoreProcessing.editor.columns.correct')}</div>
        <Checkbox
          aria-label={t('askcoreProcessing.editor.aria.correct', { number })}
          checked={question.is_correct === true}
          indeterminate={question.is_correct == null}
          onChange={(event) => onChange({ is_correct: event.target.checked })}
        >
          {t(
            question.is_correct === true
              ? 'askcoreProcessing.editor.question.correct'
              : question.is_correct === false
                ? 'askcoreProcessing.editor.question.incorrect'
                : 'askcoreProcessing.editor.question.unreviewed',
          )}
        </Checkbox>
      </div>
      <MarkdownField
        ariaLabel={t('askcoreProcessing.editor.aria.feedback', { number })}
        empty={t('askcoreProcessing.editor.question.emptyFeedback')}
        label={t('askcoreProcessing.editor.columns.feedback')}
        previewLabel={t('askcoreProcessing.editor.question.livePreview')}
        value={question.feedback || ''}
        onChange={(value) => onChange({ feedback: value })}
      />
    </div>
  );
};

const QuestionCard = ({
  baseline,
  editing,
  editable,
  onChange,
  onEdit,
  onReset,
  question,
  referenceMode,
  t,
}: {
  baseline: ProtocolProcessingQuestion | undefined;
  editing: boolean;
  editable: boolean;
  onChange: (patch: Partial<ProtocolProcessingQuestion>) => void;
  onEdit: () => void;
  onReset: () => void;
  question: ProtocolProcessingQuestion;
  referenceMode: boolean;
  t: Translate;
}) => {
  const number = question.question_number || question.order_index;
  const dirty = !sameQuestion(question, baseline);

  return (
    <article className={styles.card}>
      <header className={styles.cardHeader}>
        <div className={styles.cardIdentity}>
          <span className={styles.cardTitle}>
            {t('askcoreProcessing.editor.question.title', { number })}
          </span>
          <Tag>{question.question_type || t('askcoreProcessing.editor.question.defaultType')}</Tag>
          {referenceMode && question.max_score != null ? (
            <Tag>
              {t('askcoreProcessing.editor.question.points', {
                points: question.max_score,
              })}
            </Tag>
          ) : null}
          {!referenceMode ? (
            <Tag
              color={
                question.is_correct === true
                  ? 'green'
                  : question.is_correct === false
                    ? 'red'
                    : 'default'
              }
            >
              {question.score ?? '--'} / {question.max_score ?? '--'} ·{' '}
              {t(
                question.is_correct === true
                  ? 'askcoreProcessing.editor.question.correct'
                  : question.is_correct === false
                    ? 'askcoreProcessing.editor.question.incorrect'
                    : 'askcoreProcessing.editor.question.unreviewed',
              )}
            </Tag>
          ) : null}
          {dirty ? (
            <Tag color="orange">{t('askcoreProcessing.editor.question.unsaved')}</Tag>
          ) : null}
        </div>
        {editable ? (
          <div className={styles.cardActions}>
            {dirty ? (
              <Button icon={<RotateCcw size={14} />} size="small" onClick={onReset}>
                {t('askcoreProcessing.editor.question.revert')}
              </Button>
            ) : null}
            <Button
              aria-expanded={editing}
              icon={editing ? <Check size={14} /> : <Pencil size={14} />}
              size="small"
              onClick={onEdit}
            >
              {t(
                editing
                  ? 'askcoreProcessing.editor.question.finishEdit'
                  : 'askcoreProcessing.editor.question.edit',
                { number },
              )}
            </Button>
          </div>
        ) : null}
      </header>
      <div className={styles.cardBody}>
        {referenceMode ? (
          <ReferenceQuestionBody editing={editing} question={question} t={t} onChange={onChange} />
        ) : (
          <SubmissionQuestionBody editing={editing} question={question} t={t} onChange={onChange} />
        )}
      </div>
    </article>
  );
};

const TeacherSummaryCard = ({
  baseline,
  editable,
  onChange,
  t,
  value,
}: {
  baseline: string;
  editable: boolean;
  onChange: (value: string) => void;
  t: Translate;
  value: string;
}) => {
  const [editing, setEditing] = useState(false);
  const dirty = value !== baseline;
  return (
    <article className={styles.card}>
      <header className={styles.cardHeader}>
        <div className={styles.cardIdentity}>
          <span className={styles.cardTitle}>{t('askcoreProcessing.editor.teacherSummary')}</span>
          {dirty ? (
            <Tag color="orange">{t('askcoreProcessing.editor.question.unsaved')}</Tag>
          ) : null}
        </div>
        {editable ? (
          <div className={styles.cardActions}>
            {dirty ? (
              <Button
                icon={<RotateCcw size={14} />}
                size="small"
                onClick={() => {
                  onChange(baseline);
                  setEditing(false);
                }}
              >
                {t('askcoreProcessing.editor.question.revert')}
              </Button>
            ) : null}
            <Button
              aria-expanded={editing}
              icon={editing ? <Check size={14} /> : <Pencil size={14} />}
              size="small"
              onClick={() => setEditing((current) => !current)}
            >
              {t(
                editing
                  ? 'askcoreProcessing.editor.question.finishEdit'
                  : 'askcoreProcessing.editor.summary.edit',
              )}
            </Button>
          </div>
        ) : null}
      </header>
      <div className={styles.cardBody}>
        {editing ? (
          <MarkdownField
            ariaLabel={t('askcoreProcessing.editor.teacherSummary')}
            empty={t('askcoreProcessing.editor.summary.empty')}
            label={t('askcoreProcessing.editor.teacherSummary')}
            previewLabel={t('askcoreProcessing.editor.question.livePreview')}
            value={value}
            onChange={onChange}
          />
        ) : (
          <ReadSection
            content={value}
            empty={t('askcoreProcessing.editor.summary.empty')}
            label={t('askcoreProcessing.editor.teacherSummary')}
            wide
          />
        )}
      </div>
    </article>
  );
};

export const ProtocolProcessingEditor = memo(
  ({
    baselineQuestions,
    baselineTeacherSummary,
    editable,
    inputs,
    onQuestionChange,
    onQuestionReset,
    onTeacherSummaryChange,
    questions,
    referenceMode,
    resultState,
    t,
    teacherSummary,
    toolbar,
  }: {
    baselineQuestions: ProtocolProcessingQuestion[];
    baselineTeacherSummary: string;
    editable: boolean;
    inputs: ProtocolProcessingInput[];
    onQuestionChange: (orderIndex: number, patch: Partial<ProtocolProcessingQuestion>) => void;
    onQuestionReset: (orderIndex: number) => void;
    onTeacherSummaryChange: (value: string) => void;
    questions: ProtocolProcessingQuestion[];
    referenceMode: boolean;
    resultState: 'failed' | 'loading' | 'ready';
    t: Translate;
    teacherSummary: string;
    toolbar: ReactNode;
  }) => {
    const [editingOrderIndex, setEditingOrderIndex] = useState<number | null>(null);
    const baselines = useMemo(
      () => new Map(baselineQuestions.map((question) => [question.order_index, question])),
      [baselineQuestions],
    );

    useEffect(() => {
      if (!editable) {
        setEditingOrderIndex(null);
        return;
      }
      if (
        editingOrderIndex != null &&
        !questions.some((question) => question.order_index === editingOrderIndex)
      ) {
        setEditingOrderIndex(null);
      }
    }, [editable, editingOrderIndex, questions]);

    return (
      <div className={styles.workspace}>
        <SourceRail inputs={inputs} referenceMode={referenceMode} t={t} />
        <section className={styles.resultPanel}>
          <div className={styles.resultHeader}>
            <div className={styles.sectionHeading}>
              <ScanText aria-hidden size={18} />
              <strong>
                {t(
                  referenceMode
                    ? 'askcoreProcessing.reference.result'
                    : 'askcoreProcessing.editor.result',
                )}
              </strong>
            </div>
            {toolbar}
          </div>

          {resultState === 'loading' ? (
            <div className={styles.emptyResult}>
              <Skeleton active paragraph={{ rows: 8 }} />
            </div>
          ) : resultState === 'failed' ? (
            <div className={styles.emptyResult}>
              <Empty
                description={t('askcoreProcessing.editor.state.failed')}
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              />
            </div>
          ) : questions.length ? (
            <div className={styles.questionList}>
              {questions.map((question) => (
                <QuestionCard
                  baseline={baselines.get(question.order_index)}
                  editing={editingOrderIndex === question.order_index}
                  editable={editable}
                  key={question.order_index}
                  question={question}
                  referenceMode={referenceMode}
                  t={t}
                  onChange={(patch) => onQuestionChange(question.order_index, patch)}
                  onEdit={() =>
                    setEditingOrderIndex((current) =>
                      current === question.order_index ? null : question.order_index,
                    )
                  }
                  onReset={() => {
                    onQuestionReset(question.order_index);
                    setEditingOrderIndex(null);
                  }}
                />
              ))}
              {!referenceMode ? (
                <TeacherSummaryCard
                  baseline={baselineTeacherSummary}
                  editable={editable}
                  t={t}
                  value={teacherSummary}
                  onChange={onTeacherSummaryChange}
                />
              ) : null}
            </div>
          ) : (
            <div className={styles.emptyResult}>
              <Empty
                description={t('askcoreProcessing.editor.question.empty')}
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              />
            </div>
          )}
        </section>
      </div>
    );
  },
);

ProtocolProcessingEditor.displayName = 'ProtocolProcessingEditor';
