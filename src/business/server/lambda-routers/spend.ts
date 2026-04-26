import { publicProcedure, router } from '@/libs/trpc/lambda';

export const askCoreSpendRows = [
  {
    amountCredits: -16.4,
    id: 'usage-001',
    model: 'qwen/qwen3.5-plus',
    scope: 'org_seat',
    tokensTotal: 16_400,
  },
  {
    amountCredits: -2.8,
    id: 'usage-002',
    model: 'doubao-embedding-vision',
    scope: 'user',
    tokensTotal: 2800,
  },
] as const;

export const spendRouter = router({
  history: publicProcedure.query(() => askCoreSpendRows),
  summary: publicProcedure.query(() => ({
    currentMonthCredits: 19.2,
    currentMonthTokens: 19_200,
    mode: 'shadow',
  })),
});
