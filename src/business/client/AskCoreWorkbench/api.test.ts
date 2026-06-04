import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AskCoreWorkbenchApiClient,
  AskCoreWorkbenchApiError,
  askCoreWorkbenchDashboardUrl,
  askCoreWorkbenchItemUrl,
  askCoreWorkbenchOrganizationUrl,
  askCoreWorkbenchResourceUrl,
  fetchAskCoreWorkbenchJson,
  isAskCoreWorkbenchDeleteNotFound,
} from './api';

describe('AskCoreWorkbench API', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('routes first-party workbench requests through the LobeHub proxy', () => {
    expect(askCoreWorkbenchDashboardUrl()).toBe('/api/askcore/workbench/dashboard');
    expect(askCoreWorkbenchOrganizationUrl()).toBe('/api/askcore/organizations');
    expect(askCoreWorkbenchResourceUrl('schools', 2, 20)).toBe(
      '/api/askcore/workbench/schools?include_total=true&page=2&page_size=20',
    );
    expect(askCoreWorkbenchItemUrl('students', 201)).toBe(
      '/api/askcore/workbench/students/201',
    );
  });

  it('does not fetch plugin-auth tokens or send browser bearer tokens', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get('Authorization')).toBeNull();
      if (String(input) === '/api/askcore/organizations') {
        return new Response(
          JSON.stringify({
            current: {
              id: 'org-1',
              isActive: true,
              name: 'AskCore School',
              role: 'owner',
              slug: 'askcore-school',
            },
            organizations: [
              {
                id: 'org-1',
                isActive: true,
                name: 'AskCore School',
                role: 'owner',
                slug: 'askcore-school',
              },
            ],
          }),
          {
            headers: { 'content-type': 'application/json' },
            status: 200,
          },
        );
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchAskCoreWorkbenchJson('/api/askcore/workbench/dashboard')).resolves.toEqual({
      ok: true,
    });
    const client = new AskCoreWorkbenchApiClient();
    await expect(client.getOrganizationState()).resolves.toMatchObject({
      organization: {
        is_active: true,
        name: 'AskCore School',
        organization_id: 'org-1',
        role: 'owner',
      },
      organization_role: 'owner',
      organizations: [{ organization_id: 'org-1' }],
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [input, init] = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit | undefined];
    expect(String(input)).toBe('/api/askcore/workbench/dashboard');
    expect(init?.credentials).toBe('include');
    const [organizationInput, organizationInit] = fetchMock.mock.calls[1] as [
      RequestInfo | URL,
      RequestInit | undefined,
    ];
    expect(String(organizationInput)).toBe('/api/askcore/organizations');
    expect(organizationInit?.credentials).toBe('include');
  });

  it('builds cursor pagination requests for infinite resource lists', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe(
        '/api/askcore/workbench/schools?include_total=false&page=1&page_size=20&after_id=42&filters=%7B%22province%22%3A%22%E5%8C%97%E4%BA%AC%22%7D',
      );
      return new Response(
        JSON.stringify({
          has_more: false,
          items: [{ school_id: 43 }],
          next_after_id: null,
        }),
        {
          headers: { 'content-type': 'application/json' },
          status: 200,
        },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new AskCoreWorkbenchApiClient();
    await expect(
      client.listResource(
        'schools',
        { province: '北京' },
        { afterId: 42, includeTotal: false, pageSize: 20 },
      ),
    ).resolves.toMatchObject({
      has_more: false,
      items: [{ school_id: 43 }],
      next_after_id: null,
    });
  });

  it('builds first-party action, invocation, preview, and report requests', async () => {
    const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push([input, init]);
      const url = String(input);
      if (url.includes('/files/preview')) {
        return new Response(new Blob(['pdf']), {
          headers: {
            'content-disposition': 'attachment; filename="report.pdf"',
            'content-type': 'application/pdf',
          },
          status: 200,
        });
      }
      if (url.includes('/submissions/reports/download')) {
        return new Response(new Blob(['zip']), {
          headers: { 'content-type': 'application/zip' },
          status: 200,
        });
      }
      return new Response(
        JSON.stringify({
          action_id: 'submission.report.generate',
          invocation_id: 'inv-1',
          plugin_id: 'aitutor-suite',
          run_id: 1,
          status: 'accepted',
        }),
        {
          headers: { 'content-type': 'application/json' },
          status: 200,
        },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new AskCoreWorkbenchApiClient();
    await client.invokeAction('submission.report.generate', { submission_id: 12 });
    await client.fetchPreviewBlob('uploads/org/report.pdf');
    await client.downloadSubmissionReportsZip([12, 13]);

    expect(String(calls[0][0])).toBe(
      '/api/askcore/workbench/actions/submission.report.generate',
    );
    expect(String(calls[1][0])).toContain('/api/askcore/workbench/files/preview?object_key=');
    expect(String(calls[2][0])).toBe(
      '/api/askcore/workbench/submissions/reports/download',
    );
    expect(client.getInvocationStreamUrl('inv-1')).toBe(
      '/api/askcore/workbench/invocations/inv-1/stream',
    );
    for (const [, init] of calls) {
      expect(new Headers(init?.headers).get('Authorization')).toBeNull();
    }
  });

  it('treats missing delete targets as idempotent completion', () => {
    expect(isAskCoreWorkbenchDeleteNotFound(new AskCoreWorkbenchApiError('Submission not found', 400))).toBe(
      true,
    );
    expect(isAskCoreWorkbenchDeleteNotFound(new AskCoreWorkbenchApiError('Entity not found', 404))).toBe(
      true,
    );
    expect(isAskCoreWorkbenchDeleteNotFound(new AskCoreWorkbenchApiError('Permission denied', 403))).toBe(
      false,
    );
  });

  it('reports progress while downloading submission report ZIPs when content length is known', async () => {
    const progress: Array<{ loaded: number; percent: number | null; phase: string }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response('zip', {
          headers: {
            'content-length': '3',
            'content-type': 'application/zip',
          },
          status: 200,
        }),
      ),
    );

    const client = new AskCoreWorkbenchApiClient();
    await client.downloadSubmissionReportsZip([12, 13], {
      onProgress: (item) =>
        progress.push({ loaded: item.loaded, percent: item.percent, phase: item.phase }),
    });

    expect(progress[0]).toEqual({ loaded: 0, percent: 0, phase: 'downloading' });
    expect(progress.at(-1)).toEqual({ loaded: 3, percent: 100, phase: 'completed' });
  });
});
