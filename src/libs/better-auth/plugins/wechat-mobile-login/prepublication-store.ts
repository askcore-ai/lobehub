import { createHmac } from 'node:crypto';

import {
  hashCapability,
  type WechatMobileDatabaseAdapter,
  type WechatMobileTransaction,
  WechatMobileTransactionStore,
} from './transaction-store';

const MODEL = 'wechatMobileLoginTransaction';
const PURPOSE = 'prepublication';
const WINDOW_MS = 300_000;
const SLOTS = 5;

// Drizzle wraps PostgreSQL errors in cause. Never inspect/log SQL or parameters.
const isUniqueConflict = (error: unknown): boolean => {
  for (let depth = 0; depth < 4 && error && typeof error === 'object'; depth += 1) {
    if ('code' in error && error.code === '23505') return true;
    error = 'cause' in error ? error.cause : null;
  }
  return false;
};

export class WechatPrepublicationStore {
  private readonly transactions: WechatMobileTransactionStore;

  constructor(private readonly adapter: WechatMobileDatabaseAdapter) {
    this.transactions = new WechatMobileTransactionStore(adapter);
  }

  async create(input: { now?: Date; secret: string; sessionId: string; userId: string }) {
    const now = input.now ?? new Date();
    const window = Math.floor(now.getTime() / WINDOW_MS);
    for (let slot = 0; slot < SLOTS; slot += 1) {
      const digest = createHmac('sha256', input.secret)
        .update(`askcore:p148:manual-slot:v1\0${JSON.stringify([input.userId, window, slot])}`)
        .digest('base64url').slice(0, 24);
      const reservedId = `wxm_${digest}`;
      if (await this.transactions.find(reservedId)) continue;
      try {
        return await this.transactions.create({
          callbackUrl: '/wechat-rebind',
          initiatingSessionId: input.sessionId,
          initiatingUserId: input.userId,
          now,
          purpose: PURPOSE,
          reservedId,
        });
      } catch (error) {
        if (!isUniqueConflict(error)) throw new Error('wechat_proof_persistence_unavailable');
      }
    }
    return null;
  }

  async begin(manualCode: string, now = new Date()) {
    if (!/^[A-F0-9]{20}$/.test(manualCode)) return null;
    const current = await this.adapter.findOne<WechatMobileTransaction>({
      model: MODEL,
      where: [
        { field: 'purpose', value: PURPOSE },
        { field: 'completionCapabilityHash', value: hashCapability('manual-proof', manualCode) },
        { field: 'expiresAt', operator: 'gt', value: now },
      ],
    });
    if (!current || current.state !== 'pending') return null;
    if (current.attemptCount >= 3) {
      await this.transition(current.id, ['pending'], { failureCode: 'attempt_limit', state: 'failed' }, now);
      return null;
    }
    return this.adapter.update<WechatMobileTransaction>({
      model: MODEL,
      update: { attemptCount: current.attemptCount + 1, state: 'authorizing', updatedAt: now },
      where: [
        { field: 'id', value: current.id },
        { field: 'purpose', value: PURPOSE },
        { field: 'state', value: 'pending' },
        { field: 'attemptCount', value: current.attemptCount },
        { field: 'expiresAt', operator: 'gt', value: now },
      ],
    });
  }

  completeProvider(id: string, now = new Date()) {
    // Deliberately no authorizedUserId, provider identity, session or rebind claim.
    return this.transition(id, ['authorizing'], { authorizedAt: now, state: 'proof_ready' }, now);
  }

  finish(id: string, now = new Date()) {
    return this.transition(id, ['proof_ready'], { consumedAt: now, state: 'completed' }, now);
  }

  cancel(id: string, now = new Date()) {
    return this.transition(id, ['pending', 'authorizing', 'proof_ready'], { state: 'cancelled' }, now);
  }

  private transition(
    id: string,
    states: string[],
    update: Partial<WechatMobileTransaction>,
    now: Date,
  ) {
    return this.adapter.update<WechatMobileTransaction>({
      model: MODEL,
      update: { ...update, updatedAt: now },
      where: [
        { field: 'id', value: id },
        { field: 'purpose', value: PURPOSE },
        { field: 'state', operator: 'in', value: states },
        { field: 'expiresAt', operator: 'gt', value: now },
      ],
    });
  }
}
