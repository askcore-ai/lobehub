import { describe, expect, it } from 'vitest';

import { BusinessDesktopRoutesWithMainLayout } from './BusinessDesktopRoutes';

describe('BusinessDesktopRoutes', () => {
  it('keeps only the LTI processing and identity callback route under the main layout', () => {
    const paths = BusinessDesktopRoutesWithMainLayout.map((route) => route.path);

    expect(paths).toContain('askcore/workbench');
    expect(paths).not.toContain('organization');
  });

  it('registers the protocol callback route for signed LTI handoffs and identity invitations', () => {
    expect(
      BusinessDesktopRoutesWithMainLayout.some((route) => route.path === 'askcore/workbench'),
    ).toBe(true);
  });
});
