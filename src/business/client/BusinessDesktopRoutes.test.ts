import { describe, expect, it } from 'vitest';

import { BusinessDesktopRoutesWithMainLayout } from './BusinessDesktopRoutes';

describe('BusinessDesktopRoutes', () => {
  it('registers organization before the AskCore workbench under the main LobeHub layout', () => {
    const paths = BusinessDesktopRoutesWithMainLayout.map((route) => route.path);

    expect(paths).toContain('organization');
    expect(paths).toContain('askcore/workbench');
    expect(paths.indexOf('organization')).toBeLessThan(paths.indexOf('askcore/workbench'));
  });

  it('registers the AskCore workbench under the main LobeHub layout', () => {
    expect(
      BusinessDesktopRoutesWithMainLayout.some((route) => route.path === 'askcore/workbench'),
    ).toBe(true);
  });
});
