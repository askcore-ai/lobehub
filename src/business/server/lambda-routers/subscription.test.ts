import { describe, expect, it } from 'vitest';

import { askCoreSubscriptionPlans, subscriptionRouter } from './subscription';

describe('AskCore subscription router', () => {
  it('exposes AskCore paid plan tiers locally', () => {
    expect(askCoreSubscriptionPlans.map((plan) => plan.id)).toContain('starter');
    expect(askCoreSubscriptionPlans.map((plan) => plan.id)).toContain('premium');
  });

  it('registers local billing procedures', () => {
    expect(Object.keys(subscriptionRouter._def.procedures)).toEqual(
      expect.arrayContaining(['current', 'listPlans', 'createCheckout']),
    );
  });
});
