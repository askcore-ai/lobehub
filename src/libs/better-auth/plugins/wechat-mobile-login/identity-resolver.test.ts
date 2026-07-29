import { describe, expect, it, vi } from 'vitest';

import { resolveCanonicalWechatUser, WechatIdentityConflictError } from './identity-resolver';

describe('canonical WeChat identity resolver', () => {
  it('resolves only providerId=wechat/accountId=UnionID', async () => {
    const adapter = {
      createOAuthUser: vi.fn(),
      findAccountByProviderId: vi.fn().mockResolvedValue({ userId: 'user-1' }),
      findUserById: vi.fn().mockResolvedValue({ id: 'user-1' }),
    };
    const user = await resolveCanonicalWechatUser(
      { context: { internalAdapter: adapter } },
      'union-1',
      { allowCreate: false },
    );

    expect(user).toEqual({ id: 'user-1' });
    expect(adapter.findAccountByProviderId).toHaveBeenCalledWith('union-1', 'wechat');
    expect(adapter.createOAuthUser).not.toHaveBeenCalled();
  });

  it('never falls back to OpenID or heuristic user matching', async () => {
    const adapter = {
      createOAuthUser: vi.fn(),
      findAccountByProviderId: vi.fn().mockResolvedValue(null),
      findUserById: vi.fn(),
    };
    await expect(
      resolveCanonicalWechatUser({ context: { internalAdapter: adapter } }, 'transport-openid', {
        allowCreate: false,
      }),
    ).rejects.toThrow('identity_not_reconciled');
    expect(adapter.createOAuthUser).not.toHaveBeenCalled();
  });

  it('creates a new canonical account without placing UnionID in synthetic email', async () => {
    const adapter = {
      createOAuthUser: vi
        .fn()
        .mockResolvedValue({ account: { id: 'account-1' }, user: { id: 'user-1' } }),
      findAccountByProviderId: vi.fn().mockResolvedValue(null),
      findUserById: vi.fn(),
    };
    await resolveCanonicalWechatUser({ context: { internalAdapter: adapter } }, 'secret-union-id', {
      allowCreate: true,
    });

    const [user, account] = adapter.createOAuthUser.mock.calls[0];
    expect(user.email).not.toContain('secret-union-id');
    expect(account).toEqual({ accountId: 'secret-union-id', providerId: 'wechat' });
  });

  it('rejects missing UnionID before any database operation', async () => {
    const adapter = {
      createOAuthUser: vi.fn(),
      findAccountByProviderId: vi.fn(),
      findUserById: vi.fn(),
    };
    await expect(
      resolveCanonicalWechatUser({ context: { internalAdapter: adapter } }, '', {
        allowCreate: true,
      }),
    ).rejects.toBeInstanceOf(WechatIdentityConflictError);
    expect(adapter.findAccountByProviderId).not.toHaveBeenCalled();
  });

  it('does not turn a persistence failure into an identity conflict', async () => {
    const persistenceError = new Error('database_unavailable');
    const adapter = {
      createOAuthUser: vi.fn().mockRejectedValue(persistenceError),
      findAccountByProviderId: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(null),
      findUserById: vi.fn(),
    };

    await expect(
      resolveCanonicalWechatUser({ context: { internalAdapter: adapter } }, 'union-1', {
        allowCreate: true,
      }),
    ).rejects.toBe(persistenceError);
  });
});
