import { describe, expect, it } from 'vitest';

import {
  BusinessMobileRoutesWithMainLayout,
  BusinessMobileRoutesWithoutMainLayout,
} from './BusinessMobileRoutes';

describe('BusinessMobileRoutes', () => {
  it('matches the desktop direct school and processing routes', () => {
    const paths = BusinessMobileRoutesWithMainLayout.map((route) => route.path);

    expect(paths).toContain('askcore/workbench');
    expect(paths.filter((path) => path === 'school')).toHaveLength(1);
    expect(paths.some((path) => path?.startsWith('school/'))).toBe(false);
    expect(paths).not.toContain('organization');
  });

  it('does not register the retired local organization invitation route', () => {
    const paths = BusinessMobileRoutesWithoutMainLayout.map((route) => route.path);

    expect(paths).not.toContain('/join/organization/:token');
  });
});
