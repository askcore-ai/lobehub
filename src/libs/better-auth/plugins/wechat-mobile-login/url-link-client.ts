const STABLE_TOKEN_ENDPOINT = 'https://api.weixin.qq.com/cgi-bin/stable_token';
const URL_LINK_ENDPOINT = 'https://api.weixin.qq.com/wxa/generate_urllink';
const REQUEST_TIMEOUT_MS = 8000;
const TOKEN_REFRESH_SKEW_SECONDS = 300;
const MIN_LINK_LIFETIME_SECONDS = 60;
const MAX_LINK_LIFETIME_SECONDS = 30 * 24 * 60 * 60;

const OFFICIAL_URL_LINK_HOSTS = new Set(['wxaurl.cn', 'wxmpurl.cn']);
const ACCESS_TOKEN_ERRORS = new Set([40001, 40014, 42001]);

interface StableTokenResponse {
  access_token?: string;
  errcode?: number;
  expires_in?: number;
}

interface UrlLinkResponse {
  errcode?: number;
  url_link?: string;
}

export interface WechatUrlLinkInput {
  expiresAt: Date;
  query: string;
}

export type WechatUrlLinkGenerator = (input: WechatUrlLinkInput) => Promise<string>;

export class WechatUrlLinkError extends Error {
  constructor(readonly kind: 'invalid_access_token' | 'malformed' | 'unavailable') {
    super(kind);
  }
}

const providerJson = async <T>(response: Response): Promise<T> => {
  if (!response.ok) throw new WechatUrlLinkError('unavailable');
  try {
    return (await response.json()) as T;
  } catch {
    throw new WechatUrlLinkError('malformed');
  }
};

const officialUrlLink = (value: string): string => {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new WechatUrlLinkError('malformed');
  }
  if (
    parsed.protocol !== 'https:' ||
    !OFFICIAL_URL_LINK_HOSTS.has(parsed.hostname) ||
    parsed.username ||
    parsed.password ||
    parsed.port
  ) {
    throw new WechatUrlLinkError('malformed');
  }
  return parsed.toString();
};

export const isOfficialWechatUrlLink = (value: string): boolean => {
  try {
    officialUrlLink(value);
    return true;
  } catch {
    return false;
  }
};

export const createWechatUrlLinkGenerator = (input: {
  appId: string;
  appSecret: string;
  environment: 'release' | 'trial';
  fetcher?: typeof fetch;
  now?: () => number;
  trialExpiresAt?: string;
}): WechatUrlLinkGenerator => {
  const fetcher = input.fetcher ?? fetch;
  const now = input.now ?? Date.now;
  const trialExpiresAt = Date.parse(input.trialExpiresAt || '');
  let cachedToken: { accessToken: string; refreshAt: number } | undefined;
  let tokenRequest: Promise<{ accessToken: string; refreshAt: number }> | undefined;

  const requestToken = async (forceRefresh: boolean) => {
    const response = await fetcher(STABLE_TOKEN_ENDPOINT, {
      body: JSON.stringify({
        appid: input.appId,
        force_refresh: forceRefresh,
        grant_type: 'client_credential',
        secret: input.appSecret,
      }),
      cache: 'no-store',
      headers: { 'content-type': 'application/json' },
      method: 'POST',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const payload = await providerJson<StableTokenResponse>(response);
    if (payload.errcode || !payload.access_token || !Number.isInteger(payload.expires_in)) {
      throw new WechatUrlLinkError(payload.errcode ? 'unavailable' : 'malformed');
    }
    const lifetimeSeconds = Math.max(
      MIN_LINK_LIFETIME_SECONDS,
      (payload.expires_in as number) - TOKEN_REFRESH_SKEW_SECONDS,
    );
    return {
      accessToken: payload.access_token,
      refreshAt: now() + lifetimeSeconds * 1000,
    };
  };

  const accessToken = async (forceRefresh = false): Promise<string> => {
    if (!forceRefresh && cachedToken && cachedToken.refreshAt > now()) {
      return cachedToken.accessToken;
    }
    if (!forceRefresh && tokenRequest) return (await tokenRequest).accessToken;
    const currentRequest = requestToken(forceRefresh);
    tokenRequest = currentRequest;
    try {
      cachedToken = await currentRequest;
      return cachedToken.accessToken;
    } catch (error) {
      if (forceRefresh || (cachedToken && cachedToken.refreshAt <= now())) cachedToken = undefined;
      if (error instanceof WechatUrlLinkError) throw error;
      throw new WechatUrlLinkError('unavailable');
    } finally {
      if (tokenRequest === currentRequest) tokenRequest = undefined;
    }
  };

  const generate = async (token: string, request: WechatUrlLinkInput): Promise<string> => {
    let response: Response;
    try {
      response = await fetcher(`${URL_LINK_ENDPOINT}?access_token=${encodeURIComponent(token)}`, {
        body: JSON.stringify({
          env_version:
            input.environment === 'trial' &&
            Number.isFinite(trialExpiresAt) &&
            request.expiresAt.getTime() <= trialExpiresAt
              ? 'trial'
              : 'release',
          expire_time: Math.floor(request.expiresAt.getTime() / 1000),
          expire_type: 0,
          path: 'pages/login/index',
          query: request.query,
        }),
        cache: 'no-store',
        headers: { 'content-type': 'application/json' },
        method: 'POST',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new WechatUrlLinkError('unavailable');
    }
    const payload = await providerJson<UrlLinkResponse>(response);
    if (payload.errcode) {
      throw new WechatUrlLinkError(
        ACCESS_TOKEN_ERRORS.has(payload.errcode) ? 'invalid_access_token' : 'unavailable',
      );
    }
    if (!payload.url_link) throw new WechatUrlLinkError('malformed');
    return officialUrlLink(payload.url_link);
  };

  return async (request) => {
    const lifetimeSeconds = (request.expiresAt.getTime() - now()) / 1000;
    if (
      !Number.isFinite(lifetimeSeconds) ||
      lifetimeSeconds <= MIN_LINK_LIFETIME_SECONDS ||
      lifetimeSeconds > MAX_LINK_LIFETIME_SECONDS
    ) {
      throw new WechatUrlLinkError('malformed');
    }
    const token = await accessToken();
    try {
      return await generate(token, request);
    } catch (error) {
      if (!(error instanceof WechatUrlLinkError) || error.kind !== 'invalid_access_token') {
        throw error;
      }
      return generate(await accessToken(true), request);
    }
  };
};
