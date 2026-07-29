// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';

import { ConfigProvider } from '@lobehub/ui';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as m from 'motion/react-m';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AskCoreSchoolPortalRoute } from './index';

const mocks = vi.hoisted(() => ({
  cancel: vi.fn(),
  enter: vi.fn(),
  SchoolHandoffError: class extends Error {
    status: number;

    constructor(status: number) {
      super('school handoff unavailable');
      this.status = status;
    }
  },
}));

vi.mock('./handoffClient', () => ({
  cancelSchoolSourceHandoff: mocks.cancel,
  enterSchoolSource: mocks.enter,
  SchoolHandoffError: mocks.SchoolHandoffError,
}));

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
    mocks.cancel.mockReset();
    mocks.enter.mockReset();
    mocks.enter.mockReturnValue(new Promise(() => {}));
  });

  afterEach(() => {
    cleanup();
  });

  it('prepares Moodle without rendering a visible success intermediary', async () => {
    const view = renderRoute();

    await waitFor(() => expect(mocks.enter).toHaveBeenCalledWith('moodle'));
    expect(
      screen.queryByRole('heading', { name: 'schoolPortal.handoff.moodle.title' }),
    ).not.toBeInTheDocument();
    expect(view.container.querySelector('form')).toBeNull();
    expect(view.container.querySelector('iframe')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent(
      'schoolPortal.handoff.moodle.message',
    );
  });

  it('shows the accessible /school recovery surface only after preparation fails', async () => {
    mocks.enter.mockRejectedValueOnce(new mocks.SchoolHandoffError(503));
    renderRoute();

    expect(
      await screen.findByRole('heading', {
        name: 'schoolPortal.state.unavailable.title',
      }),
    ).toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'schoolPortal.state.unavailable.message',
    );
    mocks.enter.mockReturnValueOnce(new Promise(() => {}));
    fireEvent.click(
      screen.getByRole('button', { name: 'schoolPortal.connection.refresh' }),
    );
    expect(mocks.enter).toHaveBeenCalledTimes(2);
  });

  it('contains no duplicate school dashboard, plan card, or source iframe', () => {
    const view = renderRoute();

    expect(screen.queryByText('schoolPortal.surface.learningSpace')).not.toBeInTheDocument();
    expect(screen.queryByText('schoolPortal.surface.schoolPlan')).not.toBeInTheDocument();
    expect(view.container.querySelector('iframe')).toBeNull();
  });
});
