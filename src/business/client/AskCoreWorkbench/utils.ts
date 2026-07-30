'use client';

import { ASKCORE_WORKBENCH_PATH, ASKCORE_WORKBENCH_TABS } from './config';
import { type AskCoreWorkbenchTab } from './types';

export const DEFAULT_ASKCORE_WORKBENCH_TAB: AskCoreWorkbenchTab = 'overview';

export const normalizeAskCoreWorkbenchTab = (value?: string | null): AskCoreWorkbenchTab => {
  const normalized = String(value || '').trim();
  return ASKCORE_WORKBENCH_TABS.some((tab) => tab.key === normalized)
    ? (normalized as AskCoreWorkbenchTab)
    : DEFAULT_ASKCORE_WORKBENCH_TAB;
};

export const askCoreWorkbenchTabFromRoute = (route?: string | null): AskCoreWorkbenchTab => {
  const routeValue = String(route || '').trim();
  if (!routeValue) return DEFAULT_ASKCORE_WORKBENCH_TAB;

  const firstSegment = routeValue
    .replace(/^https?:\/\/[^/]+/i, '')
    .replace(/^\/+/, '')
    .split(/[/?#]/)[0]
    .replaceAll('_', '-');

  const mapping: Record<string, AskCoreWorkbenchTab> = {
    activities: 'activities',
    activity: 'activities',
    assignment: 'activities',
    assignments: 'activities',
    attempt: 'attempts',
    attempts: 'attempts',
    dashboard: 'overview',
    grades: 'overview',
    submission: 'attempts',
    submissions: 'attempts',
  };

  return mapping[firstSegment] || DEFAULT_ASKCORE_WORKBENCH_TAB;
};

const ORGANIZATION_ROUTE_TABS: Record<string, string> = {
  class: 'classes',
  classes: 'classes',
  school: 'schools',
  schools: 'schools',
  student: 'students',
  students: 'students',
  teacher: 'teachers',
  teachers: 'teachers',
};

export const askCoreOrganizationTabFromRoute = (route?: string | null) => {
  const routeValue = String(route || '').trim();
  if (!routeValue) return null;

  const firstSegment = routeValue
    .replace(/^https?:\/\/[^/]+/i, '')
    .replace(/^\/+/, '')
    .split(/[/?#]/)[0]
    .replaceAll('_', '-');

  return ORGANIZATION_ROUTE_TABS[firstSegment] || null;
};

export const buildAskCoreOrganizationUrl = ({ route }: { route?: string | null } = {}) => {
  const params = new URLSearchParams();
  const tab = askCoreOrganizationTabFromRoute(route);
  if (tab) params.set('tab', tab);
  if (route) params.set('route', route);
  const encoded = params.toString();
  return encoded ? `/organization?${encoded}` : '/organization';
};

export const normalizeAskCoreWorkbenchRoutePath = (route?: string | null) => {
  const normalized = String(route || '')
    .trim()
    .replace(/^https?:\/\/[^/]+/i, '')
    .replace(/^\/+/, '')
    .split(/[?#]/)[0];
  return normalized ? `/${normalized}` : '';
};

export const getAskCoreWorkbenchRouteFromState = (state?: any): string | undefined => {
  if (!state || typeof state !== 'object') return;
  const route = state.ui?.route || state.route || state.data?.ui?.route || state.data?.route;
  return typeof route === 'string' && route.trim() ? route.trim() : undefined;
};

export const buildAskCoreWorkbenchUrl = ({
  route,
  tab,
}: {
  route?: string | null;
  tab?: AskCoreWorkbenchTab | string | null;
} = {}) => {
  const nextTab = normalizeAskCoreWorkbenchTab(tab || askCoreWorkbenchTabFromRoute(route));
  const params = new URLSearchParams({ tab: nextTab });
  if (route) params.set('route', route);
  return `${ASKCORE_WORKBENCH_PATH}?${params.toString()}`;
};

export const isAskCoreSuiteRunResult = ({
  apiName,
  identifier,
  state,
}: {
  apiName?: string;
  identifier?: string;
  state?: any;
}) => {
  if (identifier !== 'aitutor-suite') return false;
  const normalizedApi = String(apiName || '').replaceAll(/[.-]/g, '_');
  if (normalizedApi !== 'suite_run') return false;
  if (!state || typeof state !== 'object') return false;
  if (state.success === false || state.error) return false;
  return Boolean(getAskCoreWorkbenchRouteFromState(state));
};
