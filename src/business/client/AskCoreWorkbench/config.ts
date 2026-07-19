'use client';

import {
  type AskCoreEducationProfile,
  type AskCoreWorkbenchTab,
  type AskCoreWorkbenchTabConfig,
} from './types';

export const ASKCORE_WORKBENCH_PATH = '/askcore/workbench';
export const ASKCORE_WORKBENCH_PLUGIN_ID = 'aitutor-suite';
export const ASKCORE_IDENTITY_LINK_TOKEN_STORAGE_KEY = 'askcore.lti.identity-link.invitation';

export type AskCoreProtocolMode = 'identity-link' | 'processing';

export const askCoreProtocolMode = (value?: string | null): AskCoreProtocolMode | null =>
  value === 'identity-link' || value === 'processing' ? value : null;

export const hasPendingAskCoreIdentityLink = () => {
  try {
    return !!window.sessionStorage.getItem(ASKCORE_IDENTITY_LINK_TOKEN_STORAGE_KEY)?.trim();
  } catch {
    return false;
  }
};

export const isAskCoreIdentityLinkCallback = (
  pathname: string,
  search: string,
  hasPendingToken = false,
) => {
  const params = new URLSearchParams(search);
  return (
    pathname === ASKCORE_WORKBENCH_PATH &&
    askCoreProtocolMode(params.get('protocol')) === 'identity-link' &&
    (!!params.get('token')?.trim() || hasPendingToken)
  );
};

export const ASKCORE_WORKBENCH_TABS: AskCoreWorkbenchTabConfig[] = [
  { key: 'overview', label: '总览' },
  {
    columns: [
      { dataIndex: 'title', title: '活动', width: 240 },
      { dataIndex: 'subject_id', displayIndex: 'subject_name', title: '学科', width: 140 },
      { dataIndex: 'grade_id', displayIndex: 'grade_name', title: '年级', width: 140 },
      { dataIndex: 'source_kind', isStatus: true, title: '来源', width: 140 },
      { dataIndex: 'status', isStatus: true, title: '状态', width: 120 },
      { dataIndex: 'created_at', title: '创建时间', width: 180 },
    ],
    key: 'activities',
    label: '活动',
    resource: 'activities',
    searchPlaceholder: '搜索活动、学科',
  },
  {
    columns: [
      { dataIndex: 'content', title: '题目', width: 280 },
      { dataIndex: 'question_type', isStatus: true, title: '题型', width: 120 },
      { dataIndex: 'subject_id', displayIndex: 'subject_name', title: '学科', width: 140 },
      { dataIndex: 'grade_id', displayIndex: 'grade_name', title: '年级', width: 140 },
      { dataIndex: 'difficulty', title: '难度', width: 120 },
      { dataIndex: 'created_at', title: '创建时间', width: 180 },
    ],
    key: 'questions',
    label: '题目',
    newLabel: '手动新建',
    resource: 'questions',
    searchPlaceholder: '搜索题干、知识点',
  },
  {
    columns: [
      { dataIndex: 'activity_title', title: '活动', width: 220 },
      { dataIndex: 'source_kind', isStatus: true, title: '来源', width: 140 },
      { dataIndex: 'status', isStatus: true, title: '状态', width: 120 },
      { dataIndex: 'score', title: '得分', width: 120 },
      { dataIndex: 'total_score', title: '总分', width: 120 },
      { dataIndex: 'submitted_at', title: '提交时间', width: 180 },
    ],
    key: 'attempts',
    label: '提交记录',
    resource: 'attempts',
    searchPlaceholder: '搜索提交记录、状态',
  },
];

export const ASKCORE_WORKBENCH_TAB_OPTIONS = ASKCORE_WORKBENCH_TABS.map((tab) => ({
  label: tab.label,
  value: tab.key,
}));

const tabOptionsFromConfigs = (tabs: AskCoreWorkbenchTabConfig[]) =>
  tabs.map((tab) => ({
    label: tab.label,
    value: tab.key,
  }));

export const askCoreWorkbenchTabsForProfile = (
  profile: AskCoreEducationProfile | null,
): AskCoreWorkbenchTabConfig[] => {
  if (profile?.workbench_mode === 'student_restricted') {
    return ASKCORE_WORKBENCH_TABS.filter((tab) =>
      new Set<AskCoreWorkbenchTab>(['overview', 'activities', 'attempts']).has(tab.key),
    ).map((tab) =>
      tab.key === 'attempts'
        ? { ...tab, label: '我的提交记录', newLabel: '提交作业' }
        : tab.key === 'activities'
          ? { ...tab, label: '我的活动', newLabel: undefined }
          : tab,
    );
  }
  if (profile?.workbench_mode === 'identity_required') {
    return ASKCORE_WORKBENCH_TABS.filter((tab) => tab.key === 'overview');
  }
  return ASKCORE_WORKBENCH_TABS;
};

export const askCoreWorkbenchTabOptionsForProfile = (profile: AskCoreEducationProfile | null) =>
  tabOptionsFromConfigs(askCoreWorkbenchTabsForProfile(profile));

export const ASKCORE_WORKBENCH_COUNT_LABELS: Record<string, string> = {
  activities: '活动',
  assignments: '作业',
  attempts: '提交记录',
  questions: '题目',
  submissions: '提交',
};
