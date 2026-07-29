import { type NextRequest, NextResponse } from 'next/server';

import {
  askCoreAssertionHeaderName,
  buildAskCoreAssertion,
  getAskCoreAssertionAuthApi,
} from '@/server/services/askcoreAssertion';
import { readBoundedStream } from '@/server/utils/readBoundedStream';

const noStoreHeaders = { 'Cache-Control': 'private, no-store' };
const DEFAULT_API_BASE_URL = 'http://api:8000';
const ACTOR_OBSERVATION_PATH = '/api/lms-connectors/v2/processing/actor-observations';
const ACTOR_OBSERVATION_READINESS_PATH = `${ACTOR_OBSERVATION_PATH}/readiness`;
const ACTOR_OBSERVATION_READINESS_SUBJECT = 'moodle-actor-observation-readiness';
const CONNECTOR_PROOF_HEADERS = [
  'X-AskCore-Deployment',
  'X-AskCore-Timestamp',
  'X-AskCore-Nonce',
  'X-AskCore-Signature',
] as const;
const REQUEST_BODY_MAX_BYTES = 1024;
const UPSTREAM_RESPONSE_MAX_BYTES = 4096;
const UPSTREAM_TIMEOUT_MS = 3000;
const textValue = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const isJsonContentType = (value: string | null) => {
  const mediaType = value?.split(';', 1)[0]?.trim().toLowerCase();
  return mediaType === 'application/json' || mediaType?.endsWith('+json') === true;
};

const currentAccountId = async (request: NextRequest) => {
  const authApi = await getAskCoreAssertionAuthApi();
  const session = await authApi.getSession({ headers: request.headers });
  const record = session && typeof session === 'object' ? session : undefined;
  const user =
    record?.user && typeof record.user === 'object'
      ? (record.user as Record<string, unknown>)
      : undefined;
  return textValue(user?.id);
};

const actorObservationUrl = (path: string) => {
  const baseUrl =
    process.env.AITUTOR_API_BASE_URL?.trim() ||
    process.env.WORKBENCH_API_BASE_URL?.trim() ||
    DEFAULT_API_BASE_URL;
  return new URL(path, baseUrl);
};

export const POST = async (request: NextRequest) => {
  const query = [...request.nextUrl.searchParams];
  const readiness = query.length === 1 && request.nextUrl.searchParams.get('readiness') === '1';
  if (query.length > 0 && !readiness) {
    return NextResponse.json(
      { detail: 'Actor observation route is unavailable' },
      { headers: noStoreHeaders, status: 404 },
    );
  }

  const userId = readiness ? ACTOR_OBSERVATION_READINESS_SUBJECT : await currentAccountId(request);
  if (!userId) {
    return NextResponse.json(
      { detail: 'AskCore session is required' },
      { headers: noStoreHeaders, status: 401 },
    );
  }

  const connectorHeaders = new Headers();
  for (const name of CONNECTOR_PROOF_HEADERS) {
    const value = textValue(request.headers.get(name));
    if (!value) {
      return NextResponse.json(
        { detail: 'Moodle connector proof is required' },
        { headers: noStoreHeaders, status: 401 },
      );
    }
    connectorHeaders.set(name, value);
  }

  const declaredLength = request.headers.get('content-length')?.trim();
  if (
    declaredLength &&
    (!/^\d+$/.test(declaredLength) || Number(declaredLength) > REQUEST_BODY_MAX_BYTES)
  ) {
    return NextResponse.json(
      { detail: 'Actor observation is invalid' },
      { headers: noStoreHeaders, status: 400 },
    );
  }

  let body: Uint8Array<ArrayBuffer>;
  try {
    body = await readBoundedStream(request.body, REQUEST_BODY_MAX_BYTES);
  } catch {
    return NextResponse.json(
      { detail: 'Actor observation is invalid' },
      { headers: noStoreHeaders, status: 400 },
    );
  }
  if (readiness && new TextDecoder().decode(body) !== '{}') {
    return NextResponse.json(
      { detail: 'Actor observation is invalid' },
      { headers: noStoreHeaders, status: 400 },
    );
  }

  let assertion: string;
  try {
    assertion = await buildAskCoreAssertion({
      scopes: [readiness ? 'school.identity.readiness' : 'school.identity.write'],
      sub: userId,
    });
  } catch {
    return NextResponse.json(
      { detail: 'Actor observation is unavailable' },
      { headers: noStoreHeaders, status: 503 },
    );
  }

  connectorHeaders.set('Accept', 'application/json');
  connectorHeaders.set('Content-Type', 'application/json');
  connectorHeaders.set(askCoreAssertionHeaderName(), assertion);
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new DOMException('Actor observation timed out', 'TimeoutError')),
    UPSTREAM_TIMEOUT_MS,
  );
  try {
    const upstream = await fetch(
      actorObservationUrl(readiness ? ACTOR_OBSERVATION_READINESS_PATH : ACTOR_OBSERVATION_PATH),
      {
        body: body.buffer,
        cache: 'no-store',
        headers: connectorHeaders,
        method: 'POST',
        redirect: 'manual',
        signal: controller.signal,
      },
    );
    if (upstream.status >= 300 && upstream.status < 400) {
      await upstream.body?.cancel();
      return NextResponse.json(
        { detail: 'Actor observation is unavailable' },
        { headers: noStoreHeaders, status: 502 },
      );
    }
    if (!isJsonContentType(upstream.headers.get('content-type'))) {
      await upstream.body?.cancel();
      return NextResponse.json(
        { detail: 'Actor observation is unavailable' },
        { headers: noStoreHeaders, status: 502 },
      );
    }
    const responseBody = await readBoundedStream(upstream.body, UPSTREAM_RESPONSE_MAX_BYTES);
    const payload = JSON.parse(new TextDecoder().decode(responseBody)) as unknown;
    return NextResponse.json(payload, {
      headers: noStoreHeaders,
      status: upstream.status,
    });
  } catch {
    return NextResponse.json(
      { detail: 'Actor observation is unavailable' },
      { headers: noStoreHeaders, status: 502 },
    );
  } finally {
    clearTimeout(timer);
  }
};

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
