import { createAuthEndpoint, getSessionFromCtx } from 'better-auth/api';
import { z } from 'zod';

import {
  endpointError,
  noStore,
  readBrowserProofs,
  rejectAuthorizationFailure,
  requireMiniProgramRebind,
  requireOrigin,
  requireTruthy,
  signedCookieName,
} from './endpoint-security';
import type { WechatMobileLoginOptions } from './index';
import { prepublicationDocument } from './prepublication-page';
import { WechatPrepublicationStore } from './prepublication-store';
import { hashCapability, type WechatMobileDatabaseAdapter, WechatMobileTransactionStore } from './transaction-store';
import { exchangeWechatMiniProgramCode } from './wechat-client';

type Context = Parameters<typeof getSessionFromCtx>[0];
const base = '/wechat-prepublication';
const transactionBody = z.object({ transactionId: z.string().min(8).max(128) }).strict();
const adapterFor = (ctx: Context) => ctx.context.adapter as WechatMobileDatabaseAdapter;

export const prepublicationRateLimits = [
  { max: 10, pathMatcher: (path: string) => path === `${base}/start` || path === `${base}/prove`, window: 60 },
  { max: 120, pathMatcher: (path: string) => path === `${base}/status`, window: 60 },
  { max: 20, pathMatcher: (path: string) => path === base || path === `${base}/finish` || path === `${base}/cancel`, window: 60 },
];

export function prepublicationEndpoints(options: WechatMobileLoginOptions) {
  const guard = (ctx: Context) => {
    ctx.setHeader('Cache-Control', noStore['Cache-Control']);
    requireMiniProgramRebind(options);
    // The current automatic HTTP instrumentation captures provider query strings.
    // Fail closed instead of weakening telemetry globally or leaking jscode2Session.
    if (process.env.ENABLE_TELEMETRY) endpointError('SERVICE_UNAVAILABLE', 'WECHAT_PROOF_PRIVACY_UNAVAILABLE');
  };
  const sessionFor = async (ctx: Context) => {
    const session = await getSessionFromCtx(ctx, { disableCookieCache: true, disableRefresh: true });
    requireTruthy(session, 'UNAUTHORIZED', 'AUTHENTICATED_REBIND_REQUIRED');
    return session;
  };
  const ownedAccount = async (ctx: Context, userId: string) => {
    const account = await adapterFor(ctx).findOne<{ id: string }>({
      model: 'account',
      where: [{ field: 'userId', value: userId }, { field: 'providerId', value: 'wechat' }],
    });
    requireTruthy(account, 'CONFLICT', 'WECHAT_ASSOCIATION_REQUIRED');
  };
  const browserTransaction = async (ctx: Context, id: string) => {
    guard(ctx);
    requireOrigin(ctx.request, options.appURL);
    const session = await sessionFor(ctx);
    const proofs = await readBrowserProofs(ctx, id);
    const transaction = await new WechatMobileTransactionStore(adapterFor(ctx)).requireBrowserBinding({ ...proofs, transactionId: id });
    requireTruthy(transaction, 'UNAUTHORIZED', 'INVALID_BROWSER_BINDING');
    requireTruthy(
      transaction.purpose === 'prepublication' &&
      transaction.initiatingUserId === session.user.id &&
      transaction.initiatingSessionIdHash === hashCapability('session-id', session.session.id),
      'UNAUTHORIZED', 'INVALID_BROWSER_BINDING',
    );
    if (transaction.expiresAt <= new Date()) endpointError('GONE', 'WECHAT_TRANSACTION_EXPIRED');
    return transaction;
  };

  return {
    getWechatPrepublicationDocument: createAuthEndpoint(base, { method: 'GET' }, async (ctx) => {
      guard(ctx);
      const session = await sessionFor(ctx);
      await ownedAccount(ctx, session.user.id);
      return prepublicationDocument(ctx.request?.headers.get('accept-language') || 'en');
    }),
    startWechatPrepublication: createAuthEndpoint(`${base}/start`, {
      body: z.object({}).strict(), method: 'POST',
    }, async (ctx) => {
      guard(ctx);
      requireOrigin(ctx.request, options.appURL);
      const session = await sessionFor(ctx);
      await ownedAccount(ctx, session.user.id);
      const adapter = adapterFor(ctx);
      let created;
      try {
        await new WechatMobileTransactionStore(adapter).cleanupExpired();
        created = await new WechatPrepublicationStore(adapter).create({
          secret: ctx.context.secret, sessionId: session.session.id, userId: session.user.id,
        });
      } catch {
        endpointError('SERVICE_UNAVAILABLE', 'WECHAT_PERSISTENCE_UNAVAILABLE');
      }
      requireTruthy(created, 'TOO_MANY_REQUESTS', 'WECHAT_PROOF_START_LIMIT');
      await ctx.setSignedCookie(signedCookieName(created.transaction.id), created.capabilities.browserCookie, ctx.context.secret, {
        httpOnly: true, maxAge: 300, path: '/', sameSite: 'lax', secure: true,
      });
      return ctx.json({
        expiresAt: created.transaction.expiresAt.toISOString(),
        manualCode: created.capabilities.completionCapability,
        pollAfterMs: 1200,
        tabBinding: created.capabilities.tabBinding,
        transactionId: created.transaction.id,
      }, { headers: noStore });
    }),
    proveWechatPrepublication: createAuthEndpoint(`${base}/prove`, {
      body: z.object({ code: z.string().min(1).max(256), manualCode: z.string().regex(/^[A-F0-9]{20}$/) }).strict(),
      method: 'POST',
    }, async (ctx) => {
      guard(ctx);
      const adapter = adapterFor(ctx);
      const proof = new WechatPrepublicationStore(adapter);
      const started = await proof.begin(ctx.body.manualCode);
      requireTruthy(started, 'NOT_FOUND', 'WECHAT_TRANSACTION_NOT_FOUND');
      try {
        await exchangeWechatMiniProgramCode({ appId: options.miniProgramAppId, appSecret: options.appSecret, code: ctx.body.code });
        const ready = await proof.completeProvider(started.id);
        requireTruthy(ready, 'NOT_FOUND', 'WECHAT_TRANSACTION_NOT_FOUND');
        return ctx.json({ state: 'proof_ready' }, { headers: noStore });
      } catch (error) {
        return rejectAuthorizationFailure(new WechatMobileTransactionStore(adapter), started.id, error);
      }
    }),
    getWechatPrepublicationStatus: createAuthEndpoint(`${base}/status`, {
      body: transactionBody, method: 'POST',
    }, async (ctx) => {
      const transaction = await browserTransaction(ctx, ctx.body.transactionId);
      return ctx.json({ state: transaction.state === 'authorizing' ? 'pending' : transaction.state }, { headers: noStore });
    }),
    finishWechatPrepublication: createAuthEndpoint(`${base}/finish`, {
      body: transactionBody, method: 'POST',
    }, async (ctx) => {
      const transaction = await browserTransaction(ctx, ctx.body.transactionId);
      if (transaction.state !== 'completed') {
        const completed = await new WechatPrepublicationStore(adapterFor(ctx)).finish(transaction.id);
        if (!completed) {
          const latest = await new WechatMobileTransactionStore(adapterFor(ctx)).find(transaction.id);
          requireTruthy(latest?.state === 'completed', 'CONFLICT', 'WECHAT_PROOF_NOT_READY');
        }
      }
      return ctx.json({ state: 'completed' }, { headers: noStore });
    }),
    cancelWechatPrepublication: createAuthEndpoint(`${base}/cancel`, {
      body: transactionBody, method: 'POST',
    }, async (ctx) => {
      const transaction = await browserTransaction(ctx, ctx.body.transactionId);
      if (transaction.state !== 'cancelled') {
        const cancelled = await new WechatPrepublicationStore(adapterFor(ctx)).cancel(transaction.id);
        if (!cancelled) {
          const latest = await new WechatMobileTransactionStore(adapterFor(ctx)).find(transaction.id);
          requireTruthy(latest?.state === 'cancelled', 'CONFLICT', 'WECHAT_TRANSACTION_NOT_CANCELLABLE');
        }
      }
      return ctx.json({ state: 'cancelled' }, { headers: noStore });
    }),
  };
}
