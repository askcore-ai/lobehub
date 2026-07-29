import { randomBytes } from 'node:crypto';

import { WechatIdentityConflictError } from './identity-resolver';
import {
  type WechatMobileDatabaseAdapter,
  WechatMobileTransactionStore,
} from './transaction-store';

const CLAIM_MODEL = 'wechatRebindClaim';
const CLAIM_RESPONSE_SAFETY_MS = 5 * 60 * 1000;

export async function cleanupWechatRebindClaims(
  adapter: WechatMobileDatabaseAdapter,
  now: Date = new Date(),
  limit = 50,
): Promise<number> {
  if (!adapter.findMany || !adapter.deleteMany) return 0;
  const pending = await adapter.findMany<{ id: string }>({
    limit: Math.ceil(limit / 2),
    model: CLAIM_MODEL,
    sortBy: { direction: 'asc', field: 'confirmationExpiresAt' },
    where: [
      { field: 'state', value: 'pending_confirmation' },
      { field: 'confirmationExpiresAt', operator: 'lt', value: now },
    ],
  });
  const verified = await adapter.findMany<{ id: string }>({
    limit: Math.max(0, limit - pending.length),
    model: CLAIM_MODEL,
    sortBy: { direction: 'asc', field: 'applyBefore' },
    where: [
      { field: 'state', value: 'verified' },
      { field: 'applyBefore', operator: 'lt', value: now },
    ],
  });
  for (const claim of [...pending, ...verified]) {
    await adapter.update({
      model: CLAIM_MODEL,
      update: { state: 'expired', updatedAt: now },
      where: [
        { field: 'id', value: claim.id },
        { field: 'state', operator: 'in', value: ['pending_confirmation', 'verified'] },
      ],
    });
  }
  const purgeBefore = new Date(now.getTime() - CLAIM_RESPONSE_SAFETY_MS);
  const purge = await adapter.findMany<{ id: string }>({
    limit,
    model: CLAIM_MODEL,
    sortBy: { direction: 'asc', field: 'updatedAt' },
    where: [
      { field: 'state', value: 'expired' },
      { field: 'updatedAt', operator: 'lt', value: purgeBefore },
    ],
  });
  if (purge.length === 0) return pending.length + verified.length;
  const deleted = await adapter.deleteMany({
    model: CLAIM_MODEL,
    where: [{ field: 'id', operator: 'in', value: purge.map((claim) => claim.id) }],
  });
  return pending.length + verified.length + deleted;
}

export async function createWechatRebindClaim(input: {
  adapter: WechatMobileDatabaseAdapter;
  legacyAccountRowId: string;
  now?: Date;
  sourceTransactionId: string;
  unionid: string;
  userId: string;
}) {
  const now = input.now ?? new Date();
  const owned = await input.adapter.findOne<{ id: string; userId: string }>({
    model: 'account',
    where: [
      { field: 'accountId', value: input.unionid },
      { field: 'providerId', value: 'wechat' },
    ],
  });
  if (owned && owned.userId !== input.userId) {
    throw new WechatIdentityConflictError('wechat_identity_conflict');
  }
  return input.adapter.create<{
    confirmationExpiresAt: Date;
    id: string;
    state: string;
  }>({
    data: {
      applyBefore: null,
      confirmationExpiresAt: new Date(now.getTime() + 10 * 60 * 1000),
      confirmedAt: null,
      createdAt: now,
      id: `wxr_${randomBytes(18).toString('base64url')}`,
      legacyAccountRowId: input.legacyAccountRowId,
      sourceTransactionId: input.sourceTransactionId,
      state: 'pending_confirmation',
      updatedAt: now,
      userId: input.userId,
      verifiedUnionid: input.unionid,
    },
    model: CLAIM_MODEL,
  });
}

export async function completeWechatRebindProof(input: {
  adapter: WechatMobileDatabaseAdapter;
  legacyAccountRowId: string;
  now?: Date;
  sourceTransactionId: string;
  unionid: string;
  userId: string;
}) {
  if (!input.adapter.transaction) throw new Error('wechat_transactions_required');
  return input.adapter.transaction(async (transactionAdapter) => {
    const claim = await createWechatRebindClaim({
      ...input,
      adapter: transactionAdapter,
    });
    const transaction = await new WechatMobileTransactionStore(transactionAdapter).authorize(
      input.sourceTransactionId,
      input.userId,
      input.now,
    );
    if (!transaction) throw new WechatIdentityConflictError('wechat_transaction_replayed');
    return { claim, transaction };
  });
}

export async function confirmWechatRebindClaim(input: {
  adapter: WechatMobileDatabaseAdapter;
  claimId: string;
  now?: Date;
  userId: string;
}) {
  const now = input.now ?? new Date();
  const claim = await input.adapter.findOne<{
    confirmationExpiresAt: Date;
    id: string;
    state: string;
    userId: string;
  }>({
    model: CLAIM_MODEL,
    where: [{ field: 'id', value: input.claimId }],
  });
  if (
    !claim ||
    claim.userId !== input.userId ||
    claim.state !== 'pending_confirmation' ||
    claim.confirmationExpiresAt <= now
  ) {
    return null;
  }
  return input.adapter.update({
    model: CLAIM_MODEL,
    update: {
      applyBefore: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
      confirmedAt: now,
      state: 'verified',
      updatedAt: now,
    },
    where: [
      { field: 'id', value: input.claimId },
      { field: 'state', value: 'pending_confirmation' },
      { field: 'userId', value: input.userId },
    ],
  });
}

export async function findWechatRebindClaimByTransaction(input: {
  adapter: WechatMobileDatabaseAdapter;
  sourceTransactionId: string;
  userId: string;
}) {
  return input.adapter.findOne<{
    confirmationExpiresAt: Date;
    id: string;
    state: string;
    userId: string;
  }>({
    model: CLAIM_MODEL,
    where: [
      { field: 'sourceTransactionId', value: input.sourceTransactionId },
      { field: 'userId', value: input.userId },
    ],
  });
}
