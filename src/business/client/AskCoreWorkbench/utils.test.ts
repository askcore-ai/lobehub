import { describe, expect, it } from 'vitest';

import {
  askCoreOrganizationTabFromRoute,
  askCoreWorkbenchTabFromRoute,
  buildAskCoreOrganizationUrl,
  buildAskCoreWorkbenchUrl,
  getAskCoreWorkbenchRouteFromState,
  isAskCoreSuiteRunResult,
  normalizeAskCoreWorkbenchTab,
} from './utils';

describe('AskCoreWorkbench utils', () => {
  it('normalizes invalid tabs to overview', () => {
    expect(normalizeAskCoreWorkbenchTab('ops')).toBe('overview');
    expect(normalizeAskCoreWorkbenchTab('schools')).toBe('overview');
    expect(normalizeAskCoreWorkbenchTab('unknown')).toBe('overview');
    expect(normalizeAskCoreWorkbenchTab(null)).toBe('overview');
  });

  it('maps plugin routes to first-party workbench tabs', () => {
    expect(askCoreWorkbenchTabFromRoute('/assignments/12')).toBe('activities');
    expect(askCoreWorkbenchTabFromRoute('/assignments/new/ocr')).toBe('activities');
    expect(askCoreWorkbenchTabFromRoute('/assignments/new/manual')).toBe('activities');
    expect(askCoreWorkbenchTabFromRoute('/submissions/new/ocr')).toBe('attempts');
    expect(askCoreWorkbenchTabFromRoute('/submissions/7')).toBe('attempts');
    expect(askCoreWorkbenchTabFromRoute('/questions/new/ocr')).toBe('overview');
    expect(askCoreWorkbenchTabFromRoute('/ops')).toBe('overview');
    expect(askCoreWorkbenchTabFromRoute('/subjects')).toBe('overview');
    expect(askCoreWorkbenchTabFromRoute('/missing')).toBe('overview');
  });

  it('builds deep links with route query preserved', () => {
    expect(buildAskCoreWorkbenchUrl({ route: '/submissions/7' })).toBe(
      '/askcore/workbench?tab=attempts&route=%2Fsubmissions%2F7',
    );
    expect(buildAskCoreWorkbenchUrl({ tab: 'teachers' })).toBe('/askcore/workbench?tab=overview');
  });

  it('maps organization-owned plugin routes to organization tabs', () => {
    expect(askCoreOrganizationTabFromRoute('/schools')).toBe('schools');
    expect(askCoreOrganizationTabFromRoute('/subjects')).toBeNull();
    expect(askCoreOrganizationTabFromRoute('/grades')).toBeNull();
    expect(askCoreOrganizationTabFromRoute('/students/201')).toBe('students');
    expect(askCoreOrganizationTabFromRoute('/assignments')).toBeNull();
    expect(buildAskCoreOrganizationUrl({ route: '/classes' })).toBe(
      '/organization?tab=classes&route=%2Fclasses',
    );
  });

  it('detects AskCore standalone suite.run UI results', () => {
    const state = {
      kind: 'aitutor.suite.run.result.v1',
      success: true,
      ui: { route: '/schools' },
    };

    expect(getAskCoreWorkbenchRouteFromState(state)).toBe('/schools');
    expect(
      isAskCoreSuiteRunResult({ apiName: 'suite_run', identifier: 'aitutor-suite', state }),
    ).toBe(true);
    expect(isAskCoreSuiteRunResult({ apiName: 'other', identifier: 'aitutor-suite', state })).toBe(
      false,
    );
  });
});
