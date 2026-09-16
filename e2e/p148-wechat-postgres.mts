import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { drizzle } from 'drizzle-orm/node-postgres';
import { boolean, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { Pool } from 'pg';

import {
  account,
  session,
  wechatMobileLoginTransaction,
  wechatRebindClaim,
} from '../packages/database/src/schemas/betterAuth';
import { wechatMobileLogin } from '../src/libs/better-auth/plugins/wechat-mobile-login';

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
  globalThis.fetch = async (input) => {
    assert.equal(new URL(String(input)).origin, 'https://api.weixin.qq.com');
    return Response.json({
      openid: 'synthetic-openid',
      session_key: 'synthetic-key',
      unionid: 'synthetic-unionid',
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
  process.stdout.write('P148_WECHAT_POSTGRES_OK\n');
} finally {
  globalThis.fetch = originalFetch;
  await pool.end();
}
