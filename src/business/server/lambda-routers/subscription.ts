import { z } from 'zod';

import { publicProcedure, router } from '@/libs/trpc/lambda';

export const askCoreSubscriptionPlans = [
  {
    features: ['Basic chat', 'Private AskCore market', 'Personal fallback credits'],
    id: 'free',
    monthlyCredits: 100,
    monthlyPriceUsd: 0,
    name: 'Free',
  },
  {
    features: ['Higher context usage', 'OCR and grading calls', 'Personal credit rollover'],
    id: 'starter',
    monthlyCredits: 1000,
    monthlyPriceUsd: 12,
    name: 'Starter',
  },
  {
    features: ['Priority model routes', 'Assignment OCR', 'Submission grading'],
    id: 'premium',
    monthlyCredits: 5000,
    monthlyPriceUsd: 29,
    name: 'Premium',
  },
  {
    features: ['Highest local quota', 'Organization seat tier', 'Advanced support lane'],
    id: 'ultimate',
    monthlyCredits: 15000,
    monthlyPriceUsd: 79,
    name: 'Ultimate',
  },
] as const;

export const subscriptionRouter = router({
  createCheckout: publicProcedure
    .input(
      z.object({
        planId: z.string(),
        scopeId: z.string().optional(),
        scopeType: z.enum(['user', 'organization']).default('user'),
        seats: z.number().int().positive().default(1),
      }),
    )
    .mutation(({ input }) => ({
      mode: 'shadow',
      planId: input.planId,
      scopeId: input.scopeId,
      scopeType: input.scopeType,
      seats: input.seats,
      status: 'created',
    })),
  current: publicProcedure.query(() => ({
    balanceCredits: 4280,
    mode: 'shadow',
    organization: {
      fallbackToPersonal: true,
      seatPlanId: 'premium',
      seatRemainingCredits: 3200,
    },
    planId: 'starter',
  })),
  listPlans: publicProcedure.query(() => askCoreSubscriptionPlans),
});
