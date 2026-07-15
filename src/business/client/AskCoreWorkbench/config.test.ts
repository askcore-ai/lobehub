import { describe, expect, it } from 'vitest';

import {
  ASKCORE_WORKBENCH_TABS,
  askCoreProtocolMode,
  askCoreWorkbenchTabsForProfile,
  isAskCoreIdentityLinkCallback,
} from './config';

describe('AskCoreWorkbench config', () => {
  it('accepts only the processing and directed identity-link protocol modes', () => {
    expect(askCoreProtocolMode('processing')).toBe('processing');
    expect(askCoreProtocolMode('identity-link')).toBe('identity-link');
    expect(askCoreProtocolMode('deep_linking')).toBeNull();
    expect(askCoreProtocolMode('resource_link')).toBeNull();
    expect(askCoreProtocolMode(null)).toBeNull();
  });

  it('identifies only the directed identity-link callback that must precede onboarding', () => {
    expect(
      isAskCoreIdentityLinkCallback(
        '/askcore/workbench',
        '?protocol=identity-link&token=one-time-secret',
      ),
    ).toBe(true);
    expect(isAskCoreIdentityLinkCallback('/askcore/workbench', '?protocol=processing')).toBe(false);
    expect(isAskCoreIdentityLinkCallback('/', '?protocol=identity-link')).toBe(false);
    expect(isAskCoreIdentityLinkCallback('/askcore/workbench', '?protocol=identity-link')).toBe(
      false,
    );
    expect(
      isAskCoreIdentityLinkCallback('/askcore/workbench', '?protocol=identity-link', true),
    ).toBe(true);
  });

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

  it('limits restricted students to their protocol activities and attempts', () => {
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
      teaching_runtime: {
        app_env: 'production',
        coherent: true,
        forbid_legacy_school_writes: true,
        production_preflight_required: true,
        production_preflight_status: 'passed',
        protocol_enabled: true,
        protocol_mode: 'protocol',
        reason: 'ready',
        require_lms_sis_in_production: true,
        teaching_available: true,
      },
      workbench_mode: 'student_restricted',
    });

    expect(tabs.map((tab) => tab.key)).toEqual(['overview', 'activities', 'attempts']);
    expect(tabs.find((tab) => tab.key === 'activities')?.label).toBe('我的活动');
    expect(tabs.find((tab) => tab.key === 'attempts')?.newLabel).toBe('提交作业');
  });

  it('uses protocol activity and attempt resources as default teaching tabs', () => {
    const tabResources = ASKCORE_WORKBENCH_TABS.map((tab) => tab.resource).filter(Boolean);

    expect(tabResources).toEqual(['activities', 'questions', 'attempts']);
    expect(ASKCORE_WORKBENCH_TABS.map((tab) => tab.key)).toEqual([
      'overview',
      'activities',
      'questions',
      'attempts',
    ]);
  });
});
