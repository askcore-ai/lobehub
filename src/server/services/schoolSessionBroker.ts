import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { importPKCS8, SignJWT } from 'jose';

import { getAskCoreAssertionAuthApi } from '@/server/services/askcoreAssertion';
import { resolveSchoolIdentity } from '@/server/services/schoolIdentity';

export const SCHOOL_SESSION_BROKER_ISSUER = 'askcore-school-session-broker';
export const SCHOOL_HANDOFF_TTL_SECONDS = 30;
export const SCHOOL_ACCESS_TTL_SECONDS = 5;
export const SCHOOL_HANDOFF_TOKEN_TYPE = 'askcore-handoff+jwt';
export const SCHOOL_ACCESS_TOKEN_TYPE = 'askcore-access+jwt';
export const SCHOOL_SESSION_BINDING_KIND = 'source-handoff-v2';

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

const KEY_ID_PATTERN = /^[\w.-]{1,64}$/;
const textValue = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const sha256 = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');

let signingKeyCache:
  | { keyId: string; path: string; value: ReturnType<typeof importPKCS8> }
  | undefined;

const signingMaterial = async () => {
  const path = process.env.SCHOOL_SESSION_BROKER_PRIVATE_KEY_FILE?.trim() || '';
  const keyId = process.env.SCHOOL_SESSION_BROKER_KEY_ID?.trim() || '';
  if (!path || !KEY_ID_PATTERN.test(keyId)) throw new Error('school session broker is unavailable');
  if (!signingKeyCache || signingKeyCache.path !== path || signingKeyCache.keyId !== keyId) {
    const value = readFile(/* turbopackIgnore: true */ path, 'utf8').then((pem) =>
      importPKCS8(pem, 'RS256'),
    );
    signingKeyCache = { keyId, path, value };
  }
  try {
    return { key: await signingKeyCache.value, keyId };
  } catch (error) {
    signingKeyCache = undefined;
    throw error;
  }
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

export const resolveCurrentSchoolBinding = async (headers: Headers) => {
  const account = await currentAccountSession(headers);
  const { identityLinkVersion, schoolSubject } = await resolveSchoolIdentity(account);
  const sessionGenerationHash = sha256(
    `askcore-school-session-generation-v1\0${account.userId}\0${account.sessionId}`,
  );
  const binding = sha256(
    `askcore-source-session-binding-v2\0${schoolSubject}\0${identityLinkVersion}\0${sessionGenerationHash}`,
  );
  return { binding, schoolSubject };
};

const sign = async ({
  audience,
  binding,
  expiresAt,
  issuedAt,
  jti,
  schoolSubject,
  tokenType,
}: {
  audience: SchoolSourceAudience;
  binding: string;
  expiresAt: number;
  issuedAt: number;
  jti?: string;
  schoolSubject: string;
  tokenType: typeof SCHOOL_ACCESS_TOKEN_TYPE | typeof SCHOOL_HANDOFF_TOKEN_TYPE;
}) => {
  const { key, keyId } = await signingMaterial();
  const token = new SignJWT({ binding })
    .setProtectedHeader({ alg: 'RS256', kid: keyId, typ: tokenType })
    .setIssuer(SCHOOL_SESSION_BROKER_ISSUER)
    .setAudience(audience)
    .setSubject(schoolSubject);
  if (jti) token.setJti(jti);
  return token.setIssuedAt(issuedAt).setExpirationTime(expiresAt).sign(key);
};

export const createSourceHandoff = async (
  headers: Headers,
  audience: SchoolSourceAudience,
  nowSeconds = Math.floor(Date.now() / 1000),
) => {
  const action = SOURCE_ACTIONS[audience];
  if (!action) throw new Error('school source is unavailable');
  const { binding, schoolSubject } = await resolveCurrentSchoolBinding(headers);
  const expiresAt = nowSeconds + SCHOOL_HANDOFF_TTL_SECONDS;
  const grant = await sign({
    audience,
    binding,
    expiresAt,
    issuedAt: nowSeconds,
    jti: randomUUID(),
    schoolSubject,
    tokenType: SCHOOL_HANDOFF_TOKEN_TYPE,
  });
  return { action, expiresAt, grant };
};

export const createSourceAccessProof = async (
  headers: Headers,
  audience: SchoolSourceAudience,
  nowSeconds = Math.floor(Date.now() / 1000),
) => {
  const { binding, schoolSubject } = await resolveCurrentSchoolBinding(headers);
  const expiresAt = nowSeconds + SCHOOL_ACCESS_TTL_SECONDS;
  const proof = await sign({
    audience,
    binding,
    expiresAt,
    issuedAt: nowSeconds,
    schoolSubject,
    tokenType: SCHOOL_ACCESS_TOKEN_TYPE,
  });
  return { expiresAt, proof };
};

export const clearSchoolBrokerKeyCacheForTest = () => {
  signingKeyCache = undefined;
};
