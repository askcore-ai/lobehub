/**
 * T148: real Better Auth/Drizzle HTTP handler against a synthetic PostgreSQL fixture.
 * This is a library experiment, not application/invitation/two-source acceptance.
 */
import { fork } from 'node:child_process';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

type Pool = import('pg').Pool;
type Counts = { users: number; accounts: number; markers: number };
type Hook = { stage: 'before' | 'after'; visible: Counts; syntheticIntentCookiePresent: boolean; verifiedOAuthIntentPresent: boolean; serverIntentAttached?: boolean };
type Observation = {
  label: string; channel: 'email' | 'magic_link' | 'oauth'; adapterTransaction: boolean;
  httpStatus: number; hooks: Hook[]; committed: Counts; requestCompleted: boolean; intentClaimed?: boolean;
};
const CONTRACT = 'askcore.p161-registration-transaction.v1';
const observations: Observation[] = [];
const terminationObservations: object[] = [];
const intentObservations: object[] = [];
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const killWorker = process.argv[2] === '--kill-worker';
let stage = 'preflight';
let writer: Pool | undefined;
let observer: Pool | undefined;

async function experiment() {
  if ((!killWorker && process.argv.slice(2).join(' ') !== '--auth-transaction') ||
      process.env.ASKCORE_TEST_WORKTREE_ID !== 'p161-t146-identity-session') throw new Error('preflight');
  const resolve = createRequire(process.cwd() + '/package.json');
  stage = 'library_version';
  // package.json is not an exported Better Auth subpath; resolve its public entry first.
  const packagePath = join(dirname(resolve.resolve('better-auth')), '..', 'package.json');
  const version = JSON.parse(readFileSync(packagePath, 'utf8')).version;
  if (version !== '1.4.6') throw new Error('library_version');
  stage = 'library_import';
  const { betterAuth } = await import('better-auth/minimal');
  const { drizzleAdapter } = await import('better-auth/adapters/drizzle');
  const { magicLink, genericOAuth } = await import('better-auth/plugins');
  const { getOAuthState } = await import('better-auth/api');
  const { drizzle } = await import('drizzle-orm/node-postgres');
  const { boolean, pgTable, text, timestamp } = await import('drizzle-orm/pg-core');
  const { Pool } = await import('pg');
  const at = (name: string) => timestamp(name, { withTimezone: true }).notNull();
  const user = pgTable('user', {
    id: text('id').primaryKey(), name: text('name').notNull(),
    email: text('email').notNull().unique(), emailVerified: boolean('emailVerified').notNull(),
    registrationIntentId: text('registrationIntentId'),
    image: text('image'), createdAt: at('createdAt'), updatedAt: at('updatedAt'),
  });
  const session = pgTable('session', {
    id: text('id').primaryKey(), expiresAt: at('expiresAt'), token: text('token').notNull().unique(),
    createdAt: at('createdAt'), updatedAt: at('updatedAt'), ipAddress: text('ipAddress'),
    userAgent: text('userAgent'), userId: text('userId').notNull().references(() => user.id),
  });
  const account = pgTable('account', {
    id: text('id').primaryKey(), accountId: text('accountId').notNull(),
    providerId: text('providerId').notNull(), userId: text('userId').notNull().references(() => user.id),
    accessToken: text('accessToken'), refreshToken: text('refreshToken'), idToken: text('idToken'),
    accessTokenExpiresAt: timestamp('accessTokenExpiresAt', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refreshTokenExpiresAt', { withTimezone: true }),
    scope: text('scope'), password: text('password'), createdAt: at('createdAt'), updatedAt: at('updatedAt'),
  });
  const verification = pgTable('verification', {
    id: text('id').primaryKey(), identifier: text('identifier').notNull(), value: text('value').notNull(),
    expiresAt: at('expiresAt'), createdAt: at('createdAt'), updatedAt: at('updatedAt'),
  });
  stage = 'fixture_binding';
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (input.host !== '127.0.0.1' || input.database !== 'p161_t148_synthetic' ||
      input.user !== 'p161_t148_synthetic' ||
      !Number.isInteger(input.port) || input.port < 1024 || input.port > 65535 ||
      typeof input.password !== 'string' || input.password.length < 32) throw new Error('fixture_binding');
  const connection = {
    host: input.host, port: input.port, database: input.database, user: input.user,
    password: input.password, connectionTimeoutMillis: 5000, max: 3,
  };
  writer = new Pool(connection);
  observer = new Pool(connection);
  stage = 'schema';
  const actual = await writer.query('SELECT current_database() AS name');
  if (actual.rows[0].name !== 'p161_t148_synthetic') throw new Error('database_binding');
  // Fresh experimental database only. No application migrations or DROP statements.
  if (!killWorker) await writer.query([
    'CREATE TABLE fixture_intent (intent_hash text PRIMARY KEY, expires_at timestamptz NOT NULL, claimed_user text);',
    'CREATE TABLE fixture_magic_context (token_hash text PRIMARY KEY, intent_hash text NOT NULL REFERENCES fixture_intent(intent_hash));',
    'CREATE TABLE "user" (id text PRIMARY KEY, name text NOT NULL, email text UNIQUE NOT NULL,',
    '"emailVerified" boolean NOT NULL, image text, "registrationIntentId" text REFERENCES fixture_intent(intent_hash), "createdAt" timestamptz NOT NULL, "updatedAt" timestamptz NOT NULL);',
    'CREATE TABLE session (id text PRIMARY KEY, "expiresAt" timestamptz NOT NULL, token text UNIQUE NOT NULL,',
    '"createdAt" timestamptz NOT NULL, "updatedAt" timestamptz NOT NULL, "ipAddress" text, "userAgent" text,',
    '"userId" text NOT NULL REFERENCES "user"(id));',
    'CREATE TABLE account (id text PRIMARY KEY, "accountId" text NOT NULL, "providerId" text NOT NULL,',
    '"userId" text NOT NULL REFERENCES "user"(id), "accessToken" text, "refreshToken" text, "idToken" text,',
    '"accessTokenExpiresAt" timestamptz, "refreshTokenExpiresAt" timestamptz, scope text, password text,',
    '"createdAt" timestamptz NOT NULL, "updatedAt" timestamptz NOT NULL);',
    'CREATE TABLE verification (id text PRIMARY KEY, identifier text NOT NULL, value text NOT NULL,',
    '"expiresAt" timestamptz NOT NULL, "createdAt" timestamptz NOT NULL, "updatedAt" timestamptz NOT NULL);',
    'CREATE TABLE fixture_marker (user_id text PRIMARY KEY REFERENCES "user"(id), intent_attached boolean NOT NULL);',
    'CREATE FUNCTION fixture_mark_insert() RETURNS trigger LANGUAGE plpgsql AS $$',
    'BEGIN IF NEW."registrationIntentId" IS NOT NULL THEN',
    'UPDATE fixture_intent SET claimed_user=NEW.id WHERE intent_hash=NEW."registrationIntentId"',
    'AND claimed_user IS NULL AND expires_at>clock_timestamp();',
    "IF NOT FOUND THEN RAISE EXCEPTION 'fixture_intent_not_claimable'; END IF; END IF;",
    'INSERT INTO fixture_marker(user_id,intent_attached) VALUES (NEW.id,NEW."registrationIntentId" IS NOT NULL); RETURN NEW; END $$;',
    'CREATE TRIGGER fixture_marker_insert AFTER INSERT ON "user" FOR EACH ROW EXECUTE FUNCTION fixture_mark_insert();',
  ].join(' '));
  const schema = { user, session, account, verification };
  const db = drizzle(writer, { schema });
  const counts = async (email: string): Promise<Counts> => {
    const result = await observer!.query([
      'SELECT (SELECT count(*)::int FROM "user" WHERE email=$1) AS users,',
      '(SELECT count(*)::int FROM account a JOIN "user" u ON a."userId"=u.id WHERE u.email=$1) AS accounts,',
      '(SELECT count(*)::int FROM fixture_marker m JOIN "user" u ON m.user_id=u.id WHERE u.email=$1) AS markers',
    ].join(' '), [email]);
    return result.rows[0];
  };
  if (killWorker) {
    await scenario('email', input.kill.transaction, 'kill', true, input.kill.email);
    throw new Error('kill_worker_returned');
  }
  for (const transaction of [false, true]) {
    for (const failure of ['none', 'before', 'after'] as const) {
      await scenario('email', transaction, failure, true);
    }
    await scenario('magic_link', transaction, 'none', true);
    await scenario('magic_link', transaction, 'none', false);
    await scenario('magic_link', transaction, 'after', true);
    await scenario('oauth', transaction, 'none', true);
    await scenario('oauth', transaction, 'after', true);
    await scenario('oauth', transaction, 'none', false);
    await terminateDuringHook(transaction);
  }

  await atomicIntentControls();

  async function scenario(
    channel: 'email' | 'magic_link' | 'oauth', transaction: boolean,
    failure: 'none' | 'before' | 'after' | 'kill', callbackCookie: boolean, fixedEmail?: string,
  ) {
    const label = [
      channel, transaction ? 'transaction_enabled' : 'current_default',
      failure, callbackCookie ? 'cookie' : 'no_cookie',
    ].join('_');
    stage = label;
    const email = fixedEmail || randomBytes(12).toString('hex') + '@fixture.invalid';
    const cookie = 't148_intent=' + randomBytes(32).toString('hex');
    const baseURL = 'http://127.0.0.1:19348';
    const hooks: Hook[] = [];
    const intent = randomBytes(32).toString('hex');
    const intentHash = hash(intent);
    await writer!.query("INSERT INTO fixture_intent(intent_hash,expires_at) VALUES ($1,now()+interval '5 minutes')", [intentHash]);
    const authorizationCode = randomBytes(24).toString('hex');
    const accessToken = randomBytes(32).toString('hex');
    const providerSubject = randomBytes(24).toString('hex');
    let provider: ReturnType<typeof createServer> | undefined;
    let providerOrigin = '';
    let exchanged = false;
    try {
    if (channel === 'oauth') {
      provider = createServer(async (request, response) => {
        response.setHeader('Content-Type', 'application/json');
        if (request.url === '/token' && request.method === 'POST') {
          const pieces: Buffer[] = [];
          for await (const piece of request) pieces.push(Buffer.from(piece));
          const form = new URLSearchParams(Buffer.concat(pieces).toString());
          if (form.get('code') !== authorizationCode || exchanged) {
            response.writeHead(400).end(JSON.stringify({ error: 'invalid_grant' })); return;
          }
          exchanged = true;
          response.end(JSON.stringify({ access_token: accessToken, token_type: 'Bearer', expires_in: 300 }));
        } else if (request.url === '/userinfo' && request.headers.authorization === `Bearer ${accessToken}`) {
          response.end(JSON.stringify({ sub: providerSubject, id: providerSubject, email, email_verified: true, name: 'Synthetic Fixture' }));
        } else response.writeHead(404).end('{}');
      });
      await new Promise<void>((resolve) => provider!.listen(0, '127.0.0.1', resolve));
      const address = provider.address();
      if (!address || typeof address === 'string') throw new Error('provider_listener');
      providerOrigin = `http://127.0.0.1:${address.port}`;
    }
    let deliveryURL = '';
    const auth = betterAuth({
      baseURL, basePath: '/api/auth', secret: randomBytes(48).toString('hex'),
      database: drizzleAdapter(db, { provider: 'pg', schema, transaction }),
      logger: { disabled: true }, telemetry: { enabled: false }, rateLimit: { enabled: false },
      emailAndPassword: { enabled: true, autoSignIn: false },
      user: { additionalFields: { registrationIntentId: { type: 'string', required: false, input: false } } },
      plugins: [magicLink({ sendMagicLink: async ({ url, token }) => {
        deliveryURL = url;
        // Model the proposed server-owned association, never a caller-provided kind flag.
        await writer!.query('INSERT INTO fixture_magic_context(token_hash,intent_hash) VALUES ($1,$2)', [hash(token), intentHash]);
      } }),
        ...(channel === 'oauth' ? [genericOAuth({ config: [{ providerId: 't148',
          clientId: 'synthetic-client', clientSecret: randomBytes(32).toString('hex'),
          authorizationUrl: providerOrigin + '/authorize', tokenUrl: providerOrigin + '/token',
          userInfoUrl: providerOrigin + '/userinfo', scopes: ['openid', 'email'],
        }] })] : [])],
      databaseHooks: {
        user: { create: {
          before: async (data, context) => {
            const headers = context?.headers ?? context?.request?.headers;
            hooks.push({
              stage: 'before', visible: await counts(email),
              verifiedOAuthIntentPresent: (await getOAuthState())?.registrationIntent === intent,
              syntheticIntentCookiePresent: (headers?.get('cookie') || '').split(';').some((value) => value.trim() === cookie),
            });
            if (failure === 'before') throw new Error('synthetic_before_failure');
            let attachedHash: string | undefined;
            if (channel === 'oauth') {
              const state = await getOAuthState();
              if (typeof state?.registrationIntent === 'string') attachedHash = hash(state.registrationIntent);
            } else if (channel === 'magic_link') {
              const token = context?.query?.token;
              if (typeof token === 'string') {
                const mapping = await writer!.query('SELECT intent_hash FROM fixture_magic_context WHERE token_hash=$1', [hash(token)]);
                attachedHash = mapping.rows[0]?.intent_hash;
              }
            } else {
              const callback = context?.body?.callbackURL;
              const handle = typeof callback === 'string' ? new URL(callback, baseURL).searchParams.get('intent') : null;
              if (handle) attachedHash = hash(handle);
            }
            const prepared = attachedHash ? await writer!.query('SELECT intent_hash FROM fixture_intent WHERE intent_hash=$1 AND expires_at>now() AND claimed_user IS NULL', [attachedHash]) : null;
            if (attachedHash !== intentHash || prepared?.rowCount !== 1) throw new Error('server_intent_unavailable');
            hooks[hooks.length - 1].serverIntentAttached = true;
            return { data: { ...data, registrationIntentId: attachedHash } };
          },
          after: async (_data, context) => {
            const headers = context?.headers ?? context?.request?.headers;
            hooks.push({
              stage: 'after', visible: await counts(email),
              verifiedOAuthIntentPresent: (await getOAuthState())?.registrationIntent === intent,
              syntheticIntentCookiePresent: (headers?.get('cookie') || '').split(';').some((value) => value.trim() === cookie),
            });
            if (failure === 'after') throw new Error('synthetic_after_failure');
            if (failure === 'kill') {
              process.send?.({ hookReady: true });
              await new Promise(() => {});
            }
          },
        } },
      },
    });
    const post = (path: string, body: object) => auth.handler(new Request(baseURL + '/api/auth' + path, {
      method: 'POST', headers: { 'content-type': 'application/json', origin: baseURL, cookie },
      body: JSON.stringify(body),
    }));
    let response: Response;
      if (channel === 'email') {
        response = await post('/sign-up/email', {
          email, name: 'Synthetic Fixture', password: randomBytes(24).toString('hex'),
          callbackURL: '/fixture-complete?intent=' + intent,
        });
      } else if (channel === 'magic_link') {
        const request = await post('/sign-in/magic-link', { email, name: 'Synthetic Fixture', callbackURL: '/fixture-complete?intent=' + intent });
        if (!request.ok || !deliveryURL || new URL(deliveryURL).origin !== baseURL) throw new Error('magic_setup');
        // The real plugin verifies its persisted token; the send callback only captures it in memory.
        const callback = new URL(deliveryURL);
        if (!callbackCookie) callback.searchParams.set('callbackURL', '/fixture-complete?intent=untrusted-replacement');
        response = await auth.handler(new Request(callback, {
          headers: callbackCookie ? { cookie } : {},
        }));
      } else {
        const initiation = await post('/sign-in/oauth2', {
          providerId: 't148', callbackURL: '/', additionalData: { registrationIntent: intent },
        });
        const initiated = await initiation.json();
        if (!initiation.ok || typeof initiated.url !== 'string') throw new Error('oauth_setup');
        const destination = new URL(initiated.url);
        if (destination.origin !== providerOrigin) throw new Error('provider_origin');
        const callback = new URL('/api/auth/oauth2/callback/t148', baseURL);
        callback.searchParams.set('code', authorizationCode);
        callback.searchParams.set('state', destination.searchParams.get('state') || '');
        const authCookies = initiation.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
        response = await auth.handler(new Request(callback, {
          headers: callbackCookie ? { cookie: authCookies + '; ' + cookie } : {},
        }));
      }
      const committed = await counts(email);
      const location = response.headers.get('location');
      const requestCompleted = response.status < 400 &&
        !(location && new URL(location, baseURL).searchParams.has('error'));
      const claimed = await writer!.query('SELECT claimed_user IS NOT NULL AS claimed FROM fixture_intent WHERE intent_hash=$1', [intentHash]);
      const intentClaimed = claimed.rows[0].claimed;
      observations.push({
        label, channel, adapterTransaction: transaction, httpStatus: response.status,
        hooks, committed, requestCompleted: Boolean(requestCompleted), intentClaimed,
      });
      // A missing callback or failed normal signup is an experiment failure, not an auth finding.
      const rejectedOAuth = channel === 'oauth' && !callbackCookie;
      if (rejectedOAuth && (response.status !== 302 || !location ||
          new URL(location, baseURL).searchParams.get('error') !== 'state_mismatch' ||
          exchanged || hooks.length !== 0 || committed.users !== 0 || requestCompleted)) throw new Error('oauth_cookie_guard');
      if (!rejectedOAuth && (hooks.length !== (failure === 'before' ? 1 : 2) ||
          (failure === 'none' && (!requestCompleted || committed.users !== 1 ||
            (channel !== 'magic_link' && committed.accounts !== 1))))) {
        throw new Error('control_failed');
      }
      if (committed.users !== committed.markers || intentClaimed !== (committed.users === 1)) throw new Error('marker_intent_atomicity_failed');
      if (channel === 'oauth' && callbackCookie && !hooks.every((hook) => hook.verifiedOAuthIntentPresent)) throw new Error('oauth_intent_context');
    } finally {
      if (provider?.listening) await new Promise<void>((resolve, reject) => provider!.close((error) => error ? reject(error) : resolve()));
    }
  }

  async function atomicIntentControls() {
    stage = 'atomic_intent_controls';
    const insert = async (intentHash: string | null, client: Pool | import('pg').PoolClient = writer!) => {
      const id = randomBytes(16).toString('hex');
      try {
        await client.query('INSERT INTO "user" (id,name,email,"emailVerified","createdAt","updatedAt","registrationIntentId") VALUES ($1,$2,$3,true,now(),now(),$4)',
          [id, 'Synthetic Fixture', randomBytes(12).toString('hex') + '@fixture.invalid', intentHash]);
        return true;
      } catch (error) {
        if ((error as { code?: string }).code !== 'P0001') throw error;
        return false;
      }
    };
    const intentHash = hash(randomBytes(32).toString('hex'));
    await writer!.query("INSERT INTO fixture_intent VALUES ($1,now()+interval '5 minutes',null)", [intentHash]);
    const first = await writer!.connect();
    const second = await writer!.connect();
    let blockedClaimObserved = false;
    let secondInsert: Promise<boolean> | undefined;
    try {
      for (const client of [first, second]) {
        await client.query('BEGIN');
        await client.query("SET LOCAL statement_timeout='5s'");
        // Hold the same locks acquired by both foreign-key checks before either claim.
        await client.query('SELECT intent_hash FROM fixture_intent WHERE intent_hash=$1 FOR KEY SHARE', [intentHash]);
      }
      const firstPid = (await first.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      const secondPid = (await second.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      if (!await insert(intentHash, first)) throw new Error('first_intent_claim');
      secondInsert = insert(intentHash, second);
      // Attach rejection handling immediately while observing the blocked query.
      void secondInsert.catch(() => {});
      const deadline = Date.now() + 3000;
      while (Date.now() < deadline) {
        const state = await observer!.query('SELECT $1::int=ANY(pg_blocking_pids($2::int)) AS blocked', [firstPid, secondPid]);
        if (state.rows[0].blocked) { blockedClaimObserved = true; break; }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      if (!blockedClaimObserved) throw new Error('concurrent_claim_not_observed');
      await first.query('COMMIT');
      if (await secondInsert) throw new Error('duplicate_intent_claim');
    } finally {
      await first.query('ROLLBACK');
      // Release the blocker before draining any outstanding second query.
      await secondInsert?.catch(() => {});
      await second.query('ROLLBACK');
      first.release(); second.release();
    }
    if (await insert(intentHash)) throw new Error('intent_replayed');
    const expiredHash = hash(randomBytes(32).toString('hex'));
    await writer!.query("INSERT INTO fixture_intent VALUES ($1,now()-interval '1 second',null)", [expiredHash]);
    if (await insert(expiredHash)) throw new Error('expired_intent_claimed');
    const linked = await writer!.query('SELECT count(*)::int AS count FROM "user" u JOIN fixture_marker m ON m.user_id=u.id WHERE u."registrationIntentId"=$1', [intentHash]);
    if (linked.rows[0].count !== 1) throw new Error('intent_event_atomicity');
    if (!await insert(null)) throw new Error('missing_intent_pending_event');
    const pending = await writer!.query('SELECT count(*)::int AS count FROM fixture_marker WHERE intent_attached=false');
    if (pending.rows[0].count !== 1) throw new Error('missing_intent_not_pending');
    intentObservations.push({ missingIntentRetainedUnattached: true, concurrentClaims: 2, blockedClaimObserved, committedClaims: 1, replayRejected: true,
      expiredRejected: true, atomicUserAndEvent: true,
      scope: 'experimental_sql_trigger_not_product_invitation_or_worker' });
  }

  async function terminateDuringHook(transaction: boolean) {
    stage = transaction ? 'kill_transaction_enabled' : 'kill_current_default';
    const email = randomBytes(12).toString('hex') + '@fixture.invalid';
    const child = fork(fileURLToPath(import.meta.url), ['--kill-worker'], {
      execArgv: ['--import', 'tsx'], stdio: ['pipe', 'pipe', 'pipe', 'ipc'], env: process.env,
    });
    child.stdout?.resume(); child.stderr?.resume();
    const exited = new Promise<string | null>((resolve) => {
      child.once('exit', (_code, signal) => resolve(signal));
      child.once('error', () => resolve(null));
    });
    try {
      const ready = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('kill_hook_timeout')), 20000);
        child.once('message', (message: any) => {
          clearTimeout(timeout);
          if (message?.hookReady === true) resolve(); else reject(new Error('kill_hook_signal'));
        });
        child.once('exit', () => { clearTimeout(timeout); reject(new Error('kill_child_exited')); });
        child.once('error', () => { clearTimeout(timeout); reject(new Error('kill_child_spawn_failed')); });
      });
      child.stdin!.end(JSON.stringify({ ...input, kill: { transaction, email } }));
      await ready;
      const visibleAtHook = await counts(email);
      child.kill('SIGKILL');
      const signal = await exited;
      const committedAfterTermination = await counts(email);
      if (signal !== 'SIGKILL' || committedAfterTermination.users !== committedAfterTermination.markers ||
          committedAfterTermination.users !== (transaction ? 0 : 1)) throw new Error('kill_control');
      terminationObservations.push({ adapterTransaction: transaction, visibleAtHook, committedAfterTermination,
        signal, pendingEventRecoverable: committedAfterTermination.markers === 1 });
    } finally {
      child.stdin?.destroy();
      if (child.pid && child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await exited; }
    }
  }
}

async function execute() {
  try {
    await experiment();
    process.stdout.write(JSON.stringify({
      contract: CONTRACT, status: 'partial', libraryVersion: '1.4.6', observations, terminationObservations, intentObservations,
      deferred: ['real_invitation_binding', 'product_intent_prepare_validation', 'process_kill_delivery_recovery'],
      sourceCalls: 0, emailsSent: 0, rawIdentityFieldsEmitted: 0,
      note: 'Experimental server-owned opaque mappings and atomic claims are exercised; product invitation validation and delivery recovery remain unproven.',
    }) + '\n');
    process.exitCode = 3;
  } catch {
    process.stdout.write(JSON.stringify({
      contract: CONTRACT, status: ['preflight', 'library_version', 'library_import', 'fixture_binding', 'schema'].includes(stage) ? 'setup_failed' : 'failed', stage, observations,
      sourceCalls: 0, emailsSent: 0, rawIdentityFieldsEmitted: 0,
    }) + '\n');
    process.exitCode = 2;
  } finally {
    await observer?.end();
    await writer?.end();
  }
}
void execute();
