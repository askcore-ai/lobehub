'use client';

import {
  type AskCoreEducationProfile,
  type AskCoreWorkbenchTab,
  type AskCoreWorkbenchTabConfig,
} from './types';

export const ASKCORE_WORKBENCH_PATH = '/askcore/workbench';
export const ASKCORE_WORKBENCH_PLUGIN_ID = 'aitutor-suite';

export const ASKCORE_WORKBENCH_TABS: AskCoreWorkbenchTabConfig[] = [
  { key: 'overview', label: '总览' },
  {
    columns: [
      { dataIndex: 'title', title: '作业', width: 240 },
      { dataIndex: 'subject_id', displayIndex: 'subject_name', title: '学科', width: 140 },
      { dataIndex: 'grade_id', displayIndex: 'grade_name', title: '年级', width: 140 },
      { dataIndex: 'creation_type', isStatus: true, title: '来源', width: 120 },
      { dataIndex: 'assign_date', title: '布置日期', width: 150 },
      { dataIndex: 'due_date', title: '截止日期', width: 150 },
    ],
    key: 'assignments',
    label: '作业',
    newLabel: '新建作业',
    resource: 'assignments',
    searchPlaceholder: '搜索作业、学科',
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
      { dataIndex: 'name', title: '提交', width: 240 },
      { dataIndex: 'assignment_id', displayIndex: 'assignment_title', title: '作业', width: 180 },
      { dataIndex: 'student_id', displayIndex: 'student_name', title: '学生', width: 140 },
      { dataIndex: 'status', isStatus: true, title: '状态', width: 120 },
      { dataIndex: 'score', title: '得分', width: 120 },
      { dataIndex: 'submitted_at', title: '提交时间', width: 180 },
    ],
    key: 'submissions',
    label: '提交',
    newLabel: '导入提交',
    resource: 'submissions',
    searchPlaceholder: '搜索提交、学生',
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
      new Set<AskCoreWorkbenchTab>(['assignments', 'submissions']).has(tab.key),
    ).map((tab) =>
      tab.key === 'submissions'
        ? { ...tab, label: '我的提交', newLabel: '提交作业' }
        : tab.key === 'assignments'
          ? { ...tab, label: '我的作业', newLabel: undefined }
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
  assignments: '作业',
  questions: '题目',
  submissions: '提交',
};
