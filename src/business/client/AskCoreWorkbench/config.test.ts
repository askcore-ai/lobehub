import { describe, expect, it } from 'vitest';

import { ASKCORE_WORKBENCH_TABS } from './config';

describe('AskCoreWorkbench config', () => {
  it('keeps organization-owned roster resources out of first-class workbench tabs', () => {
    const tabKeys = ASKCORE_WORKBENCH_TABS.map((tab) => tab.key);

    expect(tabKeys).not.toContain('schools');
    expect(tabKeys).not.toContain('grades');
    expect(tabKeys).not.toContain('classes');
    expect(tabKeys).not.toContain('teachers');
    expect(tabKeys).not.toContain('students');
  });
});
