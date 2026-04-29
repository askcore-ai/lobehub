'use client';

import { ASKCORE_WORKBENCH_PLUGIN_ID } from './config';
import { type AskCoreWorkbenchDashboardPayload, type AskCoreWorkbenchListPayload } from './types';

const TOKEN_URL = '/api/plugin-auth/v1/token';

export class AskCoreWorkbenchApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'AskCoreWorkbenchApiError';
    this.status = status;
  }
}

const readErrorMessage = async (response: Response) => {
  try {
    const payload = await response.json();
    return payload?.detail || payload?.message || response.statusText;
  } catch {
    return response.statusText;
  }
};

export const fetchAskCorePluginToken = async () => {
  const response = await fetch(TOKEN_URL, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new AskCoreWorkbenchApiError(await readErrorMessage(response), response.status);
  }

  const payload = await response.json();
  const token = String(payload?.access_token || '').trim();
  if (!token) throw new AskCoreWorkbenchApiError('Missing plugin access token', response.status);
  return token;
};

export const fetchAskCoreWorkbenchJson = async <T>(
  path: string,
  token: string,
  refreshToken: () => Promise<string>,
  retried = false,
): Promise<T> => {
  const response = await fetch(path, {
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });

  if (response.status === 401 && !retried) {
    const refreshedToken = await refreshToken();
    return fetchAskCoreWorkbenchJson<T>(path, refreshedToken, refreshToken, true);
  }

  if (!response.ok) {
    throw new AskCoreWorkbenchApiError(await readErrorMessage(response), response.status);
  }

  return response.json() as Promise<T>;
};

export const askCoreWorkbenchResourceUrl = (resource: string, page: number, pageSize: number) => {
  const params = new URLSearchParams({
    include_total: 'true',
    page: String(page),
    page_size: String(pageSize),
  });
  return `/api/lobe/plugins/v1/${ASKCORE_WORKBENCH_PLUGIN_ID}/ui/${resource}?${params.toString()}`;
};

export const askCoreWorkbenchItemUrl = (resource: string, entityId: string | number) =>
  `/api/lobe/plugins/v1/${ASKCORE_WORKBENCH_PLUGIN_ID}/ui/${resource}/${entityId}`;

export const askCoreWorkbenchDashboardUrl = () =>
  `/api/lobe/plugins/v1/${ASKCORE_WORKBENCH_PLUGIN_ID}/ui/dashboard`;

export const emptyAskCoreWorkbenchList = (
  resource: string,
  page: number,
  pageSize: number,
): AskCoreWorkbenchListPayload => ({
  has_more: false,
  items: [],
  page,
  page_size: pageSize,
  resource,
  total: 0,
});

export const emptyAskCoreWorkbenchDashboard = (): AskCoreWorkbenchDashboardPayload => ({
  active_invocations: [],
  counts: {},
  drafts: [],
  recent_invocations: [],
});
