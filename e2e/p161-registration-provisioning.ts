/** T150 real-library/PG acceptance slice. No production identities or source calls. */
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const contract = 'askcore.p161-registration-readiness.v1';
const checks: string[] = [];
let stage = 'preflight';
let pool: import('pg').Pool | undefined;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const opaque = () => randomBytes(24).toString('hex');
const assert = (condition: unknown) => { if (!condition) throw new Error('control_failed'); };

async function main() {
  assert(process.argv.slice(2).join(' ') === '--auth-readiness');
  const worktree = process.env.ASKCORE_TEST_WORKTREE_ID;
  assert(worktree === 'p161-t146-identity-session' || worktree === 'p161-candidate-acceptance');
  const expectedRoot = `/home/aitutor001/Projects-test/${worktree}/lobehub`;
  assert(process.cwd() === expectedRoot && realpathSync(process.cwd()) === expectedRoot);
  const resolve = createRequire(process.cwd() + '/package.json');
  assert(JSON.parse(readFileSync(join(dirname(resolve.resolve('better-auth')), '..', 'package.json'), 'utf8')).version === '1.4.6');
  // Better Auth snapshots NODE_ENV at import; test mode collapses every IP to
  // localhost and cannot validate the production rate-limiter boundary.
  process.env.NODE_ENV = 'production';
  const { betterAuth } = await import('better-auth/minimal');
  const { drizzleAdapter } = await import('better-auth/adapters/drizzle');
  const { magicLink } = await import('better-auth/plugins');
  const { drizzle } = await import('drizzle-orm/node-postgres');
  const { migrate } = await import('drizzle-orm/node-postgres/migrator');
  const { readMigrationFiles } = await import('drizzle-orm/migrator');
  const { boolean, pgTable, text, timestamp } = await import('drizzle-orm/pg-core');
  const { Pool } = await import('pg');
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  assert(input.host === '127.0.0.1' && input.database === 'p161_t148_synthetic' &&
    input.user === 'p161_t148_synthetic' && Number.isInteger(input.port) && input.port > 1024 &&
    input.port < 65536 && typeof input.password === 'string' && input.password.length >= 32);
  pool = new Pool({ host: input.host, port: input.port, database: input.database,
    user: input.user, password: input.password, max: 4, connectionTimeoutMillis: 5000 });
  const at = (name: string) => timestamp(name, { withTimezone: true }).notNull();
  const user = pgTable('users', {
    id: text('id').primaryKey(), name: text('name').notNull(), email: text('email').notNull().unique(),
    emailVerified: boolean('email_verified').notNull(), image: text('image'),
    registrationIntentId: text('registration_intent_id'), createdAt: at('created_at'), updatedAt: at('updated_at'),
  });
  const session = pgTable('auth_sessions', {
    id: text('id').primaryKey(), expiresAt: at('expires_at'), token: text('token').notNull().unique(),
    userId: text('user_id').notNull().references(() => user.id), createdAt: at('created_at'), updatedAt: at('updated_at'),
    ipAddress: text('ip_address'), userAgent: text('user_agent'), impersonatedBy: text('impersonated_by'),
  });
  const account = pgTable('accounts', {
    id: text('id').primaryKey(), accountId: text('account_id').notNull(), providerId: text('provider_id').notNull(),
    userId: text('user_id').notNull().references(() => user.id), password: text('password'),
    accessToken: text('access_token'), refreshToken: text('refresh_token'), idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at'), refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
    scope: text('scope'), createdAt: at('created_at'), updatedAt: at('updated_at'),
  });
  const verification = pgTable('verification', {
    id: text('id').primaryKey(), identifier: text('identifier').notNull(), value: text('value').notNull(),
    expiresAt: at('expires_at'), createdAt: at('created_at'), updatedAt: at('updated_at'),
  });
  stage = 'legacy_schema';
  await pool.query(`
    CREATE TABLE users(id text PRIMARY KEY,name text NOT NULL,email text NOT NULL UNIQUE,email_verified boolean NOT NULL,
      image text,created_at timestamptz NOT NULL,updated_at timestamptz NOT NULL);
    CREATE TABLE auth_sessions(id text PRIMARY KEY,expires_at timestamptz NOT NULL,token text NOT NULL UNIQUE,
      user_id text NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL,updated_at timestamptz NOT NULL,
      ip_address text,user_agent text,impersonated_by text);
    CREATE TABLE accounts(id text PRIMARY KEY,account_id text NOT NULL,provider_id text NOT NULL,user_id text NOT NULL REFERENCES users(id),
      password text,access_token text,refresh_token text,id_token text,access_token_expires_at timestamptz,
      refresh_token_expires_at timestamptz,scope text,created_at timestamptz NOT NULL,updated_at timestamptz NOT NULL);
    CREATE TABLE verification(id text PRIMARY KEY,identifier text NOT NULL,value text NOT NULL,
      expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL,updated_at timestamptz NOT NULL);
  `);
  const legacyId = opaque();
  const legacyEmail = opaque() + '@fixture.invalid';
  await pool.query('INSERT INTO users VALUES ($1,$2,$3,true,null,now(),now())', [legacyId, 'Synthetic', legacyEmail]);
  stage = 'published_migration_predecessor';
  const migrationFolder = 'packages/database/migrations';
  const journal = JSON.parse(readFileSync(`${migrationFolder}/meta/_journal.json`, 'utf8')).entries as
    { idx: number; tag: string; when: number }[];
  const predecessor = journal.at(-2)!;
  const registrationEntry = journal.at(-1)!;
  assert(predecessor.idx === 111 && predecessor.tag === '0111_wechat_mobile_login' &&
    predecessor.when === 1785297838002);
  assert(registrationEntry.idx === 112 && registrationEntry.tag === '0112_askcore_registration_provisioning' &&
    registrationEntry.when > predecessor.when);
  assert(new Set(journal.map(({ idx }) => idx)).size === journal.length &&
    new Set(journal.map(({ tag }) => tag)).size === journal.length);
  const migrations = readMigrationFiles({ migrationsFolder: migrationFolder });
  const publishedMigration = migrations.find(({ folderMillis }) => folderMillis === predecessor.when)!;
  assert(publishedMigration && migrations.filter(({ folderMillis }) => folderMillis > predecessor.when).length === 1);
  await pool.query(readFileSync(`${migrationFolder}/${predecessor.tag}.sql`, 'utf8'));
  const legacyAccount = opaque();
  const legacyTransaction = opaque();
  await pool.query(`INSERT INTO accounts(id,account_id,provider_id,user_id,created_at,updated_at)
    VALUES($1,$2,'wechat',$3,now(),now())`, [legacyAccount, opaque(), legacyId]);
  await pool.query(`INSERT INTO wechat_mobile_login_transactions(id,browser_cookie_binding_hash,
    callback_url,completion_capability_hash,expires_at,oauth_state_hash,purpose,tab_binding_hash,
    initiating_user_id,authorized_user_id,rebind_account_row_id)
    VALUES($1,$2,'/',$3,now()+interval '5 minutes',$4,'rebind',$5,$6,$6,$7)`,
  [legacyTransaction, hash(opaque()), hash(opaque()), hash(opaque()), hash(opaque()), legacyId, legacyAccount]);
  await pool.query(`INSERT INTO wechat_rebind_claims(id,confirmation_expires_at,legacy_account_row_id,
    source_transaction_id,user_id,verified_unionid)
    VALUES($1,now()+interval '5 minutes',$2,$3,$4,$5)`,
  [opaque(), legacyAccount, legacyTransaction, legacyId, opaque()]);
  const publishedSnapshotSQL = `SELECT jsonb_build_object(
    'accounts',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM accounts t),
    'transactions',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM wechat_mobile_login_transactions t),
    'claims',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM wechat_rebind_claims t)
  ) AS state`;
  const publishedSnapshot = (await pool.query(publishedSnapshotSQL)).rows[0].state;
  // Synthetic prior history at the exact published timestamp lets the real
  // migrator select only 0112. It is not a replay of the full production schema.
  await pool.query(`CREATE SCHEMA drizzle;
    CREATE TABLE drizzle.__drizzle_migrations(id serial PRIMARY KEY,hash text NOT NULL,created_at bigint);`);
  await pool.query('INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES($1,$2)',
    [publishedMigration.hash, predecessor.when]);
  stage = 'product_migration';
  const migration = readFileSync('packages/database/migrations/0112_askcore_registration_provisioning.sql', 'utf8');
  await migrate(drizzle(pool), { migrationsFolder: migrationFolder });
  assert(JSON.stringify((await pool.query(publishedSnapshotSQL)).rows[0].state) === JSON.stringify(publishedSnapshot));
  const migrationHistorySQL = 'SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at';
  const migrationHistory = (await pool.query(migrationHistorySQL)).rows;
  assert(migrationHistory.length === 2 && Number(migrationHistory[1].created_at) === registrationEntry.when &&
    migrationHistory[1].hash === migrations.at(-1)!.hash);
  checks.push('real_migrator_upgrades_published_predecessor_preserving_wechat_rows');
  assert((await pool.query('SELECT count(*)::int AS n FROM registration_provisioning_jobs')).rows[0].n === 0);
  checks.push('actual_migration_no_historical_backfill');
  const schema = { user, session, account, verification };
  const db = drizzle(pool, { schema });
  const baseURL = 'http://127.0.0.1:19348';
  let intentId: string | undefined;
  let failAfter = false;
  let deliveryURL = '';
  const auth = betterAuth({
    baseURL, basePath: '/api/auth', secret: opaque() + opaque(),
    database: drizzleAdapter(db, { provider: 'pg', schema, transaction: true }),
    session: { storeSessionInDatabase: true },
    logger: { disabled: true }, telemetry: { enabled: false }, rateLimit: { enabled: false },
    emailAndPassword: { enabled: true, autoSignIn: true },
    user: { additionalFields: { registrationIntentId: { type: 'string', required: false, input: false } } },
    plugins: [magicLink({ sendMagicLink: async ({ url }) => { deliveryURL = url; } })],
    databaseHooks: { user: { create: {
      before: async (data) => ({ data: { ...data, ...(intentId ? { registrationIntentId: intentId } : {}) } }),
      after: async () => { if (failAfter) throw new Error('synthetic_after_failure'); },
    } } },
  });
  const post = (path: string, data: object) => auth.handler(new Request(baseURL + '/api/auth' + path, {
    method: 'POST', headers: { 'content-type': 'application/json', origin: baseURL }, body: JSON.stringify(data),
  }));
  const prepare = async (expired = false) => {
    const id = hash(opaque());
    await pool!.query("INSERT INTO registration_intents(id,kind,return_path,expires_at) VALUES($1,'ordinary','/',now()+$2::interval)", [id, expired ? '-1 second' : '10 minutes']);
    return id;
  };
  const signup = async () => {
    const email = opaque() + '@fixture.invalid';
    const response = await post('/sign-up/email', { email, name: 'Synthetic', password: opaque() });
    const rows = await pool!.query('SELECT u.id,j.state,j.auth_ready_at FROM users u LEFT JOIN registration_provisioning_jobs j ON j.user_id=u.id WHERE u.email=$1', [email]);
    return { email, response, row: rows.rows[0] };
  };
  stage = 'normal_email';
  intentId = await prepare();
  const normal = await signup();
  assert(normal.response.ok && normal.row.state === 'ready' && normal.row.auth_ready_at);
  checks.push('real_email_session_releases_job');

  stage = 'half_registration';
  intentId = await prepare(); failAfter = true;
  const half = await signup();
  assert(!half.response.ok && half.row.state === 'awaiting_auth' && !half.row.auth_ready_at);
  assert((await pool.query('SELECT count(*)::int AS n FROM accounts WHERE user_id=$1', [half.row.id])).rows[0].n === 0);
  checks.push('after_failure_half_user_withheld');
  failAfter = false;
  stage = 'half_registration_authenticated_recovery';
  assert((await post('/sign-in/magic-link', { email: half.email, callbackURL: '/' })).ok);
  assert(deliveryURL && new URL(deliveryURL).origin === baseURL);
  const recovered = await auth.handler(new Request(deliveryURL));
  assert(recovered.status === 302);
  assert((await pool.query('SELECT state FROM registration_provisioning_jobs WHERE user_id=$1', [half.row.id])).rows[0].state === 'ready');
  assert((await pool.query('SELECT count(*)::int AS n FROM accounts WHERE user_id=$1', [half.row.id])).rows[0].n === 0);
  checks.push('passwordless_real_session_recovers_same_pending_job');

  stage = 'missing_intent';
  intentId = undefined;
  const missing = await signup();
  assert(missing.response.ok && missing.row.state === 'awaiting_intent' && missing.row.auth_ready_at);
  checks.push('authenticated_missing_intent_not_defaulted');

  stage = 'expired_and_replayed_intents';
  intentId = await prepare(true);
  const expired = await signup(); assert(!expired.response.ok && !expired.row);
  intentId = normal.row ? (await pool.query('SELECT intent_id FROM registration_provisioning_jobs WHERE user_id=$1', [normal.row.id])).rows[0].intent_id : undefined;
  const replayed = await signup(); assert(!replayed.response.ok && !replayed.row);
  checks.push('expired_and_replayed_intent_leave_no_user');

  // Direct SQL controls isolate the actual migration's transaction behavior.
  const insertUser = async (id: string) => pool!.query('INSERT INTO users(id,name,email,email_verified,created_at,updated_at) VALUES($1,$2,$3,true,now(),now())', [id, 'Synthetic', opaque() + '@fixture.invalid']);
  const sessionSQL = 'INSERT INTO auth_sessions(id,expires_at,token,user_id,created_at,updated_at,impersonated_by) VALUES($1,now()+$2::interval,$3,$4,now(),now(),$5)';
  const sessionValues = (id: string, impersonator: string | null = null, expiry = '1 hour') => [opaque(), expiry, opaque(), id, impersonator];
  stage = 'session_rollback';
  const rollbackId = opaque(); await insertUser(rollbackId);
  const client = await pool.connect();
  try {
    await client.query('BEGIN'); await client.query(sessionSQL, sessionValues(rollbackId));
    assert((await client.query('SELECT auth_ready_at IS NOT NULL AS ready FROM registration_provisioning_jobs WHERE user_id=$1', [rollbackId])).rows[0].ready);
    await client.query('ROLLBACK');
  } finally { client.release(); }
  assert(!(await pool.query('SELECT auth_ready_at FROM registration_provisioning_jobs WHERE user_id=$1', [rollbackId])).rows[0].auth_ready_at);
  checks.push('session_rollback_rolls_back_readiness');

  stage = 'expired_impersonated_and_historical_sessions';
  await pool.query(sessionSQL, sessionValues(rollbackId, opaque()));
  await pool.query(sessionSQL, sessionValues(rollbackId, null, '-1 second'));
  assert(!(await pool.query('SELECT auth_ready_at FROM registration_provisioning_jobs WHERE user_id=$1', [rollbackId])).rows[0].auth_ready_at);
  await pool.query(sessionSQL, sessionValues(legacyId));
  assert((await post('/sign-in/magic-link', { email: legacyEmail, callbackURL: '/' })).ok);
  assert((await auth.handler(new Request(deliveryURL))).status === 302);
  assert((await pool.query('SELECT count(*)::int AS n FROM registration_provisioning_jobs WHERE user_id=$1', [legacyId])).rows[0].n === 0);
  checks.push('expired_impersonated_and_historical_sessions_do_not_release_or_backfill');

  stage = 'parallel_sessions';
  await Promise.all([pool.query(sessionSQL, sessionValues(rollbackId)), pool.query(sessionSQL, sessionValues(rollbackId))]);
  const ready = await pool.query('SELECT count(*)::int AS n FROM registration_provisioning_jobs WHERE user_id=$1 AND auth_ready_at IS NOT NULL', [rollbackId]);
  assert(ready.rows[0].n === 1);
  checks.push('parallel_session_attempts_converge_on_one_job');

  stage = 'user_transaction_rollback';
  const userRollback = await pool.connect();
  const abortedId = opaque();
  const abortedIntent = await prepare();
  try {
    await userRollback.query('BEGIN');
    await userRollback.query('INSERT INTO users(id,name,email,email_verified,created_at,updated_at,registration_intent_id) VALUES($1,$2,$3,true,now(),now(),$4)', [abortedId, 'Synthetic', opaque() + '@fixture.invalid', abortedIntent]);
    assert((await userRollback.query('SELECT count(*)::int AS n FROM registration_provisioning_jobs WHERE user_id=$1', [abortedId])).rows[0].n === 1);
    assert((await userRollback.query('SELECT claimed_user FROM registration_intents WHERE id=$1', [abortedIntent])).rows[0].claimed_user === abortedId);
    await userRollback.query('ROLLBACK');
  } finally { userRollback.release(); }
  assert((await pool.query('SELECT count(*)::int AS n FROM registration_provisioning_jobs WHERE user_id=$1', [abortedId])).rows[0].n === 0);
  assert((await pool.query('SELECT claimed_user FROM registration_intents WHERE id=$1', [abortedIntent])).rows[0].claimed_user === null);
  assert((await pool.query('SELECT count(*)::int AS n FROM users WHERE id=$1', [abortedId])).rows[0].n === 0);
  checks.push('user_rollback_releases_intent_and_leaves_no_user_or_event');

  stage = 'overlapping_product_intent_claims';
  const contestedIntent = await prepare();
  const winnerId = opaque(); const loserId = opaque();
  let first: import('pg').PoolClient | undefined;
  let second: import('pg').PoolClient | undefined;
  let losingInsert: Promise<string | undefined> | undefined;
  try {
    first = await pool.connect(); second = await pool.connect();
    for (const client of [first, second]) {
      await client.query('BEGIN');
      await client.query("SET LOCAL statement_timeout='5s'");
      await client.query('SELECT id FROM registration_intents WHERE id=$1 FOR KEY SHARE', [contestedIntent]);
    }
    const firstPid = (await first.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    const secondPid = (await second.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    const insertSQL = 'INSERT INTO users(id,name,email,email_verified,created_at,updated_at,registration_intent_id) VALUES($1,$2,$3,true,now(),now(),$4)';
    await first.query(insertSQL, [winnerId, 'Synthetic', opaque() + '@fixture.invalid', contestedIntent]);
    losingInsert = second.query(insertSQL, [loserId, 'Synthetic', opaque() + '@fixture.invalid', contestedIntent])
      .then(() => undefined, (error: { code?: string }) => error.code || 'unknown');
    let blocked = false;
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      blocked = (await pool.query('SELECT $1::int=ANY(pg_blocking_pids($2::int)) AS blocked', [firstPid, secondPid])).rows[0].blocked;
      if (blocked) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert(blocked);
    await first.query('COMMIT');
    assert(await losingInsert === 'P0001');
  } finally {
    const release = async (client?: import('pg').PoolClient) => {
      if (!client) return;
      let failed = false;
      try { await client.query('ROLLBACK'); } catch { failed = true; }
      finally { client.release(failed); }
    };
    try { await release(first); }
    finally {
      try { await losingInsert; }
      finally { await release(second); }
    }
  }
  assert((await pool.query('SELECT claimed_user FROM registration_intents WHERE id=$1', [contestedIntent])).rows[0].claimed_user === winnerId);
  assert((await pool.query('SELECT count(*)::int AS n FROM registration_provisioning_jobs WHERE intent_id=$1', [contestedIntent])).rows[0].n === 1);
  assert((await pool.query('SELECT count(*)::int AS n FROM users WHERE id=$1', [loserId])).rows[0].n === 0);
  checks.push('actual_migration_blocked_parallel_claim_commits_one_user_and_event');

  stage = 'product_drizzle_schema';
  const product = await import('../packages/database/src/schemas/registrationProvisioning');
  const productRows = await drizzle(pool).select().from(product.registrationProvisioningJobs);
  assert(productRows.some((row) => row.userId === normal.row.id && row.state === 'ready'));
  checks.push('product_drizzle_schema_reads_migrated_jobs');

  stage = 'product_http_setup';
  process.env.APP_URL = baseURL;
  process.env.KEY_VAULTS_SECRET = randomBytes(32).toString('base64');
  const { RegistrationProvisioningService, registrationProvisioningPlugin, forwardRegistrationRequest, registrationHttpHandler } =
    await import('../src/server/services/registrationProvisioning');
  const { registrationSessionBinding } = await import('../src/business/client/AskCoreWorkbench/config');
  const productService = new RegistrationProvisioningService(drizzle(pool) as never);
  const productAuth = betterAuth({
    baseURL, basePath: '/api/auth', secret: opaque() + opaque(),
    database: drizzleAdapter(db, { provider: 'pg', schema, transaction: true }),
    session: { storeSessionInDatabase: true, cookieCache: { enabled: true, maxAge: 300 },
      additionalFields: { impersonatedBy: { type: 'string', required: false, input: false } } },
    logger: { disabled: true }, telemetry: { enabled: false },
    rateLimit: { enabled: true, customRules: {
      '/askcore-registration/prepare': { max: 10, window: 60 },
      '/askcore-registration/recover': { max: 10, window: 60 },
      '/askcore-registration/status': { max: 120, window: 60 },
    } },
    emailAndPassword: { enabled: true, autoSignIn: true },
    user: { additionalFields: { registrationIntentId: { type: 'string', required: false, input: false, returned: false } } },
    plugins: [registrationProvisioningPlugin(productService), magicLink({
      sendMagicLink: async ({ url, token }, ctx) => { await productService.bindMagicToken(token, ctx); deliveryURL = url; },
    })],
    databaseHooks: { user: { create: { before: async (data, ctx) => ({ data: {
      ...data, registrationIntentId: await productService.intentForNewUser(ctx),
    } }) } } },
  });
  productAuth.handler = registrationHttpHandler(productAuth.handler);
  let ipCounter = 1;
  const request = (path: string, data?: unknown, cookie?: string, extra?: Record<string, string>) => new Request(baseURL + path, {
    method: data === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', origin: baseURL, 'x-forwarded-for': `192.0.2.${ipCounter++}`,
      ...(cookie ? { cookie } : {}), ...extra },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  const call = (path: string, data?: unknown, cookie?: string, extra?: Record<string, string>) => {
    const req = request(path, data, cookie, extra);
    return path.startsWith('/api/askcore/registration/')
      ? forwardRegistrationRequest(req, new URL(req.url).pathname.split('/').at(-1)!, productAuth.handler)
      : productAuth.handler(req);
  };
  const cookies = (response: Response) => response.headers.getSetCookie().map((entry) => entry.split(';')[0]).join('; ');
  for (const prefix of ['/api/auth/askcore-registration/', '/api/askcore/registration/']) {
    stage = 'product_http_guards';
    assert((await call(prefix + 'prepare', { kind: 'ordinary', returnPath: '/school' }, undefined, { origin: 'https://foreign.invalid' })).status === 403);
    const invalidShape = await call(prefix + 'prepare', { kind: 'ordinary', returnPath: '/school', userId: opaque() });
    assert(invalidShape.status === 400 && invalidShape.headers.get('cache-control') === 'private, no-store');
    assert((await call(prefix + 'prepare', { kind: 'ordinary', returnPath: '//foreign.invalid' })).status === 400);
    assert((await call(prefix + 'prepare', { kind: 'invitation', invitationToken: 'x'.repeat(17000), returnPath: '/school' })).status === 413);
    const anonymous = await call(prefix + 'status');
    assert(anonymous.status === 401 && anonymous.headers.get('cache-control') === 'private, no-store');
    assert((await call(prefix + 'status?userId=' + opaque())).status === 400);
    stage = 'product_http_signup';
    const prepared = await call(prefix + 'prepare', { kind: 'ordinary', returnPath: '/school' });
    stage = 'product_http_prepare_response_' + prepared.status;
    assert(prepared.status === 200 && prepared.headers.get('cache-control') === 'private, no-store');
    const { handle } = await prepared.json();
    stage = 'product_http_prepared_handle';
    assert(/^[a-f0-9]{64}$/.test(handle));
    const signupResponse = await call('/api/auth/sign-up/email', { email: opaque() + '@fixture.invalid', name: 'Synthetic', password: opaque() },
      undefined, { 'x-askcore-registration-intent': handle });
    stage = 'product_http_signup_response_' + signupResponse.status;
    assert(signupResponse.ok);
    const body = await signupResponse.json();
    stage = 'product_http_provenance_redaction';
    assert(!('registrationIntentId' in body.user));
    const cookie = cookies(signupResponse);
    stage = 'product_http_session_cookie';
    assert(cookie);
    const status = await call(prefix + 'status', undefined, cookie);
    const statusBody = await status.json();
    stage = 'product_http_status_response_' + status.status;
    assert(status.status === 200 && statusBody.state === 'ready' && statusBody.returnPath === '/school');
    stage = 'product_http_status_shape';
    assert(Object.keys(statusBody).sort().join(',') === 'action,retryAt,returnPath,state');
    const stored = (await pool.query('SELECT intent_id FROM registration_provisioning_jobs WHERE user_id=$1', [body.user.id])).rows[0];
    stage = 'product_http_intent_claim';
    assert(stored.intent_id === hash(handle));
    await pool.query('UPDATE auth_sessions SET impersonated_by=$1 WHERE user_id=$2', [opaque(), body.user.id]);
    stage = 'product_http_impersonation_refusal';
    assert((await call(prefix + 'status', undefined, cookie)).status === 403);
    await pool.query('DELETE FROM auth_sessions WHERE user_id=$1', [body.user.id]);
    stage = 'product_http_revoked_cookie_refusal';
    assert((await call(prefix + 'status', undefined, cookie)).status === 401);
    checks.push(prefix.includes('/api/auth/') ? 'product_auth_alias_http_guards_signup_private_status_no_cookie_cache' : 'product_public_forwarder_http_guards_signup_private_status_no_cookie_cache');
  }
  stage = 'product_http_magic_transport';
  const magicIntent = await (await call('/api/askcore/registration/prepare', { kind: 'ordinary', returnPath: '/school' })).json();
  const magicEmail = opaque() + '@fixture.invalid';
  assert((await call('/api/auth/sign-in/magic-link', { email: magicEmail, callbackURL: '/' }, undefined,
    { 'x-askcore-registration-intent': magicIntent.handle })).ok);
  const magicURL = new URL(deliveryURL);
  magicURL.searchParams.set('callbackURL', '/changed-destination');
  assert((await productAuth.handler(new Request(magicURL))).status === 302);
  const magicJob = (await pool.query('SELECT j.intent_id,j.state FROM users u JOIN registration_provisioning_jobs j ON j.user_id=u.id WHERE u.email=$1', [magicEmail])).rows[0];
  assert(magicJob.intent_id === hash(magicIntent.handle) && magicJob.state === 'ready');
  checks.push('product_magic_actual_token_binds_intent_without_cookie_despite_callback_change');

  stage = 'product_invitation_encryption';
  const invitationToken = opaque();
  const invitationResponse = await call('/api/askcore/registration/prepare', { kind: 'invitation', invitationToken, returnPath: '/school' });
  assert(invitationResponse.ok);
  const invitationPrepared = await invitationResponse.json();
  const invitationRow = (await pool.query('SELECT kind,invitation_ciphertext FROM registration_intents WHERE id=$1', [hash(invitationPrepared.handle)])).rows[0];
  assert(invitationRow.kind === 'invitation' && !invitationRow.invitation_ciphertext.includes(invitationToken));
  const { KeyVaultsGateKeeper } = await import('../src/server/modules/KeyVaultsEncrypt');
  const decrypted = await (await KeyVaultsGateKeeper.initWithEnvKey()).decrypt(invitationRow.invitation_ciphertext);
  assert(decrypted.wasAuthentic && decrypted.plaintext === invitationToken);
  checks.push('product_prepare_encrypts_invitation_with_actual_keyvault');

  stage = 'product_http_recover';
  const unbound = await call('/api/auth/sign-up/email', { email: opaque() + '@fixture.invalid', name: 'Synthetic', password: opaque() });
  assert(unbound.ok);
  const unboundBody = await unbound.json();
  const unboundCookie = cookies(unbound);
  const binding = async (userId: string) => {
    const session = (await pool!.query('SELECT id FROM auth_sessions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1', [userId])).rows[0];
    return registrationSessionBinding(userId, session.id);
  };
  const unboundBinding = await binding(unboundBody.user.id);
  const recoveryIntent = await (await call('/api/askcore/registration/prepare', { kind: 'ordinary', returnPath: '/school' })).json();
  const before = (await pool.query('SELECT row_to_json(j) AS value FROM registration_provisioning_jobs j WHERE user_id=$1', [unboundBody.user.id])).rows[0].value;
  for (const prefix of ['/api/auth/askcore-registration/', '/api/askcore/registration/']) {
    assert((await call(prefix + 'recover', { intentHandle: recoveryIntent.handle }, unboundCookie)).status === 409);
    assert((await call(prefix + 'recover', { intentHandle: recoveryIntent.handle }, unboundCookie,
      { 'x-askcore-registration-session': '0'.repeat(64) })).status === 409);
  }
  assert(JSON.stringify((await pool.query('SELECT row_to_json(j) AS value FROM registration_provisioning_jobs j WHERE user_id=$1', [unboundBody.user.id])).rows[0].value) === JSON.stringify(before));
  assert((await pool.query('SELECT claimed_user FROM registration_intents WHERE id=$1', [hash(recoveryIntent.handle)])).rows[0].claimed_user === null);
  checks.push('product_missing_or_mismatched_expected_session_refuses_without_writes');
  assert((await call('/api/askcore/registration/recover', { intentHandle: recoveryIntent.handle }, unboundCookie,
    { 'x-askcore-registration-session': unboundBinding })).status === 200);
  await pool.query("UPDATE registration_provisioning_jobs SET state='leased',lease_token=$1,lease_until=now()+interval '1 minute' WHERE user_id=$2", [opaque(), unboundBody.user.id]);
  assert((await call('/api/askcore/registration/recover', {}, unboundCookie,
    { 'x-askcore-registration-session': unboundBinding })).status === 409);
  checks.push('product_http_unbound_recovery_and_live_lease_refusal');

  stage = 'product_http_account_switch';
  const accountBEmail = opaque() + '@fixture.invalid';
  const accountBPassword = opaque();
  const accountBResponse = await call('/api/auth/sign-up/email', { email: accountBEmail, name: 'Synthetic', password: accountBPassword });
  stage = 'product_http_account_b_signup_' + accountBResponse.status;
  assert(accountBResponse.ok);
  const accountB = await accountBResponse.json();
  const accountBCookie = cookies(accountBResponse);
  const oldBBinding = await binding(accountB.user.id);
  assert((await call('/api/askcore/registration/recover', { intentHandle: recoveryIntent.handle }, accountBCookie,
    { 'x-askcore-registration-session': unboundBinding })).status === 409);
  stage = 'product_http_account_a_binding_with_b_cookie';
  const signedOut = await call('/api/auth/sign-out', {}, accountBCookie);
  stage = 'product_http_account_b_signout_' + signedOut.status;
  assert(signedOut.ok);
  const relogin = await call('/api/auth/sign-in/email', { email: accountBEmail, password: accountBPassword });
  stage = 'product_http_account_b_relogin_' + relogin.status;
  assert(relogin.ok);
  const reloginCookie = cookies(relogin);
  stage = 'product_http_account_b_new_session';
  assert(await binding(accountB.user.id) !== oldBBinding);
  stage = 'product_http_old_session_refusal';
  assert((await call('/api/auth/askcore-registration/recover', { intentHandle: recoveryIntent.handle }, reloginCookie,
    { 'x-askcore-registration-session': oldBBinding })).status === 409);
  const accountBJob = (await pool.query('SELECT state,intent_id FROM registration_provisioning_jobs WHERE user_id=$1', [accountB.user.id])).rows[0];
  assert(accountBJob.state === 'awaiting_intent' && accountBJob.intent_id === null);
  checks.push('product_account_switch_and_logout_relogin_reject_old_session_submissions');
  stage = 'product_http_shared_rate_limit';
  for (let index = 0; index < 10; index++) {
    const prefix = index % 2 ? '/api/askcore/registration/' : '/api/auth/askcore-registration/';
    assert((await call(prefix + 'prepare', { kind: 'ordinary', returnPath: '/' }, undefined, { 'x-forwarded-for': '192.0.2.250' })).status === 200);
  }
  assert((await call('/api/askcore/registration/prepare', { kind: 'ordinary', returnPath: '/' }, undefined, { 'x-forwarded-for': '192.0.2.250' })).status === 429);
  checks.push('product_both_aliases_share_better_auth_rate_limit');
  stage = 'product_nat_existing_magic_login';
  assert((await pool.query('SELECT count(*)::int AS n FROM registration_provisioning_jobs WHERE user_id=$1', [legacyId])).rows[0].n === 0);
  const existingMagic = await call('/api/auth/sign-in/magic-link', { email: legacyEmail, callbackURL: '/', newUserCallbackURL: '/askcore/workbench?protocol=registration' },
    undefined, { 'x-forwarded-for': '192.0.2.250' });
  stage = 'product_nat_existing_magic_send_' + existingMagic.status;
  assert(existingMagic.ok);
  const existingMagicLogin = await productAuth.handler(new Request(deliveryURL, { headers: { 'x-forwarded-for': '192.0.2.250' } }));
  assert(existingMagicLogin.status === 302);
  assert(new URL(existingMagicLogin.headers.get('location')!, baseURL).pathname === '/');
  assert((await pool.query('SELECT count(*)::int AS n FROM registration_provisioning_jobs WHERE user_id=$1', [legacyId])).rows[0].n === 0);
  checks.push('product_nat_prepare_limit_does_not_block_historical_magic_login_or_create_job');

  stage = 'product_nat_new_magic_without_intent';
  const missingEmail = opaque() + '@fixture.invalid';
  const missingMagic = await call('/api/auth/sign-in/magic-link', { email: missingEmail, callbackURL: '/', newUserCallbackURL: '/askcore/workbench?protocol=registration' },
    undefined, { 'x-forwarded-for': '192.0.2.250' });
  stage = 'product_nat_new_magic_send_' + missingMagic.status;
  assert(missingMagic.ok);
  const missingMagicLogin = await productAuth.handler(new Request(deliveryURL, { headers: { 'x-forwarded-for': '192.0.2.250' } }));
  assert(missingMagicLogin.status === 302);
  const missingLocation = new URL(missingMagicLogin.headers.get('location')!, baseURL);
  assert(missingLocation.pathname === '/askcore/workbench' && missingLocation.search === '?protocol=registration');
  const missingJob = (await pool.query('SELECT u.id,j.state,j.intent_id,j.moodle_done_version,j.gibbon_done_version FROM users u JOIN registration_provisioning_jobs j ON j.user_id=u.id WHERE u.email=$1', [missingEmail])).rows[0];
  assert(missingJob.state === 'awaiting_intent' && missingJob.intent_id === null && missingJob.moodle_done_version === null && missingJob.gibbon_done_version === null);
  checks.push('product_nat_new_magic_user_waits_for_explicit_intent_with_fixed_callback');

  stage = 'product_missing_intent_invitation_transport_recovery';
  const missingCookie = cookies(missingMagicLogin);
  const missingBinding = await binding(missingJob.id);
  const invitationRecovery = await call('/api/askcore/registration/recover', { intentHandle: invitationPrepared.handle }, missingCookie,
    { 'x-askcore-registration-session': missingBinding });
  assert(invitationRecovery.status === 200);
  const recoveredInvitation = (await pool.query('SELECT j.state,i.kind,i.id FROM registration_provisioning_jobs j JOIN registration_intents i ON i.id=j.intent_id WHERE j.user_id=$1', [missingJob.id])).rows[0];
  assert(recoveredInvitation.state === 'ready' && recoveredInvitation.kind === 'invitation' && recoveredInvitation.id === hash(invitationPrepared.handle));
  checks.push('product_missing_context_recovers_with_explicit_invitation_ciphertext_pending_backend_validation');

  stage = 'product_migration_populated_snapshot';
  // Exercise preservation of consumer-owned progress, not only fresh auth jobs.
  for (const state of ['leased', 'retry', 'identity_conflict', 'completed']) {
    const id = opaque();
    await pool.query(`INSERT INTO users(id,name,email,email_verified,created_at,updated_at)
      VALUES($1,'Synthetic',$2,true,now(),now())`, [id, opaque() + '@fixture.invalid']);
    await pool.query(`UPDATE registration_provisioning_jobs SET state=$2,attempt=3,
      next_attempt_at=now()+interval '1 hour',lease_token=$3,lease_until=now()+interval '2 minutes',
      subject_digest=$4,identity_link_version=$5,moodle_done_version=$5,
      gibbon_done_version=$5,failure_code='synthetic_replay_control',updated_at=now()
      WHERE user_id=$1`, [id, state, opaque(), hash(opaque()), opaque()]);
  }
  const snapshotSQL = `SELECT jsonb_build_object(
    'users',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM users t),
    'sessions',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM auth_sessions t),
    'accounts',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM accounts t),
    'verification',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM verification t),
    'intents',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM registration_intents t),
    'contexts',(SELECT jsonb_agg(to_jsonb(t) ORDER BY token_hash) FROM registration_magic_contexts t),
    'wechat_transactions',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM wechat_mobile_login_transactions t),
    'wechat_claims',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM wechat_rebind_claims t),
    'jobs',(SELECT jsonb_agg(to_jsonb(t) ORDER BY user_id) FROM registration_provisioning_jobs t)
  ) AS state`;
  const beforeReplay = (await pool.query(snapshotSQL)).rows[0].state;
  stage = 'product_migration_populated_replay';
  await migrate(drizzle(pool), { migrationsFolder: migrationFolder });
  assert(JSON.stringify((await pool.query(migrationHistorySQL)).rows) === JSON.stringify(migrationHistory));
  assert(JSON.stringify((await pool.query(snapshotSQL)).rows[0].state) === JSON.stringify(beforeReplay));
  checks.push('real_migrator_replay_preserves_history_and_populated_rows');
  await pool.query(migration);
  assert(JSON.stringify((await pool.query(snapshotSQL)).rows[0].state) === JSON.stringify(beforeReplay));
  checks.push('migration_replay_preserves_all_auth_and_protocol_rows');
  intentId = await prepare();
  const afterReplay = await signup();
  assert(afterReplay.response.ok && afterReplay.row.state === 'ready' && afterReplay.row.auth_ready_at);
  assert((await pool.query('SELECT count(*)::int AS n FROM registration_provisioning_jobs WHERE user_id=$1',
    [afterReplay.row.id])).rows[0].n === 1);
  assert((await pool.query('SELECT count(*)::int AS n FROM registration_provisioning_jobs WHERE user_id=$1',
    [legacyId])).rows[0].n === 0);
  checks.push('migration_replay_retains_single_job_trigger_and_historical_exclusion');

  stage = 'product_http_storage_outage';
  await pool.end(); pool = undefined;
  const outage = await call('/api/askcore/registration/status', undefined, unboundCookie);
  assert(outage.status === 503 && !outage.headers.has('set-cookie'));
  assert(outage.headers.get('cache-control') === 'private, no-store');
  checks.push('product_real_storage_outage_is_503_not_logout');

}

void (async () => {
  try {
    await main();
    process.stdout.write(JSON.stringify({ contract, status: 'partial', checks,
      deferred: ['next_runtime_and_browser', 'production_secondary_storage', 'oauth_verified_state', 'email_verification_and_reset', 'native_sources', 'worker_recovery', 'public_journey'],
      sourceCalls: 0, emailsSent: 0, rawIdentityFieldsEmitted: 0 }) + '\n');
    process.exitCode = 3;
  } catch {
    process.stdout.write(JSON.stringify({ contract, status: 'failed', stage, checks,
      sourceCalls: 0, emailsSent: 0, rawIdentityFieldsEmitted: 0 }) + '\n');
    process.exitCode = 2;
  } finally { await pool?.end(); }
})();
