import { createHash } from 'node:crypto';

export class WechatIdentityConflictError extends Error {}

interface IdentityAdapter {
  createOAuthUser: (
    user: Record<string, unknown>,
    account: Record<string, unknown>,
  ) => Promise<{ user: { id: string } }>;
  findAccountByProviderId: (
    accountId: string,
    providerId: string,
  ) => Promise<null | { userId: string }>;
  findUserById: (userId: string) => Promise<null | { id: string }>;
}

export const canonicalWechatIdentity = (unionid: unknown) => {
  if (typeof unionid !== 'string' || !unionid || unionid.trim() !== unionid) {
    throw new WechatIdentityConflictError('missing_unionid');
  }
  const digest = createHash('sha256').update(unionid).digest('hex');
  return { accountId: unionid, email: `wechat-${digest}@identity.askcore.invalid` };
};

export async function resolveCanonicalWechatUser(
  context: { context: { internalAdapter: unknown } },
  unionid: string,
  options: { allowCreate: boolean },
) {
  const identity = canonicalWechatIdentity(unionid);
  const adapter = context.context.internalAdapter as IdentityAdapter;
  const existing = await adapter.findAccountByProviderId(identity.accountId, 'wechat');
  if (existing) {
    const user = await adapter.findUserById(existing.userId);
    if (!user) throw new WechatIdentityConflictError('identity_owner_missing');
    return user;
  }
  if (!options.allowCreate) {
    throw new WechatIdentityConflictError('identity_not_reconciled');
  }
  try {
    const created = await adapter.createOAuthUser(
      {
        email: identity.email,
        emailVerified: true,
        image: null,
        name: '微信用户',
      },
      {
        accountId: identity.accountId,
        providerId: 'wechat',
      },
    );
    return created.user;
  } catch (error) {
    let raced: Awaited<ReturnType<IdentityAdapter['findAccountByProviderId']>>;
    try {
      raced = await adapter.findAccountByProviderId(identity.accountId, 'wechat');
    } catch {
      throw error;
    }
    if (!raced) throw error;
    const user = await adapter.findUserById(raced.userId);
    if (!user) throw new WechatIdentityConflictError('identity_owner_missing');
    return user;
  }
}
