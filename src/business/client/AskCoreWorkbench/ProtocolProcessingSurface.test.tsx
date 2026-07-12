import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ProtocolProcessingSurface } from './ProtocolProcessingSurface';

const messageMock = vi.hoisted(() => ({
  success: vi.fn(),
}));

vi.mock('@/components/AntdStaticMethods', () => ({ message: messageMock }));

const contextPayload = {
  account_link_required: false,
  account_linked: true,
  capabilities: {
    can_edit: true,
    can_generate_report: true,
    can_grade: true,
    can_link_account: false,
    can_preview: true,
    can_run_ocr: true,
  },
  context_kind: 'processing',
  expires_at: '2026-07-11T12:00:00Z',
  processing_state: 'succeeded',
};

const surfacePayload = (artifactId = 'grading-1') => ({
  context: contextPayload,
  inputs: [
    {
      content_type: 'image/png',
      kind: 'reference',
      page_order: 1,
      preview_url: '/api/askcore/lti/processing/current/inputs/reference-1/preview',
      slot_id: 'reference-1',
    },
    {
      content_type: 'application/pdf',
      kind: 'response',
      page_order: 1,
      preview_url: '/api/askcore/lti/processing/current/inputs/response-1/preview',
      slot_id: 'response-1',
    },
  ],
  report: { artifact_id: null, available: false },
  result: {
    artifact_id: artifactId,
    content: {
      questions: [
        {
          feedback: '检查符号',
          is_correct: false,
          max_score: 5,
          order_index: 1,
          question_content: { text: '计算结果' },
          question_number: '1',
          question_type: '解答题',
          score: 2,
          student_answer: 'x=2',
        },
      ],
      score: 2,
      teacher_summary: '',
      total_score: 5,
    },
  },
});

describe('ProtocolProcessingSurface', () => {
  afterEach(() => {
    messageMock.success.mockReset();
    vi.unstubAllGlobals();
  });

  it('renders only processing controls and saves an identifier-free revision', async () => {
    let artifactId = 'grading-1';
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/askcore/lti/processing/context') {
        return new Response(JSON.stringify(contextPayload), {
          headers: { 'content-type': 'application/json' },
          status: 200,
        });
      }
      if (url === '/api/askcore/lti/processing/current' && !init?.method) {
        return new Response(JSON.stringify(surfacePayload(artifactId)), {
          headers: { 'content-type': 'application/json' },
          status: 200,
        });
      }
      if (url === '/api/askcore/lti/processing/current/result' && init?.method === 'PATCH') {
        artifactId = 'grading-2';
        return new Response(
          JSON.stringify({ artifact_id: artifactId, content: surfacePayload().result.content }),
          { headers: { 'content-type': 'application/json' }, status: 200 },
        );
      }
      if (url === '/api/askcore/lti/processing/current/report' && init?.method === 'POST') {
        return new Response(
          JSON.stringify({
            artifact_id: 'report-1',
            created: true,
            source_artifact_id: artifactId,
          }),
          { headers: { 'content-type': 'application/json' }, status: 201 },
        );
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<ProtocolProcessingSurface />);

    expect(await screen.findByRole('heading', { name: '智能批改' })).toBeInTheDocument();
    expect(screen.getByLabelText('预览内容')).toBeInTheDocument();
    expect(screen.getByLabelText('第 1 题 OCR 文本')).toHaveValue('x=2');
    for (const retired of ['创建作业', '提交作业', '班级', '组织', '截止时间']) {
      expect(screen.queryByText(retired)).not.toBeInTheDocument();
    }

    fireEvent.change(screen.getByLabelText('第 1 题得分'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: '保存修订' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/askcore/lti/processing/current/result',
        expect.objectContaining({ method: 'PATCH' }),
      ),
    );
    const revisionCall = fetchMock.mock.calls.find(
      ([input, init]) =>
        String(input) === '/api/askcore/lti/processing/current/result' && init?.method === 'PATCH',
    );
    const body = String(revisionCall?.[1]?.body || '');
    expect(body).toContain('expected_latest_artifact_id');
    expect(body).not.toMatch(
      /"(?:assignment|submission|student|course|class|organization)(?:_id)?"\s*:/i,
    );

    await waitFor(() => {
      const alert = screen.queryByRole('alert');
      if (alert) throw new Error(`processing alert: ${alert.textContent}`);
      expect(screen.getByRole('button', { name: '生成报告' })).toBeEnabled();
    });
    fireEvent.click(screen.getByRole('button', { name: '生成报告' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/askcore/lti/processing/current/report',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
  });

  it('fails closed when the school identity is not linked', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ...contextPayload,
            account_link_required: true,
            account_linked: false,
            context_kind: 'account_link_required',
          }),
          { headers: { 'content-type': 'application/json' }, status: 200 },
        ),
      ),
    );

    render(<ProtocolProcessingSurface />);

    expect(await screen.findByText('学校身份尚未绑定到当前账号')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '保存修订' })).not.toBeInTheDocument();
  });

  it('shows an actionable message instead of a backend error for an invalid context', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json(
          { detail: 'Missing active organization in LobeHub assertion' },
          {
            status: 401,
          },
        ),
      ),
    );

    render(<ProtocolProcessingSurface />);

    expect(
      await screen.findByText('处理链接无效或会话已过期，请返回教学中心重新打开'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Missing active organization in LobeHub assertion'),
    ).not.toBeInTheDocument();
  });
});
