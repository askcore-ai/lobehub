'use client';

import { Alert, Button, Skeleton, Tag } from 'antd';
import { createStaticStyles, cssVar } from 'antd-style';
import { FileText, RefreshCw, Save, WandSparkles } from 'lucide-react';
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
  ProtocolProcessingEditor,
  serializeProtocolQuestionEdits,
} from './ProtocolProcessingEditor';
import {
  type ProtocolProcessingContext,
  type ProtocolProcessingQuestion,
  type ProtocolProcessingSurface as ProtocolProcessingSurfacePayload,
} from './types';

const styles = createStaticStyles(({ css }) => ({
  actions: css`
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;

    @media (width <= 760px) {
      .ant-btn {
        min-height: 44px;
      }
    }
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
  score: css`
    font-size: 15px;
    font-weight: 650;
    font-variant-numeric: tabular-nums;
  `,
  title: css`
    margin: 0;

    font-size: 21px;
    font-weight: 650;
    line-height: 1.3;
    color: ${cssVar.colorText};
  `,
}));

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

export const ProtocolProcessingSurface = memo(({ launchScope }: { launchScope: string }) => {
  const { t } = useTranslation('common');
  const [context, setContext] = useState<ProtocolProcessingContext | null>(null);
  const [surface, setSurface] = useState<ProtocolProcessingSurfacePayload | null>(null);
  const [questions, setQuestions] = useState<ProtocolProcessingQuestion[]>([]);
  const [baselineQuestions, setBaselineQuestions] = useState<ProtocolProcessingQuestion[]>([]);
  const [teacherSummary, setTeacherSummary] = useState('');
  const [baselineTeacherSummary, setBaselineTeacherSummary] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reporting, setReporting] = useState(false);
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
          setBaselineQuestions([]);
          setTeacherSummary('');
          setBaselineTeacherSummary('');
          return;
        }
        if (nextContext.context_kind === 'capture') {
          setSurface(null);
          setQuestions([]);
          setBaselineQuestions([]);
          setTeacherSummary('');
          setBaselineTeacherSummary('');
          return;
        }
        const nextSurface = await fetchCurrentProtocolProcessingSurface(launchScope);
        setSurface(nextSurface);
        setContext(nextSurface.context);
        const resultContent = nextSurface.result?.content;
        const nextQuestions = cloneQuestions(
          nextSurface.context.run_kind === 'reference'
            ? resultContent?.question_refs
            : resultContent?.questions,
        );
        const nextTeacherSummary =
          nextSurface.context.run_kind === 'reference' ? '' : resultContent?.teacher_summary || '';
        setQuestions(cloneQuestions(nextQuestions));
        setBaselineQuestions(cloneQuestions(nextQuestions));
        setTeacherSummary(nextTeacherSummary);
        setBaselineTeacherSummary(nextTeacherSummary);
        setError(undefined);
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
  const dirty = useMemo(
    () =>
      JSON.stringify(questions) !== JSON.stringify(baselineQuestions) ||
      teacherSummary !== baselineTeacherSummary,
    [baselineQuestions, baselineTeacherSummary, questions, teacherSummary],
  );

  const updateQuestion = useCallback(
    (orderIndex: number, patch: Partial<ProtocolProcessingQuestion>) => {
      setQuestions((current) =>
        current.map((question) =>
          question.order_index === orderIndex ? { ...question, ...patch } : question,
        ),
      );
    },
    [],
  );

  const resetQuestion = useCallback(
    (orderIndex: number) => {
      const baseline = baselineQuestions.find((question) => question.order_index === orderIndex);
      if (!baseline) return;
      setQuestions((current) =>
        current.map((question) =>
          question.order_index === orderIndex ? { ...baseline } : question,
        ),
      );
    },
    [baselineQuestions],
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
        questions: serializeProtocolQuestionEdits(questions, Boolean(referenceMode)),
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
    } catch (reason) {
      setError(
        processingErrorMessage(reason, t('askcoreProcessing.editor.error.report'), t as Translate),
      );
    } finally {
      setReporting(false);
    }
  };

  const state = processingState(context?.processing_state, t as Translate);
  const score = surface?.result?.content.score;
  const total = surface?.result?.content.total_score;

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

      <ProtocolProcessingEditor
        baselineQuestions={baselineQuestions}
        baselineTeacherSummary={baselineTeacherSummary}
        editable={Boolean(context?.capabilities.can_edit)}
        inputs={surface?.inputs || []}
        questions={questions}
        referenceMode={Boolean(referenceMode)}
        t={t as Translate}
        teacherSummary={teacherSummary}
        resultState={
          surface?.result ? 'ready' : context?.processing_state === 'failed' ? 'failed' : 'loading'
        }
        toolbar={
          <div className={styles.actions}>
            {!referenceMode && surface?.report?.available && surface.report.preview_url ? (
              <Button
                href={surface.report.preview_url}
                icon={<FileText size={14} />}
                rel="noreferrer"
                target="_blank"
              >
                {t('askcoreProcessing.editor.viewReport')}
              </Button>
            ) : null}
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
              onClick={() => void save()}
              disabled={
                !surface?.result || Boolean(validationError) || !context?.capabilities.can_edit
              }
            >
              {t(
                referenceMode
                  ? 'askcoreProcessing.reference.saveRevision'
                  : 'askcoreProcessing.editor.saveRevision',
              )}
            </Button>
          </div>
        }
        onQuestionChange={updateQuestion}
        onQuestionReset={resetQuestion}
        onTeacherSummaryChange={setTeacherSummary}
      />
    </main>
  );
});

ProtocolProcessingSurface.displayName = 'ProtocolProcessingSurface';
