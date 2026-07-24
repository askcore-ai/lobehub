// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';

import { ConfigProvider } from '@lobehub/ui';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import * as m from 'motion/react-m';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AskCoreSchoolPortalRoute } from './index';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const renderRoute = () =>
  render(
    <ConfigProvider motion={m}>
      <AskCoreSchoolPortalRoute />
    </ConfigProvider>,
  );

describe('P140 direct School / Learning Space entry', () => {
  beforeEach(() => {
    vi.spyOn(HTMLFormElement.prototype, 'requestSubmit').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('posts once from /school directly to the Moodle handoff', async () => {
    const view = renderRoute();

    await waitFor(() =>
      expect(HTMLFormElement.prototype.requestSubmit).toHaveBeenCalledTimes(1),
    );
    expect(
      screen.getByRole('heading', { name: 'schoolPortal.handoff.moodle.title' }),
    ).toBeVisible();
    expect(view.container.querySelector('form')).toHaveAttribute(
      'action',
      '/api/askcore/school/handoff',
    );
    expect(view.container.querySelector('input[name="source"]')).toHaveValue('moodle');
    for (const icon of view.container.querySelectorAll('svg')) {
      expect(icon).toHaveAttribute('aria-hidden', 'true');
    }
  });

  it('contains no duplicate school dashboard, plan card, or source iframe', () => {
    const view = renderRoute();

    expect(screen.queryByText('schoolPortal.surface.learningSpace')).not.toBeInTheDocument();
    expect(screen.queryByText('schoolPortal.surface.schoolPlan')).not.toBeInTheDocument();
    expect(view.container.querySelector('iframe')).toBeNull();
  });
});
