import { type LobeChatDatabase, serverDB } from '@lobechat/database';
import { registrationIntents, registrationMagicContexts, registrationProvisioningJobs } from '@lobechat/database/schemas';
import { APIError, createAuthEndpoint, getOAuthState, getSession } from 'better-auth/api';
import { type BetterAuthPlugin } from 'better-auth/types';
import { and, eq, gt, isNull, or, sql } from 'drizzle-orm';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';

import { appEnv } from '@/envs/app';
import { KeyVaultsGateKeeper } from '@/server/modules/KeyVaultsEncrypt';
import { resolveSchoolIdentity } from '@/server/services/schoolIdentity';

const HANDLE = /^[a-f0-9]{64}$/;
const AUTH_PREFIX = '/api/auth/askcore-registration/';
const HEADERS = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const unavailable = () => new APIError('SERVICE_UNAVAILABLE', { code: 'REGISTRATION_UNAVAILABLE', message: 'Registration is temporarily unavailable' });
const conflict = () => new APIError('CONFLICT', { code: 'REGISTRATION_CONFLICT', message: 'Registration requires a fresh intent or identity review' });
const invalid = () => new APIError('BAD_REQUEST', { code: 'REGISTRATION_INVALID', message: 'Invalid registration request' });

export const registrationPrepareSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ordinary'), returnPath: z.string().max(2048) }).strict(),
  z.object({ kind: z.literal('invitation'), invitationToken: z.string().min(1).max(8192), returnPath: z.string().max(2048) }).strict(),
]);
export const registrationRecoverSchema = z.object({
  acknowledgeCurrentIdentity: z.literal(true).optional(),
  intentHandle: z.string().regex(HANDLE).optional(),
}).strict();

type Prepare = z.infer<typeof registrationPrepareSchema>;
type Recover = z.infer<typeof registrationRecoverSchema>;
type Account = { email?: string | null; userId: string };
type HookContext = { headers?: Headers; path?: string; query?: Record<string, unknown>; request?: Request };
type Job = typeof registrationProvisioningJobs.$inferSelect;
export type RegistrationStatus = {
  action: 'continue' | 'choose_intent' | 'authenticate' | 'wait' | 'retry' | 'review_identity' | 'replace_invitation' | 'contact_school';
  retryAt: string | null;
  returnPath: string;
  state: Job['state'] | 'not_applicable';
};

export const registrationReturnPath = (value: string) => {
  if (!value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u0020\u007f]/.test(value)) throw invalid();
  const base = new URL(appEnv.APP_URL);
  const target = new URL(value, base);
  if (target.origin !== base.origin || target.hash || [...target.searchParams.keys()].some((key) =>
    /^(token|invitationToken|intent|intentHandle|registrationIntent)$/i.test(key))) throw invalid();
  if (target.pathname === '/askcore/workbench' && target.searchParams.get('protocol') === 'registration') return '/school';
  return target.pathname + target.search;
};

export class RegistrationProvisioningService {
  constructor(private readonly db: LobeChatDatabase = serverDB) {}

  async prepare(input: Prepare) {
    const returnPath = registrationReturnPath(input.returnPath);
    if (input.kind === 'invitation' && Buffer.byteLength(input.invitationToken, 'utf8') > 8192) throw invalid();
    const invitationCiphertext = input.kind === 'invitation'
      ? await (await KeyVaultsGateKeeper.initWithEnvKey()).encrypt(input.invitationToken) : null;
    const handle = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    await this.db.insert(registrationIntents).values({ id: hash(handle), kind: input.kind, invitationCiphertext, returnPath, expiresAt });
    return { expiresAt: expiresAt.toISOString(), handle };
  }

  private async preparedHandle(handle: string) {
    if (!HANDLE.test(handle)) throw invalid();
    const id = hash(handle);
    const [intent] = await this.db.select({ id: registrationIntents.id }).from(registrationIntents)
      .where(and(eq(registrationIntents.id, id), isNull(registrationIntents.claimedUser), gt(registrationIntents.expiresAt, new Date()))).limit(1);
    if (!intent) throw conflict();
    return id;
  }

  async intentForNewUser(context?: HookContext | null): Promise<string | undefined> {
    let handle: unknown;
    if (context?.path === '/sign-up/email') {
      handle = (context.headers ?? context.request?.headers)?.get('x-askcore-registration-intent');
    } else if (context?.path?.startsWith('/callback/') || context?.path?.startsWith('/oauth2/callback/')) {
      handle = (await getOAuthState())?.registrationIntent;
    } else if (context?.path === '/magic-link/verify') {
      const token = context.query?.token;
      if (typeof token !== 'string' || token.length > 8192) return undefined;
      const [mapping] = await this.db.select({ intentId: registrationMagicContexts.intentId })
        .from(registrationMagicContexts).where(and(eq(registrationMagicContexts.tokenHash, hash(token)),
          gt(registrationMagicContexts.expiresAt, new Date()))).limit(1);
      if (!mapping) return undefined;
      const [intent] = await this.db.select({ id: registrationIntents.id }).from(registrationIntents)
        .where(and(eq(registrationIntents.id, mapping.intentId), isNull(registrationIntents.claimedUser),
          gt(registrationIntents.expiresAt, new Date()))).limit(1);
      if (!intent) throw conflict();
      return intent.id;
    }
    if (handle === undefined || handle === null) return undefined;
    if (typeof handle !== 'string') throw invalid();
    return this.preparedHandle(handle);
  }

  async bindMagicToken(token: string, context?: HookContext | null) {
    const handle = (context?.headers ?? context?.request?.headers)?.get('x-askcore-registration-intent');
    if (handle === undefined || handle === null) return;
    if (!token || token.length > 8192) throw invalid();
    const intentId = await this.preparedHandle(handle);
    await this.db.insert(registrationMagicContexts).values({ tokenHash: hash(token), intentId,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000) });
  }

  async status(account: Account): Promise<RegistrationStatus> {
    const [row] = await this.db.select({ job: registrationProvisioningJobs, returnPath: registrationIntents.returnPath })
      .from(registrationProvisioningJobs).leftJoin(registrationIntents, eq(registrationProvisioningJobs.intentId, registrationIntents.id))
      .where(eq(registrationProvisioningJobs.userId, account.userId)).limit(1);
    if (!row) return { action: 'continue', retryAt: null, returnPath: '/', state: 'not_applicable' };
    const { job } = row;
    const action: RegistrationStatus['action'] = job.state === 'completed' ? 'continue'
      : job.state === 'awaiting_intent' ? 'choose_intent'
      : job.state === 'awaiting_auth' ? 'authenticate'
      : job.state === 'retry' ? 'retry'
      : job.state === 'identity_conflict' ? (job.failureCode === 'identity_changed' ? 'review_identity'
        : job.failureCode === 'invitation_invalid' ? 'replace_invitation' : 'contact_school') : 'wait';
    return { action, state: job.state, returnPath: registrationReturnPath(row.returnPath ?? '/school'),
      retryAt: job.state === 'retry' ? job.nextAttemptAt.toISOString() : null };
  }

  async recover(account: Account, input: Recover) {
    const current = input.acknowledgeCurrentIdentity ? await resolveSchoolIdentity(account) : undefined;
    await this.db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL lock_timeout = '3s'`);
      await tx.execute(sql`SET LOCAL statement_timeout = '5s'`);
      const [job] = await tx.select().from(registrationProvisioningJobs)
        .where(eq(registrationProvisioningJobs.userId, account.userId)).for('update');
      if (!job || job.state === 'leased') throw conflict();
      if (job.state === 'completed') {
        if (input.intentHandle || current) throw conflict();
        return;
      }
      if (current && job.state !== 'identity_conflict') throw conflict();
      let intentId = job.intentId;
      if (input.intentHandle) {
        if (job.intentId && job.state !== 'identity_conflict') throw conflict();
        const id = hash(input.intentHandle);
        const [intent] = await tx.update(registrationIntents).set({ claimedUser: account.userId })
          .where(and(eq(registrationIntents.id, id), gt(registrationIntents.expiresAt, new Date()),
            or(isNull(registrationIntents.claimedUser), eq(registrationIntents.claimedUser, account.userId))))
          .returning();
        if (!intent || ((job.moodleDoneVersion || job.gibbonDoneVersion) && intent.kind === 'ordinary')) throw conflict();
        intentId = intent.id;
      }
      if (!intentId || (job.state === 'identity_conflict' && !input.intentHandle && !current)) throw conflict();
      await tx.update(registrationProvisioningJobs).set({
        intentId, state: job.authReadyAt ? 'ready' : 'awaiting_auth', nextAttemptAt: new Date(),
        leaseToken: null, leaseUntil: null, failureCode: null, updatedAt: new Date(),
        ...(current ? { subjectDigest: hash(current.schoolSubject), identityLinkVersion: current.identityLinkVersion,
          moodleDoneVersion: null, gibbonDoneVersion: null } : {}),
      }).where(eq(registrationProvisioningJobs.userId, account.userId));
    });
    return this.status(account);
  }
}

const failureResponse = (status: number, code: string) => ({ response: Response.json({ code, message: code }, { headers: HEADERS, status }) });

/** Both public aliases enter this guard before Better Auth parses the body. */
const guardRegistrationRequest: NonNullable<BetterAuthPlugin['onRequest']> = async (request) => {
  const url = new URL(request.url);
  let decodedPath: string;
  try { decodedPath = decodeURIComponent(url.pathname).replace(/\/{2,}/g, '/'); }
  catch { return failureResponse(400, 'REGISTRATION_INVALID'); }
  if (!decodedPath.startsWith(AUTH_PREFIX)) return;
  if (decodedPath !== url.pathname) return failureResponse(400, 'REGISTRATION_INVALID');
  const action = url.pathname.slice(AUTH_PREFIX.length);
  if (!['prepare', 'status', 'recover'].includes(action)) return failureResponse(404, 'REGISTRATION_NOT_FOUND');
  if (url.search) return failureResponse(400, 'REGISTRATION_INVALID');
  const origin = request.headers.get('origin');
  if ((origin && origin !== new URL(appEnv.APP_URL).origin)
      || request.headers.get('sec-fetch-site') === 'cross-site'
      || (request.method !== 'GET' && origin !== new URL(appEnv.APP_URL).origin)) return failureResponse(403, 'REGISTRATION_ORIGIN_REQUIRED');
  if (request.method !== (action === 'status' ? 'GET' : 'POST')) return failureResponse(405, 'REGISTRATION_METHOD_INVALID');
  if (request.method === 'GET') return;
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type') ?? '')) return failureResponse(415, 'REGISTRATION_JSON_REQUIRED');
  const reader = request.body?.getReader();
  if (!reader) return failureResponse(400, 'REGISTRATION_INVALID');
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const read = async () => {
      const chunks: Uint8Array[] = [];
      let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 16384) return failureResponse(413, 'REGISTRATION_BODY_TOO_LARGE');
        chunks.push(value);
      }
      const body = Buffer.concat(chunks);
      try { JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body)); }
      catch { return failureResponse(400, 'REGISTRATION_INVALID'); }
      return { request: new Request(request.url, { method: request.method, headers: request.headers, body }) };
    };
    return await Promise.race([read(), new Promise<ReturnType<typeof failureResponse>>((resolve) => {
      timer = setTimeout(() => resolve(failureResponse(408, 'REGISTRATION_BODY_TIMEOUT')), 3000);
    })]);
  } catch {
    return failureResponse(400, 'REGISTRATION_INVALID');
  } finally {
    if (timer) clearTimeout(timer);
    void reader.cancel().catch(() => {});
  }
};

export const registrationProvisioningPlugin = (service = new RegistrationProvisioningService()): BetterAuthPlugin => {
  const sessionEndpoint = getSession();
  // Unlike getSessionFromCtx(), this public endpoint preserves storage outages.
  const account = async (ctx: Parameters<typeof sessionEndpoint>[0]): Promise<Account> => {
    let session;
    try {
      session = await sessionEndpoint({ ...ctx, query: { disableCookieCache: true, disableRefresh: true },
        asResponse: false, returnHeaders: false, returnStatus: false });
    } catch { throw unavailable(); }
    if (!session?.user?.id || !session.session?.id) throw new APIError('UNAUTHORIZED', { message: 'Authentication required' });
    if ((session.session as Record<string, unknown>).impersonatedBy) throw new APIError('FORBIDDEN', { message: 'Impersonation is not allowed' });
    return { userId: session.user.id, email: session.user.email };
  };
  const safe = async <T>(call: () => Promise<T>) => {
    try { return await call(); }
    catch (error) { if (error instanceof APIError) throw error; throw unavailable(); }
  };
  return {
    id: 'askcore-registration',
    onRequest: guardRegistrationRequest,
    onResponse: async (response) => {
      // The pinned router produces a mutable Response before endpoint dispatch
      // for rate limits. Mutate it without short-circuiting later plugin hooks.
      if (response.status === 429) {
        response.headers.set('Cache-Control', 'private, no-store');
        response.headers.set('X-Content-Type-Options', 'nosniff');
      }
    },
    endpoints: {
      askcoreRegistrationPrepare: createAuthEndpoint('/askcore-registration/prepare', {
        method: 'POST', requireHeaders: true, body: registrationPrepareSchema,
      }, async (ctx) => {
        for (const [key, value] of Object.entries(HEADERS)) ctx.setHeader(key, value);
        return ctx.json(await safe(() => service.prepare(ctx.body)));
      }),
      askcoreRegistrationStatus: createAuthEndpoint('/askcore-registration/status', {
        method: 'GET', requireHeaders: true,
      }, async (ctx) => {
        for (const [key, value] of Object.entries(HEADERS)) ctx.setHeader(key, value);
        return ctx.json(await safe(async () => service.status(await account(ctx))));
      }),
      askcoreRegistrationRecover: createAuthEndpoint('/askcore-registration/recover', {
        method: 'POST', requireHeaders: true, body: registrationRecoverSchema,
      }, async (ctx) => {
        for (const [key, value] of Object.entries(HEADERS)) ctx.setHeader(key, value);
        return ctx.json(await safe(async () => service.recover(await account(ctx), ctx.body)));
      }),
    },
  };
};

/** Public alias delegates to the exact Better Auth router (including rate controls). */
export const forwardRegistrationRequest = async (
  request: Request,
  action: string,
  handler: (request: Request) => Promise<Response>,
) => {
  if (!['prepare', 'status', 'recover'].includes(action)) return failureResponse(404, 'REGISTRATION_NOT_FOUND').response;
  const target = new URL(request.url);
  target.pathname = `/api/auth/askcore-registration/${action}`;
  const init: RequestInit & { duplex?: 'half' } = {
    body: request.method === 'GET' ? undefined : request.body,
    duplex: 'half', headers: request.headers, method: request.method,
  };
  try {
    return await handler(new Request(target, init));
  } catch {
    return failureResponse(503, 'REGISTRATION_UNAVAILABLE').response;
  }
};
