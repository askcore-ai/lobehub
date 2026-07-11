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

import { message } from '@/components/AntdStaticMethods';

import {
  editCurrentProtocolProcessingResult,
  fetchCurrentProtocolProcessingSurface,
  fetchProtocolProcessingContext,
  generateCurrentProtocolProcessingReport,
} from './api';
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
  | { key: 'report'; label: string; type: 'report' };

const processingState = (value?: string) => {
  if (value === 'succeeded') return { color: 'green', label: '处理完成' };
  if (value === 'failed') return { color: 'red', label: '处理失败' };
  if (value === 'cancelled') return { color: 'default', label: '已取消' };
  return { color: 'blue', label: '处理中' };
};

const recordText = (value: JsonRecord | undefined) => {
  if (!value) return '';
  for (const key of ['text', 'content', 'value']) {
    const candidate = value[key];
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return '';
};

const cloneQuestions = (questions: ProtocolProcessingQuestion[] = []) =>
  questions.map((question) => ({ ...question }));

const PreviewPane = ({
  choice,
  choices,
  onChange,
}: {
  choice: PreviewChoice | undefined;
  choices: PreviewChoice[];
  onChange: (key: string) => void;
}) => (
  <section className={styles.preview}>
    <div className={styles.previewToolbar}>
      <Select
        aria-label="预览内容"
        options={choices.map((item) => ({ label: item.label, value: item.key }))}
        style={{ minWidth: 190 }}
        value={choice?.key}
        onChange={onChange}
      />
      {choice?.type === 'input' ? (
        <Tag>{choice.input.content_type === 'application/pdf' ? 'PDF' : '图片'}</Tag>
      ) : choice?.type === 'report' ? (
        <Tag color="green">反馈报告</Tag>
      ) : null}
    </div>
    <div className={styles.previewCanvas}>
      {!choice ? (
        <Empty description="暂无可预览内容" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : choice.type === 'report' || choice.input.content_type === 'application/pdf' ? (
        <iframe
          className={styles.previewFrame}
          title={choice.label}
          src={
            choice.type === 'report'
              ? '/api/askcore/lti/processing/current/report/preview'
              : choice.input.preview_url
          }
        />
      ) : (
        <img alt={choice.label} className={styles.previewImage} src={choice.input.preview_url} />
      )}
    </div>
  </section>
);

export const ProtocolProcessingSurface = memo(() => {
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

  const refresh = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError(undefined);
    try {
      const nextContext = await fetchProtocolProcessingContext();
      setContext(nextContext);
      if (!nextContext.account_linked) {
        setSurface(null);
        setQuestions([]);
        return;
      }
      const nextSurface = await fetchCurrentProtocolProcessingSurface();
      setSurface(nextSurface);
      setContext(nextSurface.context);
      setQuestions(cloneQuestions(nextSurface.result?.content.questions));
      setTeacherSummary(nextSurface.result?.content.teacher_summary || '');
      setDirty(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '处理内容加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!context || ['succeeded', 'failed', 'cancelled'].includes(context.processing_state)) return;
    const timer = window.setInterval(() => void refresh(true), 3000);
    return () => window.clearInterval(timer);
  }, [context, refresh]);

  const choices = useMemo<PreviewChoice[]>(() => {
    const inputs: PreviewChoice[] = (surface?.inputs || []).map((input) => ({
      input,
      key: `input:${input.slot_id}`,
      label: `${input.kind === 'reference' ? '原稿' : '答卷'} ${input.page_order}`,
      type: 'input' as const,
    }));
    if (surface?.report?.available) {
      inputs.push({ key: 'report', label: '反馈报告', type: 'report' });
    }
    return inputs;
  }, [surface]);

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
        return `第 ${question.question_number || question.order_index} 题得分超出范围`;
      }
      if (maximum != null && maximum < 0) {
        return `第 ${question.question_number || question.order_index} 题满分不能为负数`;
      }
    }
    return null;
  }, [questions]);

  const save = async () => {
    const artifactId = surface?.result?.artifact_id;
    if (!artifactId || validationError) return;
    setSaving(true);
    setError(undefined);
    try {
      await editCurrentProtocolProcessingResult({
        expected_latest_artifact_id: artifactId,
        questions: questions.map((question) => ({
          feedback: question.feedback ?? null,
          is_correct: question.is_correct ?? null,
          max_score: question.max_score ?? null,
          order_index: question.order_index,
          score: question.score ?? null,
          student_answer: question.student_answer ?? null,
        })),
        teacher_summary: teacherSummary,
      });
      message.success('批改结果已保存');
      await refresh(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '批改结果保存失败');
    } finally {
      setSaving(false);
    }
  };

  const generateReport = async () => {
    setReporting(true);
    setError(undefined);
    try {
      await generateCurrentProtocolProcessingReport();
      message.success('反馈报告已生成');
      await refresh(true);
      setSelectedPreview('report');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '反馈报告生成失败');
    } finally {
      setReporting(false);
    }
  };

  const columns = useMemo<ColumnsType<ProtocolProcessingQuestion>>(
    () => [
      {
        fixed: 'left',
        render: (_, row) => (
          <div>
            <strong>{row.question_number || row.order_index}</strong>
            <div className={styles.meta}>{row.question_type || '题目'}</div>
            {recordText(row.question_content) ? (
              <Tooltip title={recordText(row.question_content)}>
                <div className={styles.meta}>查看题干</div>
              </Tooltip>
            ) : null}
          </div>
        ),
        title: '题号',
        width: 92,
      },
      {
        render: (_, row) => (
          <Input.TextArea
            aria-label={`第 ${row.question_number || row.order_index} 题 OCR 文本`}
            autoSize={{ maxRows: 8, minRows: 3 }}
            value={row.student_answer || ''}
            onChange={(event) =>
              updateQuestion(row.order_index, { student_answer: event.target.value })
            }
          />
        ),
        title: 'OCR 文本',
        width: 270,
      },
      {
        render: (_, row) => (
          <Space.Compact>
            <InputNumber
              aria-label={`第 ${row.question_number || row.order_index} 题得分`}
              min={0}
              precision={2}
              style={{ width: 86 }}
              value={row.score}
              onChange={(value) => updateQuestion(row.order_index, { score: value })}
            />
            <InputNumber
              aria-label={`第 ${row.question_number || row.order_index} 题满分`}
              min={0}
              precision={2}
              style={{ width: 86 }}
              value={row.max_score}
              onChange={(value) => updateQuestion(row.order_index, { max_score: value })}
            />
          </Space.Compact>
        ),
        title: '得分 / 满分',
        width: 185,
      },
      {
        align: 'center',
        render: (_, row) => (
          <Checkbox
            aria-label={`第 ${row.question_number || row.order_index} 题正确`}
            checked={row.is_correct === true}
            indeterminate={row.is_correct == null}
            onChange={(event) =>
              updateQuestion(row.order_index, { is_correct: event.target.checked })
            }
          />
        ),
        title: '正确',
        width: 72,
      },
      {
        render: (_, row) => (
          <Input.TextArea
            aria-label={`第 ${row.question_number || row.order_index} 题反馈`}
            autoSize={{ maxRows: 8, minRows: 3 }}
            value={row.feedback || ''}
            onChange={(event) => updateQuestion(row.order_index, { feedback: event.target.value })}
          />
        ),
        title: '反馈',
        width: 270,
      },
    ],
    [updateQuestion],
  );

  const state = processingState(context?.processing_state);
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
          description="请通过学校发出的定向邀请完成账号绑定后重新打开。"
          title="学校身份尚未绑定到当前账号"
          type="warning"
        />
      </div>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.heading}>
          <div className={styles.icon}>
            <WandSparkles size={20} />
          </div>
          <div>
            <h1 className={styles.title}>智能批改</h1>
            <div className={styles.meta}>OCR、批改修订与反馈报告</div>
          </div>
        </div>
        <div className={styles.actions}>
          <Tag color={state.color}>{state.label}</Tag>
          {score != null || total != null ? (
            <span className={styles.score}>
              {score ?? '--'} / {total ?? '--'}
            </span>
          ) : null}
          <Button icon={<RefreshCw size={14} />} onClick={() => void refresh()}>
            刷新
          </Button>
        </div>
      </header>

      {error ? <Alert showIcon title={error} type="error" /> : null}
      {validationError ? <Alert showIcon title={validationError} type="warning" /> : null}

      <div className={styles.body}>
        <PreviewPane choice={selectedChoice} choices={choices} onChange={setSelectedPreview} />

        <section className={styles.editor}>
          <div className={styles.editorHeader}>
            <div className={styles.heading}>
              <ScanText size={18} />
              <strong>批改结果</strong>
            </div>
            <div className={styles.actions}>
              <Button
                disabled={!surface?.result || dirty || !context?.capabilities.can_generate_report}
                icon={<FileText size={14} />}
                loading={reporting}
                onClick={() => void generateReport()}
              >
                生成报告
              </Button>
              <Button
                icon={<Save size={14} />}
                loading={saving}
                type="primary"
                disabled={
                  !surface?.result || Boolean(validationError) || !context?.capabilities.can_edit
                }
                onClick={() => void save()}
              >
                保存修订
              </Button>
            </div>
          </div>

          {surface?.result ? (
            <>
              <Table
                columns={columns}
                dataSource={questions}
                pagination={false}
                rowKey="order_index"
                scroll={{ x: 900 }}
                size="small"
              />
              <div className={styles.summary}>
                <Input.TextArea
                  aria-label="教师总结"
                  autoSize={{ maxRows: 8, minRows: 3 }}
                  placeholder="教师总结"
                  value={teacherSummary}
                  onChange={(event) => {
                    setDirty(true);
                    setTeacherSummary(event.target.value);
                  }}
                />
              </div>
            </>
          ) : context?.processing_state === 'failed' ? (
            <Empty description="处理失败" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : (
            <Skeleton active paragraph={{ rows: 8 }} />
          )}
        </section>
      </div>
    </main>
  );
});

ProtocolProcessingSurface.displayName = 'ProtocolProcessingSurface';
