import { describe, expect, it } from 'vitest';

import {
  BusinessDesktopRoutesWithMainLayout,
  BusinessDesktopRoutesWithoutMainLayout,
} from './BusinessDesktopRoutes';

describe('BusinessDesktopRoutes', () => {
  it('keeps only the LTI processing and identity callback route under the main layout', () => {
    const paths = BusinessDesktopRoutesWithMainLayout.map((route) => route.path);

    expect(paths).toContain('askcore/workbench');
    expect(paths).toContain('school');
    expect(paths).toContain('school/teaching-center');
    expect(paths).toContain('school/learning-space');
    expect(paths).not.toContain('organization');
  });

  it('registers the linked-school portal without restoring organization routes', () => {
    const paths = BusinessDesktopRoutesWithMainLayout.map((route) => route.path);

    expect(paths).toContain('school');
    expect(paths).toContain('school/teaching-center');
    expect(paths).toContain('school/learning-space');
    expect(paths).not.toContain('organization');
  });

  it('registers the protocol callback route for signed LTI handoffs and identity invitations', () => {
    expect(
      BusinessDesktopRoutesWithMainLayout.some((route) => route.path === 'askcore/workbench'),
    ).toBe(true);
  });

  it('does not register the retired local organization invitation route', () => {
    const paths = BusinessDesktopRoutesWithoutMainLayout.map((route) => route.path);

    expect(paths).not.toContain('/join/organization/:token');
  });
});
