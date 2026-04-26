import { describe, expect, it } from 'vitest';

import { askCoreCreditPacks, askCorePlanCatalog, askCoreUsageRows } from './AskCoreBillingPage';
import { askCoreSeatRows } from './OrgSeats';

describe('AskCoreBillingPage catalog data', () => {
  it('includes local paid plans and personal fallback usage markers', () => {
    expect(askCorePlanCatalog.map((plan) => plan.id)).toEqual([
      'free',
      'starter',
      'premium',
      'ultimate',
    ]);
    expect(askCoreCreditPacks.length).toBeGreaterThan(0);
    expect(askCoreUsageRows.some((row) => row.scope === 'Personal fallback')).toBe(true);
  });

  it('models organization seats as independent member quota buckets', () => {
    expect(askCoreSeatRows).toHaveLength(2);
    expect(askCoreSeatRows.every((seat) => seat.user && seat.plan)).toBe(true);
    expect(askCoreSeatRows.find((seat) => seat.status === 'exhausted')?.remaining).toBe(0);
  });
});
