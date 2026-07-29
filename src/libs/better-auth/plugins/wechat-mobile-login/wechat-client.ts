export interface WechatCodeSession {
  openid: string;
  sessionKey: string;
  unionid: string;
}

export interface WechatWebsiteCodeSession {
  accessToken: string;
  openid: string;
  refreshToken?: string;
  unionid: string;
}

export class WechatProviderError extends Error {
  constructor(readonly kind: 'invalid_code' | 'malformed' | 'missing_unionid' | 'retryable') {
    super(kind);
  }
}

interface WechatCode2SessionResponse {
  errcode?: number;
  openid?: string;
  session_key?: string;
  unionid?: string;
}

interface WechatWebsiteTokenResponse {
  access_token?: string;
  errcode?: number;
  openid?: string;
  refresh_token?: string;
  unionid?: string;
}

const parseProviderResponse = async <T>(response: Response): Promise<T> => {
  if (!response.ok) {
    throw new WechatProviderError(response.status >= 500 ? 'retryable' : 'malformed');
  }
  try {
    return (await response.json()) as T;
  } catch {
    throw new WechatProviderError('malformed');
  }
};

export async function exchangeWechatMiniProgramCode(input: {
  appId: string;
  appSecret: string;
  code: string;
  fetcher?: typeof fetch;
}): Promise<WechatCodeSession> {
  const fetcher = input.fetcher ?? fetch;
  const endpoint = new URL('https://api.weixin.qq.com/sns/jscode2session');
  endpoint.searchParams.set('appid', input.appId);
  endpoint.searchParams.set('secret', input.appSecret);
  endpoint.searchParams.set('js_code', input.code);
  endpoint.searchParams.set('grant_type', 'authorization_code');

  let response: Response;
  try {
    response = await fetcher(endpoint, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new WechatProviderError('retryable');
  }
  const payload = await parseProviderResponse<WechatCode2SessionResponse>(response);
  if (payload.errcode) {
    throw new WechatProviderError(
      payload.errcode === 40029 || payload.errcode === 40163 ? 'invalid_code' : 'retryable',
    );
  }
  if (!payload.openid || !payload.session_key) {
    throw new WechatProviderError('malformed');
  }
  if (!payload.unionid) {
    throw new WechatProviderError('missing_unionid');
  }
  return {
    openid: payload.openid,
    sessionKey: payload.session_key,
    unionid: payload.unionid,
  };
}

export async function exchangeWechatWebsiteCode(input: {
  appId: string;
  appSecret: string;
  code: string;
  fetcher?: typeof fetch;
}): Promise<WechatWebsiteCodeSession> {
  const fetcher = input.fetcher ?? fetch;
  const endpoint = new URL('https://api.weixin.qq.com/sns/oauth2/access_token');
  endpoint.searchParams.set('appid', input.appId);
  endpoint.searchParams.set('secret', input.appSecret);
  endpoint.searchParams.set('code', input.code);
  endpoint.searchParams.set('grant_type', 'authorization_code');

  let response: Response;
  try {
    response = await fetcher(endpoint, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new WechatProviderError('retryable');
  }
  const payload = await parseProviderResponse<WechatWebsiteTokenResponse>(response);
  if (payload.errcode) {
    throw new WechatProviderError(
      payload.errcode === 40029 || payload.errcode === 40163 ? 'invalid_code' : 'retryable',
    );
  }
  if (!payload.access_token || !payload.openid) {
    throw new WechatProviderError('malformed');
  }
  if (!payload.unionid) {
    throw new WechatProviderError('missing_unionid');
  }
  return {
    accessToken: payload.access_token,
    openid: payload.openid,
    refreshToken: payload.refresh_token,
    unionid: payload.unionid,
  };
}
