import { checkBusinessFeatureAccess } from '@/business/server/trpc-middlewares/lambda';
import { publicProcedure, router } from '@/libs/trpc/lambda';

export const askCoreReferralSummary = {
  code: 'ASKCORE-LOCAL',
  invites: 6,
  rewardCredits: 300,
  rewarded: 4,
  status: 'registered',
} as const;

const billingProcedure = publicProcedure.use(checkBusinessFeatureAccess);

export const referralRouter = router({
  summary: billingProcedure.query(() => askCoreReferralSummary),
});
