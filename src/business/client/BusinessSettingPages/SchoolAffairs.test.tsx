// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';

import { ConfigProvider } from '@lobehub/ui';
import { cleanup, render } from '@testing-library/react';
import * as m from 'motion/react-m';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import SchoolAffairs from './SchoolAffairs';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('SchoolAffairs', () => {
  beforeEach(() => {
    vi.spyOn(HTMLFormElement.prototype, 'requestSubmit').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('hands Settings school affairs to Gibbon through the top-level POST', () => {
    const view = render(
      <ConfigProvider motion={m}>
        <SchoolAffairs />
      </ConfigProvider>,
    );

    expect(view.container.querySelector('form')).toHaveAttribute(
      'action',
      '/api/askcore/school/handoff',
    );
    expect(view.container.querySelector('input[name="source"]')).toHaveValue('gibbon');
    expect(view.container.querySelector('iframe')).toBeNull();
  });
});
