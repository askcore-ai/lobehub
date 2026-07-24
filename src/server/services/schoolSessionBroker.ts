import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { SignJWT } from 'jose';

import { resolveSchoolOIDCIdentity } from '@/libs/oidc-provider/provider';
import { getAskCoreAssertionAuthApi } from '@/server/services/askcoreAssertion';

export const SCHOOL_SESSION_BROKER_ISSUER = 'askcore-school-session-broker';
export const SCHOOL_SESSION_BROKER_TTL_SECONDS = 30;

export type SchoolSourceAudience = 'gibbon' | 'moodle';

export class SchoolSessionRequiredError extends Error {
  constructor() {
    super('school session is required');
    this.name = 'SchoolSessionRequiredError';
  }
}

const SOURCE_ACTIONS: Record<SchoolSourceAudience, string> = {
  gibbon: '/school/services/askcore/handoff.php',
  moodle: '/school/teaching/local/askcore/handoff.php',
};

const textValue = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const sha256 = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');

const brokerSecret = async () => {
  const path = process.env.SCHOOL_SESSION_BROKER_SECRET_FILE?.trim();
  if (!path) throw new Error('school session broker is unavailable');
  const secret = (await readFile(path, 'utf8')).trim();
  if (Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('school session broker is unavailable');
  }
  return new TextEncoder().encode(secret);
};

const currentAccountSession = async (headers: Headers) => {
  const authApi = await getAskCoreAssertionAuthApi();
  const session = await authApi.getSession({ headers });
  const record = session && typeof session === 'object' ? session : undefined;
  const user =
    record?.user && typeof record.user === 'object'
      ? (record.user as Record<string, unknown>)
      : undefined;
  const sessionData =
    record?.session && typeof record.session === 'object'
      ? (record.session as Record<string, unknown>)
      : undefined;
  const userId = textValue(user?.id);
  const sessionId = textValue(sessionData?.id);
  if (!userId || !sessionId) throw new SchoolSessionRequiredError();
  return { email: textValue(user?.email) || undefined, sessionId, userId };
};

export const createSourceHandoff = async (
  headers: Headers,
  audience: SchoolSourceAudience,
  nowSeconds = Math.floor(Date.now() / 1000),
) => {
  const action = SOURCE_ACTIONS[audience];
  if (!action) throw new Error('school source is unavailable');
  const account = await currentAccountSession(headers);
  const { identityLinkVersion, schoolSubject } = await resolveSchoolOIDCIdentity(account);
  const sessionGenerationHash = sha256(
    `askcore-school-session-generation-v1\0${account.userId}\0${account.sessionId}`,
  );
  const expiresAt = nowSeconds + SCHOOL_SESSION_BROKER_TTL_SECONDS;
  const grant = await new SignJWT({
    identity_link_version: identityLinkVersion,
    session_generation_hash: sessionGenerationHash,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(SCHOOL_SESSION_BROKER_ISSUER)
    .setAudience(audience)
    .setSubject(schoolSubject)
    .setJti(randomUUID())
    .setIssuedAt(nowSeconds)
    .setExpirationTime(expiresAt)
    .sign(await brokerSecret());

  return { action, expiresAt, grant };
};
