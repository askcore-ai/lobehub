// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';

import { ConfigProvider } from '@lobehub/ui';
import { cleanup, render, waitFor } from '@testing-library/react';
import * as m from 'motion/react-m';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import SchoolAffairs from './SchoolAffairs';

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

vi.mock('@/business/client/AskCoreSchoolPortal/handoffClient', () => ({
  cancelSchoolSourceHandoff: mocks.cancel,
  enterSchoolSource: mocks.enter,
  SchoolHandoffError: mocks.SchoolHandoffError,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('SchoolAffairs', () => {
  beforeEach(() => {
    mocks.cancel.mockReset();
    mocks.enter.mockReset();
    mocks.enter.mockReturnValue(new Promise(() => {}));
  });

  afterEach(() => {
    cleanup();
  });

  it('prepares Gibbon without rendering a visible success intermediary', async () => {
    const view = render(
      <ConfigProvider motion={m}>
        <SchoolAffairs />
      </ConfigProvider>,
    );

    await waitFor(() => expect(mocks.enter).toHaveBeenCalledWith('gibbon'));
    expect(view.container.querySelector('form')).toBeNull();
    expect(view.container.querySelector('iframe')).toBeNull();
    expect(view.container.querySelector('h1')).toBeNull();
  });
});
