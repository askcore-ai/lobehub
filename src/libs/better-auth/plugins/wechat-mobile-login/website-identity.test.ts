import { describe, expect, it, vi } from 'vitest';

import { reconcileWebsiteWechatIdentity, type WebsiteIdentityStore } from './website-identity';

const unionId = 'verified-union';
const openId = 'verified-website-openid';

function fixture(initial: { accountId: string; id: string; userId: string }[] = []) {
  const rows = initial.map((row) => ({ ...row }));
  const replace = vi.fn(async (id: string, oldAccountId: string, nextAccountId: string) => {
    const row = rows.find((item) => item.id === id && item.accountId === oldAccountId);
    if (!row || rows.some((item) => item.accountId === nextAccountId)) return false;
    row.accountId = nextAccountId;
    return true;
  });
  const store: WebsiteIdentityStore = {
    transaction: vi.fn(async (_, action) => action({
      find: async (accountId: string) => rows.filter((row) => row.accountId === accountId),
      replace,
    })),
  };
  return { replace, rows, store };
}

describe('proof-bound website identity reconciliation', () => {
  it('requires a valid UnionID before touching persistence', async () => {
    const f = fixture([{ accountId: openId, id: 'old-row', userId: 'old-user' }]);
    await expect(reconcileWebsiteWechatIdentity(f.store, openId, undefined)).rejects.toThrow('missing_unionid');
    expect(f.store.transaction).not.toHaveBeenCalled();
    expect(f.rows[0].accountId).toBe(openId);
  });

  it('rewrites exactly the OpenID row and leaves its owner unchanged', async () => {
    const f = fixture([{ accountId: openId, id: 'old-row', userId: 'old-user' }]);
    await expect(reconcileWebsiteWechatIdentity(f.store, openId, unionId)).resolves.toMatchObject({ accountId: unionId });
    expect(f.rows).toEqual([{ accountId: unionId, id: 'old-row', userId: 'old-user' }]);
    expect(f.replace).toHaveBeenCalledWith('old-row', openId, unionId);
  });

  it('prefers the UnionID owner and never touches a different OpenID row', async () => {
    const f = fixture([
      { accountId: openId, id: 'old-row', userId: 'old-user' },
      { accountId: unionId, id: 'canonical-row', userId: 'canonical-user' },
    ]);
    await reconcileWebsiteWechatIdentity(f.store, openId, unionId);
    expect(f.rows[0].accountId).toBe(openId);
    expect(f.replace).not.toHaveBeenCalled();
  });

  it('rejects duplicate historical matches and a stale compare-and-swap', async () => {
    const duplicates = fixture([
      { accountId: openId, id: 'a', userId: 'a' },
      { accountId: openId, id: 'b', userId: 'b' },
    ]);
    await expect(reconcileWebsiteWechatIdentity(duplicates.store, openId, unionId)).rejects.toThrow('duplicate_openid');
    expect(duplicates.replace).not.toHaveBeenCalled();

    const stale = fixture([{ accountId: openId, id: 'old-row', userId: 'old-user' }]);
    stale.replace.mockResolvedValueOnce(false);
    await expect(reconcileWebsiteWechatIdentity(stale.store, openId, unionId)).rejects.toThrow('stale_openid');
    expect(stale.rows[0].accountId).toBe(openId);
  });

  it('never treats a failed transaction as a successful identity', async () => {
    const store: WebsiteIdentityStore = { transaction: async () => { throw new Error('synthetic_store_failure'); } };
    await expect(reconcileWebsiteWechatIdentity(store, openId, unionId)).rejects.toThrow('synthetic_store_failure');
  });
});
