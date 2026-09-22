import { authEnv } from '@/envs/auth';
import { canonicalWechatIdentity } from '@/libs/better-auth/plugins/wechat-mobile-login/identity-resolver';

import { type GenericProviderDefinition } from '../types';

const WECHAT_AUTHORIZATION_URL = 'https://open.weixin.qq.com/connect/qrconnect';
const WECHAT_TOKEN_URL = 'https://api.weixin.qq.com/sns/oauth2/access_token';
const WECHAT_USERINFO_URL = 'https://api.weixin.qq.com/sns/userinfo';

type WeChatTokenResponse = {
  access_token?: string;
  errcode?: number;
  errmsg?: string;
  expires_in?: number;
  openid?: string;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  unionid?: string;
};

const parseWechatScopes = (scope: string | undefined) =>
  scope ? scope.split(' ').filter(Boolean) : [];

const provider: GenericProviderDefinition<{
  AUTH_WECHAT_ID: string;
  AUTH_WECHAT_SECRET: string;
}> = {
  build: (env) => {
    const clientId = env.AUTH_WECHAT_ID;
    const clientSecret = env.AUTH_WECHAT_SECRET;

    return {
      authorizationUrl: WECHAT_AUTHORIZATION_URL,
      authorizationUrlParams: {
        appid: clientId,
        response_type: 'code',
        scope: 'snsapi_login',
      },
      clientId,
      clientSecret,
      /**
       * WeChat uses a non-standard token endpoint (GET with appid/secret/code)
       * and returns openid/unionid alongside tokens, so we exchange the code
       * manually instead of proxying through a custom API route.
       */
      getToken: async ({ code }) => {
        const tokenUrl = new URL(WECHAT_TOKEN_URL);
        tokenUrl.searchParams.set('appid', clientId);
        tokenUrl.searchParams.set('secret', clientSecret);
        tokenUrl.searchParams.set('code', code);
        tokenUrl.searchParams.set('grant_type', 'authorization_code');

        let response: Response;
        let data: WeChatTokenResponse;
        try {
          response = await fetch(tokenUrl, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
          data = (await response.json()) as WeChatTokenResponse;
        } catch {
          throw new Error('wechat_token_exchange_failed');
        }
        if (!response.ok || !data || data.errcode ||
            typeof data.access_token !== 'string' || !data.access_token.trim() ||
            typeof data.openid !== 'string' || !data.openid.trim()) {
          throw new Error('wechat_token_exchange_failed');
        }

        return {
          accessToken: data.access_token,
          accessTokenExpiresAt: data.expires_in
            ? new Date(Date.now() + data.expires_in * 1000)
            : undefined,
          expiresIn: data.expires_in,
          raw: { openid: data.openid, unionid: data.unionid },
          refreshToken: data.refresh_token,
          refreshTokenExpiresAt: undefined,
          scopes: parseWechatScopes(data.scope),
          tokenType: data.token_type ?? 'Bearer',
        };
      },

      /**
       * Use openid/unionid returned in the token response; no custom scope encoding needed.
       */
      getUserInfo: async (tokens) => {
        const accessToken = tokens.accessToken;
        const openId = (tokens as { raw?: WeChatTokenResponse }).raw?.openid;
        const unionId = (tokens as { raw?: WeChatTokenResponse }).raw?.unionid;

        if (typeof accessToken !== 'string' || !accessToken || typeof openId !== 'string' || !openId) {
          return null;
        }

        const url = new URL(WECHAT_USERINFO_URL);
        url.searchParams.set('access_token', accessToken);
        url.searchParams.set('openid', openId);
        url.searchParams.set('lang', 'zh_CN');

        try {
          const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
          if (!response.ok) return null;
          const profile = (await response.json()) as Record<string, unknown> | null;
          if (!profile || profile.errcode || profile.openid !== openId) return null;
          if (unionId !== undefined && profile.unionid !== undefined && unionId !== profile.unionid) return null;
          const identity = canonicalWechatIdentity(unionId ?? profile.unionid);
          return {
            email: identity.email,
            emailVerified: false,
            id: identity.accountId,
            image: typeof profile.headimgurl === 'string' ? profile.headimgurl : undefined,
            name: typeof profile.nickname === 'string' && profile.nickname ? profile.nickname : '微信用户',
          };
        } catch {
          // Generic OAuth owns the failure redirect; never log raw provider data.
          return null;
        }
      },

      pkce: false,

      providerId: 'wechat',

      responseMode: 'query',

      scopes: ['snsapi_login'],

      tokenUrl: WECHAT_TOKEN_URL,
    };
  },

  checkEnvs: () => {
    return !!(authEnv.AUTH_WECHAT_ID && authEnv.AUTH_WECHAT_SECRET)
      ? {
          AUTH_WECHAT_ID: authEnv.AUTH_WECHAT_ID,
          AUTH_WECHAT_SECRET: authEnv.AUTH_WECHAT_SECRET,
        }
      : false;
  },
  id: 'wechat',
  type: 'generic',
};

export default provider;
