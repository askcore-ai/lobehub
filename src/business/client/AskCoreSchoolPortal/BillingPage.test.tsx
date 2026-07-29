import { render, screen, waitFor } from '@testing-library/react';
import { App } from 'antd';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SchoolBillingPage } from './BillingPage';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values ? `${key}:${JSON.stringify(values)}` : key,
  }),
}));

const sourceProof = 'header.payload.signature';
const sponsorship = {
  contract: 'askcore.school-sponsorship.v1',
  credit_summary: {
    period_end: '2026-09-01T00:00:00Z',
    period_start: '2026-08-01T00:00:00Z',
    rollover: false,
    school_available_credits: 750,
    school_granted_credits: 1000,
    seat_monthly_credits: 100,
    seat_settled_credits: 25,
  },
  current_funding_priority: 'school_then_personal',
  personal_fallback_enabled: true,
  safe_reason: null,
  school_key: 'askcore-online-school',
  school_status: 'active',
  seat_id: 1,
  sponsorship_status: 'assigned',
};

const renderPage = () =>
  render(
    <App>
      <SWRConfig value={{ dedupingInterval: 0, provider: () => new Map() }}>
        <SchoolBillingPage accountUserId="user-1" schoolKey="askcore-online-school" />
      </SWRConfig>
    </App>,
  );

beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation(() => ({
      addEventListener: vi.fn(),
      addListener: vi.fn(),
      matches: false,
      removeEventListener: vi.fn(),
      removeListener: vi.fn(),
    })),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('SchoolBillingPage', () => {
  it('shows the current sponsorship, shared balance, and seat credits to an ordinary member', async () => {
    const sourceProofBodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/school/services/askcore/billing.php')) {
          sourceProofBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
          return Response.json({
            expires_at: Math.floor(Date.now() / 1000) + 120,
            source_proof: sourceProof,
            status: 'succeeded',
          });
        }
        if (url.endsWith('/schools/askcore-online-school')) return Response.json(sponsorship);
        if (url.endsWith('/schools/askcore-online-school/admin')) {
          return Response.json(
            { detail: 'native Gibbon administrator is required' },
            { status: 403 },
          );
        }
        throw new Error(`unexpected request: ${url}`);
      }),
    );

    renderPage();

    expect(await screen.findByText('schoolBilling.member.title')).toBeInTheDocument();
    expect(screen.getByText('schoolBilling.member.status.assigned')).toBeInTheDocument();
    expect(screen.getByText('schoolBilling.payer.schoolThenPersonal')).toBeInTheDocument();
    expect(screen.getByText('schoolBilling.member.credit.title')).toBeInTheDocument();
    expect(
      screen.getByText(
        'schoolBilling.member.credit.available:{"credits":"750"}',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'schoolBilling.member.credit.monthly:{"credits":"100"}',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'schoolBilling.member.credit.total:{"credits":"1,000"}',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'schoolBilling.member.credit.used:{"credits":"25"}',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('schoolBilling.summary.totalSeats')).not.toBeInTheDocument();
    expect(sourceProofBodies).toEqual([
      {
        action: 'session_proof',
        school_key: 'askcore-online-school',
      },
    ]);
  });

  it('shows aggregate pool and seat controls only after live administrator authorization', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/school/services/askcore/billing.php')) {
          return Response.json({
            expires_at: Math.floor(Date.now() / 1000) + 120,
            source_proof: sourceProof,
            status: 'succeeded',
          });
        }
        if (url.endsWith('/schools/askcore-online-school')) return Response.json(sponsorship);
        if (url.endsWith('/schools/askcore-online-school/admin')) {
          return Response.json({
            period: {
              available_credits: 300,
              granted_credits: 350,
              held_credits: 10,
              period_end: '2026-09-01T00:00:00Z',
              period_id: 1,
              period_start: '2026-08-01T00:00:00Z',
              rollover: false,
              settled_credits: 40,
            },
            school_key: 'askcore-online-school',
            seat_counts: { assigned: 1, available: 0, blocked: 0, retiring: 0, total: 1 },
            subscription: {
              billing_anchor_at: '2026-08-01T00:00:00Z',
              current_period_end: '2027-08-01T00:00:00Z',
              current_period_start: '2026-08-01T00:00:00Z',
              interval: 'year',
              plan_id: 'school-seat',
              requested_seats_total: 1,
              seat_change_status: 'applied',
              seats_total: 1,
              status: 'active',
            },
          });
        }
        if (url.endsWith('/schools/askcore-online-school/seats')) {
          return Response.json({
            items: [
              {
                assignment: {
                  account_user_id: 'user-1',
                  assigned_at: '2026-08-01T00:00:00Z',
                  display_name: '示例教师',
                  source: 'auto_claim',
                },
                assignment_blocked_until: null,
                assignment_version: 1,
                seat_id: 1,
                slot_number: 1,
                status: 'active',
                voluntary_reassignment_available: true,
              },
            ],
            next_cursor: null,
          });
        }
        if (url.endsWith('/schools/askcore-online-school/usage')) {
          return Response.json({
            by_seat: [
              { account_user_id: 'user-1', credits_used: 40, seat_id: 1, tokens_total: 1234 },
            ],
            credits: {},
            period_id: 1,
            tokens_total: 1234,
          });
        }
        throw new Error(`unexpected request: ${url}`);
      }),
    );

    renderPage();

    expect(await screen.findByText('schoolBilling.summary.totalSeats')).toBeInTheDocument();
    expect(screen.getByText('schoolBilling.assignment.title')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('示例教师')).toBeInTheDocument());
    expect(screen.getByText('schoolBilling.seats.title')).toBeInTheDocument();
  });
});
