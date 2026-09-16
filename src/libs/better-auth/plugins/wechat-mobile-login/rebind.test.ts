import { describe, expect, it, vi } from 'vitest';

import {
  cleanupWechatRebindClaims,
  completeWechatRebindProof,
  confirmWechatRebindClaim,
  createWechatRebindClaim,
  findWechatRebindClaimByTransaction,
} from './rebind';
import type { WechatMobileDatabaseAdapter } from './transaction-store';

class RebindAdapter implements WechatMobileDatabaseAdapter {
  accountOwner: null | string = null;
  claim: null | Record<string, unknown> = null;
  transactionRecord: null | Record<string, unknown> = null;
  transactionRuns = 0;

  async create<T>({ data }: { data: Record<string, unknown>; model: string }) {
    this.claim = { ...data };
    return this.claim as T;
  }

  async findOne<T>({
    model,
    where,
  }: {
    model: string;
    where: { field: string; value: unknown }[];
  }) {
    if (model === 'account') {
      return (
        this.accountOwner ? { id: 'canonical', userId: this.accountOwner } : null
      ) as T | null;
    }
    if (model === 'wechatMobileLoginTransaction') {
      return (
        this.transactionRecord &&
        where.every((item) => this.transactionRecord?.[item.field] === item.value)
          ? this.transactionRecord
          : null
      ) as T | null;
    }
    if (!this.claim) return null;
    return (
      where.every((item) => this.claim?.[item.field] === item.value) ? this.claim : null
    ) as T | null;
  }

  async transaction<R>(
    callback: (transaction: WechatMobileDatabaseAdapter) => Promise<R>,
  ): Promise<R> {
    this.transactionRuns += 1;
    return callback(this);
  }

  async update<T>({
    update,
    where,
  }: {
    model: string;
    update: Record<string, unknown>;
    where: { field: string; value: unknown }[];
  }) {
    if (
      this.transactionRecord &&
      where.every((item) => this.transactionRecord?.[item.field] === item.value)
    ) {
      this.transactionRecord = { ...this.transactionRecord, ...update };
      return this.transactionRecord as T;
    }
    if (!this.claim || !where.every((item) => this.claim?.[item.field] === item.value)) {
      return null;
    }
    this.claim = { ...this.claim, ...update };
    return this.claim as T;
  }
}

describe('authenticated WeChat rebind', () => {
  it('records proof only, then requires a second same-user confirmation', async () => {
    const adapter = new RebindAdapter();
    adapter.transactionRecord = {
      id: 'transaction-1',
      state: 'authorizing',
    };
    const { claim } = await completeWechatRebindProof({
      adapter,
      legacyAccountRowId: 'legacy-account',
      sourceTransactionId: 'transaction-1',
      unionid: 'union-1',
      userId: 'user-1',
    });
    expect(claim.state).toBe('pending_confirmation');
    expect(adapter.transactionRuns).toBe(1);
    expect(adapter.transactionRecord).toMatchObject({
      authorizedUserId: 'user-1',
      state: 'authorized',
    });
    expect(adapter.claim).toMatchObject({
      legacyAccountRowId: 'legacy-account',
      sourceTransactionId: 'transaction-1',
      verifiedUnionid: 'union-1',
    });

    const found = await findWechatRebindClaimByTransaction({
      adapter,
      sourceTransactionId: 'transaction-1',
      userId: 'user-1',
    });
    const confirmed = await confirmWechatRebindClaim({
      adapter,
      claimId: found!.id,
      userId: 'user-1',
    });
    expect(confirmed).toMatchObject({ state: 'verified' });
    expect(adapter.claim).not.toHaveProperty('accountId');
  });

  it('quarantines a UnionID already owned by another user', async () => {
    const adapter = new RebindAdapter();
    adapter.accountOwner = 'other-user';
    await expect(
      createWechatRebindClaim({
        adapter,
        legacyAccountRowId: 'legacy-account',
        sourceTransactionId: 'transaction-1',
        unionid: 'union-1',
        userId: 'user-1',
      }),
    ).rejects.toThrow('wechat_identity_conflict');
    expect(adapter.claim).toBeNull();
  });

  it('expires and purges rebind claims in bounded batches', async () => {
    const adapter = {
      deleteMany: vi.fn().mockResolvedValue(1),
      findMany: vi
        .fn()
        .mockResolvedValueOnce([{ id: 'pending-expired' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 'expired-old' }]),
      update: vi.fn().mockResolvedValue({ id: 'pending-expired', state: 'expired' }),
    } as unknown as WechatMobileDatabaseAdapter;

    await expect(
      cleanupWechatRebindClaims(adapter, new Date('2026-07-29T00:00:00Z'), 10),
    ).resolves.toBe(2);
    expect(adapter.update).toHaveBeenCalledTimes(1);
    expect(adapter.deleteMany).toHaveBeenCalledWith({
      model: 'wechatRebindClaim',
      where: [{ field: 'id', operator: 'in', value: ['expired-old'] }],
    });
  });
});
