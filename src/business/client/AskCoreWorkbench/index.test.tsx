import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { message, Modal } from 'antd';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AskCoreWorkbenchRoute,
  buildAssignmentOcrRunSummary,
  buildQuestionOcrRunSummary,
  buildSubmissionOcrAssignmentSelectOption,
  buildSubmissionOcrRunSummary,
  RESOURCE_LIST_LAYOUT,
  SUBMISSION_OCR_LAYOUT_BREAKPOINTS,
} from './index';

const activeOrganizationResponse = () =>
  new Response(
    JSON.stringify({
      current: {
        id: 'org_askcore_school_2026',
        isActive: true,
        name: 'AskCore School',
        role: 'owner',
        slug: 'askcore-school',
      },
      organizations: [
        {
          id: 'org_askcore_school_2026',
          isActive: true,
          name: 'AskCore School',
          role: 'owner',
          slug: 'askcore-school',
        },
      ],
      permissions: {
        canInvite: true,
        canManageMembers: true,
        canUpdateMeta: true,
      },
    }),
    { headers: { 'content-type': 'application/json' }, status: 200 },
  );

describe('AskCoreWorkbenchRoute dashboard overview', () => {
  afterEach(() => {
    message.destroy();
    Modal.destroyAll();
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
          drafts: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }],
          recent_invocations: [runningInvocation, invocation],
        }),
        { headers: { 'content-type': 'application/json' }, status: 200 },
      );
    }

    if (url === '/api/askcore/organizations') {
      return new Response(
        JSON.stringify({
          current: {
            id: 'org_askcore_school_2026',
            isActive: true,
            name: 'AskCore School',
            role: 'owner',
            slug: 'askcore-school',
          },
          organizations: [
            {
              id: 'org_askcore_school_2026',
              isActive: true,
              name: 'AskCore School',
              role: 'owner',
              slug: 'askcore-school',
            },
          ],
          permissions: {
            canInvite: true,
            canManageMembers: true,
            canUpdateMeta: true,
          },
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

    await waitFor(() => expect(screen.getAllByText('批量导入学生提交').length).toBeGreaterThan(0));

    expect(screen.getByText('当前组织')).toBeInTheDocument();
    expect(screen.getByText('AskCore School')).toBeInTheDocument();
    expect(screen.getByText('组织所有者')).toBeInTheDocument();
    expect(screen.queryByText('org_askcore_school_2026')).not.toBeInTheDocument();
    expect(screen.queryByText('submission.create_from_ocr')).not.toBeInTheDocument();
    expect(screen.queryByText('finalizing_batch')).not.toBeInTheDocument();
    expect(screen.getByText('提交处理进度 6/24')).toBeInTheDocument();
    expect(screen.getByText('已汇总批次结果')).toBeInTheDocument();
    expect(screen.queryByText('正在汇总批次结果')).not.toBeInTheDocument();
    expect(screen.getByText('处理 69 份提交')).toBeInTheDocument();
    expect(screen.queryByText('生成 69 项提交处理结果')).not.toBeInTheDocument();
    expect(screen.queryByText(/草稿/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '创建作业' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '导入提交' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '刷新' })).not.toBeInTheDocument();
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
  }, 15_000);

  it('blocks the workbench dashboard when no active organization is selected', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/askcore/workbench/dashboard') {
        return new Response(
          JSON.stringify({
            active_invocations: [],
            counts: { assignments: 1, questions: 342, submissions: 0 },
            drafts: [],
            recent_invocations: [runningInvocation],
          }),
          { headers: { 'content-type': 'application/json' }, status: 200 },
        );
      }
      if (url === '/api/askcore/organizations') {
        return new Response(JSON.stringify({ current: null, organizations: [] }), {
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
      <MemoryRouter initialEntries={['/askcore/workbench?tab=overview']}>
        <AskCoreWorkbenchRoute />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText('请选择组织')).toBeInTheDocument());

    expect(screen.queryByText('提交')).not.toBeInTheDocument();
    expect(screen.queryByText('题目')).not.toBeInTheDocument();
    expect(screen.queryByText('批量导入学生提交')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '进入组织页' })).toHaveAttribute(
      'href',
      '/organization',
    );
    expect(screen.getByRole('link', { name: '打开组织管理' })).toHaveAttribute(
      'href',
      '/organization',
    );
  });

  it('links identity-required users to the organization identity claim action', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/askcore/workbench/me') {
        return new Response(
          JSON.stringify({
            active_persona: null,
            capabilities: {
              can_create_assignment: false,
              can_create_question: false,
              can_run_teacher_submission_ocr: false,
              can_submit_own_work: false,
            },
            default_persona: null,
            education_identities: [],
            org_composition: { students: 1, teachers: 1 },
            workbench_mode: 'identity_required',
          }),
          { headers: { 'content-type': 'application/json' }, status: 200 },
        );
      }
      if (url === '/api/askcore/workbench/dashboard') {
        return new Response(
          JSON.stringify({
            active_invocations: [],
            counts: { assignments: 0, questions: 0, submissions: 0 },
            drafts: [],
            recent_invocations: [],
          }),
          { headers: { 'content-type': 'application/json' }, status: 200 },
        );
      }
      if (url === '/api/askcore/organizations') {
        return new Response(
          JSON.stringify({
            current: {
              id: 'org-1',
              isActive: true,
              name: 'AskCore School',
              role: 'member',
              slug: 'askcore-school',
            },
            members: [],
            organizations: [
              {
                id: 'org-1',
                isActive: true,
                name: 'AskCore School',
                role: 'member',
                slug: 'askcore-school',
              },
            ],
            permissions: {
              canInvite: false,
              canManageMembers: false,
              canUpdateMeta: false,
            },
          }),
          { headers: { 'content-type': 'application/json' }, status: 200 },
        );
      }
      return new Response(JSON.stringify(emptyListResponse), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter initialEntries={['/askcore/workbench?tab=overview']}>
        <AskCoreWorkbenchRoute />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText('请先完成教师或学生身份绑定')).toBeInTheDocument());
    expect(screen.getByRole('link', { name: '去提交身份申请' })).toHaveAttribute(
      'href',
      '/organization?action=identity-claim',
    );
  });

  it('keeps a restricted student overview focused on the active organization', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/askcore/workbench/me') {
        return new Response(
          JSON.stringify({
            active_persona: { id: 7, label: '张扬', role: 'student' },
            capabilities: {
              can_create_assignment: false,
              can_create_question: false,
              can_run_teacher_submission_ocr: false,
              can_submit_own_work: true,
            },
            default_persona: { id: 7, label: '张扬', role: 'student' },
            education_identities: [{ id: 7, label: '张扬', role: 'student' }],
            org_composition: { student_count: 1, teacher_count: 1 },
            workbench_mode: 'student_restricted',
          }),
          { headers: { 'content-type': 'application/json' }, status: 200 },
        );
      }
      if (url === '/api/askcore/organizations') return activeOrganizationResponse();
      if (url.startsWith('/api/askcore/workbench/assignments?')) {
        return new Response(
          JSON.stringify({
            ...emptyListResponse,
            items: [{ assignment_id: 501, subject_name: '数学', title: '函数作业' }],
            resource: 'assignments',
            total: 1,
          }),
          { headers: { 'content-type': 'application/json' }, status: 200 },
        );
      }
      if (url === '/api/askcore/workbench/dashboard') {
        return new Response(
          JSON.stringify({
            active_invocations: [],
            counts: { assignments: 16, questions: 555, submissions: 1662 },
            drafts: [],
            recent_invocations: [runningInvocation],
          }),
          { headers: { 'content-type': 'application/json' }, status: 200 },
        );
      }
      return new Response(JSON.stringify(emptyListResponse), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter initialEntries={['/askcore/workbench?tab=overview']}>
        <AskCoreWorkbenchRoute />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText('AskCore School')).toBeInTheDocument());

    expect(screen.getByText('总览')).toBeInTheDocument();
    expect(screen.getByText('我的作业')).toBeInTheDocument();
    expect(screen.getByText('我的提交')).toBeInTheDocument();
    expect(screen.queryByText('函数作业')).not.toBeInTheDocument();
    expect(screen.queryByText('学生工作台')).not.toBeInTheDocument();
    expect(screen.queryByText('题目')).not.toBeInTheDocument();
    expect(screen.queryByText('1662')).not.toBeInTheDocument();
    expect(screen.queryByText('16')).not.toBeInTheDocument();
    expect(screen.queryByText('555')).not.toBeInTheDocument();
    expect(screen.queryByText('批量导入学生提交')).not.toBeInTheDocument();
  });
});

describe('AskCoreWorkbenchRoute assignment detail', () => {
  afterEach(() => {
    message.destroy();
    Modal.destroyAll();
    vi.unstubAllGlobals();
  });

  it('renders assignment recipients from nested backend student and classroom fields', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === '/api/askcore/organizations') return activeOrganizationResponse();

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

    await waitFor(() => expect(screen.getByText('发布对象')).toBeInTheDocument(), {
      timeout: 10_000,
    });

    expect(screen.getByText('张三')).toBeInTheDocument();
    expect(screen.getByText('高一 1 班')).toBeInTheDocument();
  }, 15_000);
});

describe('AskCoreWorkbenchRoute submission detail binding', () => {
  afterEach(() => {
    message.destroy();
    Modal.destroyAll();
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

  const submissionDetail = (
    status: string,
    assignmentStudentId: number | null = null,
    files: Array<{
      media_type?: string;
      name: string;
      object_key: string;
      preview_url?: string;
    }> = [],
  ) => ({
    assignment: {
      assignment_id: 501,
      title: '高三数学 2026-05-22 2',
    },
    assignment_questions: [],
    classroom: null,
    explanation_artifact: null,
    files,
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

  const renderSubmissionDetail = (
    status: string,
    assignmentStudentId: number | null = null,
    files: Array<{
      media_type?: string;
      name: string;
      object_key: string;
      preview_url?: string;
    }> = [],
  ) => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === '/api/askcore/organizations') return activeOrganizationResponse();

      if (url === '/api/askcore/workbench/submissions/1109/detail') {
        return new Response(JSON.stringify(submissionDetail(status, assignmentStudentId, files)), {
          headers: { 'content-type': 'application/json' },
          status: 200,
        });
      }

      if (
        url === '/api/askcore/workbench/actions/submission.ocr.rerun' &&
        init?.method === 'POST'
      ) {
        return new Response(
          JSON.stringify({
            action_id: 'submission.ocr.rerun',
            invocation_id: 'inv-submission-rerun-1',
            plugin_id: 'aitutor-suite',
            run_id: 2001,
            status: 'starting',
          }),
          {
            headers: { 'content-type': 'application/json' },
            status: 201,
          },
        );
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
    const option = await screen.findByText(
      '李常奕 · 学号 1014233712 · 班级 高三 2 班 · 作业学生 #847',
    );
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
  }, 15_000);

  it('hides binding controls for already bound submissions', async () => {
    renderSubmissionDetail('graded', 847);

    await waitFor(() => expect(screen.getByText('提交信息')).toBeInTheDocument());

    expect(screen.queryByText('学生归属')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '保存绑定' })).not.toBeInTheDocument();
  }, 15_000);

  it('confirms and invokes submission OCR rerun when uploaded images exist', async () => {
    const fetchMock = renderSubmissionDetail('graded', 847, [
      {
        media_type: 'image/jpeg',
        name: 'submission-sheet.jpg',
        object_key: 'uploads/org1/scan/submission-sheet.jpg',
        preview_url: '/api/askcore/workbench/files/preview?object_key=submission-sheet.jpg',
      },
    ]);

    await waitFor(() => expect(screen.getByText('提交信息')).toBeInTheDocument());

    const rerunButton = screen.getByRole('button', { name: '重新 OCR 并批改' });
    expect(rerunButton).toBeEnabled();
    fireEvent.click(rerunButton);
    fireEvent.click(await screen.findByRole('button', { name: /OK|确定/ }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/askcore/workbench/actions/submission.ocr.rerun',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    const actionCall = fetchMock.mock.calls.find(
      ([input]) => String(input) === '/api/askcore/workbench/actions/submission.ocr.rerun',
    );
    expect(actionCall).toBeTruthy();
    const body = JSON.parse(String((actionCall?.[1] as RequestInit).body || '{}'));
    expect(body.params).toEqual({ submission_id: 1109 });
    expect(body.confirmation_id).toMatch(/^confirm-/);
  }, 10_000);

  it('disables submission OCR rerun when no uploaded images exist', async () => {
    renderSubmissionDetail('graded', 847);

    await waitFor(() => expect(screen.getByText('提交信息')).toBeInTheDocument());

    expect(screen.getByRole('button', { name: '重新 OCR 并批改' })).toBeDisabled();
  }, 10_000);
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

describe('AskCoreWorkbenchRoute question OCR run summary', () => {
  const invocation = {
    action_id: 'question.create_from_ocr',
    artifact_count: 1,
    created_at: '2026-06-16T00:00:00Z',
    current_question_order_index: null,
    failure_reason: null,
    finished_at: '2026-06-16T00:02:00Z',
    invocation_id: 'inv-question-ocr-1',
    last_event_at: '2026-06-16T00:02:00Z',
    plugin_id: 'aitutor-suite',
    progress_stage: 'succeeded',
    question_failed: 1,
    question_succeeded: 4,
    question_total: 5,
    run_id: 30,
    started_at: '2026-06-16T00:00:10Z',
    state: 'succeeded',
    workflow_name: 'workbench.question_ocr',
  };

  const artifact = (type: string, artifactId: string, content = {}) => ({
    artifact_id: artifactId,
    content,
    created_at: '2026-06-16T00:02:00Z',
    redaction: {},
    references: [],
    run_id: 30,
    schema_version: 'v1',
    summary: null,
    title: null,
    type,
  });

  it('summarizes created, reused, generated-answer, failure, and similarity counts', () => {
    const summary = buildQuestionOcrRunSummary({
      artifacts: [
        artifact('assignment.draft', 'draft-hidden'),
        artifact('question.ocr.import.result', 'question-import-1', {
          created_question_ids: [101, 102],
          failed_questions: [{ error: 'schema_invalid' }],
          generated_answer_question_ids: [102],
          reused_question_ids: [88],
          similarity_decisions: [{ decision: 'duplicate' }, { decision: 'create_new' }],
          skipped_duplicates: [{ existing_question_id: 88 }],
        }),
      ],
      busy: false,
      error: null,
      invocation,
      notice: null,
      tracking: 'polling',
    });

    expect(summary.statusTitle).toBe('题库 OCR 已完成');
    expect(summary.progressLabel).toBe('已处理 5/5');
    expect(summary.visibleArtifacts.map((item) => item.type)).toEqual([
      'question.ocr.import.result',
    ]);
    expect(summary.hiddenArtifacts.map((item) => item.type)).toEqual(['assignment.draft']);
    expect(summary.resultItems[0]).toMatchObject({
      description: '新建 2 · 复用 1 · 补全答案 1 · 跳过重复 1 · 失败 1 · 相似度判定 2',
      title: '题库导入结果',
    });
  });
});

describe('AskCoreWorkbenchRoute submission list batch actions', () => {
  afterEach(() => {
    message.destroy();
    Modal.destroyAll();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const submissions = [
    { status: 'graded', student_name: '张三', submission_id: 1109 },
    { status: 'graded', student_name: '李四', submission_id: 1110 },
  ];

  const invocation = (invocationId: string, actionId: string) => ({
    action_id: actionId,
    artifact_count: 0,
    created_at: '2026-05-23T14:25:32',
    current_question_order_index: null,
    failure_reason: null,
    finished_at: '2026-05-23T14:25:40',
    invocation_id: invocationId,
    last_event_at: '2026-05-23T14:25:40',
    plugin_id: 'aitutor-suite',
    progress_stage: 'succeeded',
    question_failed: 0,
    question_succeeded: 1,
    question_total: 1,
    run_id: 20,
    started_at: '2026-05-23T14:25:33',
    state: 'succeeded',
    workflow_name: 'workbench.submission_batch_test',
  });

  const submissionDetail = (submissionId: number, hasImage: boolean) => ({
    assignment: null,
    assignment_questions: [],
    classroom: null,
    explanation_artifact: null,
    files: hasImage
      ? [
          {
            media_type: 'image/jpeg',
            name: `submission-${submissionId}.jpg`,
            object_key: `uploads/org/scan/submission-${submissionId}.jpg`,
          },
        ]
      : [],
    grade: null,
    questions: [],
    report: null,
    student: null,
    students: [],
    subject: null,
    submission: { status: 'graded', submission_id: submissionId },
  });

  const makeFetch = () => {
    const actions = new Map<string, string>();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);

      if (url === '/api/askcore/organizations') return activeOrganizationResponse();

      if (url.startsWith('/api/askcore/workbench/submissions?')) {
        return new Response(
          JSON.stringify({
            has_more: false,
            items: submissions,
            next_after_id: null,
            page: 1,
            page_size: 20,
            resource: 'submissions',
            total: submissions.length,
          }),
          { headers: { 'content-type': 'application/json' }, status: 200 },
        );
      }

      if (url === '/api/askcore/workbench/submissions/1109/detail') {
        return new Response(JSON.stringify(submissionDetail(1109, true)), {
          headers: { 'content-type': 'application/json' },
          status: 200,
        });
      }

      if (url === '/api/askcore/workbench/submissions/1110/detail') {
        return new Response(JSON.stringify(submissionDetail(1110, false)), {
          headers: { 'content-type': 'application/json' },
          status: 200,
        });
      }

      if (url === '/api/askcore/workbench/submissions/reports/download') {
        return new Response('zip', {
          headers: {
            'content-length': '3',
            'content-type': 'application/zip',
          },
          status: 200,
        });
      }

      if (url === '/api/askcore/workbench/devices/printers') {
        return new Response(
          JSON.stringify({
            default_printer_id: 'printer-1',
            items: [
              {
                bridge_id: 'agent-1',
                capabilities: {},
                display_name: '办公室打印机',
                kind: 'ipp',
                online: true,
                printer_id: 'printer-1',
                source: 'device_agent',
              },
            ],
          }),
          { headers: { 'content-type': 'application/json' }, status: 200 },
        );
      }

      if (url.includes('/actions/')) {
        const actionId = decodeURIComponent(url.split('/actions/')[1]);
        const invocationId = `inv-${actions.size + 1}`;
        actions.set(invocationId, actionId);
        return new Response(
          JSON.stringify({
            action_id: actionId,
            invocation_id: invocationId,
            plugin_id: 'aitutor-suite',
            run_id: actions.size,
            status: 'accepted',
          }),
          { headers: { 'content-type': 'application/json' }, status: 201 },
        );
      }

      const invocationMatch = url.match(/\/api\/askcore\/workbench\/invocations\/([^/]+)$/);
      if (invocationMatch?.[1]) {
        const invocationId = decodeURIComponent(invocationMatch[1]);
        return new Response(
          JSON.stringify(invocation(invocationId, actions.get(invocationId) || '')),
          {
            headers: { 'content-type': 'application/json' },
            status: 200,
          },
        );
      }

      if (url.includes('/invocations/') && url.endsWith('/artifacts')) {
        return new Response(JSON.stringify({ artifacts: [], invocation_id: 'inv-1', run_id: 20 }), {
          headers: { 'content-type': 'application/json' },
          status: 200,
        });
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
        { headers: { 'content-type': 'application/json' }, status: 200 },
      );
    });
    return fetchMock;
  };

  const renderSubmissionList = async (fetchMock = makeFetch()) => {
    vi.stubGlobal('fetch', fetchMock);
    render(
      <MemoryRouter initialEntries={['/askcore/workbench?tab=submissions']}>
        <AskCoreWorkbenchRoute />
      </MemoryRouter>,
    );
    await screen.findAllByText('张三');
    return fetchMock;
  };

  const selectVisibleSubmissions = async () => {
    const checkbox = screen.getByRole('checkbox', { name: '全选当前显示记录' });
    await waitFor(() => expect(checkbox).toBeEnabled());
    fireEvent.click(checkbox);
    await waitFor(() => expect(screen.getByText(/已选 2 条/)).toBeInTheDocument());
  };

  const actionCalls = (fetchMock: ReturnType<typeof makeFetch>, action: string) =>
    fetchMock.mock.calls.filter(
      ([input]) => String(input) === `/api/askcore/workbench/actions/${action}`,
    );

  it('shows disabled submission batch buttons until rows are selected', async () => {
    await renderSubmissionList();

    expect(screen.getByRole('button', { name: '重新 OCR 并批改' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '批改/讲解' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '生成报告' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '下载报告' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '打印报告' })).toBeDisabled();

    await selectVisibleSubmissions();

    expect(screen.getByRole('button', { name: '批改/讲解' })).toBeEnabled();
  }, 15_000);

  it('runs selected grading actions with aggregate progress', async () => {
    const fetchMock = await renderSubmissionList();
    await selectVisibleSubmissions();

    fireEvent.click(screen.getByRole('button', { name: '批改/讲解' }));
    await waitFor(() => expect(actionCalls(fetchMock, 'submission.grade.run')).toHaveLength(2));
    await waitFor(() => expect(screen.getByText('全部完成')).toBeInTheDocument());
  }, 20_000);

  it('runs selected report generation actions with force enabled', async () => {
    const fetchMock = await renderSubmissionList();
    await selectVisibleSubmissions();

    fireEvent.click(screen.getByRole('button', { name: '生成报告' }));
    await waitFor(() =>
      expect(actionCalls(fetchMock, 'submission.report.generate')).toHaveLength(2),
    );
    const reportBodies = actionCalls(fetchMock, 'submission.report.generate').map(([, init]) =>
      JSON.parse(String((init as RequestInit).body || '{}')),
    );
    expect(reportBodies.map((body) => body.params)).toEqual([
      { force: true, submission_id: 1109 },
      { force: true, submission_id: 1110 },
    ]);
  }, 20_000);

  it('reruns OCR only for selected submissions with images and reports skipped failures', async () => {
    const fetchMock = await renderSubmissionList();
    await selectVisibleSubmissions();

    fireEvent.click(screen.getByRole('button', { name: '重新 OCR 并批改' }));
    fireEvent.click(await screen.findByRole('button', { name: /OK|确定/ }));

    await waitFor(() => expect(actionCalls(fetchMock, 'submission.ocr.rerun')).toHaveLength(1));
    const body = JSON.parse(
      String((actionCalls(fetchMock, 'submission.ocr.rerun')[0][1] as RequestInit).body || '{}'),
    );
    expect(body.params).toEqual({ submission_id: 1109 });
    expect(body.confirmation_id).toMatch(/^confirm-/);
    await waitFor(() => expect(screen.getAllByText(/失败 1/).length).toBeGreaterThan(0));
  }, 15_000);

  it('shows progress while downloading selected submission reports', async () => {
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:reports'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    });
    const fetchMock = await renderSubmissionList();
    await selectVisibleSubmissions();

    fireEvent.click(screen.getByRole('button', { name: '下载报告' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/askcore/workbench/submissions/reports/download',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    await waitFor(() => expect(screen.getByText('下载完成')).toBeInTheDocument());
  }, 15_000);

  it('prints selected submission reports through the batch print action', async () => {
    vi.spyOn(Modal, 'confirm').mockImplementation((config) => {
      void config.onOk?.();
      return { destroy: vi.fn(), update: vi.fn() } as never;
    });
    const fetchMock = await renderSubmissionList();
    await selectVisibleSubmissions();

    fireEvent.click(screen.getByRole('button', { name: '打印报告' }));

    await waitFor(() =>
      expect(actionCalls(fetchMock, 'submission.report.print_batch')).toHaveLength(1),
    );
    const body = JSON.parse(
      String(
        (actionCalls(fetchMock, 'submission.report.print_batch')[0][1] as RequestInit).body || '{}',
      ),
    );
    expect(body.params).toEqual({
      duplex: true,
      media: 'iso_a4_210x297mm',
      printer_id: 'printer-1',
      submission_ids: [1109, 1110],
    });
  }, 15_000);
});

describe('AskCoreWorkbenchRoute resource list loading states', () => {
  afterEach(() => {
    message.destroy();
    Modal.destroyAll();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const jsonResponse = (payload: unknown) =>
    new Response(JSON.stringify(payload), {
      headers: { 'content-type': 'application/json' },
      status: 200,
    });

  const listResponse = (resource: string, items: unknown[]) => ({
    has_more: false,
    items,
    next_after_id: null,
    page: 1,
    page_size: 20,
    resource,
    total: items.length,
  });

  const emptyListResponse = (resource = 'teachers') => listResponse(resource, []);

  const deferredResponse = () => {
    let resolve!: (value: Response) => void;
    const promise = new Promise<Response>((next) => {
      resolve = next;
    });
    return { promise, resolve };
  };

  const emptyLookupFetch = (url: string) => {
    if (url === '/api/askcore/organizations') {
      return activeOrganizationResponse();
    }
    if (url === '/api/askcore/workbench/organization/units') {
      return jsonResponse({ units: [] });
    }
    return jsonResponse(emptyListResponse());
  };

  it('builds distinguishable assignment options for submission OCR selection', () => {
    const option = buildSubmissionOcrAssignmentSelectOption({
      assignment_id: 502,
      grade_name: '高三',
      subject_name: '数学',
      title: '高三数学 2026-06-04 选择填空专项 B 卷',
    });

    expect(option).toEqual({
      assignmentMeta: '科目 数学 · 教学年级 高三 · ID 502',
      assignmentTitle: '高三数学 2026-06-04 选择填空专项 B 卷',
      label: '高三数学 2026-06-04 选择填空专项 B 卷 · 科目 数学 · 教学年级 高三 · ID 502',
      searchText: '高三数学 2026-06-04 选择填空专项 B 卷 科目 数学 · 教学年级 高三 · ID 502',
      title: '高三数学 2026-06-04 选择填空专项 B 卷 · 科目 数学 · 教学年级 高三 · ID 502',
      value: 502,
    });
  });

  it('keeps submission OCR layout stacked before narrow windows overlap controls', () => {
    expect(SUBMISSION_OCR_LAYOUT_BREAKPOINTS).toEqual({
      compactPageMaxWidth: 900,
      controlSingleColumnMaxWidth: 980,
      minimumUsableWidth: 420,
      splitWorkspaceStackMaxWidth: 1440,
    });
  });

  it('keeps resource list cards in row-major three-column flow', () => {
    expect(RESOURCE_LIST_LAYOUT).toEqual({
      columns: 3,
      flow: 'row-major',
      minimumCardWidth: '260px',
      mobileColumns: 1,
      scrollAxis: 'y',
      tabletColumns: 2,
    });
  });

  it('adds a question-bank OCR entrypoint without assignment publishing controls', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.startsWith('/api/askcore/workbench/questions?')) {
        return jsonResponse(listResponse('questions', []));
      }

      if (url === '/api/askcore/workbench/devices/scanners') {
        return jsonResponse({ default_scanner_id: null, items: [] });
      }

      return emptyLookupFetch(url);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter initialEntries={['/askcore/workbench?tab=questions']}>
        <AskCoreWorkbenchRoute />
      </MemoryRouter>,
    );

    const ocrButton = await screen.findByRole('button', { name: 'OCR 录入' });
    expect(screen.getByRole('button', { name: '手动新建' })).toBeInTheDocument();

    fireEvent.click(ocrButton);

    expect(await screen.findByText('OCR 录入题库')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '开始 OCR 录入题库' })).toBeInTheDocument();
    expect(screen.queryByText('发布范围')).not.toBeInTheDocument();
    expect(screen.queryByText('错题变式训练')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '开始 OCR 创建并发布' })).not.toBeInTheDocument();
  });

  it('renders P41 Gaokao question content in question list cards', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.startsWith('/api/askcore/workbench/questions?')) {
        return jsonResponse(
          listResponse('questions', [
            {
              answer: { raw_markdown: 'A', version: 'question.answer@gaokao.v1' },
              content: {
                assets: [],
                content_markdown: '已知函数 $f(x)=x^2+1$，求 $f(1)$。',
                options: [
                  { content_markdown: '$1$', label: 'A' },
                  { content_markdown: '$2$', label: 'B' },
                ],
                schema_ref: 'choice_question',
                subquestions: [],
                version: 'question.content@gaokao.v1',
              },
              grade_id: 3,
              grade_name: '高三',
              question_id: 481,
              question_type: '选择题',
              subject_id: 1002,
              subject_name: '数学',
            },
          ]),
        );
      }

      return emptyLookupFetch(url);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter initialEntries={['/askcore/workbench?tab=questions']}>
        <AskCoreWorkbenchRoute />
      </MemoryRouter>,
    );

    await waitFor(() => expect(document.body.textContent || '').toContain('已知函数'));
    expect(document.body.textContent || '').toContain('求');
    expect(document.body.textContent || '').not.toContain('[object Object]');
  });

  it('hides submission rows while an assignment tab request is still loading', async () => {
    const assignmentResponse = deferredResponse();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.startsWith('/api/askcore/workbench/submissions?')) {
        return jsonResponse(
          listResponse('submissions', [
            { status: 'graded', student_name: '张三', submission_id: 1109 },
            { status: 'graded', student_name: '李四', submission_id: 1110 },
          ]),
        );
      }

      if (url.startsWith('/api/askcore/workbench/assignments?')) {
        return assignmentResponse.promise;
      }

      return emptyLookupFetch(url);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter initialEntries={['/askcore/workbench?tab=submissions']}>
        <AskCoreWorkbenchRoute />
      </MemoryRouter>,
    );

    await screen.findAllByText('张三');
    expect(
      fetchMock.mock.calls.some(([input]) => {
        const url = String(input);
        return (
          url.startsWith('/api/askcore/workbench/submissions?') && url.includes('page_size=100')
        );
      }),
    ).toBe(true);

    fireEvent.click(screen.getAllByText('作业')[0]);
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([input]) =>
          String(input).startsWith('/api/askcore/workbench/assignments?'),
        ),
      ).toBe(true),
    );

    expect(screen.queryAllByText('张三')).toHaveLength(0);
    expect(screen.queryAllByText('李四')).toHaveLength(0);
    expect(screen.getByText('正在加载…')).toBeInTheDocument();

    assignmentResponse.resolve(
      jsonResponse(listResponse('assignments', [{ assignment_id: 501, title: '期中练习' }])),
    );

    expect(await screen.findAllByText('期中练习')).toHaveLength(2);
    expect(screen.queryByText('正在加载…')).not.toBeInTheDocument();
  });

  it('hides assignment rows while a question tab request is still loading', async () => {
    const questionResponse = deferredResponse();
    let assignmentCalls = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.startsWith('/api/askcore/workbench/assignments?')) {
        assignmentCalls += 1;
        return jsonResponse(listResponse('assignments', [{ assignment_id: 501, title: '旧作业' }]));
      }

      if (url.startsWith('/api/askcore/workbench/questions?')) {
        return questionResponse.promise;
      }

      return emptyLookupFetch(url);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter initialEntries={['/askcore/workbench?tab=assignments']}>
        <AskCoreWorkbenchRoute />
      </MemoryRouter>,
    );

    await screen.findAllByText('旧作业');
    await waitFor(() => expect(assignmentCalls).toBeGreaterThanOrEqual(1));

    fireEvent.click(screen.getByRole('radio', { name: '题目' }));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([input]) =>
          String(input).startsWith('/api/askcore/workbench/questions?'),
        ),
      ).toBe(true),
    );

    expect(screen.queryAllByText('旧作业')).toHaveLength(0);
    expect(screen.getByText('正在加载…')).toBeInTheDocument();

    questionResponse.resolve(
      jsonResponse(
        listResponse('questions', [
          { question_id: 301, question_type: 'short_answer', title: '压轴题' },
        ]),
      ),
    );

    expect(await screen.findAllByText('压轴题')).toHaveLength(1);
    expect(screen.queryByText('正在加载…')).not.toBeInTheDocument();
  });

  it('hides existing assignment rows while the current list is refreshing', async () => {
    const refreshResponse = deferredResponse();
    let assignmentCalls = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.startsWith('/api/askcore/workbench/assignments?')) {
        assignmentCalls += 1;
        if (assignmentCalls <= 2) {
          return jsonResponse(
            listResponse('assignments', [{ assignment_id: 501, title: '旧作业' }]),
          );
        }
        return refreshResponse.promise;
      }

      return emptyLookupFetch(url);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter initialEntries={['/askcore/workbench?tab=assignments']}>
        <AskCoreWorkbenchRoute />
      </MemoryRouter>,
    );

    await screen.findAllByText('旧作业');

    const callsBeforeRefresh = assignmentCalls;
    fireEvent.click(screen.getByRole('button', { name: /筛\s*选/ }));
    await waitFor(() => expect(assignmentCalls).toBeGreaterThan(callsBeforeRefresh));

    expect(screen.queryAllByText('旧作业')).toHaveLength(0);
    expect(screen.getByText('正在加载…')).toBeInTheDocument();

    refreshResponse.resolve(
      jsonResponse(listResponse('assignments', [{ assignment_id: 502, title: '新作业' }])),
    );

    expect(await screen.findAllByText('新作业')).toHaveLength(2);
    expect(screen.queryAllByText('旧作业')).toHaveLength(0);
  }, 15_000);
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
      invocation: {
        ...invocation,
        progress_stage: 'succeeded',
        question_failed: 1,
        question_succeeded: 3,
        state: 'succeeded',
      },
      notice: null,
      tracking: 'polling',
    });

    expect(summary.statusTitle).toBe('学生提交处理完成');
    expect(summary.progressLabel).toBe('已完成处理 4/4 份提交，剩余 0 份');
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

  it('labels submission OCR progress by completed and remaining submissions', () => {
    const summary = buildSubmissionOcrRunSummary({
      artifacts: [],
      busy: true,
      error: null,
      invocation: { ...invocation, current_question_order_index: 4 },
      notice: null,
      tracking: 'polling',
    });

    expect(summary.progressLabel).toBe('已完成处理 2/4 份提交，剩余 2 份');
  });

  it('does not describe a fully counted running submission OCR batch as still processing every submission', () => {
    const summary = buildSubmissionOcrRunSummary({
      artifacts: [],
      busy: true,
      error: null,
      invocation: {
        ...invocation,
        question_failed: 0,
        question_succeeded: 24,
        question_total: 24,
        state: 'running',
      },
      notice: null,
      tracking: 'polling',
    });

    expect(summary.progressLabel).toBe('已完成处理 24/24 份提交，剩余 0 份');
    expect(summary.progressLabel).not.toContain('正在处理 24/24 份提交');
  });
});
