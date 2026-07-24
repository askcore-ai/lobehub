// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';

import { ConfigProvider } from '@lobehub/ui';
import { cleanup, render, screen } from '@testing-library/react';
import * as m from 'motion/react-m';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import SchoolPlan from './SchoolPlan';

const useSession = vi.hoisted(() => vi.fn());
const useSWR = vi.hoisted(() => vi.fn());

vi.mock('@/libs/better-auth/auth-client', () => ({ useSession }));
vi.mock('swr', () => ({ default: useSWR }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('@/business/client/AskCoreSchoolPortal/BillingPage', () => ({
  SchoolBillingPage: ({ accountUserId, schoolKey }: { accountUserId: string; schoolKey: string }) => (
    <div data-testid="school-plan">{accountUserId}:{schoolKey}</div>
  ),
}));

const renderSchoolPlan = () =>
  render(
    <ConfigProvider motion={m}>
      <SchoolPlan />
    </ConfigProvider>,
  );

describe('SchoolPlan', () => {
  beforeEach(() => {
    useSession.mockReturnValue({
      data: { session: { id: 'session-1' }, user: { id: 'account-1' } },
      isPending: false,
      isRefetching: false,
    });
    useSWR.mockReturnValue({
      data: {
        contract: 'askcore.native-school-shell.v1',
        schools: [{ key: 'pilot-school', name: 'Pilot School' }],
        selection_required: false,
        show_school_entry: true,
        state: 'ready',
      },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders the source-authorized school plan in Settings', () => {
    renderSchoolPlan();

    expect(screen.getByRole('heading', { name: 'schoolPortal.surface.schoolPlan' })).toBeVisible();
    expect(screen.getByTestId('school-plan')).toHaveTextContent('account-1:pilot-school');
  });

  it('fails closed when the school presentation is unavailable', () => {
    useSWR.mockReturnValue({
      data: undefined,
      error: new Error('offline'),
      isLoading: false,
      mutate: vi.fn(),
    });

    renderSchoolPlan();

    expect(screen.getByText('schoolPortal.state.unavailable.title')).toBeVisible();
    expect(screen.queryByTestId('school-plan')).not.toBeInTheDocument();
  });

  it('renders the distinct conflict state without treating it as an invalid response', () => {
    useSWR.mockReturnValue({
      data: {
        can_manage_integrations: false,
        contract: 'askcore.native-school-shell.v1',
        schools: [],
        selection_required: false,
        show_school_entry: true,
        state: 'conflict',
      },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    });

    renderSchoolPlan();

    expect(screen.getByText('schoolPortal.state.conflict.title')).toBeVisible();
    expect(screen.queryByText('schoolPortal.state.unavailable.title')).not.toBeInTheDocument();
    expect(screen.queryByTestId('school-plan')).not.toBeInTheDocument();
  });

  it('invalidates the stale account and school-plan key throughout session refetch', () => {
    useSession.mockReturnValue({
      data: { session: { id: 'session-a' }, user: { id: 'account-a' } },
      isPending: false,
      isRefetching: true,
    });

    renderSchoolPlan();

    expect(useSWR).toHaveBeenCalledWith(null, expect.any(Function), {
      revalidateOnFocus: true,
      shouldRetryOnError: false,
    });
    expect(screen.getByLabelText('schoolPortal.schoolPlan.loading')).toBeVisible();
    expect(screen.queryByTestId('school-plan')).not.toBeInTheDocument();
  });
});
