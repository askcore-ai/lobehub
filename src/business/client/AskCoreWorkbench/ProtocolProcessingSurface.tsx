'use client';

import {
  Alert,
  Button,
  Checkbox,
  Empty,
  Input,
  InputNumber,
  Select,
  Skeleton,
  Space,
  Table,
  Tag,
  Tooltip,
} from 'antd';
import { type ColumnsType } from 'antd/es/table';
import { createStaticStyles, cssVar } from 'antd-style';
import { FileText, RefreshCw, Save, ScanText, WandSparkles } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { message } from '@/components/AntdStaticMethods';

import {
  AskCoreWorkbenchApiError,
  editCurrentProtocolProcessingResult,
  fetchCurrentProtocolProcessingSurface,
  fetchProtocolProcessingContext,
  generateCurrentProtocolProcessingReport,
} from './api';
import { ProtocolCaptureSurface } from './ProtocolCaptureSurface';
import {
  type JsonRecord,
  type ProtocolProcessingContext,
  type ProtocolProcessingInput,
  type ProtocolProcessingQuestion,
  type ProtocolProcessingSurface as ProtocolProcessingSurfacePayload,
} from './types';

const styles = createStaticStyles(({ css }) => ({
  actions: css`
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  `,
  body: css`
    display: grid;
    grid-template-columns: minmax(320px, 0.92fr) minmax(540px, 1.3fr);
    gap: 16px;
    min-width: 0;

    @media (width <= 1180px) {
      grid-template-columns: 1fr;
    }
  `,
  editor: css`
    min-width: 0;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 8px;
    background: ${cssVar.colorBgContainer};
  `,
  editorHeader: css`
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
    justify-content: space-between;

    padding-block: 14px;
    padding-inline: 16px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};
  `,
  header: css`
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
    align-items: center;
    justify-content: space-between;

    min-width: 0;
    padding-block-end: 16px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};
  `,
  heading: css`
    display: flex;
    gap: 12px;
    align-items: center;
    min-width: 0;
  `,
  icon: css`
    display: grid;
    flex: 0 0 40px;
    place-items: center;

    width: 40px;
    height: 40px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 8px;

    color: ${cssVar.colorPrimary};

    background: ${cssVar.colorBgContainer};
  `,
  meta: css`
    margin-block-start: 3px;
    font-size: 13px;
    line-height: 1.45;
    color: ${cssVar.colorTextDescription};
  `,
  page: css`
    display: flex;
    flex-direction: column;
    gap: 16px;

    min-width: 0;
    padding-block: 16px 28px;
    padding-inline: clamp(12px, 2vw, 28px);
  `,
  preview: css`
    min-width: 0;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 8px;
    background: ${cssVar.colorBgContainer};
  `,
  previewCanvas: css`
    overflow: hidden;
    display: grid;
    place-items: center;

    aspect-ratio: 4 / 5;
    width: 100%;
    min-height: 480px;
    border-block-start: 1px solid ${cssVar.colorBorderSecondary};

    background: ${cssVar.colorFillQuaternary};

    @media (width <= 760px) {
      min-height: 420px;
    }
  `,
  previewFrame: css`
    display: block;

    width: 100%;
    height: 100%;
    min-height: 480px;
    border: 0;

    background: white;
  `,
  previewImage: css`
    display: block;

    width: 100%;
    height: 100%;
    max-height: 760px;

    object-fit: contain;
  `,
  previewToolbar: css`
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
    justify-content: space-between;

    min-height: 58px;
    padding-block: 10px;
    padding-inline: 12px;
  `,
  score: css`
    font-size: 15px;
    font-weight: 650;
    font-variant-numeric: tabular-nums;
  `,
  singleBody: css`
    grid-template-columns: minmax(0, 1fr);
  `,
  summary: css`
    padding-block: 14px 16px;
    padding-inline: 16px;
    border-block-start: 1px solid ${cssVar.colorBorderSecondary};
  `,
  title: css`
    margin: 0;

    font-size: 21px;
    font-weight: 650;
    line-height: 1.3;
    color: ${cssVar.colorText};
  `,
}));

type PreviewChoice =
  | { input: ProtocolProcessingInput; key: string; label: string; type: 'input' }
  | { key: 'report'; label: string; previewUrl: string; type: 'report' };

type Translate = (key: string, options?: Record<string, unknown>) => string;

const processingState = (value: string | undefined, t: Translate) => {
  if (value === 'succeeded')
    return { color: 'green', label: t('askcoreProcessing.editor.state.succeeded') };
  if (value === 'failed')
    return { color: 'red', label: t('askcoreProcessing.editor.state.failed') };
  if (value === 'cancelled')
    return { color: 'default', label: t('askcoreProcessing.editor.state.cancelled') };
  return { color: 'blue', label: t('askcoreProcessing.editor.state.running') };
};

const recordText = (value: JsonRecord | string | null | undefined) => {
  if (typeof value === 'string') return value.trim();
  if (!value) return '';
  for (const key of ['text', 'content', 'value']) {
    const candidate = value[key];
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return '';
};

const cloneQuestions = (questions: ProtocolProcessingQuestion[] = []) =>
  questions.map((question) => ({ ...question }));

const processingErrorMessage = (reason: unknown, fallback: string, t: Translate) => {
  if (!(reason instanceof AskCoreWorkbenchApiError)) {
    return fallback;
  }

  if (reason.status === 401) return t('askcoreProcessing.editor.error.invalidContext');
  if (reason.status === 403) return t('askcoreProcessing.editor.error.forbidden');
  if (
    reason.status === 404 ||
    reason.status === 410 ||
    /verified processing context|processing context is required/i.test(reason.message)
  ) {
    return t('askcoreProcessing.editor.error.invalidContext');
  }
  if (reason.status === 409) return t('askcoreProcessing.editor.error.conflict');
  if (reason.status >= 500) return t('askcoreProcessing.editor.error.unavailable');
  return fallback;
};

const PreviewPane = ({
  choice,
  choices,
  onChange,
  t,
}: {
  choice: PreviewChoice | undefined;
  choices: PreviewChoice[];
  onChange: (key: string) => void;
  t: Translate;
}) => (
  <section className={styles.preview}>
    <div className={styles.previewToolbar}>
      <Select
        aria-label={t('askcoreProcessing.editor.preview.aria')}
        options={choices.map((item) => ({ label: item.label, value: item.key }))}
        style={{ minWidth: 190 }}
        value={choice?.key}
        onChange={onChange}
      />
      {choice?.type === 'input' ? (
        <Tag>
          {choice.input.content_type === 'application/pdf'
            ? 'PDF'
            : t('askcoreProcessing.editor.preview.image')}
        </Tag>
      ) : choice?.type === 'report' ? (
        <Tag color="green">{t('askcoreProcessing.editor.report')}</Tag>
      ) : null}
    </div>
    <div className={styles.previewCanvas}>
      {!choice ? (
        <Empty
          description={t('askcoreProcessing.editor.preview.empty')}
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      ) : choice.type === 'report' || choice.input.content_type === 'application/pdf' ? (
        <iframe
          className={styles.previewFrame}
          src={choice.type === 'report' ? choice.previewUrl : choice.input.preview_url}
          title={choice.label}
        />
      ) : (
        <img alt={choice.label} className={styles.previewImage} src={choice.input.preview_url} />
      )}
    </div>
  </section>
);

export const ProtocolProcessingSurface = memo(({ launchScope }: { launchScope: string }) => {
  const { t } = useTranslation('common');
  const [context, setContext] = useState<ProtocolProcessingContext | null>(null);
  const [surface, setSurface] = useState<ProtocolProcessingSurfacePayload | null>(null);
  const [questions, setQuestions] = useState<ProtocolProcessingQuestion[]>([]);
  const [teacherSummary, setTeacherSummary] = useState('');
  const [selectedPreview, setSelectedPreview] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string>();

  const refresh = useCallback(
    async (quiet = false) => {
      if (!quiet) setLoading(true);
      setError(undefined);
      try {
        const nextContext = await fetchProtocolProcessingContext(launchScope);
        setContext(nextContext);
        if (!nextContext.account_linked) {
          setSurface(null);
          setQuestions([]);
          return;
        }
        if (nextContext.context_kind === 'capture') {
          setSurface(null);
          setQuestions([]);
          setTeacherSummary('');
          setDirty(false);
          return;
        }
        const nextSurface = await fetchCurrentProtocolProcessingSurface(launchScope);
        setSurface(nextSurface);
        setContext(nextSurface.context);
        const resultContent = nextSurface.result?.content;
        setQuestions(
          cloneQuestions(
            nextSurface.context.run_kind === 'reference'
              ? resultContent?.question_refs
              : resultContent?.questions,
          ),
        );
        setTeacherSummary(
          nextSurface.context.run_kind === 'reference' ? '' : resultContent?.teacher_summary || '',
        );
        setDirty(false);
      } catch (reason) {
        setError(
          processingErrorMessage(reason, t('askcoreProcessing.editor.error.load'), t as Translate),
        );
      } finally {
        setLoading(false);
      }
    },
    [launchScope, t],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (
      !context ||
      context.context_kind === 'capture' ||
      ['succeeded', 'failed', 'cancelled'].includes(context.processing_state)
    )
      return;
    const timer = window.setInterval(() => void refresh(true), 3000);
    return () => window.clearInterval(timer);
  }, [context, refresh]);

  const referenceMode = context?.run_kind === 'reference';
  const choices = useMemo<PreviewChoice[]>(() => {
    const sourceKind = referenceMode ? 'reference' : 'response';
    const inputs: PreviewChoice[] = (surface?.inputs || [])
      .filter((input) => input.kind === sourceKind)
      .map((input) => ({
        input,
        key: `input:${input.slot_id}`,
        label: t(
          input.kind === 'reference'
            ? 'askcoreProcessing.editor.preview.referencePage'
            : 'askcoreProcessing.editor.preview.responsePage',
          { page: input.page_order },
        ),
        type: 'input' as const,
      }));
    if (inputs.length && surface?.report?.available && surface.report.preview_url) {
      inputs.push({
        key: 'report',
        label: t('askcoreProcessing.editor.report'),
        previewUrl: surface.report.preview_url,
        type: 'report',
      });
    }
    return inputs;
  }, [referenceMode, surface, t]);

  useEffect(() => {
    if (!choices.length) {
      setSelectedPreview('');
      return;
    }
    if (!choices.some((item) => item.key === selectedPreview)) {
      setSelectedPreview(choices[0].key);
    }
  }, [choices, selectedPreview]);

  const updateQuestion = useCallback(
    (orderIndex: number, patch: Partial<ProtocolProcessingQuestion>) => {
      setDirty(true);
      setQuestions((current) =>
        current.map((question) =>
          question.order_index === orderIndex ? { ...question, ...patch } : question,
        ),
      );
    },
    [],
  );

  const validationError = useMemo(() => {
    for (const question of questions) {
      const score = question.score;
      const maximum = question.max_score;
      if (score != null && (score < 0 || (maximum != null && score > maximum))) {
        return t('askcoreProcessing.editor.validation.scoreRange', {
          number: question.question_number || question.order_index,
        });
      }
      if (maximum != null && maximum < 0) {
        return t('askcoreProcessing.editor.validation.negativeMaximum', {
          number: question.question_number || question.order_index,
        });
      }
    }
    return null;
  }, [questions, t]);

  const save = async () => {
    const artifactId = surface?.result?.artifact_id;
    if (!artifactId || validationError) return;
    setSaving(true);
    setError(undefined);
    try {
      const referenceMode = context?.run_kind === 'reference';
      await editCurrentProtocolProcessingResult(launchScope, {
        expected_latest_artifact_id: artifactId,
        questions: questions.map((question) =>
          referenceMode
            ? {
                max_score: question.max_score ?? null,
                order_index: question.order_index,
                question_content: recordText(question.question_content),
                question_number: question.question_number ?? null,
                question_type: question.question_type ?? null,
                reference_answer: recordText(question.reference_answer),
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
        ),
        ...(referenceMode ? {} : { teacher_summary: teacherSummary }),
      });
      message.success(
        t(referenceMode ? 'askcoreProcessing.reference.saved' : 'askcoreProcessing.editor.saved'),
      );
      await refresh(true);
    } catch (reason) {
      setError(
        processingErrorMessage(reason, t('askcoreProcessing.editor.error.save'), t as Translate),
      );
    } finally {
      setSaving(false);
    }
  };

  const generateReport = async () => {
    setReporting(true);
    setError(undefined);
    try {
      await generateCurrentProtocolProcessingReport(launchScope);
      message.success(t('askcoreProcessing.editor.reportGenerated'));
      await refresh(true);
      setSelectedPreview('report');
    } catch (reason) {
      setError(
        processingErrorMessage(reason, t('askcoreProcessing.editor.error.report'), t as Translate),
      );
    } finally {
      setReporting(false);
    }
  };

  const submissionColumns = useMemo<ColumnsType<ProtocolProcessingQuestion>>(
    () => [
      {
        fixed: 'left',
        render: (_, row) => (
          <div>
            <strong>{row.question_number || row.order_index}</strong>
            <div className={styles.meta}>
              {row.question_type || t('askcoreProcessing.editor.question.defaultType')}
            </div>
            {recordText(row.question_content) ? (
              <Tooltip title={recordText(row.question_content)}>
                <div className={styles.meta}>{t('askcoreProcessing.editor.question.viewStem')}</div>
              </Tooltip>
            ) : null}
          </div>
        ),
        title: t('askcoreProcessing.editor.columns.number'),
        width: 92,
      },
      {
        render: (_, row) => (
          <Input.TextArea
            autoSize={{ maxRows: 8, minRows: 3 }}
            value={row.student_answer || ''}
            aria-label={t('askcoreProcessing.editor.aria.ocr', {
              number: row.question_number || row.order_index,
            })}
            onChange={(event) =>
              updateQuestion(row.order_index, { student_answer: event.target.value })
            }
          />
        ),
        title: t('askcoreProcessing.editor.columns.ocr'),
        width: 270,
      },
      {
        render: (_, row) => (
          <Space.Compact>
            <InputNumber
              min={0}
              precision={2}
              style={{ width: 86 }}
              value={row.score}
              aria-label={t('askcoreProcessing.editor.aria.score', {
                number: row.question_number || row.order_index,
              })}
              onChange={(value) => updateQuestion(row.order_index, { score: value })}
            />
            <InputNumber
              min={0}
              precision={2}
              style={{ width: 86 }}
              value={row.max_score}
              aria-label={t('askcoreProcessing.editor.aria.maximum', {
                number: row.question_number || row.order_index,
              })}
              onChange={(value) => updateQuestion(row.order_index, { max_score: value })}
            />
          </Space.Compact>
        ),
        title: t('askcoreProcessing.editor.columns.score'),
        width: 185,
      },
      {
        align: 'center',
        render: (_, row) => (
          <Checkbox
            checked={row.is_correct === true}
            indeterminate={row.is_correct == null}
            aria-label={t('askcoreProcessing.editor.aria.correct', {
              number: row.question_number || row.order_index,
            })}
            onChange={(event) =>
              updateQuestion(row.order_index, { is_correct: event.target.checked })
            }
          />
        ),
        title: t('askcoreProcessing.editor.columns.correct'),
        width: 72,
      },
      {
        render: (_, row) => (
          <Input.TextArea
            autoSize={{ maxRows: 8, minRows: 3 }}
            value={row.feedback || ''}
            aria-label={t('askcoreProcessing.editor.aria.feedback', {
              number: row.question_number || row.order_index,
            })}
            onChange={(event) => updateQuestion(row.order_index, { feedback: event.target.value })}
          />
        ),
        title: t('askcoreProcessing.editor.columns.feedback'),
        width: 270,
      },
    ],
    [t, updateQuestion],
  );

  const referenceColumns = useMemo<ColumnsType<ProtocolProcessingQuestion>>(
    () => [
      {
        fixed: 'left',
        render: (_, row) => (
          <Space direction="vertical" size={6}>
            <Input
              value={row.question_number || ''}
              aria-label={t('askcoreProcessing.reference.aria.number', {
                number: row.order_index,
              })}
              onChange={(event) =>
                updateQuestion(row.order_index, { question_number: event.target.value })
              }
            />
            <Input
              value={row.question_type || ''}
              aria-label={t('askcoreProcessing.reference.aria.type', {
                number: row.question_number || row.order_index,
              })}
              onChange={(event) =>
                updateQuestion(row.order_index, { question_type: event.target.value })
              }
            />
          </Space>
        ),
        title: t('askcoreProcessing.reference.columns.question'),
        width: 150,
      },
      {
        render: (_, row) => (
          <Input.TextArea
            autoSize={{ maxRows: 10, minRows: 4 }}
            value={recordText(row.question_content)}
            aria-label={t('askcoreProcessing.reference.aria.content', {
              number: row.question_number || row.order_index,
            })}
            onChange={(event) =>
              updateQuestion(row.order_index, { question_content: event.target.value })
            }
          />
        ),
        title: t('askcoreProcessing.reference.columns.content'),
        width: 300,
      },
      {
        render: (_, row) => (
          <Input.TextArea
            autoSize={{ maxRows: 10, minRows: 4 }}
            value={recordText(row.reference_answer)}
            aria-label={t('askcoreProcessing.reference.aria.answer', {
              number: row.question_number || row.order_index,
            })}
            onChange={(event) =>
              updateQuestion(row.order_index, { reference_answer: event.target.value })
            }
          />
        ),
        title: t('askcoreProcessing.reference.columns.answer'),
        width: 280,
      },
      {
        render: (_, row) => (
          <Input.TextArea
            autoSize={{ maxRows: 10, minRows: 4 }}
            value={row.reference_thinking || ''}
            aria-label={t('askcoreProcessing.reference.aria.thinking', {
              number: row.question_number || row.order_index,
            })}
            onChange={(event) =>
              updateQuestion(row.order_index, { reference_thinking: event.target.value })
            }
          />
        ),
        title: t('askcoreProcessing.reference.columns.thinking'),
        width: 280,
      },
      {
        render: (_, row) => (
          <InputNumber
            min={0}
            precision={2}
            style={{ width: 90 }}
            value={row.max_score}
            aria-label={t('askcoreProcessing.editor.aria.maximum', {
              number: row.question_number || row.order_index,
            })}
            onChange={(value) => updateQuestion(row.order_index, { max_score: value })}
          />
        ),
        title: t('askcoreProcessing.reference.columns.maximum'),
        width: 110,
      },
    ],
    [t, updateQuestion],
  );

  const state = processingState(context?.processing_state, t as Translate);
  const score = surface?.result?.content.score;
  const total = surface?.result?.content.total_score;
  const selectedChoice = choices.find((item) => item.key === selectedPreview);

  if (loading) {
    return (
      <div className={styles.page}>
        <Skeleton active paragraph={{ rows: 12 }} />
      </div>
    );
  }

  if (context?.account_link_required) {
    return (
      <div className={styles.page}>
        <Alert
          showIcon
          description={t('askcoreProcessing.editor.accountLink.description')}
          title={t('askcoreProcessing.editor.accountLink.title')}
          type="warning"
        />
      </div>
    );
  }

  if (context?.context_kind === 'capture') {
    return <ProtocolCaptureSurface context={context} launchScope={launchScope} />;
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.heading}>
          <div className={styles.icon}>
            <WandSparkles size={20} />
          </div>
          <div>
            <h1 className={styles.title}>
              {t(
                referenceMode
                  ? 'askcoreProcessing.reference.title'
                  : 'askcoreProcessing.editor.title',
              )}
            </h1>
            <div className={styles.meta}>
              {t(
                referenceMode
                  ? 'askcoreProcessing.reference.subtitle'
                  : 'askcoreProcessing.editor.subtitle',
              )}
            </div>
          </div>
        </div>
        <div className={styles.actions}>
          <Tag color={state.color}>{state.label}</Tag>
          {!referenceMode && (score != null || total != null) ? (
            <span className={styles.score}>
              {score ?? '--'} / {total ?? '--'}
            </span>
          ) : null}
          <Button icon={<RefreshCw size={14} />} onClick={() => void refresh()}>
            {t('askcoreProcessing.editor.refresh')}
          </Button>
        </div>
      </header>

      {error ? <Alert showIcon title={error} type="error" /> : null}
      {validationError ? <Alert showIcon title={validationError} type="warning" /> : null}

      <div className={styles.body}>
        <PreviewPane
          choice={selectedChoice}
          choices={choices}
          t={t as Translate}
          onChange={setSelectedPreview}
        />

        <section className={styles.editor}>
          <div className={styles.editorHeader}>
            <div className={styles.heading}>
              <ScanText size={18} />
              <strong>
                {t(
                  referenceMode
                    ? 'askcoreProcessing.reference.result'
                    : 'askcoreProcessing.editor.result',
                )}
              </strong>
            </div>
            <div className={styles.actions}>
              {!referenceMode ? (
                <Button
                  disabled={!surface?.result || dirty || !context?.capabilities.can_generate_report}
                  icon={<FileText size={14} />}
                  loading={reporting}
                  onClick={() => void generateReport()}
                >
                  {t('askcoreProcessing.editor.generateReport')}
                </Button>
              ) : null}
              <Button
                icon={<Save size={14} />}
                loading={saving}
                type="primary"
                disabled={
                  !surface?.result || Boolean(validationError) || !context?.capabilities.can_edit
                }
                onClick={() => void save()}
              >
                {t(
                  referenceMode
                    ? 'askcoreProcessing.reference.saveRevision'
                    : 'askcoreProcessing.editor.saveRevision',
                )}
              </Button>
            </div>
          </div>

          {surface?.result ? (
            <>
              <Table
                columns={referenceMode ? referenceColumns : submissionColumns}
                dataSource={questions}
                pagination={false}
                rowKey="order_index"
                scroll={{ x: referenceMode ? 1020 : 900 }}
                size="small"
              />
              {!referenceMode ? (
                <div className={styles.summary}>
                  <Input.TextArea
                    aria-label={t('askcoreProcessing.editor.teacherSummary')}
                    autoSize={{ maxRows: 8, minRows: 3 }}
                    placeholder={t('askcoreProcessing.editor.teacherSummary')}
                    value={teacherSummary}
                    onChange={(event) => {
                      setDirty(true);
                      setTeacherSummary(event.target.value);
                    }}
                  />
                </div>
              ) : null}
            </>
          ) : context?.processing_state === 'failed' ? (
            <Empty
              description={t('askcoreProcessing.editor.state.failed')}
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          ) : (
            <Skeleton active paragraph={{ rows: 8 }} />
          )}
        </section>
      </div>
    </main>
  );
});

ProtocolProcessingSurface.displayName = 'ProtocolProcessingSurface';
