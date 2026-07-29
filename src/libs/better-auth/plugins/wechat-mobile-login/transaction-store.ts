import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const WECHAT_MOBILE_TRANSACTION_TTL_SECONDS = 300;
export const WECHAT_MOBILE_POLL_AFTER_MS = 1200;
export const WECHAT_MOBILE_MAX_CONFIRM_ATTEMPTS = 3;

export type WechatMobilePurpose = 'rebind' | 'signin';
export type WechatMobileTransactionState =
  'authorized' | 'authorizing' | 'cancelled' | 'consumed' | 'expired' | 'failed' | 'pending';

export interface WechatMobileTransaction {
  accountSwitchConfirmedAt: Date | null;
  attemptCount: number;
  authorizedAt: Date | null;
  authorizedUserId: null | string;
  browserCookieBindingHash: string;
  callbackUrl: string;
  completionCapabilityHash: string;
  consumedAt: Date | null;
  createdAt: Date;
  expiresAt: Date;
  failureCode: null | string;
  id: string;
  initiatingSessionIdHash: null | string;
  initiatingUserId: null | string;
  issuedSessionId: null | string;
  oauthStateHash: string;
  purpose: WechatMobilePurpose;
  rebindAccountRowId: null | string;
  recoveryUntil: Date | null;
  state: WechatMobileTransactionState;
  tabBindingHash: string;
  updatedAt: Date;
}

interface Where {
  field: string;
  operator?: 'eq' | 'in' | 'lt';
  value: unknown;
}

export interface WechatMobileDatabaseAdapter {
  create: <T>(input: { data: Record<string, unknown>; model: string }) => Promise<T>;
  deleteMany?: (input: { model: string; where: Where[] }) => Promise<number>;
  findMany?: <T>(input: {
    limit: number;
    model: string;
    sortBy: { direction: 'asc' | 'desc'; field: string };
    where: Where[];
  }) => Promise<T[]>;
  findOne: <T>(input: { model: string; where: Where[] }) => Promise<T | null>;
  transaction: <R>(
    callback: (transaction: WechatMobileDatabaseAdapter) => Promise<R>,
  ) => Promise<R>;
  update: <T>(input: {
    model: string;
    update: Record<string, unknown>;
    where: Where[];
  }) => Promise<T | null>;
}

export interface TransactionCapabilities {
  browserCookie: string;
  completionCapability: string;
  oauthState: string;
  tabBinding: string;
  transactionId: string;
}

const MODEL = 'wechatMobileLoginTransaction';

const capability = (): string => randomBytes(32).toString('base64url');

export const hashCapability = (
  purpose: 'browser-cookie' | 'completion' | 'oauth-state' | 'session-id' | 'tab',
  value: string,
): string =>
  createHash('sha256')
    .update(Buffer.from(`askcore:p148:${purpose}:v1\0`, 'utf8'))
    .update(Buffer.from(value, 'utf8'))
    .digest('hex');

export const capabilityMatches = (
  purpose: 'browser-cookie' | 'completion' | 'oauth-state' | 'tab',
  raw: string,
  expectedHex: string,
): boolean => {
  const actual = Buffer.from(hashCapability(purpose, raw), 'hex');
  const expected = Buffer.from(expectedHex, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
};

export class WechatMobileTransactionStore {
  constructor(private readonly adapter: WechatMobileDatabaseAdapter) {}

  async create(input: {
    callbackUrl: string;
    initiatingSessionId?: string;
    initiatingUserId?: string;
    now?: Date;
    purpose: WechatMobilePurpose;
    rebindAccountRowId?: string;
  }): Promise<{ capabilities: TransactionCapabilities; transaction: WechatMobileTransaction }> {
    const now = input.now ?? new Date();
    const transactionId = `wxm_${randomBytes(18).toString('base64url')}`;
    const browserCookie = capability();
    const tabBinding = capability();
    const completionCapability = capability();
    const oauthState = capability();
    const transaction = await this.adapter.create<WechatMobileTransaction>({
      data: {
        accountSwitchConfirmedAt: null,
        attemptCount: 0,
        authorizedAt: null,
        authorizedUserId: null,
        browserCookieBindingHash: hashCapability('browser-cookie', browserCookie),
        callbackUrl: input.callbackUrl,
        completionCapabilityHash: hashCapability('completion', completionCapability),
        consumedAt: null,
        createdAt: now,
        expiresAt: new Date(now.getTime() + WECHAT_MOBILE_TRANSACTION_TTL_SECONDS * 1000),
        failureCode: null,
        id: transactionId,
        initiatingSessionIdHash: input.initiatingSessionId
          ? hashCapability('session-id', input.initiatingSessionId)
          : null,
        initiatingUserId: input.initiatingUserId ?? null,
        issuedSessionId: null,
        oauthStateHash: hashCapability('oauth-state', oauthState),
        purpose: input.purpose,
        rebindAccountRowId: input.rebindAccountRowId ?? null,
        recoveryUntil: null,
        state: 'pending',
        tabBindingHash: hashCapability('tab', tabBinding),
        updatedAt: now,
      },
      model: MODEL,
    });
    return {
      capabilities: {
        browserCookie,
        completionCapability,
        oauthState,
        tabBinding,
        transactionId,
      },
      transaction,
    };
  }

  find(transactionId: string): Promise<null | WechatMobileTransaction> {
    return this.adapter.findOne({
      model: MODEL,
      where: [{ field: 'id', value: transactionId }],
    });
  }

  async cleanupExpired(now: Date = new Date(), limit = 50): Promise<number> {
    if (!this.adapter.findMany || !this.adapter.deleteMany) return 0;
    const responseSafetyCutoff = new Date(
      now.getTime() - WECHAT_MOBILE_TRANSACTION_TTL_SECONDS * 1000,
    );
    const expired = await this.adapter.findMany<Pick<WechatMobileTransaction, 'id'>>({
      limit,
      model: MODEL,
      sortBy: { direction: 'asc', field: 'expiresAt' },
      where: [{ field: 'expiresAt', operator: 'lt', value: responseSafetyCutoff }],
    });
    if (expired.length === 0) return 0;
    return this.adapter.deleteMany({
      model: MODEL,
      where: [{ field: 'id', operator: 'in', value: expired.map((item) => item.id) }],
    });
  }

  async requireBrowserBinding(input: {
    browserCookie: string;
    tabBinding: string;
    transactionId: string;
  }): Promise<WechatMobileTransaction | null> {
    const transaction = await this.find(input.transactionId);
    if (!transaction) return null;
    if (
      !capabilityMatches(
        'browser-cookie',
        input.browserCookie,
        transaction.browserCookieBindingHash,
      ) ||
      !capabilityMatches('tab', input.tabBinding, transaction.tabBindingHash)
    ) {
      return null;
    }
    return transaction;
  }

  async beginAuthorization(input: {
    completionCapability: string;
    now?: Date;
    purpose: WechatMobilePurpose;
    transactionId: string;
  }): Promise<WechatMobileTransaction | null> {
    const current = await this.find(input.transactionId);
    const now = input.now ?? new Date();
    if (
      !current ||
      current.purpose !== input.purpose ||
      current.state !== 'pending' ||
      current.expiresAt <= now ||
      !capabilityMatches('completion', input.completionCapability, current.completionCapabilityHash)
    ) {
      return null;
    }
    if (current.attemptCount >= WECHAT_MOBILE_MAX_CONFIRM_ATTEMPTS) {
      await this.adapter.update({
        model: MODEL,
        update: {
          failureCode: 'attempt_limit',
          state: 'failed',
          updatedAt: now,
        },
        where: [
          { field: 'id', value: input.transactionId },
          { field: 'state', value: 'pending' },
        ],
      });
      return null;
    }
    return this.adapter.update({
      model: MODEL,
      update: {
        attemptCount: current.attemptCount + 1,
        state: 'authorizing',
        updatedAt: now,
      },
      where: [
        { field: 'id', value: input.transactionId },
        { field: 'state', value: 'pending' },
      ],
    });
  }

  async beginWebsiteAuthorization(input: {
    now?: Date;
    oauthState: string;
    purpose: WechatMobilePurpose;
    transactionId: string;
  }): Promise<WechatMobileTransaction | null> {
    const current = await this.find(input.transactionId);
    const now = input.now ?? new Date();
    if (
      !current ||
      current.purpose !== input.purpose ||
      current.state !== 'pending' ||
      current.expiresAt <= now ||
      !capabilityMatches('oauth-state', input.oauthState, current.oauthStateHash)
    ) {
      return null;
    }
    if (current.attemptCount >= WECHAT_MOBILE_MAX_CONFIRM_ATTEMPTS) {
      await this.adapter.update({
        model: MODEL,
        update: {
          failureCode: 'attempt_limit',
          state: 'failed',
          updatedAt: now,
        },
        where: [
          { field: 'id', value: input.transactionId },
          { field: 'state', value: 'pending' },
        ],
      });
      return null;
    }
    return this.adapter.update({
      model: MODEL,
      update: {
        attemptCount: current.attemptCount + 1,
        state: 'authorizing',
        updatedAt: now,
      },
      where: [
        { field: 'id', value: input.transactionId },
        { field: 'state', value: 'pending' },
      ],
    });
  }

  authorize(
    transactionId: string,
    authorizedUserId: string,
    now: Date = new Date(),
  ): Promise<WechatMobileTransaction | null> {
    return this.adapter.update({
      model: MODEL,
      update: {
        authorizedAt: now,
        authorizedUserId,
        state: 'authorized',
        updatedAt: now,
      },
      where: [
        { field: 'id', value: transactionId },
        { field: 'state', value: 'authorizing' },
      ],
    });
  }

  restorePending(transactionId: string, now: Date = new Date()) {
    return this.adapter.update<WechatMobileTransaction>({
      model: MODEL,
      update: { state: 'pending', updatedAt: now },
      where: [
        { field: 'id', value: transactionId },
        { field: 'state', value: 'authorizing' },
      ],
    });
  }

  fail(transactionId: string, failureCode: string, now: Date = new Date()) {
    return this.adapter.update<WechatMobileTransaction>({
      model: MODEL,
      update: { failureCode, state: 'failed', updatedAt: now },
      where: [
        { field: 'id', value: transactionId },
        { field: 'state', value: 'authorizing' },
      ],
    });
  }

  cancel(transactionId: string, now: Date = new Date()) {
    return this.adapter.update<WechatMobileTransaction>({
      model: MODEL,
      update: { state: 'cancelled', updatedAt: now },
      where: [
        { field: 'id', value: transactionId },
        { field: 'state', value: 'pending' },
      ],
    });
  }

  async consumeWithSession<TSession extends { id: string }>(input: {
    accountSwitchConfirmed: boolean;
    createSession: () => Promise<TSession>;
    now?: Date;
    recoverySeconds: number;
    transaction: WechatMobileTransaction;
    transactionRunner?: <R>(
      callback: (adapter: WechatMobileDatabaseAdapter) => Promise<R>,
    ) => Promise<R>;
  }): Promise<TSession | null> {
    const now = input.now ?? new Date();
    const transactionRunner =
      input.transactionRunner ??
      (<R>(callback: (adapter: WechatMobileDatabaseAdapter) => Promise<R>) =>
        this.adapter.transaction(callback));
    return transactionRunner(async (transactionAdapter) => {
      const reserved = await transactionAdapter.update<WechatMobileTransaction>({
        model: MODEL,
        update: {
          accountSwitchConfirmedAt: input.accountSwitchConfirmed ? now : null,
          consumedAt: now,
          recoveryUntil: new Date(now.getTime() + input.recoverySeconds * 1000),
          state: 'consumed',
          updatedAt: now,
        },
        where: [
          { field: 'id', value: input.transaction.id },
          { field: 'state', value: 'authorized' },
        ],
      });
      if (!reserved) return null;
      const session = await input.createSession();
      const committed = await transactionAdapter.update<WechatMobileTransaction>({
        model: MODEL,
        update: { issuedSessionId: session.id, updatedAt: now },
        where: [
          { field: 'id', value: input.transaction.id },
          { field: 'state', value: 'consumed' },
        ],
      });
      if (!committed) throw new Error('wechat_mobile_session_commit_failed');
      return session;
    });
  }
}
