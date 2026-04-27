import { z } from 'zod';

import { checkBusinessFeatureAccess } from '@/business/server/trpc-middlewares/lambda';
import { publicProcedure, router } from '@/libs/trpc/lambda';

export const askCoreTopUpPacks = [
  { credits: 1000, id: 'starter-pack', name: 'Starter Pack', priceUsd: 10 },
  { credits: 5000, id: 'growth-pack', name: 'Growth Pack', priceUsd: 45 },
  { credits: 15000, id: 'scale-pack', name: 'Scale Pack', priceUsd: 120 },
] as const;

const billingProcedure = publicProcedure.use(checkBusinessFeatureAccess);

export const topUpRouter = router({
  createCheckout: billingProcedure
    .input(
      z.object({
        packId: z.string(),
        provider: z.enum(['stripe', 'alipay', 'wechat']).default('stripe'),
      }),
    )
    .mutation(({ input }) => ({
      mode: 'shadow',
      packId: input.packId,
      provider: input.provider,
      status: 'created',
    })),
  listPacks: billingProcedure.query(() => askCoreTopUpPacks),
});
