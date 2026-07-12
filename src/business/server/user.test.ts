// @vitest-environment node
import { Plans } from '@lobechat/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getSubscriptionPlan,
  isAskCoreBillingEnabledForUser,
  isBusinessFeatureEnabledForUser,
} from './user';

vi.mock('@lobechat/business-const', () => ({ ENABLE_BUSINESS_FEATURES: true }));

describe('AskCore business adapters', () => {
  beforeEach(() => {
    vi.stubEnv('BILLING_LOBEHUB_ASSERTION_SECRET', 'test-assertion-secret');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('keeps generic LobeHub business features disabled while enabling AskCore billing for users', () => {
    expect(isBusinessFeatureEnabledForUser({ userId: 'user-1' })).toBe(false);
    expect(isAskCoreBillingEnabledForUser({ userId: 'user-1' })).toBe(true);
    expect(isAskCoreBillingEnabledForUser({ userEmail: 'user@example.com' })).toBe(true);
    expect(isAskCoreBillingEnabledForUser()).toBe(false);
  });

  it.each([
    ['free', Plans.Free],
    ['personal', Plans.Premium],
    ['professional', Plans.Ultimate],
  ])('maps AskCore plan %s to the local plan hint', async (planId, expected) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ personal: { plan_id: planId } }), {
          headers: { 'content-type': 'application/json' },
          status: 200,
        }),
      ),
    );

    await expect(getSubscriptionPlan('user-1')).resolves.toBe(expected);
    expect(fetch).toHaveBeenCalledWith(
      'http://api:8000/api/billing/v1/account',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('degrades to free when the billing authority is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('unavailable')));

    await expect(getSubscriptionPlan('user-1')).resolves.toBe(Plans.Free);
  });
});
