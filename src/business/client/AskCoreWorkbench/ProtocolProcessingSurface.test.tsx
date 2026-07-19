import { ConfigProvider } from '@lobehub/ui';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as m from 'motion/react-m';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import enUS from '../../../../locales/en-US/common.json';
import zhCN from '../../../../locales/zh-CN/common.json';
import { ProtocolProcessingSurface } from './ProtocolProcessingSurface';

const messageMock = vi.hoisted(() => ({
  success: vi.fn(),
}));

const localeState = vi.hoisted(() => ({
  messages: {} as Record<string, string>,
}));
const captureT = vi.hoisted(
  () =>
    (key: string, options: Record<string, unknown> = {}) =>
      (localeState.messages[key] || key).replaceAll(/\{\{(\w+)\}\}/g, (_, name: string) =>
        String(options[name] ?? ''),
      ),
);

const localStorageText = () =>
  Array.from({ length: window.localStorage.length }, (_, index) => {
    const key = window.localStorage.key(index);
    return key ? `${key}\n${window.localStorage.getItem(key) || ''}` : '';
  }).join('\n');

vi.mock('@/components/AntdStaticMethods', () => ({ message: messageMock }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: captureT,
  }),
}));

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
  expires_at: '2099-07-11T12:00:00Z',
  processing_state: 'succeeded',
  run_kind: 'submission',
};

const captureContextPayload = {
  ...contextPayload,
  capabilities: {
    ...contextPayload.capabilities,
    can_capture_student_submission: true,
    can_edit: false,
    can_generate_report: false,
    can_grade: false,
    can_list_scanners: true,
    can_run_ocr: false,
    can_start_capture: true,
  },
  context_kind: 'capture',
  purpose: 'student_submission',
  processing_state: 'waiting_capture',
  return_url:
    'https://moodle.example.edu/mod/assign/submission/askcorescan/import.php?state=return-state',
  run_kind: 'capture',
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
  beforeEach(() => {
    localeState.messages = zhCN;
    window.localStorage.clear();
  });

  afterEach(() => {
    messageMock.success.mockReset();
    vi.unstubAllGlobals();
  });

  it('ships aligned English and Simplified Chinese processing labels', () => {
    const englishKeys = Object.keys(enUS).filter((key) => key.startsWith('askcoreProcessing.'));
    const chineseKeys = Object.keys(zhCN).filter((key) => key.startsWith('askcoreProcessing.'));

    expect(chineseKeys.sort()).toEqual(englishKeys.sort());
    expect(enUS['askcoreProcessing.editor.title']).toBe('Assisted grading');
    expect(enUS['askcoreProcessing.editor.error.invalidContext']).toMatch(/invalid or expired/i);
    expect(enUS['askcoreProcessing.capture.help.source']).toMatch(/flatbed/i);
    expect(enUS['askcoreProcessing.capture.help.backRotation']).toMatch(/reverse pages/i);
    expect(enUS['askcoreProcessing.capture.error.conflict']).toMatch(/state changed/i);
    expect(enUS['askcoreProcessing.capture.failure.paperJam']).toMatch(/paper jam/i);
    expect(zhCN['askcoreProcessing.editor.title']).toBe('智能批改');
    expect(zhCN['askcoreProcessing.editor.error.invalidContext']).toContain('会话已过期');
    expect(zhCN['askcoreProcessing.capture.help.source']).toContain('自动进纸器');
    expect(zhCN['askcoreProcessing.capture.help.backRotation']).toContain('背页倒置');
    expect(zhCN['askcoreProcessing.capture.error.conflict']).toContain('状态已发生变化');
    expect(zhCN['askcoreProcessing.capture.failure.paperJam']).toContain('卡纸');
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
          JSON.stringify({
            artifact_id: artifactId,
            content: surfacePayload().result.content,
          }),
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

    fireEvent.change(screen.getByLabelText('第 1 题得分'), {
      target: { value: '3' },
    });
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
      await screen.findByText(zhCN['askcoreProcessing.editor.error.invalidContext']),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Missing active organization in LobeHub assertion'),
    ).not.toBeInTheDocument();
  });

  it('renders only device-reported capture options with localized explanations and no page limit', async () => {
    const user = userEvent.setup();
    localeState.messages = enUS;
    let scannerAvailable = true;
    let scannerFetchCount = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/askcore/lti/processing/context') {
        return Response.json(captureContextPayload);
      }
      if (url === '/api/askcore/lti/processing/capture/scanners') {
        scannerFetchCount += 1;
        return Response.json({
          scanners: scannerAvailable
            ? [
                {
                  capabilities: {
                    document_formats: ['image/jpeg'],
                    input_sources: ['platen', 'adf_simplex', 'adf_duplex'],
                    media: ['A4', 'B5'],
                  },
                  device_assistant_name: '办公室电脑',
                  display_name: '办公室扫描仪',
                  online: true,
                  protocol: 'escl',
                  scanner_ref:
                    scannerFetchCount === 1 ? 'opaque-scanner-ref' : 'opaque-scanner-ref-fresh',
                },
                {
                  capabilities: {
                    document_formats: ['image/jpeg'],
                    input_sources: ['platen', 'adf_simplex', 'adf_duplex'],
                    media: ['A4', 'B5'],
                  },
                  device_assistant_name: '备用笔记本',
                  display_name: '办公室扫描仪',
                  online: true,
                  protocol: 'escl',
                  scanner_ref:
                    scannerFetchCount === 1 ? 'opaque-scanner-ref-2' : 'opaque-scanner-ref-2-fresh',
                },
              ]
            : [],
        });
      }
      if (url === '/api/askcore/lti/processing/capture/jobs' && init?.method === 'POST') {
        return Response.json(
          {
            capture_id: 'capture-1',
            capture_state: 'continuation_required',
            committed_page_count: 200,
            continuation: { next_page_order: 201, next_segment_index: 2 },
            failure: null,
            first_page_order: 1,
            purpose: 'student_submission',
            receipt: null,
            segment_index: 1,
            status: 'completed',
          },
          { status: 201 },
        );
      }
      if (url === '/api/askcore/lti/processing/capture/jobs/capture-1' && !init?.method) {
        return Response.json({
          capture_id: 'capture-1',
          capture_state: 'continuation_required',
          committed_page_count: 200,
          continuation: { next_page_order: 201, next_segment_index: 2 },
          failure: null,
          first_page_order: 1,
          purpose: 'student_submission',
          receipt: null,
          segment_index: 1,
          status: 'completed',
        });
      }
      if (
        url === '/api/askcore/lti/processing/capture/jobs/capture-1/continue' &&
        init?.method === 'POST'
      ) {
        return Response.json({
          capture_id: 'capture-2',
          capture_state: 'completed',
          committed_page_count: 201,
          continuation: null,
          failure: null,
          first_page_order: 201,
          purpose: 'student_submission',
          receipt: 'receipt-token',
          segment_index: 2,
          status: 'completed',
        });
      }
      if (url === '/api/askcore/lti/processing/capture/jobs/capture-2' && !init?.method) {
        return Response.json({
          capture_id: 'capture-2',
          capture_state: 'completed',
          committed_page_count: 201,
          continuation: null,
          failure: null,
          first_page_order: 201,
          purpose: 'student_submission',
          receipt: 'receipt-token',
          segment_index: 2,
          status: 'completed',
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const firstView = render(
      <ConfigProvider motion={m}>
        <ProtocolProcessingSurface />
      </ConfigProvider>,
    );

    expect(await screen.findByRole('heading', { name: 'Scan assignment' })).toBeInTheDocument();
    expect(screen.getByText(/Scan source chooses the flatbed/)).toBeInTheDocument();
    expect(screen.getByText(/Back-side rotation corrects upside-down/)).toBeInTheDocument();
    await user.click(screen.getByRole('combobox', { name: 'Scanner' }));
    expect(
      await screen.findByRole('option', { name: '办公室扫描仪 · 办公室电脑' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '办公室扫描仪 · 备用笔记本' })).toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: '办公室扫描仪 · 备用笔记本' }));
    fireEvent.click(screen.getByRole('combobox', { name: 'Paper size' }));
    expect(await screen.findByRole('option', { name: 'A4' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'B5' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'A3' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/maximum pages/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/max_pages/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Start scan' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/askcore/lti/processing/capture/jobs',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    const startCall = fetchMock.mock.calls.find(
      ([input, init]) =>
        String(input) === '/api/askcore/lti/processing/capture/jobs' && init?.method === 'POST',
    );
    const startBody = String(startCall?.[1]?.body || '');
    expect(startBody).toContain('"scanner_ref":"opaque-scanner-ref-2"');
    expect(startBody).not.toMatch(/scanner_id|max_pages/i);
    expect(scannerFetchCount).toBe(1);
    expect(await screen.findByRole('button', { name: 'Continue scanning' })).toBeInTheDocument();
    await waitFor(() => {
      const persisted = localStorageText();
      expect(persisted).toContain('capture-1');
      expect(persisted).not.toContain('receipt-token');
      expect(persisted).not.toContain('return-state');
      expect(persisted).not.toMatch(/receipt|ticket/i);
    });
    expect(
      screen.queryByRole('link', { name: 'Return to Moodle and import draft' }),
    ).not.toBeInTheDocument();

    firstView.unmount();
    const continuationView = render(
      <ConfigProvider motion={m}>
        <ProtocolProcessingSurface />
      </ConfigProvider>,
    );
    expect(await screen.findByRole('button', { name: 'Continue scanning' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/askcore/lti/processing/capture/jobs/capture-1',
      expect.anything(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Continue scanning' }));
    const returnLink = await screen.findByRole('link', {
      name: 'Return to Moodle and import draft',
    });
    expect(returnLink).toHaveAttribute(
      'href',
      'https://moodle.example.edu/mod/assign/submission/askcorescan/import.php?state=return-state&receipt=receipt-token',
    );
    await waitFor(() => {
      const persisted = localStorageText();
      expect(persisted).toContain('capture-2');
      expect(persisted).not.toContain('receipt-token');
      expect(persisted).not.toContain('return-state');
      expect(persisted).not.toMatch(/receipt|ticket/i);
    });

    returnLink.addEventListener('click', (event) => event.preventDefault());
    fireEvent.click(returnLink);
    expect(localStorageText()).toContain('capture-2');
    expect(localStorageText()).not.toMatch(/receipt|ticket|return-state/i);

    continuationView.unmount();
    scannerAvailable = false;
    render(
      <ConfigProvider motion={m}>
        <ProtocolProcessingSurface />
      </ConfigProvider>,
    );
    expect(
      await screen.findByRole('link', {
        name: 'Return to Moodle and import draft',
      }),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/askcore/lti/processing/capture/jobs/capture-2',
      expect.anything(),
    );
  }, 15_000);

  it.each([
    [404, 'askcoreProcessing.capture.error.expired'],
    [409, 'askcoreProcessing.capture.error.conflict'],
    [410, 'askcoreProcessing.capture.error.expired'],
  ] as const)(
    'localizes capture HTTP %s without exposing the backend detail',
    async (status, messageKey) => {
      const backendDetail = `backend capture detail ${status}`;
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === '/api/askcore/lti/processing/context') {
          return Response.json(captureContextPayload);
        }
        if (url === '/api/askcore/lti/processing/capture/scanners') {
          return Response.json({
            scanners: [
              {
                capabilities: {
                  document_formats: ['image/jpeg'],
                  input_sources: ['platen'],
                  media: ['A4'],
                },
                device_assistant_name: 'Test helper',
                display_name: 'Test scanner',
                online: true,
                protocol: 'escl',
                scanner_ref: 'localized-error-scanner-ref',
              },
            ],
          });
        }
        if (url === '/api/askcore/lti/processing/capture/jobs' && init?.method === 'POST') {
          return Response.json({ detail: backendDetail }, { status });
        }
        throw new Error(`unexpected fetch: ${url}`);
      });
      vi.stubGlobal('fetch', fetchMock);

      render(
        <ConfigProvider motion={m}>
          <ProtocolProcessingSurface />
        </ConfigProvider>,
      );

      fireEvent.click(await screen.findByRole('button', { name: '开始扫描' }));
      const localized = (zhCN as Record<string, string>)[messageKey];
      expect(await screen.findByText(localized)).toBeInTheDocument();
      expect(screen.queryByText(backendDetail)).not.toBeInTheDocument();
    },
  );

  it('starts the exact opaque scanner reference when scanner labels are duplicated', async () => {
    localeState.messages = enUS;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/askcore/lti/processing/context') {
        return Response.json(captureContextPayload);
      }
      if (url === '/api/askcore/lti/processing/capture/scanners') {
        const scanner = {
          capabilities: {
            document_formats: ['image/jpeg'],
            input_sources: ['platen'],
            media: ['A4'],
          },
          device_assistant_name: '共享电脑',
          display_name: '同名扫描仪',
          online: true,
          protocol: 'escl',
        };
        return Response.json({
          scanners: [
            { ...scanner, scanner_ref: 'exact-ref-1' },
            { ...scanner, scanner_ref: 'exact-ref-2' },
          ],
        });
      }
      if (url === '/api/askcore/lti/processing/capture/jobs' && init?.method === 'POST') {
        return Response.json(
          {
            capture_id: 'duplicate-label-capture',
            capture_state: 'capturing',
            committed_page_count: 0,
            continuation: null,
            failure: null,
            first_page_order: 1,
            purpose: 'student_submission',
            receipt: null,
            segment_index: 1,
            status: 'queued',
          },
          { status: 201 },
        );
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <ConfigProvider motion={m}>
        <ProtocolProcessingSurface />
      </ConfigProvider>,
    );

    await userEvent.click(await screen.findByRole('combobox', { name: 'Scanner' }));
    const duplicateOptions = await screen.findAllByRole('option', {
      name: '同名扫描仪 · 共享电脑',
    });
    await userEvent.click(duplicateOptions[1]);
    const startButton = await screen.findByRole('button', { name: 'Start scan' });
    fireEvent.click(startButton);

    await waitFor(() => {
      const startCall = fetchMock.mock.calls.find(
        ([input, request]) =>
          String(input) === '/api/askcore/lti/processing/capture/jobs' &&
          request?.method === 'POST',
      );
      expect(String(startCall?.[1]?.body || '')).toContain('"scanner_ref":"exact-ref-2"');
    });
    expect(
      screen.queryByText(enUS['askcoreProcessing.capture.error.start']),
    ).not.toBeInTheDocument();
  });

  it.each([
    ['scanner.paper_jam', 'askcoreProcessing.capture.failure.paperJam'],
    ['scanner.unmapped_failure', 'askcoreProcessing.capture.failure.generic'],
  ] as const)(
    'localizes capture failure code %s without exposing the device message',
    async (failureCode, messageKey) => {
      const deviceMessage = `raw device failure for ${failureCode}`;
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === '/api/askcore/lti/processing/context') {
          return Response.json(captureContextPayload);
        }
        if (url === '/api/askcore/lti/processing/capture/scanners') {
          return Response.json({
            scanners: [
              {
                capabilities: {
                  document_formats: ['image/jpeg'],
                  input_sources: ['platen'],
                  media: ['A4'],
                },
                device_assistant_name: 'Test helper',
                display_name: 'Test scanner',
                online: true,
                protocol: 'escl',
                scanner_ref: 'failure-code-scanner-ref',
              },
            ],
          });
        }
        if (url === '/api/askcore/lti/processing/capture/jobs' && init?.method === 'POST') {
          return Response.json(
            {
              capture_id: 'capture-failed',
              capture_state: null,
              committed_page_count: 0,
              continuation: null,
              failure: { code: failureCode, message: deviceMessage },
              first_page_order: 1,
              purpose: 'student_submission',
              receipt: null,
              segment_index: 1,
              status: 'failed',
            },
            { status: 201 },
          );
        }
        throw new Error(`unexpected fetch: ${url}`);
      });
      vi.stubGlobal('fetch', fetchMock);

      render(
        <ConfigProvider motion={m}>
          <ProtocolProcessingSurface />
        </ConfigProvider>,
      );

      fireEvent.click(await screen.findByRole('button', { name: '开始扫描' }));
      const localized = (zhCN as Record<string, string>)[messageKey];
      expect(await screen.findByText(localized)).toBeInTheDocument();
      expect(screen.queryByText(deviceMessage)).not.toBeInTheDocument();
    },
  );

  it('selects and hides the only physical source reported by a platen-only scanner', async () => {
    localeState.messages = enUS;
    window.localStorage.setItem(
      'askcore.lti.capture.v1.expired',
      JSON.stringify({
        binding_fingerprint: 'expired',
        capture_id: 'capture-expired',
        context_expires_at: Date.now() - 1,
        saved_at: Date.now() - 1000,
        version: 1,
      }),
    );
    let restoredStatusCode: number | undefined;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/askcore/lti/processing/context') {
        return Response.json(captureContextPayload);
      }
      if (url === '/api/askcore/lti/processing/capture/scanners') {
        return Response.json({
          scanners: [
            {
              capabilities: {
                document_formats: ['image/jpeg'],
                input_sources: ['platen'],
                media: ['A4'],
              },
              device_assistant_name: '学生笔记本',
              display_name: '平板扫描仪',
              online: true,
              protocol: 'escl',
              scanner_ref: 'platen-scanner-ref',
            },
          ],
        });
      }
      if (url === '/api/askcore/lti/processing/capture/jobs' && init?.method === 'POST') {
        return Response.json(
          {
            capture_id: 'capture-platen',
            capture_state: null,
            committed_page_count: 0,
            continuation: null,
            failure: null,
            first_page_order: 1,
            purpose: 'student_submission',
            receipt: null,
            segment_index: 1,
            status: 'pending',
          },
          { status: 201 },
        );
      }
      if (url === '/api/askcore/lti/processing/capture/jobs/capture-platen' && !init?.method) {
        if (restoredStatusCode) {
          return Response.json(
            { detail: 'backend status detail must stay hidden' },
            { status: restoredStatusCode },
          );
        }
        return Response.json({
          capture_id: 'capture-platen',
          capture_state: null,
          committed_page_count: 0,
          continuation: null,
          failure: null,
          first_page_order: 1,
          purpose: 'student_submission',
          receipt: null,
          segment_index: 1,
          status: 'pending',
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const firstView = render(
      <ConfigProvider motion={m}>
        <ProtocolProcessingSurface />
      </ConfigProvider>,
    );

    expect(await screen.findByRole('heading', { name: 'Scan assignment' })).toBeInTheDocument();
    expect(window.localStorage.getItem('askcore.lti.capture.v1.expired')).toBeNull();
    await waitFor(() =>
      expect(screen.queryByRole('combobox', { name: 'Scan source' })).not.toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Start scan' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/askcore/lti/processing/capture/jobs',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    const startCall = fetchMock.mock.calls.find(
      ([input, init]) =>
        String(input) === '/api/askcore/lti/processing/capture/jobs' && init?.method === 'POST',
    );
    expect(JSON.parse(String(startCall?.[1]?.body || '{}'))).toMatchObject({
      duplex: false,
      input_source_mode: 'platen',
    });

    await waitFor(() => expect(localStorageText()).toContain('capture-platen'));
    firstView.unmount();
    const resumedView = render(
      <ConfigProvider motion={m}>
        <ProtocolProcessingSurface />
      </ConfigProvider>,
    );
    expect(
      await screen.findByText(enUS['askcoreProcessing.capture.status.pending']),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/askcore/lti/processing/capture/jobs/capture-platen',
      expect.anything(),
    );

    resumedView.unmount();
    restoredStatusCode = 403;
    const otherAccountView = render(
      <ConfigProvider motion={m}>
        <ProtocolProcessingSurface />
      </ConfigProvider>,
    );
    await screen.findByText(enUS['askcoreProcessing.capture.error.status']);
    expect(localStorageText()).toContain('capture-platen');

    otherAccountView.unmount();
    restoredStatusCode = undefined;
    const originalAccountView = render(
      <ConfigProvider motion={m}>
        <ProtocolProcessingSurface />
      </ConfigProvider>,
    );
    expect(
      await screen.findByText(enUS['askcoreProcessing.capture.status.pending']),
    ).toBeInTheDocument();
    expect(localStorageText()).toContain('capture-platen');

    originalAccountView.unmount();
    restoredStatusCode = 404;
    render(
      <ConfigProvider motion={m}>
        <ProtocolProcessingSurface />
      </ConfigProvider>,
    );
    await screen.findByText(enUS['askcoreProcessing.capture.error.expired']);
    await waitFor(() => expect(localStorageText()).not.toContain('capture-platen'));
  });
});
