// @vitest-environment node
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { jwtVerify } from 'jose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authApi = vi.hoisted(() => ({ getSession: vi.fn() }));
const resolveSchoolOIDCIdentity = vi.hoisted(() => vi.fn());

vi.mock('@/server/services/askcoreAssertion', () => ({
  getAskCoreAssertionAuthApi: vi.fn(async () => authApi),
}));
vi.mock('@/libs/oidc-provider/provider', () => ({ resolveSchoolOIDCIdentity }));

describe('School Session Broker', () => {
  let directory = '';
  let secretPath = '';
  const secret = 'p140-school-session-broker-secret-0123456789abcdef';

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'p140-broker-'));
    secretPath = path.join(directory, 'broker.secret');
    await writeFile(secretPath, `${secret}\n`, { mode: 0o600 });
    vi.stubEnv('SCHOOL_SESSION_BROKER_SECRET_FILE', secretPath);
    authApi.getSession.mockResolvedValue({
      session: { id: 'session-a' },
      user: { email: 'student@example.test', id: 'account-a' },
    });
    resolveSchoolOIDCIdentity.mockResolvedValue({
      identityLinkVersion: 'a'.repeat(64),
      schoolSubject: 'school_0123456789abcdef0123456789abcdef',
    });
  });

  afterEach(async () => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    await rm(directory, { force: true, recursive: true });
  });

  it.each([
    ['moodle', '/school/teaching/local/askcore/handoff.php'],
    ['gibbon', '/school/services/askcore/handoff.php'],
  ] as const)('creates one exact 30-second %s grant', async (audience, action) => {
    const { createSourceHandoff, SCHOOL_SESSION_BROKER_ISSUER } = await import(
      './schoolSessionBroker'
    );
    const handoff = await createSourceHandoff(new Headers(), audience, 1_800_000_000);
    expect(handoff.action).toBe(action);
    expect(handoff.expiresAt).toBe(1_800_000_030);
    const verified = await jwtVerify(handoff.grant, new TextEncoder().encode(secret), {
      audience,
      issuer: SCHOOL_SESSION_BROKER_ISSUER,
    });
    expect(verified.protectedHeader).toEqual({ alg: 'HS256', typ: 'JWT' });
    expect(Object.keys(verified.payload).sort()).toEqual([
      'aud',
      'exp',
      'iat',
      'identity_link_version',
      'iss',
      'jti',
      'session_generation_hash',
      'sub',
    ]);
    expect(verified.payload.identity_link_version).toBe('a'.repeat(64));
    expect(verified.payload.session_generation_hash).toMatch(/^[a-f\d]{64}$/);
    expect(JSON.stringify(verified.payload)).not.toContain('student@example.test');
    expect(JSON.stringify(verified.payload)).not.toContain('account-a');
    expect(JSON.stringify(verified.payload)).not.toContain('session-a');
  });

  it('fails closed when the dedicated secret file is unavailable', async () => {
    vi.stubEnv('SCHOOL_SESSION_BROKER_SECRET_FILE', path.join(directory, 'missing'));
    const { createSourceHandoff } = await import('./schoolSessionBroker');
    await expect(createSourceHandoff(new Headers(), 'moodle')).rejects.toThrow();
  });
});
