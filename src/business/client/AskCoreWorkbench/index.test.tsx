import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AskCoreWorkbenchRoute,
  buildAssignmentOcrRunSummary,
  buildSubmissionOcrRunSummary,
} from './index';

describe('AskCoreWorkbenchRoute dashboard overview', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const emptyListResponse = {
    has_more: false,
    items: [],
    next_after_id: null,
    page: 1,
    page_size: 100,
    total: 0,
  };

  const invocation = {
    action_id: 'submission.create_from_ocr',
    artifact_count: 69,
    created_at: '2026-05-23T14:25:32',
    current_question_order_index: null,
    failure_reason: null,
    finished_at: '2026-05-23T14:28:10',
    invocation_id: 'inv-submission-ocr-1',
    last_event_at: '2026-05-23T14:28:10',
    plugin_id: 'aitutor-suite',
    progress_stage: 'finalizing_batch',
    question_failed: 0,
    question_succeeded: 69,
    question_total: 69,
    run_id: 20,
    started_at: '2026-05-23T14:25:40',
    state: 'succeeded',
    workflow_name: 'workbench.submission_create_from_ocr',
  };

  const runningInvocation = {
    ...invocation,
    artifact_count: 0,
    created_at: '2026-05-23T14:35:32',
    finished_at: null,
    invocation_id: 'inv-submission-ocr-running',
    last_event_at: '2026-05-23T14:36:10',
    progress_stage: 'running_submission_ocr',
    question_failed: 0,
    question_succeeded: 6,
    question_total: 24,
    run_id: 21,
    started_at: '2026-05-23T14:35:40',
    state: 'running',
  };

  const fetchDashboard = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url === '/api/askcore/workbench/dashboard') {
      return new Response(
        JSON.stringify({
          active_invocations: [],
          counts: { assignments: 1, questions: 342, submissions: 0 },
          drafts: [],
          recent_invocations: [runningInvocation, invocation],
        }),
        { headers: { 'content-type': 'application/json' }, status: 200 },
      );
    }

    if (url === '/api/askcore/workbench/invocations/inv-submission-ocr-1') {
      return new Response(JSON.stringify(invocation), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      });
    }

    if (url === '/api/askcore/workbench/invocations/inv-submission-ocr-1/artifacts') {
      return new Response(
        JSON.stringify({
          artifacts: [
            {
              artifact_id: 'batch-1',
              created_at: '2026-05-23T14:28:10',
              run_id: 20,
              schema_version: 'v1',
              summary: null,
              title: null,
              type: 'submission.ocr.batch.result',
            },
          ],
          invocation_id: 'inv-submission-ocr-1',
          run_id: 20,
        }),
        { headers: { 'content-type': 'application/json' }, status: 200 },
      );
    }

    if (url === '/api/askcore/workbench/artifacts/batch-1') {
      return new Response(
        JSON.stringify({
          artifact_id: 'batch-1',
          content: {
            assignment_title: '函数作业',
            auto_bound: [{ submission_id: 101 }],
            created_count: 69,
            explained_count: 4,
            failed: [],
            graded_count: 4,
            needs_binding: [],
          },
          created_at: '2026-05-23T14:28:10',
          redaction: {},
          references: [],
          run_id: 20,
          schema_version: 'v1',
          summary: null,
          title: null,
          type: 'submission.ocr.batch.result',
        }),
        { headers: { 'content-type': 'application/json' }, status: 200 },
      );
    }

    return new Response(JSON.stringify(emptyListResponse), {
      headers: { 'content-type': 'application/json' },
      status: 200,
    });
  });

  it('renders recent runs with teacher-readable labels, result meaning, and finish time', async () => {
    vi.stubGlobal('fetch', fetchDashboard);

    render(
      <MemoryRouter initialEntries={['/askcore/workbench?tab=overview']}>
        <AskCoreWorkbenchRoute />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(screen.getAllByText('批量导入学生提交').length).toBeGreaterThan(0),
    );

    expect(screen.queryByText('submission.create_from_ocr')).not.toBeInTheDocument();
    expect(screen.queryByText('finalizing_batch')).not.toBeInTheDocument();
    expect(screen.getByText('提交处理进度 6/24')).toBeInTheDocument();
    expect(screen.getByText('正在汇总批次结果')).toBeInTheDocument();
    expect(screen.getByText('处理 69 份提交')).toBeInTheDocument();
    expect(screen.queryByText('生成 69 项提交处理结果')).not.toBeInTheDocument();
    expect(screen.getAllByText('结束时间').length).toBeGreaterThan(0);
    expect(screen.getByText('2026-05-23 14:28:10')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '查看任务' }).length).toBeGreaterThan(0);
  });

  it('opens a task detail page from a recent run row', async () => {
    vi.stubGlobal('fetch', fetchDashboard);

    render(
      <MemoryRouter initialEntries={['/askcore/workbench?tab=overview']}>
        <AskCoreWorkbenchRoute />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getAllByRole('button', { name: '查看任务' }).length).toBe(2));
    fireEvent.click(screen.getAllByRole('button', { name: '查看任务' })[1]);

    await waitFor(() => expect(screen.getByText('任务内容')).toBeInTheDocument());

    expect(fetchDashboard).toHaveBeenCalledWith(
      '/api/askcore/workbench/invocations/inv-submission-ocr-1',
      expect.any(Object),
    );
    expect(screen.getAllByText('批量导入学生提交').length).toBeGreaterThan(0);
    expect(screen.getAllByText('学生提交批量处理结果').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: '返回总览' })).toBeInTheDocument();
  });
});

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

describe('AskCoreWorkbenchRoute submission detail binding', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const emptyListResponse = {
    has_more: false,
    items: [],
    next_after_id: null,
    page: 1,
    page_size: 100,
    total: 0,
  };

  const submissionDetail = (status: string, assignmentStudentId: number | null = null) => ({
    assignment: {
      assignment_id: 501,
      title: '高三数学 2026-05-22 2',
    },
    assignment_questions: [],
    classroom: null,
    explanation_artifact: null,
    files: [],
    grade: null,
    questions: [],
    report: null,
    student: null,
    students: [
      {
        assigned_at: '2026-05-22T00:00:00Z',
        assignment_student_id: 847,
        classroom: {
          class_id: 201,
          name: '高三 2 班',
        },
        status: 'assigned',
        student: {
          name: '李常奕',
          student_id: 1001,
          student_number: '1014233712',
        },
      },
      {
        assigned_at: '2026-05-22T00:00:00Z',
        assignment_student_id: 848,
        classroom: {
          class_id: 201,
          name: '高三 2 班',
        },
        status: 'removed',
        student: {
          name: '不应显示',
          student_id: 1002,
          student_number: '1014233713',
        },
      },
    ],
    subject: null,
    submission: {
      assignment_id: 501,
      assignment_student_id: assignmentStudentId,
      score: 0,
      status,
      submission_id: 1109,
      submitted_at: '2026-05-23T00:25:45Z',
      total_score: 0,
    },
  });

  const renderSubmissionDetail = (status: string, assignmentStudentId: number | null = null) => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === '/api/askcore/workbench/submissions/1109/detail') {
        return new Response(JSON.stringify(submissionDetail(status, assignmentStudentId)), {
          headers: { 'content-type': 'application/json' },
          status: 200,
        });
      }

      if (url === '/api/askcore/workbench/submissions/1109' && init?.method === 'PATCH') {
        return new Response(
          JSON.stringify({
            item: {
              assignment_id: 501,
              assignment_student_id: 847,
              status: 'submitted',
              submission_id: 1109,
            },
          }),
          {
            headers: { 'content-type': 'application/json' },
            status: 200,
          },
        );
      }

      if (url === '/api/askcore/workbench/organization/units') {
        return new Response(JSON.stringify({ org_id: 'org-test', units: [] }), {
          headers: { 'content-type': 'application/json' },
          status: 200,
        });
      }

      return new Response(JSON.stringify(emptyListResponse), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter
        initialEntries={['/askcore/workbench?tab=submissions&route=%2Fsubmissions%2F1109']}
      >
        <AskCoreWorkbenchRoute />
      </MemoryRouter>,
    );

    return fetchMock;
  };

  it('shows binding only for needs_binding submissions and saves an assigned student choice', async () => {
    const fetchMock = renderSubmissionDetail('needs_binding');

    await waitFor(() => expect(screen.getByText('学生归属')).toBeInTheDocument());

    fireEvent.mouseDown(screen.getByText('选择已发布学生'));
    const option = await screen.findByText('李常奕 · 学号 1014233712 · 班级 高三 2 班 · 作业学生 #847');
    expect(option).toBeInTheDocument();
    expect(screen.queryByText(/不应显示/)).not.toBeInTheDocument();

    fireEvent.click(option);
    fireEvent.click(screen.getByRole('button', { name: '保存绑定' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/askcore/workbench/submissions/1109',
        expect.objectContaining({
          body: JSON.stringify({ patch: { assignment_student_id: 847 } }),
          method: 'PATCH',
        }),
      ),
    );
  });

  it('hides binding controls for already bound submissions', async () => {
    renderSubmissionDetail('graded', 847);

    await waitFor(() => expect(screen.getByText('提交信息')).toBeInTheDocument());

    expect(screen.queryByText('学生归属')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '保存绑定' })).not.toBeInTheDocument();
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

  it('labels assignment OCR progress as in progress until the invocation is terminal', () => {
    const summary = buildAssignmentOcrRunSummary({
      artifacts: [],
      busy: true,
      error: null,
      invocation,
      notice: null,
      tracking: 'polling',
    });

    expect(summary.progressLabel).toBe('正在处理 5/8');
  });
});

describe('AskCoreWorkbenchRoute submission OCR run summary', () => {
  const invocation = {
    action_id: 'submission.create_from_ocr',
    artifact_count: 3,
    created_at: '2026-05-16T00:00:00Z',
    current_question_order_index: null,
    failure_reason: null,
    finished_at: null,
    invocation_id: 'inv-submission-ocr-1',
    last_event_at: null,
    plugin_id: 'aitutor-suite',
    progress_stage: 'running_submission_ocr',
    question_failed: 1,
    question_succeeded: 1,
    question_total: 4,
    run_id: 20,
    started_at: '2026-05-16T00:00:00Z',
    state: 'running',
    workflow_name: 'workbench.submission_create_from_ocr',
  };

  const artifact = (type: string, artifactId: string, content = {}) => ({
    artifact_id: artifactId,
    content,
    created_at: '2026-05-16T00:00:00Z',
    redaction: {},
    references: [],
    run_id: 20,
    schema_version: 'v1',
    summary: null,
    title: null,
    type,
  });

  it('summarizes student submission batch results and hides raw grading artifacts', () => {
    const summary = buildSubmissionOcrRunSummary({
      artifacts: [
        artifact('grading.result.student', 'grading-1'),
        artifact('submission.ocr.batch.result', 'batch-1', {
          assignment_title: '函数作业',
          auto_bound: [{ submission_id: 101 }],
          created_count: 3,
          explained_count: 1,
          failed: [{ submission_id: 103 }],
          graded_count: 1,
          needs_binding: [{ submission_id: 102 }],
        }),
        artifact('grading.explanation', 'explanation-1'),
      ],
      busy: false,
      error: null,
      invocation: { ...invocation, progress_stage: 'succeeded', state: 'succeeded' },
      notice: null,
      tracking: 'polling',
    });

    expect(summary.statusTitle).toBe('学生提交处理完成');
    expect(summary.progressLabel).toBe('已处理 2/4 份提交');
    expect(summary.visibleArtifacts.map((item) => item.type)).toEqual([
      'submission.ocr.batch.result',
    ]);
    expect(summary.hiddenArtifacts.map((item) => item.type)).toEqual([
      'grading.result.student',
      'grading.explanation',
    ]);
    expect(summary.resultItems[0]).toMatchObject({
      description: '函数作业 · 创建 3 份 · 自动绑定 1 · 待处理 1 · 失败 1 · 已批改 1',
      title: '学生提交批量处理结果',
    });
  });

  it.each([
    ['running_submission_ocr', 'running', '正在识别并批改提交'],
    ['finalizing_batch', 'running', '正在汇总批次结果'],
    ['succeeded', 'succeeded', '学生提交处理完成'],
    ['failed', 'failed', '提交 OCR 失败'],
  ])('maps %s to a teacher readable submission OCR status', (stage, state, expectedTitle) => {
    const summary = buildSubmissionOcrRunSummary({
      artifacts: state === 'succeeded' ? [artifact('submission.ocr.batch.result', 'batch-1')] : [],
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

  it('labels submission OCR progress as in progress until the invocation is terminal', () => {
    const summary = buildSubmissionOcrRunSummary({
      artifacts: [],
      busy: true,
      error: null,
      invocation,
      notice: null,
      tracking: 'polling',
    });

    expect(summary.progressLabel).toBe('正在处理 2/4 份提交');
  });
});
