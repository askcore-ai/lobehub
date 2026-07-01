import { describe, expect, it } from 'vitest';

import { ASKCORE_WORKBENCH_TABS, askCoreWorkbenchTabsForProfile } from './config';

describe('AskCoreWorkbench config', () => {
  it('keeps organization-owned roster resources out of first-class workbench tabs', () => {
    const tabKeys = ASKCORE_WORKBENCH_TABS.map((tab) => tab.key);

    expect(tabKeys).not.toContain('ops');
    expect(tabKeys).not.toContain('schools');
    expect(tabKeys).not.toContain('grades');
    expect(tabKeys).not.toContain('classes');
    expect(tabKeys).not.toContain('teachers');
    expect(tabKeys).not.toContain('students');
    expect(tabKeys).not.toContain('subjects');
  });

  it('limits restricted students to their assignments and submissions', () => {
    const tabs = askCoreWorkbenchTabsForProfile({
      active_persona: null,
      capabilities: {
        can_create_assignment: false,
        can_create_question: false,
        can_run_teacher_submission_ocr: false,
        can_submit_own_work: true,
      },
      default_persona: null,
      education_identities: [],
      org_composition: { student_count: 1, teacher_count: 1 },
      workbench_mode: 'student_restricted',
    });

    expect(tabs.map((tab) => tab.key)).toEqual(['overview', 'assignments', 'submissions']);
    expect(tabs.find((tab) => tab.key === 'assignments')?.label).toBe('我的作业');
    expect(tabs.find((tab) => tab.key === 'submissions')?.newLabel).toBe('提交作业');
  });
});
