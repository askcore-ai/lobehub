'use client';

export type AskCoreWorkbenchTab =
  | 'overview'
  | 'schools'
  | 'teachers'
  | 'classes'
  | 'students'
  | 'grades'
  | 'subjects'
  | 'assignments'
  | 'questions'
  | 'submissions'
  | 'ops';

export interface AskCoreWorkbenchColumn {
  dataIndex: string;
  isStatus?: boolean;
  title: string;
  width?: number;
}

export interface AskCoreWorkbenchTabConfig {
  columns?: AskCoreWorkbenchColumn[];
  key: AskCoreWorkbenchTab;
  label: string;
  newLabel?: string;
  resource?: string;
  searchPlaceholder?: string;
}

export type AskCoreWorkbenchRecord = Record<string, any>;

export interface AskCoreWorkbenchListPayload {
  filters?: Record<string, any>;
  has_more?: boolean;
  items: AskCoreWorkbenchRecord[];
  next_after_id?: number | null;
  page: number;
  page_size: number;
  resource: string;
  total?: number | null;
}

export interface AskCoreWorkbenchDashboardPayload {
  active_invocations?: AskCoreWorkbenchRecord[];
  counts?: Record<string, number>;
  drafts?: AskCoreWorkbenchRecord[];
  recent_invocations?: AskCoreWorkbenchRecord[];
}
