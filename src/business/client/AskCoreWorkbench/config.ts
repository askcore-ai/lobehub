'use client';

import { type AskCoreWorkbenchTabConfig } from './types';

export const ASKCORE_WORKBENCH_PATH = '/askcore/workbench';
export const ASKCORE_WORKBENCH_PLUGIN_ID = 'aitutor-suite';

export const ASKCORE_WORKBENCH_TABS: AskCoreWorkbenchTabConfig[] = [
  { key: 'overview', label: '总览' },
  {
    columns: [
      { dataIndex: 'name', title: '学校', width: 220 },
      { dataIndex: 'province', title: '省份', width: 120 },
      { dataIndex: 'city', title: '城市', width: 120 },
      { dataIndex: 'contact_phone', title: '电话', width: 140 },
      { dataIndex: 'created_at', title: '创建时间', width: 180 },
    ],
    key: 'schools',
    label: '学校',
    newLabel: '新建学校',
    resource: 'schools',
    searchPlaceholder: '搜索学校、校区',
  },
  {
    columns: [
      { dataIndex: 'real_name', title: '教师', width: 160 },
      { dataIndex: 'username', title: '账号', width: 160 },
      { dataIndex: 'teacher_number', title: '工号', width: 140 },
      { dataIndex: 'role', isStatus: true, title: '角色', width: 120 },
      { dataIndex: 'school_id', title: '学校', width: 120 },
      { dataIndex: 'last_login', title: '最近登录', width: 180 },
    ],
    key: 'teachers',
    label: '教师',
    newLabel: '新建教师',
    resource: 'teachers',
    searchPlaceholder: '搜索教师、账号',
  },
  {
    columns: [
      { dataIndex: 'name', title: '班级', width: 180 },
      { dataIndex: 'school_id', title: '学校', width: 120 },
      { dataIndex: 'grade_label', title: '年级', width: 120 },
      { dataIndex: 'education_level', isStatus: true, title: '学段', width: 120 },
      { dataIndex: 'admission_year', title: '入学', width: 100 },
      { dataIndex: 'graduation_year', title: '毕业', width: 100 },
    ],
    key: 'classes',
    label: '班级',
    newLabel: '新建班级',
    resource: 'classes',
    searchPlaceholder: '搜索班级、年级',
  },
  {
    columns: [
      { dataIndex: 'name', title: '学生', width: 160 },
      { dataIndex: 'student_number', title: '学号', width: 160 },
      { dataIndex: 'class_id', title: '班级', width: 120 },
      { dataIndex: 'gender', isStatus: true, title: '性别', width: 100 },
      { dataIndex: 'created_at', title: '创建时间', width: 180 },
    ],
    key: 'students',
    label: '学生',
    newLabel: '新建学生',
    resource: 'students',
    searchPlaceholder: '搜索学生、学号',
  },
  {
    columns: [
      { dataIndex: 'name', title: '年级', width: 180 },
      { dataIndex: 'education_level', isStatus: true, title: '学段', width: 140 },
      { dataIndex: 'grade_order', title: '顺序', width: 120 },
      { dataIndex: 'is_graduation_grade', isStatus: true, title: '毕业年级', width: 140 },
      { dataIndex: 'created_at', title: '创建时间', width: 180 },
    ],
    key: 'grades',
    label: '年级',
    newLabel: '新建年级',
    resource: 'grades',
    searchPlaceholder: '搜索年级、学段',
  },
  {
    columns: [
      { dataIndex: 'name', title: '学科', width: 180 },
      { dataIndex: 'subject_category', title: '分类', width: 160 },
      { dataIndex: 'is_core_subject', isStatus: true, title: '核心学科', width: 140 },
      { dataIndex: 'created_at', title: '创建时间', width: 180 },
      { dataIndex: 'updated_at', title: '更新时间', width: 180 },
    ],
    key: 'subjects',
    label: '学科',
    newLabel: '新建学科',
    resource: 'subjects',
    searchPlaceholder: '搜索学科、分类',
  },
  {
    columns: [
      { dataIndex: 'title', title: '作业', width: 240 },
      { dataIndex: 'subject_id', title: '学科', width: 120 },
      { dataIndex: 'grade_id', title: '年级', width: 120 },
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
      { dataIndex: 'subject_id', title: '学科', width: 120 },
      { dataIndex: 'grade_id', title: '年级', width: 120 },
      { dataIndex: 'difficulty', title: '难度', width: 120 },
      { dataIndex: 'created_at', title: '创建时间', width: 180 },
    ],
    key: 'questions',
    label: '题目',
    newLabel: '新建题目',
    resource: 'questions',
    searchPlaceholder: '搜索题干、知识点',
  },
  {
    columns: [
      { dataIndex: 'name', title: '提交', width: 240 },
      { dataIndex: 'assignment_id', title: '作业', width: 120 },
      { dataIndex: 'student_id', title: '学生', width: 120 },
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
  { key: 'ops', label: '运维' },
];

export const ASKCORE_WORKBENCH_TAB_OPTIONS = ASKCORE_WORKBENCH_TABS.map((tab) => ({
  label: tab.label,
  value: tab.key,
}));

export const ASKCORE_WORKBENCH_COUNT_LABELS: Record<string, string> = {
  assignments: '作业',
  classes: '班级',
  questions: '题目',
  schools: '学校',
  students: '学生',
  submissions: '提交',
  teachers: '教师',
};
