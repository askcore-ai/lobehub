import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AskCoreWorkbenchRoute, buildAssignmentOcrRunSummary } from './index';

describe('AskCoreWorkbenchRoute assignment detail', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders assignment recipients from nested backend student and classroom fields', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === '/api/askcore/workbench/assignments/501/detail') {
        return new Response(
          JSON.stringify({
            assignment: {
              assign_date: '2026-05-14T00:00:00Z',
              assignment_id: 501,
              created_at: '2026-05-14T00:00:00Z',
              creation_type: 'manual',
              due_date: '2026-05-21T00:00:00Z',
              grade_id: 3,
              subject_id: 7,
              title: '期中练习',
            },
            files: [],
            grade: { grade_id: 3, name: '高一' },
            questions: [],
            students: [
              {
                assigned_at: '2026-05-14T00:00:00Z',
                assignment_student_id: 9001,
                classroom: {
                  class_id: 201,
                  name: '高一 1 班',
                },
                status: 'assigned',
                student: {
                  name: '张三',
                  student_id: 1001,
                  student_number: 'S1001',
                },
              },
            ],
            subject: { name: '数学', subject_id: 7 },
          }),
          {
            headers: { 'content-type': 'application/json' },
            status: 200,
          },
        );
      }

      return new Response(
        JSON.stringify({
          has_more: false,
          items: [],
          next_after_id: null,
          page: 1,
          page_size: 100,
          total: 0,
        }),
        {
          headers: { 'content-type': 'application/json' },
          status: 200,
        },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter
        initialEntries={['/askcore/workbench?tab=assignments&route=%2Fassignments%2F501']}
      >
        <AskCoreWorkbenchRoute />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText('发布对象')).toBeInTheDocument());

    expect(screen.getByText('张三')).toBeInTheDocument();
    expect(screen.getByText('高一 1 班')).toBeInTheDocument();
  });
});

describe('AskCoreWorkbenchRoute assignment OCR run summary', () => {
  const invocation = {
    action_id: 'assignment.draft.create_from_ocr',
    artifact_count: 4,
    created_at: '2026-05-16T00:00:00Z',
    current_question_order_index: null,
    failure_reason: null,
    finished_at: null,
    invocation_id: 'inv-ocr-1',
    last_event_at: null,
    plugin_id: 'aitutor-suite',
    progress_stage: 'recognizing_questions',
    question_failed: 1,
    question_succeeded: 4,
    question_total: 8,
    run_id: 10,
    started_at: '2026-05-16T00:00:00Z',
    state: 'running',
    workflow_name: 'workbench.assignment_ocr',
  };

  const artifact = (type: string, artifactId: string, content = {}) => ({
    artifact_id: artifactId,
    content,
    created_at: '2026-05-16T00:00:00Z',
    redaction: {},
    references: [],
    run_id: 10,
    schema_version: 'v1',
    summary: null,
    title: null,
    type,
  });

  it('filters submission and grading artifacts from assignment OCR results', () => {
    const summary = buildAssignmentOcrRunSummary({
      artifacts: [
        artifact('submission.ocr.batch.result', 'batch-1'),
        artifact('assignment.draft', 'draft-1', { questions: [{}, {}], title: '函数练习' }),
        artifact('grading.result.student', 'grading-1'),
        artifact('grading.explanation', 'explanation-1'),
      ],
      busy: false,
      error: null,
      invocation: { ...invocation, progress_stage: 'succeeded', state: 'succeeded' },
      notice: null,
      tracking: 'polling',
    });

    expect(summary.statusTitle).toBe('作业草稿已生成');
    expect(summary.progressLabel).toBe('已处理 5/8');
    expect(summary.visibleArtifacts.map((item) => item.type)).toEqual(['assignment.draft']);
    expect(summary.hiddenArtifacts.map((item) => item.type)).toEqual([
      'submission.ocr.batch.result',
      'grading.result.student',
      'grading.explanation',
    ]);
    expect(summary.resultItems[0]).toMatchObject({
      description: '函数练习 · 识别题目 2 道 · 草稿 draft-1',
      title: '已生成作业草稿',
    });
  });

  it.each([
    ['recognizing_questions', 'running', '正在识别题目'],
    ['building_draft', 'running', '正在生成作业草稿'],
    ['succeeded', 'succeeded', '作业草稿已生成'],
    ['failed', 'failed', 'OCR 失败'],
  ])('maps %s to a teacher readable OCR status', (stage, state, expectedTitle) => {
    const summary = buildAssignmentOcrRunSummary({
      artifacts: state === 'succeeded' ? [artifact('assignment.draft', 'draft-1')] : [],
      busy: state === 'running',
      error: state === 'failed' ? 'boom' : null,
      invocation: {
        ...invocation,
        failure_reason: state === 'failed' ? 'boom' : null,
        progress_stage: stage,
        state,
      },
      notice: null,
      tracking: 'polling',
    });

    expect(summary.statusTitle).toBe(expectedTitle);
  });
});
