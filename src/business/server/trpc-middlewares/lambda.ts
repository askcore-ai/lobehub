import { TRPCError } from '@trpc/server';

import { trpc } from '@/libs/trpc/lambda/init';

import { isBusinessFeatureEnabledForUser } from '../user';

export const checkFileStorageUsage = trpc.middleware(async (opts) => {
  return opts.next();
});

export const checkBusinessFeatureAccess = trpc.middleware(async (opts) => {
  const { ctx } = opts;

  if (!ctx.userId) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }

  if (!isBusinessFeatureEnabledForUser({ userEmail: ctx.userEmail, userId: ctx.userId })) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'AskCore billing is not enabled for this user',
    });
  }

  return opts.next();
});
