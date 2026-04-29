'use client';

import { type AskCoreWorkbenchDashboardPayload, type AskCoreWorkbenchListPayload } from './types';

const WORKBENCH_API_BASE = '/api/askcore/workbench';

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

export const fetchAskCoreWorkbenchJson = async <T>(path: string): Promise<T> => {
  const response = await fetch(path, {
    credentials: 'include',
    headers: {
      Accept: 'application/json',
    },
  });

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
  return `${WORKBENCH_API_BASE}/${resource}?${params.toString()}`;
};

export const askCoreWorkbenchItemUrl = (resource: string, entityId: string | number) =>
  `${WORKBENCH_API_BASE}/${resource}/${entityId}`;

export const askCoreWorkbenchDashboardUrl = () => `${WORKBENCH_API_BASE}/dashboard`;

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
