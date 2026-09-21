import { describe, expect, it } from 'vitest';

import {
  capabilityMatches,
  type WechatMobileDatabaseAdapter,
  WechatMobileTransactionStore,
} from './transaction-store';
import { WechatPrepublicationStore } from './prepublication-store';

type Clause = { field: string; operator?: 'eq' | 'gt' | 'in' | 'lt'; value: unknown };
const matches = (row: Record<string, unknown>, clause: Clause) => {
  const value = row[clause.field];
  if (clause.operator === 'in') return (clause.value as unknown[]).includes(value);
  if (clause.operator === 'gt') return (value as Date) > (clause.value as Date);
  if (clause.operator === 'lt') return (value as Date) < (clause.value as Date);
  return value === clause.value;
};

class MemoryAdapter implements WechatMobileDatabaseAdapter {
  rows = new Map<string, Record<string, unknown>>();

  async create<T>({ data }: { data: Record<string, unknown>; model: string }): Promise<T> {
    if (this.rows.has(String(data.id))) throw Object.assign(new Error('duplicate'), { code: '23505' });
    this.rows.set(String(data.id), { ...data });
    return { ...data } as T;
  }

  async deleteMany({
    where,
  }: {
    model: string;
    where: Clause[];
  }): Promise<number> {
    const ids = new Set(where[0].value as string[]);
    let deleted = 0;
    for (const id of ids) {
      if (this.rows.delete(id)) deleted += 1;
    }
    return deleted;
  }

  async findMany<T>({
    limit,
    where,
  }: {
    limit: number;
    model: string;
    sortBy: { direction: 'asc' | 'desc'; field: string };
    where: Clause[];
  }): Promise<T[]> {
    const cutoff = where[0].value as Date;
    return [...this.rows.values()]
      .filter((row) => (row.expiresAt as Date) < cutoff)
      .slice(0, limit) as T[];
  }

  async findOne<T>({ where }: { model: string; where: Clause[] }) {
    return (
      ([...this.rows.values()].find((row) =>
        where.every((clause) => matches(row, clause)),
      ) as T | undefined) ?? null
    );
  }

  async transaction<R>(
    callback: (transaction: WechatMobileDatabaseAdapter) => Promise<R>,
  ): Promise<R> {
    const snapshot = new Map([...this.rows].map(([key, value]) => [key, { ...value }]));
    try {
      return await callback(this);
    } catch (error) {
      this.rows = snapshot;
      throw error;
    }
  }

  async update<T>({
    update,
    where,
  }: {
    model: string;
    update: Record<string, unknown>;
    where: Clause[];
  }) {
    const entry = [...this.rows.entries()].find(([, row]) =>
      where.every((clause) => matches(row, clause)),
    );
    if (!entry) return null;
    const value = { ...entry[1], ...update };
    this.rows.set(entry[0], value);
    return value as T;
  }
}

describe('WechatMobileTransactionStore', () => {
  it('limits acceptance-only issuance to five atomic account/window slots', async () => {
    const adapter = new MemoryAdapter();
    const store = new WechatPrepublicationStore(adapter);
    const input = { now: new Date('2026-09-21T00:00:00Z'), secret: 'synthetic', sessionId: 'session', userId: 'user' };
    const results = await Promise.all(Array.from({ length: 12 }, () => store.create(input)));
    expect(results.filter(Boolean)).toHaveLength(5);
    expect(adapter.rows.size).toBe(5);
    const first = results.find(Boolean)!;
    expect(first.capabilities.completionCapability).toMatch(/^[A-F0-9]{20}$/);
    expect(JSON.stringify([...adapter.rows.values()])).not.toContain(first.capabilities.completionCapability);
    expect(await store.create({ ...input, sessionId: 'other-session' })).toBeNull();
    expect(await store.create({ ...input, now: new Date('2026-09-21T00:05:00Z') })).not.toBeNull();
  });

  it('cannot promote a manual transaction through normal authorization or session persistence', async () => {
    const adapter = new MemoryAdapter();
    const proof = new WechatPrepublicationStore(adapter);
    const store = new WechatMobileTransactionStore(adapter);
    const created = await proof.create({ secret: 'synthetic', sessionId: 'session', userId: 'user' });
    await proof.begin(created!.capabilities.completionCapability);
    expect(await store.authorize(created!.transaction.id, 'user')).toBeNull();
    let issued = false;
    expect(await store.consumeWithSession({
      accountSwitchConfirmed: false,
      createSession: async () => { issued = true; return { id: 'bad' }; },
      recoverySeconds: 60,
      transaction: { ...created!.transaction, authorizedUserId: 'user', state: 'authorized' },
    })).toBeNull();
    expect(issued).toBe(false);
  });

  it('uses independent cookie, tab, and completion capabilities', async () => {
    const adapter = new MemoryAdapter();
    const store = new WechatMobileTransactionStore(adapter);
    const created = await store.create({
      callbackUrl: '/',
      now: new Date('2026-07-29T00:00:00Z'),
      purpose: 'signin',
    });

    expect(new Set(Object.values(created.capabilities)).size).toBe(5);
    expect(
      capabilityMatches(
        'browser-cookie',
        created.capabilities.browserCookie,
        created.transaction.browserCookieBindingHash,
      ),
    ).toBe(true);
    expect(
      await store.requireBrowserBinding({
        browserCookie: created.capabilities.browserCookie,
        tabBinding: 'wrong-tab',
        transactionId: created.capabilities.transactionId,
      }),
    ).toBeNull();
  });

  it('binds completion capability to immutable signin/rebind purpose', async () => {
    const store = new WechatMobileTransactionStore(new MemoryAdapter());
    const created = await store.create({ callbackUrl: '/', purpose: 'rebind' });

    expect(
      await store.beginAuthorization({
        completionCapability: created.capabilities.completionCapability,
        purpose: 'signin',
        transactionId: created.transaction.id,
      }),
    ).toBeNull();
    expect(
      await store.beginAuthorization({
        completionCapability: created.capabilities.completionCapability,
        purpose: 'rebind',
        transactionId: created.transaction.id,
      }),
    ).toMatchObject({ state: 'authorizing' });
  });

  it('uses an independent OAuth state for desktop rebind', async () => {
    const store = new WechatMobileTransactionStore(new MemoryAdapter());
    const created = await store.create({ callbackUrl: '/', purpose: 'rebind' });

    await expect(
      store.findByOauthState(created.capabilities.completionCapability),
    ).resolves.toBeNull();
    await expect(store.findByOauthState(created.capabilities.oauthState)).resolves.toMatchObject({
      id: created.transaction.id,
    });
    expect(
      await store.beginWebsiteAuthorization({
        oauthState: created.capabilities.completionCapability,
        purpose: 'rebind',
        transactionId: created.transaction.id,
      }),
    ).toBeNull();
    expect(
      await store.beginWebsiteAuthorization({
        oauthState: created.capabilities.oauthState,
        purpose: 'rebind',
        transactionId: created.transaction.id,
      }),
    ).toMatchObject({ state: 'authorizing' });
  });

  it('bounds provider confirmation attempts for one transaction', async () => {
    const adapter = new MemoryAdapter();
    const store = new WechatMobileTransactionStore(adapter);
    const created = await store.create({ callbackUrl: '/', purpose: 'signin' });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect(
        await store.beginAuthorization({
          completionCapability: created.capabilities.completionCapability,
          purpose: 'signin',
          transactionId: created.transaction.id,
        }),
      ).toMatchObject({ state: 'authorizing' });
      await store.restorePending(created.transaction.id);
    }
    expect(
      await store.beginAuthorization({
        completionCapability: created.capabilities.completionCapability,
        purpose: 'signin',
        transactionId: created.transaction.id,
      }),
    ).toBeNull();
    expect(await store.find(created.transaction.id)).toMatchObject({
      failureCode: 'attempt_limit',
      state: 'failed',
    });
  });

  it('opportunistically deletes only a bounded expired batch after the recovery window', async () => {
    const adapter = new MemoryAdapter();
    const store = new WechatMobileTransactionStore(adapter);
    const createdAt = new Date('2026-07-29T00:00:00Z');
    await Promise.all(
      Array.from({ length: 55 }, () =>
        store.create({ callbackUrl: '/', now: createdAt, purpose: 'signin' }),
      ),
    );

    expect(await store.cleanupExpired(new Date('2026-07-29T00:11:00Z'))).toBe(50);
    expect(adapter.rows.size).toBe(5);
  });

  it('commits exactly one session reference and recovers no second session', async () => {
    const adapter = new MemoryAdapter();
    const store = new WechatMobileTransactionStore(adapter);
    const created = await store.create({ callbackUrl: '/', purpose: 'signin' });
    await store.beginAuthorization({
      completionCapability: created.capabilities.completionCapability,
      purpose: 'signin',
      transactionId: created.transaction.id,
    });
    const authorized = await store.authorize(created.transaction.id, 'user-1');
    let createdSessions = 0;
    let transactionRuns = 0;
    const transactionRunner = <R>(
      callback: (transaction: WechatMobileDatabaseAdapter) => Promise<R>,
    ) => {
      transactionRuns += 1;
      return adapter.transaction(callback);
    };
    const session = await store.consumeWithSession({
      accountSwitchConfirmed: false,
      createSession: async () => {
        createdSessions += 1;
        return { id: 'session-1' };
      },
      recoverySeconds: 60,
      transaction: authorized!,
      transactionRunner,
    });
    const replay = await store.consumeWithSession({
      accountSwitchConfirmed: false,
      createSession: async () => {
        createdSessions += 1;
        return { id: 'session-2' };
      },
      recoverySeconds: 60,
      transaction: authorized!,
      transactionRunner,
    });

    expect(session).toEqual({ id: 'session-1' });
    expect(replay).toBeNull();
    expect(createdSessions).toBe(1);
    expect(transactionRuns).toBe(2);
    expect(await store.find(created.transaction.id)).toMatchObject({
      issuedSessionId: 'session-1',
      state: 'consumed',
    });
  });

  it('rolls session and transaction reservation back together on failure', async () => {
    const adapter = new MemoryAdapter();
    const store = new WechatMobileTransactionStore(adapter);
    const created = await store.create({ callbackUrl: '/', purpose: 'signin' });
    await store.beginAuthorization({
      completionCapability: created.capabilities.completionCapability,
      purpose: 'signin',
      transactionId: created.transaction.id,
    });
    const authorized = await store.authorize(created.transaction.id, 'user-1');

    await expect(
      store.consumeWithSession({
        accountSwitchConfirmed: false,
        createSession: async () => {
          throw new Error('session_write_failed');
        },
        recoverySeconds: 60,
        transaction: authorized!,
      }),
    ).rejects.toThrow('session_write_failed');
    expect(await store.find(created.transaction.id)).toMatchObject({ state: 'authorized' });
  });
});
