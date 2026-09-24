import { type LobeChatDatabase } from '@lobechat/database';
import { account } from '@lobechat/database/schemas';
import { and, eq, sql } from 'drizzle-orm';

import { canonicalWechatIdentity, WechatIdentityConflictError } from './identity-resolver';

type WebsiteAccount = { id: string; userId: string };

export interface WebsiteIdentityTransaction {
  find: (accountId: string) => Promise<WebsiteAccount[]>;
  replace: (id: string, oldAccountId: string, unionId: string) => Promise<boolean>;
}

export interface WebsiteIdentityStore {
  transaction: (unionId: string, action: (tx: WebsiteIdentityTransaction) => Promise<void>) => Promise<void>;
}

export const createDatabaseWebsiteIdentityStore = (database: LobeChatDatabase): WebsiteIdentityStore => ({
  transaction: (unionId, action) => database.transaction(async (db) => {
    // All website callbacks for one UnionID serialize before checking either key.
    await db.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${unionId})::bigint)`);
    await action({
      find: (accountId) => db.select({ id: account.id, userId: account.userId })
        .from(account)
        .where(and(eq(account.providerId, 'wechat'), eq(account.accountId, accountId)))
        .limit(2),
      replace: async (id, oldAccountId, nextAccountId) => {
        const changed = await db.update(account)
          .set({ accountId: nextAccountId })
          .where(and(
            eq(account.id, id),
            eq(account.providerId, 'wechat'),
            eq(account.accountId, oldAccountId),
          ))
          .returning({ id: account.id });
        return changed.length === 1;
      },
    });
  }),
});

export const databaseWebsiteIdentityStore: WebsiteIdentityStore = {
  transaction: async (unionId, action) => {
    const { serverDB } = await import('@lobechat/database');
    return createDatabaseWebsiteIdentityStore(serverDB).transaction(unionId, action);
  },
};

/** Reconcile only proof freshly returned by the website AppID's OAuth exchange. */
export async function reconcileWebsiteWechatIdentity(
  store: WebsiteIdentityStore,
  openId: string,
  unionId: unknown,
) {
  const identity = canonicalWechatIdentity(unionId);
  if (!openId || openId.trim() !== openId) throw new WechatIdentityConflictError('invalid_openid');
  await store.transaction(identity.accountId, async (tx) => {
    const canonical = await tx.find(identity.accountId);
    if (canonical.length > 1) throw new WechatIdentityConflictError('duplicate_unionid');
    if (canonical.length === 1) return;

    const historical = await tx.find(openId);
    if (historical.length > 1) throw new WechatIdentityConflictError('duplicate_openid');
    if (historical.length === 0) return;
    if (!(await tx.replace(historical[0].id, openId, identity.accountId))) {
      throw new WechatIdentityConflictError('stale_openid');
    }
  });
  return identity;
}
