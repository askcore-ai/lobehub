import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  askCoreWorkbenchDashboardUrl,
  askCoreWorkbenchItemUrl,
  askCoreWorkbenchResourceUrl,
  fetchAskCoreWorkbenchJson,
} from './api';

describe('AskCoreWorkbench API', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('routes first-party workbench requests through the LobeHub proxy', () => {
    expect(askCoreWorkbenchDashboardUrl()).toBe('/api/askcore/workbench/dashboard');
    expect(askCoreWorkbenchResourceUrl('schools', 2, 20)).toBe(
      '/api/askcore/workbench/schools?include_total=true&page=2&page_size=20',
    );
    expect(askCoreWorkbenchItemUrl('students', 201)).toBe(
      '/api/askcore/workbench/students/201',
    );
  });

  it('does not fetch plugin-auth tokens or send browser bearer tokens', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get('Authorization')).toBeNull();
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchAskCoreWorkbenchJson('/api/askcore/workbench/dashboard')).resolves.toEqual({
      ok: true,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [input, init] = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit | undefined];
    expect(String(input)).toBe('/api/askcore/workbench/dashboard');
    expect(init?.credentials).toBe('include');
  });
});
