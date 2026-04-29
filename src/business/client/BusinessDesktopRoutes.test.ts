import { describe, expect, it } from 'vitest';

import { BusinessDesktopRoutesWithMainLayout } from './BusinessDesktopRoutes';

describe('BusinessDesktopRoutes', () => {
  it('registers the AskCore workbench under the main LobeHub layout', () => {
    expect(
      BusinessDesktopRoutesWithMainLayout.some((route) => route.path === 'askcore/workbench'),
    ).toBe(true);
  });
});
