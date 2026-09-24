import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { genericOAuth } from 'better-auth/plugins';
import { drizzle } from 'drizzle-orm/node-postgres';
import { boolean, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { Pool } from 'pg';

import {
  account,
  session,
  wechatMobileLoginTransaction,
  wechatRebindClaim,
} from '../packages/database/src/schemas/betterAuth';
import type { LobeChatDatabase } from '../packages/database/src/type';
import { wechatMobileLogin } from '../src/libs/better-auth/plugins/wechat-mobile-login';
import {
  createDatabaseWebsiteIdentityStore,
  reconcileWebsiteWechatIdentity,
} from '../src/libs/better-auth/plugins/wechat-mobile-login/website-identity';
import { buildWechatProvider } from '../src/libs/better-auth/sso/providers/wechat';

const socket = process.env.P148_WECHAT_TEST_PG_SOCKET;
assert.ok(socket?.startsWith(`${process.env.TMPDIR}/p148-pg.`), 'owned PostgreSQL socket required');
const bridge = createRequire(import.meta.url)(
  '../apps/wechat-login-bridge/controllers/login-controller.js',
);
const origin = 'https://askcore.example';
const users = pgTable('users', {
  avatar: text('avatar'),
  createdAt: timestamp('created_at').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull(),
  fullName: text('full_name').notNull(),
  id: text('id').primaryKey(),
  updatedAt: timestamp('updated_at').notNull(),
});
let pool = new Pool({ database: 'p148', host: socket, port: 5432, user: 'p148' });
const createAuth = () =>
  betterAuth({
    baseURL: origin,
    database: drizzleAdapter(drizzle(pool), {
      provider: 'pg',
      schema: { account, session, users, wechatMobileLoginTransaction, wechatRebindClaim },
      transaction: true,
    }),
    logger: { disabled: true },
    plugins: [
      genericOAuth({ config: [buildWechatProvider(
        { AUTH_WECHAT_ID: 'synthetic-website', AUTH_WECHAT_SECRET: 'synthetic-website-secret' },
        createDatabaseWebsiteIdentityStore(drizzle(pool) as unknown as LobeChatDatabase),
      )] }),
      wechatMobileLogin({
        appId: 'synthetic-website',
        appSecret: 'synthetic-mini-secret',
        appURL: origin,
        identityMode: 'canonical',
        miniProgramAppId: 'synthetic-mini',
        mobileLoginEnabled: true,
        rebindEnabled: true,
        recoverySeconds: 60,
        schemePath: 'pages/login/index',
        transactionTtlSeconds: 300,
        websiteAppSecret: 'synthetic-website-secret',
      }),
    ],
    rateLimit: { enabled: false },
    secret: 'synthetic-postgres-fixture-secret-at-least-32-characters',
    trustedOrigins: [origin],
    user: { fields: { image: 'avatar', name: 'fullName' }, modelName: 'users' },
  });
let auth = createAuth();
const cookieHeader = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0])
    .join('; ');
const request = (path: string, body?: unknown, cookie?: string, tab?: string) => {
  const headers = new Headers({ origin });
  if (body !== undefined) headers.set('content-type', 'application/json');
  if (cookie) headers.set('cookie', cookie);
  if (tab) headers.set('x-askcore-wechat-tab-binding', tab);
  return auth.handler(
    new Request(`${origin}/api/auth${path}`, {
      body: body === undefined ? undefined : JSON.stringify(body),
      headers,
      method: body === undefined ? 'GET' : 'POST',
    }),
  );
};
const restart = async () => {
  await pool.end();
  pool = new Pool({ database: 'p148', host: socket, port: 5432, user: 'p148' });
  auth = createAuth();
};
const start = async (rebind = false, cookie?: string) => {
  const response = await request(
    rebind ? '/wechat-rebind/start' : '/wechat-mobile/start',
    rebind ? { channel: 'mobile' } : { callbackURL: '/chat' },
    cookie,
  );
  assert.equal(response.status, 200);
  const prepared = await response.json();
  const query = new URLSearchParams(new URL(prepared.openTarget).searchParams.get('query')!);
  const launch = bridge.parseLaunchOptions(Object.fromEntries(query));
  assert.equal(launch.transactionId, prepared.transactionId);
  return { ...prepared, cookie: cookieHeader(response), launch };
};
const prove = async (prepared: Awaited<ReturnType<typeof start>>) => {
  const response = await auth.handler(
    new Request(`${origin}${bridge.endpointForPurpose(prepared.launch.purpose)}`, {
      body: JSON.stringify({
        code: 'synthetic-one-time-code',
        completionCapability: prepared.launch.completionCapability,
        transactionId: prepared.transactionId,
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { state: 'authorized' });
};
const originalFetch = globalThis.fetch;
let providerUnionId = 'synthetic-unionid';

const withUserInsertBlocker = async (run: () => Promise<void>) => {
  const blocker = await pool.connect();
  try {
    await blocker.query('SELECT pg_advisory_lock(148113)');
    await run();
  } finally {
    try {
      await blocker.query('SELECT pg_advisory_unlock(148113)');
    } finally {
      // Destroying the connection also releases its lock if the unlock failed.
      blocker.release(true);
    }
  }
};

try {
  // Minimal existing Better Auth tables; the P148 tables use the actual migration.
  await pool.query(`
    CREATE TABLE users (id text PRIMARY KEY, full_name text NOT NULL,
      email text NOT NULL UNIQUE, email_verified boolean NOT NULL,
      avatar text, created_at timestamp NOT NULL, updated_at timestamp NOT NULL);
    CREATE TABLE accounts (id text PRIMARY KEY, account_id text NOT NULL,
      provider_id text NOT NULL, user_id text NOT NULL REFERENCES users(id),
      access_token text, refresh_token text, id_token text, password text, scope text,
      access_token_expires_at timestamp, refresh_token_expires_at timestamp,
      created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL);
    CREATE TABLE auth_sessions (id text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id),
      token text NOT NULL UNIQUE, expires_at timestamp NOT NULL,
      created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL,
      active_organization_id text, impersonated_by text, ip_address text, user_agent text);
  `);
  const migration = await readFile(
    new URL('../packages/database/migrations/0111_wechat_mobile_login.sql', import.meta.url),
    'utf8',
  );
  await pool.query(migration);
  await pool.query(migration);
  const identityMigration = await readFile(
    new URL('../packages/database/migrations/0113_wechat_identity_unique.sql', import.meta.url),
    'utf8',
  );
  await pool.query(`
    INSERT INTO users (id, full_name, email, email_verified, created_at, updated_at)
      VALUES ('fixture-a', 'Fixture A', 'a@example.invalid', false, now(), now()),
             ('fixture-b', 'Fixture B', 'b@example.invalid', false, now(), now());
    INSERT INTO accounts (id, account_id, provider_id, user_id, updated_at)
      VALUES ('legacy-a', 'unreconciled-duplicate', 'wechat', 'fixture-a', now()),
             ('legacy-b', 'unreconciled-duplicate', 'wechat', 'fixture-b', now());
  `);
  const beforeRepair = (await pool.query('SELECT * FROM accounts ORDER BY id')).rows;
  await assert.rejects(pool.query(identityMigration), { code: '23505' });
  assert.deepEqual((await pool.query('SELECT * FROM accounts ORDER BY id')).rows, beforeRepair);
  // Explicit synthetic repair only; production repair belongs to the reviewed operator plan.
  await pool.query("UPDATE accounts SET account_id='verified-distinct-b' WHERE id='legacy-b'");
  await pool.query(identityMigration);
  await pool.query(identityMigration);
  const index = (await pool.query(`SELECT indisunique, indisvalid, pg_get_expr(indpred, indrelid) AS predicate
    FROM pg_index WHERE indexrelid='accounts_wechat_identity_unique'::regclass`)).rows;
  assert.deepEqual(index, [{ indisunique: true, indisvalid: true, predicate: "(provider_id = 'wechat'::text)" }]);
  for (const owner of ['fixture-a', 'fixture-b']) {
    await assert.rejects(pool.query(`INSERT INTO accounts (id, account_id, provider_id, user_id, updated_at)
      VALUES ('rejected-duplicate', 'unreconciled-duplicate', 'wechat', $1, now())`, [owner]), { code: '23505' });
  }
  await pool.query(`INSERT INTO accounts (id, account_id, provider_id, user_id, updated_at)
    VALUES ('other-a', 'unreconciled-duplicate', 'github', 'fixture-a', now()),
           ('other-b', 'unreconciled-duplicate', 'github', 'fixture-b', now())`);
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM accounts')).rows[0].count, 4);
  const websiteStore = createDatabaseWebsiteIdentityStore(drizzle(pool) as unknown as LobeChatDatabase);
  await pool.query(`INSERT INTO accounts (id, account_id, provider_id, user_id, updated_at)
    VALUES ('website-old', 'website-openid', 'wechat', 'fixture-a', now())`);
  await Promise.all([
    reconcileWebsiteWechatIdentity(websiteStore, 'website-openid', 'website-unionid'),
    reconcileWebsiteWechatIdentity(websiteStore, 'website-openid', 'website-unionid'),
  ]);
  assert.deepEqual((await pool.query(`SELECT id, account_id, user_id FROM accounts
    WHERE id='website-old'`)).rows, [{ id: 'website-old', account_id: 'website-unionid', user_id: 'fixture-a' }]);
  assert.equal((await pool.query(`SELECT count(*)::int AS count FROM accounts
    WHERE provider_id='wechat' AND account_id='website-unionid'`)).rows[0].count, 1);
  await pool.query(`INSERT INTO accounts (id, account_id, provider_id, user_id, updated_at)
    VALUES ('website-dual-open', 'dual-openid', 'wechat', 'fixture-a', now()),
           ('website-dual-union', 'dual-unionid', 'wechat', 'fixture-b', now()),
           ('website-fail', 'fail-openid', 'wechat', 'fixture-a', now())`);
  await reconcileWebsiteWechatIdentity(websiteStore, 'dual-openid', 'dual-unionid');
  assert.deepEqual((await pool.query(`SELECT id, account_id, user_id FROM accounts
    WHERE id IN ('website-dual-open', 'website-dual-union') ORDER BY id`)).rows, [
    { id: 'website-dual-open', account_id: 'dual-openid', user_id: 'fixture-a' },
    { id: 'website-dual-union', account_id: 'dual-unionid', user_id: 'fixture-b' },
  ]);
  await assert.rejects(reconcileWebsiteWechatIdentity(websiteStore, 'fail-openid', undefined), /missing_unionid/);
  await pool.query(`CREATE FUNCTION reject_website_rewrite() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF OLD.id='website-fail' THEN RAISE EXCEPTION 'fixture_rewrite_failure'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER reject_website_rewrite BEFORE UPDATE ON accounts
      FOR EACH ROW EXECUTE FUNCTION reject_website_rewrite();`);
  await assert.rejects(
    reconcileWebsiteWechatIdentity(websiteStore, 'fail-openid', 'fail-unionid'),
    (error: { cause?: { code?: string } }) => error.cause?.code === 'P0001',
  );
  assert.deepEqual((await pool.query(`SELECT account_id, user_id FROM accounts WHERE id='website-fail'`)).rows,
    [{ account_id: 'fail-openid', user_id: 'fixture-a' }]);
  await pool.query('DROP TRIGGER reject_website_rewrite ON accounts; DROP FUNCTION reject_website_rewrite();');
  await pool.query(`INSERT INTO accounts (id, account_id, provider_id, user_id, updated_at)
    VALUES ('website-callback-old', 'callback-openid', 'wechat', 'fixture-a', now())`);
  globalThis.fetch = async (input) => {
    const path = new URL(String(input)).pathname;
    if (path === '/sns/oauth2/access_token') return Response.json({
      access_token: 'synthetic-website-access', openid: 'callback-openid', unionid: 'callback-unionid',
    });
    if (path === '/sns/userinfo') return Response.json({
      nickname: 'Fixture A', openid: 'callback-openid', unionid: 'callback-unionid',
    });
    throw new Error('unexpected website provider request');
  };
  const qrStart = await request('/sign-in/oauth2', { callbackURL: '/chat', providerId: 'wechat' });
  assert.equal(qrStart.status, 200);
  const qrTarget = new URL((await qrStart.json()).url);
  const qrCallback = await request(`/oauth2/callback/wechat?${new URLSearchParams({
    code: 'synthetic-code', state: qrTarget.searchParams.get('state')!,
  })}`, undefined, cookieHeader(qrStart));
  const qrSession = await (await request('/get-session', undefined, cookieHeader(qrCallback))).json();
  assert.equal(qrSession?.user?.id, 'fixture-a');
  assert.deepEqual((await pool.query(`SELECT id, account_id, user_id FROM accounts
    WHERE id='website-callback-old'`)).rows,
    [{ id: 'website-callback-old', account_id: 'callback-unionid', user_id: 'fixture-a' }]);
  globalThis.fetch = async (input) => {
    assert.equal(new URL(String(input)).origin, 'https://api.weixin.qq.com');
    return Response.json({
      openid: 'synthetic-openid',
      session_key: 'synthetic-key',
      unionid: providerUnionId,
    });
  };

  const prepared = await start();
  await restart();
  const status = await request(
    `/wechat-mobile/status?transactionId=${prepared.transactionId}`,
    undefined,
    prepared.cookie,
    prepared.tabBinding,
  );
  assert.equal(status.status, 200);
  assert.deepEqual(await status.json(), { state: 'pending' });
  await prove(prepared);
  await restart();

  await pool.query(`CREATE FUNCTION reject_fixture_session() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'fixture_session_write_failure'; END $$;
    CREATE TRIGGER reject_fixture_session BEFORE INSERT ON auth_sessions
      FOR EACH ROW EXECUTE FUNCTION reject_fixture_session();`);
  const consume = () =>
    request(
      '/wechat-mobile/consume',
      {
        confirmAccountSwitch: false,
        transactionId: prepared.transactionId,
      },
      prepared.cookie,
      prepared.tabBinding,
    );
  assert.ok((await consume()).status >= 500);
  const rolledBack = await pool.query(
    'SELECT state, issued_session_id FROM wechat_mobile_login_transactions WHERE id=$1',
    [prepared.transactionId],
  );
  assert.deepEqual(rolledBack.rows, [{ issued_session_id: null, state: 'authorized' }]);
  assert.equal(
    (await pool.query('SELECT count(*)::int AS count FROM auth_sessions')).rows[0].count,
    0,
  );
  await pool.query(
    'DROP TRIGGER reject_fixture_session ON auth_sessions; DROP FUNCTION reject_fixture_session();',
  );

  const concurrent = await Promise.all([consume(), consume()]);
  assert.ok(concurrent.every((response) => [200, 409].includes(response.status)));
  const successful = concurrent.find((response) => response.status === 200);
  assert.ok(successful);
  const cookie = cookieHeader(successful);
  assert.ok(cookie.includes('__Secure-better-auth.session_token='));
  assert.equal(
    (await pool.query('SELECT count(*)::int AS count FROM auth_sessions')).rows[0].count,
    1,
  );
  const recovered = await consume();
  assert.equal(recovered.status, 200);
  assert.equal(cookieHeader(recovered), cookie);
  const sessionResponse = await request('/get-session', undefined, cookie);
  assert.ok((await sessionResponse.json())?.user?.id);

  const accountsBefore = (
    await pool.query('SELECT id, account_id, user_id FROM accounts ORDER BY id')
  ).rows;
  const rebind = await start(true, cookie);
  await prove(rebind);
  const confirmed = await request(
    '/wechat-rebind/confirm',
    { transactionId: rebind.transactionId },
    `${cookie}; ${rebind.cookie}`,
    rebind.tabBinding,
  );
  assert.equal(confirmed.status, 200);
  assert.deepEqual(await confirmed.json(), { state: 'verified' });
  assert.deepEqual(
    (await pool.query('SELECT id, account_id, user_id FROM accounts ORDER BY id')).rows,
    accountsBefore,
  );
  assert.equal(
    (await pool.query('SELECT state FROM wechat_rebind_claims')).rows[0].state,
    'verified',
  );
  const authoritySnapshot = async () => ({
    accounts: (await pool.query('SELECT * FROM accounts ORDER BY id')).rows,
    claims: (await pool.query('SELECT * FROM wechat_rebind_claims ORDER BY id')).rows,
    sessions: (await pool.query('SELECT * FROM auth_sessions ORDER BY id')).rows,
    users: (await pool.query('SELECT * FROM users ORDER BY id')).rows,
  });
  const authorityBefore = await authoritySnapshot();
  const startManual = async () => {
    const response = await request('/wechat-prepublication/start', {}, cookie);
    assert.equal(response.status, 200);
    return { ...await response.json(), cookie: `${cookie}; ${cookieHeader(response)}` };
  };
  const manual = await startManual();
  const action = (prepared: typeof manual, name: string) => request(
    `/wechat-prepublication/${name}`, { transactionId: prepared.transactionId }, prepared.cookie, prepared.tabBinding,
  );
  const manualProof = (manualCode: string) => auth.handler(new Request(`${origin}/api/auth/wechat-prepublication/prove`, {
    body: JSON.stringify({ code: 'synthetic-manual-wx-code', manualCode }),
    headers: { 'content-type': 'application/json' }, method: 'POST',
  }));
  await restart();
  assert.deepEqual(await (await action(manual, 'status')).json(), { state: 'pending' });
  const concurrentProofs = await Promise.all([manualProof(manual.manualCode), manualProof(manual.manualCode)]);
  assert.deepEqual(concurrentProofs.map((response) => response.status).sort(), [200, 404]);
  await restart();
  assert.deepEqual(await (await action(manual, 'status')).json(), { state: 'proof_ready' });
  const finishes = await Promise.all([action(manual, 'finish'), action(manual, 'finish')]);
  for (const response of finishes) {
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { state: 'completed' });
    assert.ok(!cookieHeader(response).includes('session_token='));
  }
  assert.equal((await manualProof(manual.manualCode)).status, 404);
  const row = (await pool.query('SELECT * FROM wechat_mobile_login_transactions WHERE id=$1', [manual.transactionId])).rows[0];
  for (const field of ['authorized_user_id', 'issued_session_id', 'rebind_account_row_id', 'recovery_until']) assert.equal(row[field], null);
  assert.ok(!JSON.stringify(row).includes(manual.manualCode));
  assert.ok(!JSON.stringify(row).includes('synthetic-manual-wx-code'));
  assert.ok(!JSON.stringify(row).includes('synthetic-unionid'));

  const cancelled = await startManual();
  const successfulProvider = globalThis.fetch;
  let providerStarted: () => void = () => {};
  const providerReady = new Promise<void>((resolve) => { providerStarted = resolve; });
  let finishProvider: (response: Response) => void = () => {};
  globalThis.fetch = async () => {
    providerStarted();
    return new Promise<Response>((resolve) => { finishProvider = resolve; });
  };
  const delayed = manualProof(cancelled.manualCode);
  await providerReady;
  assert.equal((await action(cancelled, 'cancel')).status, 200);
  finishProvider(Response.json({ openid: 'synthetic-openid', session_key: 'synthetic-key', unionid: 'synthetic-unionid' }));
  assert.equal((await delayed).status, 404);
  globalThis.fetch = successfulProvider;
  assert.deepEqual(await (await action(cancelled, 'status')).json(), { state: 'cancelled' });

  // Use the real Drizzle adapter and primary key under concurrent issuance.
  // Window boundaries may admit another fixed bucket, but never >5 per bucket.
  const starts = await Promise.all(Array.from({ length: 12 }, () => request('/wechat-prepublication/start', {}, cookie)));
  assert.ok(starts.every((response) => [200, 429].includes(response.status)));
  const buckets = (await pool.query(`SELECT floor(extract(epoch from created_at)/300) AS bucket, count(*)::int AS count
    FROM wechat_mobile_login_transactions WHERE purpose='prepublication' GROUP BY bucket`)).rows;
  assert.ok(buckets.length > 0 && buckets.every((bucket) => bucket.count <= 5));
  assert.ok(starts.some((response) => response.status === 429));
  await pool.query('UPDATE wechat_mobile_login_transactions SET expires_at=now()-interval \'1 second\' WHERE id=$1', [manual.transactionId]);
  assert.equal((await action(manual, 'finish')).status, 410);
  assert.equal((await manualProof(manual.manualCode)).status, 404);
  assert.deepEqual(await authoritySnapshot(), authorityBefore);

  // Force both independent login transactions past the missing-account lookup
  // and into user insertion. PostgreSQL locks make this an observed race, not
  // merely two requests that might happen to execute sequentially.
  providerUnionId = 'synthetic-concurrent-new-union';
  const beforeRace = (await pool.query('SELECT count(*)::int AS count FROM users')).rows[0].count;
  await pool.query(`CREATE FUNCTION hold_fixture_user_insert() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN PERFORM pg_advisory_xact_lock(148113); RETURN NEW; END $$;
    CREATE TRIGGER hold_fixture_user_insert BEFORE INSERT ON users
      FOR EACH ROW EXECUTE FUNCTION hold_fixture_user_insert();`);
  await assert.rejects(withUserInsertBlocker(async () => {
    throw new Error('fixture_start_failure');
  }), /fixture_start_failure/);
  assert.equal((await pool.query(`SELECT count(*)::int AS count FROM pg_locks
    WHERE locktype='advisory' AND objid=148113`)).rows[0].count, 0);
  let raceStarts: Awaited<ReturnType<typeof start>>[] = [];
  let confirmations: Promise<PromiseSettledResult<void>[]> = Promise.resolve([]);
  let waiters = 0;
  await withUserInsertBlocker(async () => {
    raceStarts = await Promise.all([start(), start()]);
    confirmations = Promise.allSettled(raceStarts.map(prove));
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      waiters = (await pool.query(`SELECT count(*)::int AS count FROM pg_locks
        WHERE locktype='advisory' AND objid=148113 AND NOT granted`)).rows[0].count;
      if (waiters === 2) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  });
  const outcomes = await confirmations;
  assert.equal(waiters, 2, 'both first-login transactions must overlap at insertion');
  assert.ok(outcomes.every((outcome) => outcome.status === 'fulfilled'), JSON.stringify(outcomes));
  await pool.query('DROP TRIGGER hold_fixture_user_insert ON users; DROP FUNCTION hold_fixture_user_insert();');
  const owner = (await pool.query("SELECT user_id FROM accounts WHERE provider_id='wechat' AND account_id=$1", [providerUnionId])).rows;
  assert.equal(owner.length, 1);
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM users')).rows[0].count, beforeRace + 1);
  assert.equal((await pool.query(`SELECT count(*)::int AS count FROM users u
    WHERE NOT EXISTS (SELECT 1 FROM accounts a WHERE a.user_id=u.id)`)).rows[0].count, 0);
  for (const preparedRace of raceStarts) {
    const consumed = await request('/wechat-mobile/consume', {
      confirmAccountSwitch: false, transactionId: preparedRace.transactionId,
    }, preparedRace.cookie, preparedRace.tabBinding);
    assert.equal(consumed.status, 200);
    const observedSession = await request('/get-session', undefined, cookieHeader(consumed));
    assert.equal((await observedSession.json()).user.id, owner[0].user_id);
  }
  process.stdout.write('P148_WECHAT_POSTGRES_OK\n');
} finally {
  globalThis.fetch = originalFetch;
  await pool.end();
}
