import { describe, expect, it } from 'vitest';

import {
  BusinessDesktopRoutesWithMainLayout,
  BusinessDesktopRoutesWithoutMainLayout,
} from './BusinessDesktopRoutes';

describe('BusinessDesktopRoutes', () => {
  it('keeps one direct school entry and the LTI processing route under the main layout', () => {
    const paths = BusinessDesktopRoutesWithMainLayout.map((route) => route.path);

    expect(paths).toContain('askcore/workbench');
    expect(paths).toContain('school');
    expect(paths).not.toContain('school/teaching-center');
    expect(paths).not.toContain('school/learning-space');
    expect(paths).not.toContain('school/operations-center');
    expect(paths).not.toContain('school/billing');
    expect(paths).not.toContain('organization');
  });

  it('registers no duplicate or legacy school routes', () => {
    const paths = BusinessDesktopRoutesWithMainLayout.map((route) => route.path);

    expect(paths.filter((path) => path === 'school')).toHaveLength(1);
    expect(paths.some((path) => path?.startsWith('school/'))).toBe(false);
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
