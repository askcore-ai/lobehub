import { publicProcedure, router } from '@/libs/trpc/lambda';

export const askCoreReferralSummary = {
  code: 'ASKCORE-LOCAL',
  invites: 6,
  rewardCredits: 300,
  rewarded: 4,
  status: 'registered',
} as const;

export const referralRouter = router({
  summary: publicProcedure.query(() => askCoreReferralSummary),
});
