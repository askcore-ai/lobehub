import { getCurrentAdapter, runWithTransaction } from '@better-auth/core/context';
import { APIError, createAuthEndpoint, getSessionFromCtx } from 'better-auth/api';
import { setSessionCookie } from 'better-auth/cookies';
import type { BetterAuthPlugin } from 'better-auth/types';
import { z } from 'zod';

import { resolveCanonicalWechatUser, WechatIdentityConflictError } from './identity-resolver';
import {
  cleanupWechatRebindClaims,
  completeWechatRebindProof,
  confirmWechatRebindClaim,
} from './rebind';
import {
  capabilityMatches,
  hashCapability,
  WECHAT_MOBILE_POLL_AFTER_MS,
  type WechatMobileDatabaseAdapter,
  type WechatMobilePurpose,
  type WechatMobileTransaction,
  WechatMobileTransactionStore,
} from './transaction-store';
import {
  exchangeWechatMiniProgramCode,
  exchangeWechatWebsiteCode,
  WechatProviderError,
} from './wechat-client';

export type WechatIdentityMode = 'canonical' | 'legacy' | 'maintenance';

export interface WechatMobileLoginOptions {
  appId: string;
  appSecret: string;
  appURL: string;
  identityMode: WechatIdentityMode;
  miniProgramAppId: string;
  mobileLoginEnabled: boolean;
  rebindEnabled: boolean;
  recoverySeconds: number;
  schemePath: 'pages/login/index';
  transactionTtlSeconds: 300;
  websiteAppSecret: string;
}

const transactionId = z.string().min(8).max(128);
const capability = z.string().length(43);
const signedCookieName = (id: string) => `__Host-askcore-wxm-${id}`;
const noStore = { 'Cache-Control': 'private, no-store' };
type EndpointStatus = ConstructorParameters<typeof APIError>[0];

interface AuthorizationFailure {
  code: string;
  failureCode: string;
  retryable: boolean;
  status: EndpointStatus;
}

const endpointError = (status: ConstructorParameters<typeof APIError>[0], code: string): never => {
  throw new APIError(status, { code, message: code });
};

const classifyAuthorizationFailure = (error: unknown): AuthorizationFailure => {
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

const rejectAuthorizationFailure = async (
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

function requireTruthy<T>(
  value: T,
  status: ConstructorParameters<typeof APIError>[0],
  code: string,
): asserts value is Exclude<T, '' | 0 | false | null | undefined> {
  if (!value) endpointError(status, code);
}

const normalizeCallback = (callbackURL: string, appURL: string): string => {
  const base = new URL(appURL);
  const candidate = new URL(callbackURL, base);
  if (candidate.origin !== base.origin || !candidate.pathname.startsWith('/')) {
    endpointError('BAD_REQUEST', 'INVALID_CALLBACK_URL');
  }
  return `${candidate.pathname}${candidate.search}${candidate.hash}`;
};

const requireOrigin = (request: Request | undefined, appURL: string): void => {
  const origin = request?.headers.get('origin');
  if (!origin || origin !== new URL(appURL).origin) {
    endpointError('FORBIDDEN', 'UNTRUSTED_ORIGIN');
  }
};

const requireNotMaintenance = (options: WechatMobileLoginOptions): void => {
  if (options.identityMode === 'maintenance') {
    endpointError('LOCKED', 'WECHAT_IDENTITY_MAINTENANCE');
  }
};

const requireMobileEnabled = (options: WechatMobileLoginOptions): void => {
  requireNotMaintenance(options);
  if (!options.mobileLoginEnabled) endpointError('NOT_FOUND', 'WECHAT_MOBILE_LOGIN_DISABLED');
  if (options.identityMode !== 'canonical') {
    endpointError('SERVICE_UNAVAILABLE', 'WECHAT_CANONICAL_IDENTITY_REQUIRED');
  }
  if (!options.miniProgramAppId || !options.appSecret) {
    endpointError('SERVICE_UNAVAILABLE', 'WECHAT_MOBILE_LOGIN_MISCONFIGURED');
  }
};

const requireRebindEnabled = (options: WechatMobileLoginOptions): void => {
  requireNotMaintenance(options);
  if (!options.rebindEnabled) endpointError('NOT_FOUND', 'WECHAT_REBIND_DISABLED');
};

const requireMiniProgramRebind = (options: WechatMobileLoginOptions): void => {
  requireRebindEnabled(options);
  if (!options.miniProgramAppId || !options.appSecret) {
    endpointError('SERVICE_UNAVAILABLE', 'WECHAT_REBIND_MISCONFIGURED');
  }
};

const requireWebsiteRebind = (options: WechatMobileLoginOptions): void => {
  requireRebindEnabled(options);
  if (!options.appId || !options.websiteAppSecret) {
    endpointError('SERVICE_UNAVAILABLE', 'WECHAT_REBIND_MISCONFIGURED');
  }
};

const openTarget = (
  options: WechatMobileLoginOptions,
  purpose: WechatMobilePurpose,
  transactionIdValue: string,
  completionCapability: string,
): string => {
  const query = new URLSearchParams({
    c: completionCapability,
    p: purpose,
    t: transactionIdValue,
  }).toString();
  const scheme = new URL('weixin://dl/business/');
  scheme.searchParams.set('appid', options.miniProgramAppId);
  scheme.searchParams.set('path', options.schemePath);
  scheme.searchParams.set('query', query);
  scheme.searchParams.set('env_version', 'release');
  return scheme.toString();
};

const publicState = (transaction: WechatMobileTransaction) => ({
  ...(transaction.failureCode ? { reason: transaction.failureCode } : {}),
  state: transaction.state === 'authorizing' ? 'pending' : transaction.state,
});

const websiteRebindTarget = (
  options: WechatMobileLoginOptions,
  transactionIdValue: string,
  oauthState: string,
): string => {
  const state = `${transactionIdValue}.${oauthState}`;
  const callback = new URL('/api/auth/wechat-rebind/callback', options.appURL);
  const authorization = new URL('https://open.weixin.qq.com/connect/qrconnect');
  authorization.searchParams.set('appid', options.appId);
  authorization.searchParams.set('redirect_uri', callback.toString());
  authorization.searchParams.set('response_type', 'code');
  authorization.searchParams.set('scope', 'snsapi_login');
  authorization.searchParams.set('state', state);
  authorization.hash = 'wechat_redirect';
  return authorization.toString();
};

const parseWebsiteRebindState = (state: string) => {
  const delimiter = state.lastIndexOf('.');
  if (delimiter <= 0) endpointError('BAD_REQUEST', 'INVALID_WECHAT_REBIND_STATE');
  return {
    oauthState: capability.parse(state.slice(delimiter + 1)),
    transactionId: transactionId.parse(state.slice(0, delimiter)),
  };
};

const readBrowserCookieProof = async (
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

const readBrowserProofs = async (
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

const currentSession = async (ctx: Parameters<typeof getSessionFromCtx>[0]) => {
  try {
    return await getSessionFromCtx(ctx);
  } catch {
    return null;
  }
};

const isLegacyWechatIdentityRequest = async (request: Request): Promise<boolean> => {
  const path = new URL(request.url).pathname;
  if (path.endsWith('/api/auth/oauth2/callback/wechat')) return true;
  if (
    request.method !== 'POST' ||
    (!path.endsWith('/api/auth/sign-in/social') && !path.endsWith('/api/auth/sign-in/oauth2'))
  ) {
    return false;
  }
  try {
    const body = (await request.clone().json()) as {
      provider?: string;
      providerId?: string;
    };
    return body.provider === 'wechat' || body.providerId === 'wechat';
  } catch {
    return false;
  }
};

export const wechatMobileLogin = (options: WechatMobileLoginOptions): BetterAuthPlugin => {
  if (options.recoverySeconds < 1 || options.recoverySeconds > 300) {
    throw new Error('AUTH_WECHAT_SESSION_RECOVERY_SECONDS must be between 1 and 300');
  }
  if (options.transactionTtlSeconds !== 300) {
    throw new Error('AUTH_WECHAT_TRANSACTION_TTL_SECONDS must be exactly 300');
  }
  const browserBindingMaxAge = options.transactionTtlSeconds + options.recoverySeconds;
  const adapterFor = (ctx: { context: { adapter: unknown } }) =>
    ctx.context.adapter as WechatMobileDatabaseAdapter;
  const storeFor = (ctx: { context: { adapter: unknown } }) =>
    new WechatMobileTransactionStore(adapterFor(ctx));

  return {
    id: 'wechat-mobile-login',
    onRequest: async (request) => {
      if (
        options.identityMode === 'maintenance' &&
        (await isLegacyWechatIdentityRequest(request))
      ) {
        return {
          response: Response.json(
            {
              code: 'WECHAT_IDENTITY_MAINTENANCE',
              message: 'WECHAT_IDENTITY_MAINTENANCE',
            },
            {
              headers: noStore,
              status: 423,
            },
          ),
        };
      }
    },
    rateLimit: [
      {
        max: 10,
        pathMatcher: (path) => path === '/wechat-mobile/start',
        window: 60,
      },
      {
        max: 120,
        pathMatcher: (path) => path === '/wechat-mobile/status',
        window: 60,
      },
      {
        max: 10,
        pathMatcher: (path) =>
          path === '/wechat-mobile/confirm' ||
          path === '/wechat-rebind/prove' ||
          path === '/wechat-rebind/callback',
        window: 60,
      },
      {
        max: 20,
        pathMatcher: (path) =>
          path === '/wechat-mobile/consume' ||
          path === '/wechat-mobile/cancel' ||
          path === '/wechat-rebind/confirm',
        window: 60,
      },
    ],
    schema: {
      wechatMobileLoginTransaction: {
        fields: {
          accountSwitchConfirmedAt: { required: false, type: 'date' },
          attemptCount: { defaultValue: 0, required: true, type: 'number' },
          authorizedAt: { required: false, type: 'date' },
          authorizedUserId: {
            references: { field: 'id', model: 'user' },
            required: false,
            type: 'string',
          },
          browserCookieBindingHash: { required: true, type: 'string' },
          callbackUrl: { required: true, type: 'string' },
          completionCapabilityHash: { required: true, type: 'string' },
          consumedAt: { required: false, type: 'date' },
          createdAt: { required: true, type: 'date' },
          expiresAt: { required: true, type: 'date' },
          failureCode: { required: false, type: 'string' },
          initiatingSessionIdHash: { required: false, type: 'string' },
          initiatingUserId: {
            references: { field: 'id', model: 'user' },
            required: false,
            type: 'string',
          },
          issuedSessionId: { required: false, type: 'string' },
          oauthStateHash: { required: true, type: 'string' },
          purpose: { required: true, type: 'string' },
          rebindAccountRowId: {
            references: { field: 'id', model: 'account' },
            required: false,
            type: 'string',
          },
          recoveryUntil: { required: false, type: 'date' },
          state: { defaultValue: 'pending', required: true, type: 'string' },
          tabBindingHash: { required: true, type: 'string' },
          updatedAt: { required: true, type: 'date' },
        },
        modelName: 'wechatMobileLoginTransaction',
      },
      wechatRebindClaim: {
        fields: {
          applyBefore: { required: false, type: 'date' },
          confirmationExpiresAt: { required: true, type: 'date' },
          confirmedAt: { required: false, type: 'date' },
          createdAt: { required: true, type: 'date' },
          legacyAccountRowId: {
            references: { field: 'id', model: 'account' },
            required: true,
            type: 'string',
          },
          sourceTransactionId: {
            references: { field: 'id', model: 'wechatMobileLoginTransaction' },
            required: true,
            type: 'string',
          },
          state: { defaultValue: 'pending_confirmation', required: true, type: 'string' },
          updatedAt: { required: true, type: 'date' },
          userId: {
            references: { field: 'id', model: 'user' },
            required: true,
            type: 'string',
          },
          verifiedUnionid: { required: true, type: 'string' },
        },
        modelName: 'wechatRebindClaim',
      },
    },
    endpoints: {
      cancelWechatMobileLogin: createAuthEndpoint(
        '/wechat-mobile/cancel',
        {
          body: z.object({ transactionId }),
          method: 'POST',
        },
        async (ctx) => {
          const proofs = await readBrowserProofs(ctx, ctx.body.transactionId);
          const store = storeFor(ctx);
          const transaction = await store.requireBrowserBinding({
            ...proofs,
            transactionId: ctx.body.transactionId,
          });
          requireTruthy(transaction, 'UNAUTHORIZED', 'INVALID_BROWSER_BINDING');
          const cancelled = await store.cancel(transaction.id);
          if (!cancelled && transaction.state !== 'cancelled') {
            endpointError('CONFLICT', 'WECHAT_TRANSACTION_NOT_CANCELLABLE');
          }
          return ctx.json({ state: 'cancelled' }, { headers: noStore });
        },
      ),
      confirmWechatMobileLogin: createAuthEndpoint(
        '/wechat-mobile/confirm',
        {
          body: z.object({
            code: z.string().min(1).max(256),
            completionCapability: capability,
            transactionId,
          }),
          method: 'POST',
        },
        async (ctx) => {
          requireMobileEnabled(options);
          const store = storeFor(ctx);
          const started = await store.beginAuthorization({
            completionCapability: ctx.body.completionCapability,
            purpose: 'signin',
            transactionId: ctx.body.transactionId,
          });
          requireTruthy(started, 'NOT_FOUND', 'WECHAT_TRANSACTION_NOT_FOUND');
          try {
            const codeSession = await exchangeWechatMiniProgramCode({
              appId: options.miniProgramAppId,
              appSecret: options.appSecret,
              code: ctx.body.code,
            });
            const user = await resolveCanonicalWechatUser(ctx, codeSession.unionid, {
              allowCreate: true,
            });
            const authorized = await store.authorize(started.id, user.id);
            if (!authorized) endpointError('CONFLICT', 'WECHAT_TRANSACTION_REPLAYED');
            return ctx.json({ state: 'authorized' }, { headers: noStore });
          } catch (error) {
            return rejectAuthorizationFailure(store, started.id, error);
          }
        },
      ),
      consumeWechatMobileLogin: createAuthEndpoint(
        '/wechat-mobile/consume',
        {
          body: z.object({
            confirmAccountSwitch: z.boolean(),
            transactionId,
          }),
          method: 'POST',
        },
        async (ctx) => {
          requireMobileEnabled(options);
          const store = storeFor(ctx);
          const proofs = await readBrowserProofs(ctx, ctx.body.transactionId);
          const transaction = await store.requireBrowserBinding({
            ...proofs,
            transactionId: ctx.body.transactionId,
          });
          requireTruthy(transaction, 'UNAUTHORIZED', 'INVALID_BROWSER_BINDING');
          if (transaction.state !== 'consumed' && transaction.expiresAt <= new Date())
            endpointError('GONE', 'WECHAT_TRANSACTION_EXPIRED');
          requireTruthy(
            transaction.authorizedUserId,
            'CONFLICT',
            'WECHAT_TRANSACTION_NOT_AUTHORIZED',
          );
          const adapter = adapterFor(ctx);
          const issueCookie = async (session: Record<string, unknown>) => {
            const user = await ctx.context.internalAdapter.findUserById(
              transaction.authorizedUserId!,
            );
            requireTruthy(user, 'CONFLICT', 'WECHAT_IDENTITY_OWNER_MISSING');
            await setSessionCookie(ctx, { session: session as never, user });
            return ctx.json({ redirectTo: transaction.callbackUrl }, { headers: noStore });
          };
          if (transaction.state === 'consumed') {
            if (
              !transaction.issuedSessionId ||
              !transaction.recoveryUntil ||
              transaction.recoveryUntil <= new Date()
            ) {
              endpointError('GONE', 'WECHAT_SESSION_RECOVERY_EXPIRED');
            }
            const session = await adapter.findOne<Record<string, unknown>>({
              model: 'session',
              where: [{ field: 'id', value: transaction.issuedSessionId }],
            });
            requireTruthy(session, 'GONE', 'WECHAT_SESSION_RECOVERY_EXPIRED');
            return issueCookie(session);
          }
          if (transaction.state !== 'authorized') {
            endpointError('CONFLICT', 'WECHAT_TRANSACTION_NOT_AUTHORIZED');
          }
          const sessionAtConsume = await currentSession(ctx);
          const currentSessionId = sessionAtConsume?.session.id;
          const currentSessionMatches = transaction.initiatingSessionIdHash
            ? Boolean(
                currentSessionId &&
                hashCapability('session-id', currentSessionId) ===
                  transaction.initiatingSessionIdHash,
              )
            : !currentSessionId;
          if (!currentSessionMatches) {
            endpointError('CONFLICT', 'WECHAT_INITIATING_SESSION_CHANGED');
          }
          const switching =
            Boolean(transaction.initiatingUserId) &&
            transaction.initiatingUserId !== transaction.authorizedUserId;
          if (switching && !ctx.body.confirmAccountSwitch) {
            endpointError('CONFLICT', 'ACCOUNT_SWITCH_CONFIRMATION_REQUIRED');
          }
          const session = await store.consumeWithSession({
            accountSwitchConfirmed: switching && ctx.body.confirmAccountSwitch,
            createSession: () =>
              ctx.context.internalAdapter.createSession(transaction.authorizedUserId!),
            recoverySeconds: options.recoverySeconds,
            transaction,
            transactionRunner: (callback) =>
              runWithTransaction(adapterFor(ctx) as never, async () =>
                callback(
                  (await getCurrentAdapter(
                    adapterFor(ctx) as never,
                  )) as WechatMobileDatabaseAdapter,
                ),
              ).then((result) => result),
          });
          requireTruthy(session, 'CONFLICT', 'WECHAT_TRANSACTION_REPLAYED');
          return issueCookie(session as unknown as Record<string, unknown>);
        },
      ),
      getWechatMobileLoginStatus: createAuthEndpoint(
        '/wechat-mobile/status',
        {
          method: 'GET',
          query: z.object({ transactionId }),
        },
        async (ctx) => {
          const proofs = await readBrowserProofs(ctx, ctx.query.transactionId);
          const transaction = await storeFor(ctx).requireBrowserBinding({
            ...proofs,
            transactionId: ctx.query.transactionId,
          });
          requireTruthy(transaction, 'UNAUTHORIZED', 'INVALID_BROWSER_BINDING');
          const now = new Date();
          if (
            transaction.expiresAt <= now &&
            (transaction.state !== 'consumed' ||
              !transaction.recoveryUntil ||
              transaction.recoveryUntil <= now)
          ) {
            endpointError('GONE', 'WECHAT_TRANSACTION_EXPIRED');
          }
          return ctx.json(publicState(transaction), { headers: noStore });
        },
      ),
      startWechatMobileLogin: createAuthEndpoint(
        '/wechat-mobile/start',
        {
          body: z.object({ callbackURL: z.string().min(1).max(2048) }),
          method: 'POST',
        },
        async (ctx) => {
          requireOrigin(ctx.request, options.appURL);
          requireMobileEnabled(options);
          const session = await currentSession(ctx);
          const store = storeFor(ctx);
          await store.cleanupExpired();
          await cleanupWechatRebindClaims(adapterFor(ctx));
          const created = await store.create({
            callbackUrl: normalizeCallback(ctx.body.callbackURL, options.appURL),
            initiatingSessionId: session?.session.id,
            initiatingUserId: session?.user.id,
            purpose: 'signin',
          });
          await ctx.setSignedCookie(
            signedCookieName(created.transaction.id),
            created.capabilities.browserCookie,
            ctx.context.secret,
            {
              httpOnly: true,
              maxAge: browserBindingMaxAge,
              path: '/',
              sameSite: 'lax',
              secure: true,
            },
          );
          return ctx.json(
            {
              expiresAt: created.transaction.expiresAt.toISOString(),
              openTarget: openTarget(
                options,
                'signin',
                created.transaction.id,
                created.capabilities.completionCapability,
              ),
              pollAfterMs: WECHAT_MOBILE_POLL_AFTER_MS,
              tabBinding: created.capabilities.tabBinding,
              transactionId: created.transaction.id,
            },
            { headers: noStore },
          );
        },
      ),
      startWechatRebind: createAuthEndpoint(
        '/wechat-rebind/start',
        {
          body: z.object({
            channel: z.enum(['desktop', 'mobile']),
            legacyAccountRowId: z.string().min(1).max(128).optional(),
          }),
          method: 'POST',
        },
        async (ctx) => {
          requireOrigin(ctx.request, options.appURL);
          requireRebindEnabled(options);
          if (ctx.body.channel === 'mobile') requireMiniProgramRebind(options);
          else requireWebsiteRebind(options);
          const session = await currentSession(ctx);
          requireTruthy(session, 'UNAUTHORIZED', 'AUTHENTICATED_REBIND_REQUIRED');
          const accounts = await ctx.context.internalAdapter.findAccountByUserId(session.user.id);
          const candidates = accounts.filter((account) => account.providerId === 'wechat');
          const account = ctx.body.legacyAccountRowId
            ? candidates.find((item) => item.id === ctx.body.legacyAccountRowId)
            : candidates.length === 1
              ? candidates[0]
              : undefined;
          requireTruthy(account, 'CONFLICT', 'WECHAT_REBIND_ACCOUNT_SELECTION_REQUIRED');
          const store = storeFor(ctx);
          await store.cleanupExpired();
          await cleanupWechatRebindClaims(adapterFor(ctx));
          const created = await store.create({
            callbackUrl: '/wechat-rebind',
            initiatingSessionId: session.session.id,
            initiatingUserId: session.user.id,
            purpose: 'rebind',
            rebindAccountRowId: account.id,
          });
          await ctx.setSignedCookie(
            signedCookieName(created.transaction.id),
            created.capabilities.browserCookie,
            ctx.context.secret,
            {
              httpOnly: true,
              maxAge: browserBindingMaxAge,
              path: '/',
              sameSite: 'lax',
              secure: true,
            },
          );
          return ctx.json(
            {
              expiresAt: created.transaction.expiresAt.toISOString(),
              openTarget:
                ctx.body.channel === 'mobile'
                  ? openTarget(
                      options,
                      'rebind',
                      created.transaction.id,
                      created.capabilities.completionCapability,
                    )
                  : websiteRebindTarget(
                      options,
                      created.transaction.id,
                      created.capabilities.oauthState,
                    ),
              pollAfterMs: WECHAT_MOBILE_POLL_AFTER_MS,
              tabBinding: created.capabilities.tabBinding,
              transactionId: created.transaction.id,
            },
            { headers: noStore },
          );
        },
      ),
      proveWechatRebind: createAuthEndpoint(
        '/wechat-rebind/prove',
        {
          body: z.object({
            code: z.string().min(1).max(256),
            completionCapability: capability,
            transactionId,
          }),
          method: 'POST',
        },
        async (ctx) => {
          requireMiniProgramRebind(options);
          const store = storeFor(ctx);
          const started = await store.beginAuthorization({
            completionCapability: ctx.body.completionCapability,
            purpose: 'rebind',
            transactionId: ctx.body.transactionId,
          });
          requireTruthy(started, 'NOT_FOUND', 'WECHAT_TRANSACTION_NOT_FOUND');
          requireTruthy(started.initiatingUserId, 'NOT_FOUND', 'WECHAT_TRANSACTION_NOT_FOUND');
          requireTruthy(started.rebindAccountRowId, 'NOT_FOUND', 'WECHAT_TRANSACTION_NOT_FOUND');
          try {
            const codeSession = await exchangeWechatMiniProgramCode({
              appId: options.miniProgramAppId,
              appSecret: options.appSecret,
              code: ctx.body.code,
            });
            await completeWechatRebindProof({
              adapter: adapterFor(ctx),
              legacyAccountRowId: started.rebindAccountRowId,
              sourceTransactionId: started.id,
              unionid: codeSession.unionid,
              userId: started.initiatingUserId,
            });
            return ctx.json({ state: 'authorized' }, { headers: noStore });
          } catch (error) {
            return rejectAuthorizationFailure(store, started.id, error);
          }
        },
      ),
      callbackWechatRebind: createAuthEndpoint(
        '/wechat-rebind/callback',
        {
          method: 'GET',
          query: z.object({
            code: z.string().min(1).max(256),
            state: z.string().min(1).max(256),
          }),
        },
        async (ctx) => {
          requireWebsiteRebind(options);
          const state = parseWebsiteRebindState(ctx.query.state);
          const session = await currentSession(ctx);
          requireTruthy(session, 'UNAUTHORIZED', 'AUTHENTICATED_REBIND_REQUIRED');
          const store = storeFor(ctx);
          const pending = await store.find(state.transactionId);
          requireTruthy(pending, 'UNAUTHORIZED', 'INVALID_BROWSER_BINDING');
          const browserCookie = await readBrowserCookieProof(ctx, state.transactionId);
          if (
            pending.purpose !== 'rebind' ||
            pending.initiatingUserId !== session.user.id ||
            !pending.initiatingSessionIdHash ||
            hashCapability('session-id', session.session.id) !== pending.initiatingSessionIdHash ||
            !capabilityMatches('browser-cookie', browserCookie, pending.browserCookieBindingHash)
          ) {
            endpointError('UNAUTHORIZED', 'INVALID_BROWSER_BINDING');
          }
          const started = await store.beginWebsiteAuthorization({
            oauthState: state.oauthState,
            purpose: 'rebind',
            transactionId: state.transactionId,
          });
          requireTruthy(started, 'NOT_FOUND', 'WECHAT_TRANSACTION_NOT_FOUND');
          requireTruthy(started.rebindAccountRowId, 'NOT_FOUND', 'WECHAT_TRANSACTION_NOT_FOUND');
          const redirect = (error?: string): never => {
            const target = new URL('/wechat-rebind', options.appURL);
            target.searchParams.set('transactionId', started.id);
            if (error) target.searchParams.set('error', error);
            ctx.setHeader('Cache-Control', noStore['Cache-Control']);
            throw ctx.redirect(target.toString());
          };
          let callbackError: string | undefined;
          try {
            const codeSession = await exchangeWechatWebsiteCode({
              appId: options.appId,
              appSecret: options.websiteAppSecret,
              code: ctx.query.code,
            });
            await completeWechatRebindProof({
              adapter: adapterFor(ctx),
              legacyAccountRowId: started.rebindAccountRowId,
              sourceTransactionId: started.id,
              unionid: codeSession.unionid,
              userId: started.initiatingUserId!,
            });
          } catch (error) {
            const failure = classifyAuthorizationFailure(error);
            if (failure.retryable) {
              await store.restorePending(started.id);
            } else {
              await store.fail(started.id, failure.failureCode);
            }
            callbackError = failure.code;
          }
          return redirect(callbackError);
        },
      ),
      confirmWechatRebind: createAuthEndpoint(
        '/wechat-rebind/confirm',
        {
          body: z.object({ transactionId }),
          method: 'POST',
        },
        async (ctx) => {
          requireRebindEnabled(options);
          const session = await currentSession(ctx);
          requireTruthy(session, 'UNAUTHORIZED', 'AUTHENTICATED_REBIND_REQUIRED');
          const proofs = await readBrowserProofs(ctx, ctx.body.transactionId);
          const transaction = await storeFor(ctx).requireBrowserBinding({
            ...proofs,
            transactionId: ctx.body.transactionId,
          });
          requireTruthy(transaction, 'CONFLICT', 'WECHAT_REBIND_CONFIRMATION_REJECTED');
          if (
            transaction.purpose !== 'rebind' ||
            transaction.initiatingUserId !== session.user.id ||
            transaction.state !== 'authorized' ||
            transaction.expiresAt <= new Date() ||
            !transaction.initiatingSessionIdHash ||
            hashCapability('session-id', session.session.id) !== transaction.initiatingSessionIdHash
          ) {
            endpointError('CONFLICT', 'WECHAT_REBIND_CONFIRMATION_REJECTED');
          }
          const claim = await adapterFor(ctx).findOne<{ id: string }>({
            model: 'wechatRebindClaim',
            where: [
              { field: 'sourceTransactionId', value: transaction.id },
              { field: 'userId', value: session.user.id },
            ],
          });
          requireTruthy(claim, 'CONFLICT', 'WECHAT_REBIND_CONFIRMATION_REJECTED');
          const confirmed = await confirmWechatRebindClaim({
            adapter: adapterFor(ctx),
            claimId: claim.id,
            userId: session.user.id,
          });
          if (!confirmed) endpointError('CONFLICT', 'WECHAT_REBIND_CONFIRMATION_REJECTED');
          return ctx.json({ state: 'verified' }, { headers: noStore });
        },
      ),
    },
  };
};
