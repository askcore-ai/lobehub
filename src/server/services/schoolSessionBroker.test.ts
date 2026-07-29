// @vitest-environment node
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { exportPKCS8, exportSPKI, generateKeyPair, importSPKI, jwtVerify } from 'jose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authApi = vi.hoisted(() => ({ getSession: vi.fn() }));
const resolveSchoolIdentity = vi.hoisted(() => vi.fn());

vi.mock('@/server/services/askcoreAssertion', () => ({
  getAskCoreAssertionAuthApi: vi.fn(async () => authApi),
}));
vi.mock('@/server/services/schoolIdentity', () => ({ resolveSchoolIdentity }));

describe('School Access Broker', () => {
  let directory = '';
  let privateKeyPath = '';
  let publicKey: Awaited<ReturnType<typeof importSPKI>>;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'p140-broker-'));
    privateKeyPath = path.join(directory, 'broker-private.pem');
    const pair = await generateKeyPair('RS256', { extractable: true });
    await writeFile(privateKeyPath, await exportPKCS8(pair.privateKey), { mode: 0o600 });
    publicKey = await importSPKI(await exportSPKI(pair.publicKey), 'RS256');
    vi.stubEnv('SCHOOL_SESSION_BROKER_PRIVATE_KEY_FILE', privateKeyPath);
    vi.stubEnv('SCHOOL_SESSION_BROKER_KEY_ID', 'school-key-v1');
    authApi.getSession.mockResolvedValue({
      session: { id: 'session-a' },
      user: { email: 'student@example.test', id: 'account-a' },
    });
    resolveSchoolIdentity.mockResolvedValue({
      identityLinkVersion: 'a'.repeat(64),
      schoolSubject: 'school_0123456789abcdef0123456789abcdef',
    });
    const { clearSchoolBrokerKeyCacheForTest } = await import('./schoolSessionBroker');
    clearSchoolBrokerKeyCacheForTest();
  });

  afterEach(async () => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    await rm(directory, { force: true, recursive: true });
  });

  it.each([
    ['moodle', '/school/teaching/local/askcore/handoff.php'],
    ['gibbon', '/school/services/askcore/handoff.php'],
  ] as const)('creates one exact 30-second RS256 %s grant', async (audience, action) => {
    const { createSourceHandoff, SCHOOL_SESSION_BROKER_ISSUER } = await import(
      './schoolSessionBroker'
    );
    const handoff = await createSourceHandoff(new Headers(), audience, 1_800_000_000);
    expect(handoff).toMatchObject({ action, expiresAt: 1_800_000_030 });
    const verified = await jwtVerify(handoff.grant, publicKey, {
      audience,
      issuer: SCHOOL_SESSION_BROKER_ISSUER,
    });
    expect(verified.protectedHeader).toEqual({
      alg: 'RS256',
      kid: 'school-key-v1',
      typ: 'askcore-handoff+jwt',
    });
    expect(Object.keys(verified.payload).sort()).toEqual([
      'aud',
      'binding',
      'exp',
      'iat',
      'iss',
      'jti',
      'sub',
    ]);
    expect(verified.payload.binding).toMatch(/^[a-f\d]{64}$/);
    expect(verified.payload.sub).toBe('school_0123456789abcdef0123456789abcdef');
    expect(verified.payload.jti).toMatch(
      /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i,
    );
    expect(JSON.stringify(verified.payload)).not.toContain('student@example.test');
    expect(JSON.stringify(verified.payload)).not.toContain('account-a');
    expect(JSON.stringify(verified.payload)).not.toContain('session-a');
  });

  it('creates an exact five-second access proof without a replay identifier', async () => {
    const { createSourceAccessProof } = await import('./schoolSessionBroker');

    const result = await createSourceAccessProof(new Headers(), 'moodle', 1_800_000_000);
    const verified = await jwtVerify(result.proof, publicKey, {
      audience: 'moodle',
      issuer: 'askcore-school-session-broker',
    });

    expect(result.expiresAt).toBe(1_800_000_005);
    expect(verified.protectedHeader.typ).toBe('askcore-access+jwt');
    expect(Object.keys(verified.payload).sort()).toEqual([
      'aud',
      'binding',
      'exp',
      'iat',
      'iss',
      'sub',
    ]);
  });

  it('keeps 1,000 resolved-identity RS256 access-proof grants within the authorization budget', async () => {
    const { createSourceAccessProof } = await import('./schoolSessionBroker');
    const durations: number[] = [];

    for (let index = 0; index < 1000; index++) {
      const startedAt = performance.now();
      await createSourceAccessProof(
        new Headers(),
        index % 2 === 0 ? 'moodle' : 'gibbon',
        1_800_000_000,
      );
      durations.push(performance.now() - startedAt);
    }

    durations.sort((left, right) => left - right);
    const percentile = (quantile: number) =>
      durations[Math.max(0, Math.ceil(durations.length * quantile) - 1)];
    const p95 = percentile(0.95);
    const p99 = percentile(0.99);
    console.info(
      JSON.stringify({
        authorization_broker_checks: durations.length,
        authorization_broker_p95_ms: Number(p95.toFixed(3)),
        authorization_broker_p99_ms: Number(p99.toFixed(3)),
        source_audiences: ['gibbon', 'moodle'],
      }),
    );
    expect(p95).toBeLessThanOrEqual(150);
    expect(p99).toBeLessThanOrEqual(300);
    expect(resolveSchoolIdentity).toHaveBeenCalledTimes(1000);
  });

  it('changes the binding immediately when the Better Auth session changes', async () => {
    const { createSourceAccessProof } = await import('./schoolSessionBroker');
    const first = await createSourceAccessProof(new Headers(), 'gibbon', 1_800_000_000);
    authApi.getSession.mockResolvedValue({
      session: { id: 'session-b' },
      user: { email: 'student@example.test', id: 'account-a' },
    });
    const second = await createSourceAccessProof(new Headers(), 'gibbon', 1_800_000_001);
    const firstPayload = (await jwtVerify(first.proof, publicKey)).payload;
    const secondPayload = (await jwtVerify(second.proof, publicKey)).payload;
    expect(secondPayload.binding).not.toBe(firstPayload.binding);
  });

  it('fails closed without a session, private key, or valid key ID', async () => {
    const { createSourceHandoff, SchoolSessionRequiredError } = await import(
      './schoolSessionBroker'
    );
    authApi.getSession.mockResolvedValue(null);
    await expect(createSourceHandoff(new Headers(), 'moodle')).rejects.toBeInstanceOf(
      SchoolSessionRequiredError,
    );

    authApi.getSession.mockResolvedValue({
      session: { id: 'session-a' },
      user: { id: 'account-a' },
    });
    vi.stubEnv('SCHOOL_SESSION_BROKER_PRIVATE_KEY_FILE', path.join(directory, 'missing'));
    await expect(createSourceHandoff(new Headers(), 'moodle')).rejects.toThrow();
    vi.stubEnv('SCHOOL_SESSION_BROKER_KEY_ID', 'invalid key id');
    await expect(createSourceHandoff(new Headers(), 'moodle')).rejects.toThrow();
  });
});
