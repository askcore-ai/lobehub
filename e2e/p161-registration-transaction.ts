/**
 * T148: real Better Auth/Drizzle HTTP handler against a synthetic PostgreSQL fixture.
 * This is a library experiment, not application/invitation/two-source acceptance.
 */
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

type Pool = import('pg').Pool;
type Counts = { users: number; accounts: number; markers: number };
type Hook = { stage: 'before' | 'after'; visible: Counts; syntheticIntentCookiePresent: boolean };
type Observation = {
  label: string; channel: 'email' | 'magic_link'; adapterTransaction: boolean;
  httpStatus: number; hooks: Hook[]; committed: Counts; requestCompleted: boolean;
};
const CONTRACT = 'askcore.p161-registration-transaction.v1';
const observations: Observation[] = [];
let stage = 'preflight';
let writer: Pool | undefined;
let observer: Pool | undefined;

async function experiment() {
  if (process.argv.slice(2).join(' ') !== '--auth-transaction' ||
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
  const { magicLink } = await import('better-auth/plugins');
  const { drizzle } = await import('drizzle-orm/node-postgres');
  const { boolean, pgTable, text, timestamp } = await import('drizzle-orm/pg-core');
  const { Pool } = await import('pg');
  const at = (name: string) => timestamp(name, { withTimezone: true }).notNull();
  const user = pgTable('user', {
    id: text('id').primaryKey(), name: text('name').notNull(),
    email: text('email').notNull().unique(), emailVerified: boolean('emailVerified').notNull(),
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
  await writer.query([
    'CREATE TABLE "user" (id text PRIMARY KEY, name text NOT NULL, email text UNIQUE NOT NULL,',
    '"emailVerified" boolean NOT NULL, image text, "createdAt" timestamptz NOT NULL, "updatedAt" timestamptz NOT NULL);',
    'CREATE TABLE session (id text PRIMARY KEY, "expiresAt" timestamptz NOT NULL, token text UNIQUE NOT NULL,',
    '"createdAt" timestamptz NOT NULL, "updatedAt" timestamptz NOT NULL, "ipAddress" text, "userAgent" text,',
    '"userId" text NOT NULL REFERENCES "user"(id));',
    'CREATE TABLE account (id text PRIMARY KEY, "accountId" text NOT NULL, "providerId" text NOT NULL,',
    '"userId" text NOT NULL REFERENCES "user"(id), "accessToken" text, "refreshToken" text, "idToken" text,',
    '"accessTokenExpiresAt" timestamptz, "refreshTokenExpiresAt" timestamptz, scope text, password text,',
    '"createdAt" timestamptz NOT NULL, "updatedAt" timestamptz NOT NULL);',
    'CREATE TABLE verification (id text PRIMARY KEY, identifier text NOT NULL, value text NOT NULL,',
    '"expiresAt" timestamptz NOT NULL, "createdAt" timestamptz NOT NULL, "updatedAt" timestamptz NOT NULL);',
    'CREATE TABLE fixture_marker (user_id text PRIMARY KEY REFERENCES "user"(id));',
    'CREATE FUNCTION fixture_mark_insert() RETURNS trigger LANGUAGE plpgsql AS $$',
    'BEGIN INSERT INTO fixture_marker(user_id) VALUES (NEW.id); RETURN NEW; END $$;',
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
  for (const transaction of [false, true]) {
    for (const failure of ['none', 'before', 'after'] as const) {
      await scenario('email', transaction, failure, true);
    }
    await scenario('magic_link', transaction, 'none', true);
    await scenario('magic_link', transaction, 'none', false);
    await scenario('magic_link', transaction, 'after', true);
  }

  async function scenario(
    channel: 'email' | 'magic_link', transaction: boolean,
    failure: 'none' | 'before' | 'after', callbackCookie: boolean,
  ) {
    const label = [
      channel, transaction ? 'transaction_enabled' : 'current_default',
      failure, callbackCookie ? 'cookie' : 'no_cookie',
    ].join('_');
    stage = label;
    const email = randomBytes(12).toString('hex') + '@fixture.invalid';
    const cookie = 't148_intent=' + randomBytes(32).toString('hex');
    const baseURL = 'http://127.0.0.1:19348';
    const hooks: Hook[] = [];
    let deliveryURL = '';
    const auth = betterAuth({
      baseURL, basePath: '/api/auth', secret: randomBytes(48).toString('hex'),
      database: drizzleAdapter(db, { provider: 'pg', schema, transaction }),
      logger: { disabled: true }, telemetry: { enabled: false }, rateLimit: { enabled: false },
      emailAndPassword: { enabled: true, autoSignIn: false },
      plugins: [magicLink({ sendMagicLink: async ({ url }) => { deliveryURL = url; } })],
      databaseHooks: {
        user: { create: {
          before: async (data, context) => {
            const headers = context?.headers ?? context?.request?.headers;
            hooks.push({
              stage: 'before', visible: await counts(email),
              syntheticIntentCookiePresent: (headers?.get('cookie') || '').split(';').some((value) => value.trim() === cookie),
            });
            if (failure === 'before') throw new Error('synthetic_before_failure');
            return { data };
          },
          after: async (_data, context) => {
            const headers = context?.headers ?? context?.request?.headers;
            hooks.push({
              stage: 'after', visible: await counts(email),
              syntheticIntentCookiePresent: (headers?.get('cookie') || '').split(';').some((value) => value.trim() === cookie),
            });
            if (failure === 'after') throw new Error('synthetic_after_failure');
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
      });
    } else {
      const request = await post('/sign-in/magic-link', { email, name: 'Synthetic Fixture', callbackURL: '/' });
      if (!request.ok || !deliveryURL || new URL(deliveryURL).origin !== baseURL) throw new Error('magic_setup');
      // The real plugin verifies its persisted token; the send callback only captures it in memory.
      response = await auth.handler(new Request(deliveryURL, {
        headers: callbackCookie ? { cookie } : {},
      }));
    }
    const committed = await counts(email);
    const location = response.headers.get('location');
    const requestCompleted = response.status < 400 &&
      !(location && new URL(location, baseURL).searchParams.has('error'));
    observations.push({
      label, channel, adapterTransaction: transaction, httpStatus: response.status,
      hooks, committed, requestCompleted: Boolean(requestCompleted),
    });
    // A missing callback or failed normal signup is an experiment failure, not an auth finding.
    if (hooks.length !== (failure === 'before' ? 1 : 2) ||
        (failure === 'none' && (!requestCompleted || committed.users !== 1 ||
          (channel === 'email' && committed.accounts !== 1)))) {
      throw new Error('control_failed');
    }
    if (committed.users !== committed.markers) throw new Error('marker_atomicity_failed');
  }
}

async function execute() {
  try {
    await experiment();
    process.stdout.write(JSON.stringify({
      contract: CONTRACT, status: 'partial', libraryVersion: '1.4.6', observations,
      deferred: ['local_oauth_provider', 'process_kill_during_hook', 'real_invitation_binding'],
      sourceCalls: 0, emailsSent: 0, rawIdentityFieldsEmitted: 0,
      note: 'Synthetic cookie presence is observed; trusted invitation transport is not proven.',
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
