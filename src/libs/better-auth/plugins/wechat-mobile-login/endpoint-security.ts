import { APIError, getSessionFromCtx } from 'better-auth/api';

import { WechatIdentityConflictError } from './identity-resolver';
import type { WechatMobileLoginOptions } from './index';
import type { WechatMobileTransactionStore } from './transaction-store';
import { WechatProviderError } from './wechat-client';

export const signedCookieName = (id: string) => `__Host-askcore-wxm-${id}`;
export const noStore = { 'Cache-Control': 'private, no-store' };
type EndpointStatus = ConstructorParameters<typeof APIError>[0];

interface SignedCookieContext {
  context: { secret: string };
  setSignedCookie: (
    name: string,
    value: string,
    secret: string,
    attributes: {
      httpOnly: boolean;
      maxAge: number;
      path: string;
      sameSite: 'lax';
      secure: boolean;
    },
  ) => Promise<unknown>;
}

interface AuthorizationFailure {
  code: string;
  failureCode: string;
  retryable: boolean;
  status: EndpointStatus;
}

export const endpointError = (status: ConstructorParameters<typeof APIError>[0], code: string): never => {
  throw new APIError(status, { code, message: code });
};

export const classifyAuthorizationFailure = (error: unknown): AuthorizationFailure => {
  if (error instanceof WechatProviderError) {
    if (error.kind === 'retryable') {
      return {
        code: 'WECHAT_PROVIDER_UNAVAILABLE',
        failureCode: 'provider_unavailable',
        retryable: true,
        status: 'SERVICE_UNAVAILABLE',
      };
    }
    if (error.kind === 'malformed') {
      return {
        code: 'WECHAT_PROVIDER_MALFORMED',
        failureCode: 'provider_malformed',
        retryable: true,
        status: 'BAD_GATEWAY',
      };
    }
    if (error.kind === 'invalid_code') {
      return {
        code: 'INVALID_WECHAT_CODE',
        failureCode: 'invalid_code',
        retryable: false,
        status: 'BAD_REQUEST',
      };
    }
    return {
      code: 'WECHAT_UNIONID_REQUIRED',
      failureCode: 'missing_unionid',
      retryable: false,
      status: 'CONFLICT',
    };
  }
  if (error instanceof WechatIdentityConflictError) {
    if (error.message === 'identity_not_reconciled') {
      return {
        code: 'WECHAT_MOBILE_NOT_IN_ROLLOUT',
        failureCode: 'not_in_rollout',
        retryable: false,
        status: 'FORBIDDEN',
      };
    }
    return {
      code: 'WECHAT_IDENTITY_CONFLICT',
      failureCode: 'identity_conflict',
      retryable: false,
      status: 'CONFLICT',
    };
  }
  return {
    code: 'WECHAT_PERSISTENCE_UNAVAILABLE',
    failureCode: 'persistence_unavailable',
    retryable: true,
    status: 'SERVICE_UNAVAILABLE',
  };
};

export const rejectAuthorizationFailure = async (
  store: WechatMobileTransactionStore,
  transactionIdValue: string,
  error: unknown,
): Promise<never> => {
  if (error instanceof APIError) throw error;
  const failure = classifyAuthorizationFailure(error);
  if (failure.retryable) await store.restorePending(transactionIdValue);
  else await store.fail(transactionIdValue, failure.failureCode);
  return endpointError(failure.status, failure.code);
};

export function requireTruthy<T>(
  value: T,
  status: ConstructorParameters<typeof APIError>[0],
  code: string,
): asserts value is Exclude<T, '' | 0 | false | null | undefined> {
  if (!value) endpointError(status, code);
}


export const requireOrigin = (request: Request | undefined, appURL: string): void => {
  const origin = request?.headers.get('origin');
  if (!origin || origin !== new URL(appURL).origin) {
    endpointError('FORBIDDEN', 'UNTRUSTED_ORIGIN');
  }
};

export const requireNotMaintenance = (options: WechatMobileLoginOptions): void => {
  if (options.identityMode === 'maintenance') {
    endpointError('LOCKED', 'WECHAT_IDENTITY_MAINTENANCE');
  }
};

export const requireMobileEnabled = (options: WechatMobileLoginOptions): void => {
  requireNotMaintenance(options);
  if (!options.mobileLoginEnabled) endpointError('NOT_FOUND', 'WECHAT_MOBILE_LOGIN_DISABLED');
  if (options.identityMode !== 'canonical') {
    endpointError('SERVICE_UNAVAILABLE', 'WECHAT_CANONICAL_IDENTITY_REQUIRED');
  }
  if (!options.miniProgramAppId || !options.appSecret) {
    endpointError('SERVICE_UNAVAILABLE', 'WECHAT_MOBILE_LOGIN_MISCONFIGURED');
  }
};

export const requireRebindEnabled = (options: WechatMobileLoginOptions): void => {
  requireNotMaintenance(options);
  if (!options.rebindEnabled) endpointError('NOT_FOUND', 'WECHAT_REBIND_DISABLED');
};

export const requireMiniProgramRebind = (options: WechatMobileLoginOptions): void => {
  requireRebindEnabled(options);
  if (!options.miniProgramAppId || !options.appSecret) {
    endpointError('SERVICE_UNAVAILABLE', 'WECHAT_REBIND_MISCONFIGURED');
  }
};

export const requireWebsiteRebind = (options: WechatMobileLoginOptions): void => {
  requireRebindEnabled(options);
  if (!options.appId || !options.websiteAppSecret) {
    endpointError('SERVICE_UNAVAILABLE', 'WECHAT_REBIND_MISCONFIGURED');
  }
};


export const readBrowserCookieProof = async (
  ctx: {
    context: { secret: string };
    getSignedCookie: (name: string, secret: string) => Promise<false | null | string>;
  },
  id: string,
) => {
  const browserCookie = await ctx.getSignedCookie(signedCookieName(id), ctx.context.secret);
  requireTruthy(browserCookie, 'UNAUTHORIZED', 'INVALID_BROWSER_BINDING');
  return browserCookie;
};

export const expireBrowserBindingCookie = async (ctx: SignedCookieContext, id: string) => {
  await ctx.setSignedCookie(signedCookieName(id), '', ctx.context.secret, {
    httpOnly: true,
    maxAge: 0,
    path: '/',
    sameSite: 'lax',
    secure: true,
  });
};

export const readBrowserProofs = async (
  ctx: {
    context: { secret: string };
    getSignedCookie: (name: string, secret: string) => Promise<false | null | string>;
    request?: Request;
  },
  id: string,
) => {
  const browserCookie = await ctx.getSignedCookie(signedCookieName(id), ctx.context.secret);
  const tabBinding = ctx.request?.headers.get('x-askcore-wechat-tab-binding');
  requireTruthy(browserCookie, 'UNAUTHORIZED', 'INVALID_BROWSER_BINDING');
  requireTruthy(tabBinding, 'UNAUTHORIZED', 'INVALID_BROWSER_BINDING');
  return { browserCookie, tabBinding };
};

export const currentSession = async (ctx: Parameters<typeof getSessionFromCtx>[0]) => {
  try {
    return await getSessionFromCtx(ctx);
  } catch {
    return null;
  }
};
