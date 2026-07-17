import { describe, expect, it } from 'vitest';

import {
  BusinessMobileRoutesWithMainLayout,
  BusinessMobileRoutesWithoutMainLayout,
} from './BusinessMobileRoutes';

describe('BusinessMobileRoutes', () => {
  it('matches the desktop P130 processing and identity callback route', () => {
    const paths = BusinessMobileRoutesWithMainLayout.map((route) => route.path);

    expect(paths).toContain('askcore/workbench');
    expect(paths).toContain('school');
    expect(paths).toContain('school/teaching-center');
    expect(paths).toContain('school/learning-space');
    expect(paths).toContain('school/operations-center');
    expect(paths).not.toContain('organization');
  });

  it('does not register the retired local organization invitation route', () => {
    const paths = BusinessMobileRoutesWithoutMainLayout.map((route) => route.path);

    expect(paths).not.toContain('/join/organization/:token');
  });
});
