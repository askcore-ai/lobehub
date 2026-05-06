import { describe, expect, it } from 'vitest';

import {
  askCoreWorkbenchTabFromRoute,
  buildAskCoreWorkbenchUrl,
  canUseAskCoreWorkbenchCreateFlows,
  getAskCoreWorkbenchRouteFromState,
  isAskCoreSuiteRunResult,
  isAskCoreWorkbenchCreateRoute,
  normalizeAskCoreWorkbenchTab,
} from './utils';

describe('AskCoreWorkbench utils', () => {
  it('normalizes invalid tabs to overview', () => {
    expect(normalizeAskCoreWorkbenchTab('schools')).toBe('overview');
    expect(normalizeAskCoreWorkbenchTab('unknown')).toBe('overview');
    expect(normalizeAskCoreWorkbenchTab(null)).toBe('overview');
  });

  it('maps plugin routes to first-party workbench tabs', () => {
    expect(askCoreWorkbenchTabFromRoute('/assignments/12')).toBe('assignments');
    expect(askCoreWorkbenchTabFromRoute('/assignments/new/ocr')).toBe('assignments');
    expect(askCoreWorkbenchTabFromRoute('/assignments/new/manual')).toBe('assignments');
    expect(askCoreWorkbenchTabFromRoute('/submissions/new/ocr')).toBe('submissions');
    expect(askCoreWorkbenchTabFromRoute('/submissions/7')).toBe('submissions');
    expect(askCoreWorkbenchTabFromRoute('/operations')).toBe('ops');
    expect(askCoreWorkbenchTabFromRoute('/missing')).toBe('overview');
  });

  it('builds deep links with route query preserved', () => {
    expect(buildAskCoreWorkbenchUrl({ route: '/submissions/7' })).toBe(
      '/askcore/workbench?tab=submissions&route=%2Fsubmissions%2F7',
    );
    expect(buildAskCoreWorkbenchUrl({ tab: 'teachers' })).toBe('/askcore/workbench?tab=overview');
  });

  it('identifies create routes that require the gray allowlist', () => {
    expect(isAskCoreWorkbenchCreateRoute('/assignments/new/manual')).toBe(true);
    expect(isAskCoreWorkbenchCreateRoute('https://askcore.cn/assignments/new/ocr?draft=1')).toBe(
      true,
    );
    expect(isAskCoreWorkbenchCreateRoute('/submissions/new/ocr')).toBe(true);
    expect(isAskCoreWorkbenchCreateRoute('/assignments/12')).toBe(false);
    expect(isAskCoreWorkbenchCreateRoute('/questions/new')).toBe(false);
  });

  it('gates create flows by the runtime feature flag state', () => {
    expect(canUseAskCoreWorkbenchCreateFlows(true)).toBe(true);
    expect(canUseAskCoreWorkbenchCreateFlows(false)).toBe(false);
    expect(canUseAskCoreWorkbenchCreateFlows(undefined)).toBe(false);
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
