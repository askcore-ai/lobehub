import { type NextRequest, NextResponse } from 'next/server';

import { isAllowedAskCoreSameOriginWrite } from '@/server/services/askcoreAssertion';
import {
  createSourceHandoff,
  SchoolSessionRequiredError,
  type SchoolSourceAudience,
} from '@/server/services/schoolSessionBroker';
import { translation } from '@/server/translation';
import { BodyLimitError, readBoundedStream } from '@/server/utils/readBoundedStream';

import { handoffFailureDocumentCSP, renderHandoffFailureDocument } from './document';

const REQUEST_BODY_MAX_BYTES = 128;
const MAX_GRANT_LENGTH = 8192;
const GRANT_PATTERN = /^[\w-]+\.[\w-]+\.[\w-]+$/;
const SOURCE_ACTIONS: Record<SchoolSourceAudience, string> = {
  gibbon: '/school/services/askcore/handoff.php',
  moodle: '/school/teaching/local/askcore/handoff.php',
};
const noStoreHeaders = {
  'Cache-Control': 'private, no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
};

export const isHandoffPreparationRequest = (request: NextRequest) => {
  const origin = request.headers.get('origin');
  const site = request.headers.get('sec-fetch-site');
  const mode = request.headers.get('sec-fetch-mode');
  const destination = request.headers.get('sec-fetch-dest');
  const accept = request.headers.get('accept') || '';
  return (
    Boolean(origin) &&
    site === 'same-origin' &&
    (mode === 'cors' || mode === 'same-origin') &&
    destination === 'empty' &&
    accept
      .split(',')
      .map((value) => value.split(';', 1)[0]?.trim().toLowerCase())
      .includes('application/json')
  );
};

const requestedLocale = (request: NextRequest) =>
  request.headers.get('accept-language')?.split(',', 1)[0]?.split(';', 1)[0]?.trim() || 'en-US';

const errorResponse = async ({
  messageKey,
  recoveryHref = '/school',
  request,
  status,
  titleKey = messageKey,
}: {
  messageKey: string;
  recoveryHref?: string;
  request: NextRequest;
  status: number;
  titleKey?: string;
}) => {
  const { locale, t } = await translation('common', requestedLocale(request));
  return new NextResponse(
    renderHandoffFailureDocument({
      locale,
      message: t(messageKey),
      recoveryHref,
      recoveryLabel: t('schoolPortal.connection.refresh'),
      status,
      title: t(titleKey),
    }),
    {
      headers: {
        ...noStoreHeaders,
        'Content-Security-Policy': handoffFailureDocumentCSP,
        'Content-Type': 'text/html; charset=utf-8',
      },
      status,
    },
  );
};

const preparationErrorResponse = (status: number) =>
  NextResponse.json(
    { error: 'handoff_unavailable' },
    {
      headers: noStoreHeaders,
      status,
    },
  );

export const POST = async (request: NextRequest) => {
  if (!isAllowedAskCoreSameOriginWrite(request) || !isHandoffPreparationRequest(request)) {
    return preparationErrorResponse(403);
  }
  const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
  if (contentType !== 'application/x-www-form-urlencoded') {
    return preparationErrorResponse(400);
  }
  const declaredLength = request.headers.get('content-length')?.trim();
  if (declaredLength && !/^\d+$/.test(declaredLength)) {
    return preparationErrorResponse(400);
  }
  if (declaredLength && Number(declaredLength) > REQUEST_BODY_MAX_BYTES) {
    return preparationErrorResponse(413);
  }
  let body: Uint8Array<ArrayBuffer>;
  try {
    body = await readBoundedStream(request.body, REQUEST_BODY_MAX_BYTES);
  } catch (error) {
    return preparationErrorResponse(error instanceof BodyLimitError ? 413 : 400);
  }
  let encodedBody: string;
  try {
    encodedBody = new TextDecoder('utf-8', { fatal: true }).decode(body);
  } catch {
    return preparationErrorResponse(400);
  }
  const source =
    encodedBody === 'source=moodle'
      ? 'moodle'
      : encodedBody === 'source=gibbon'
        ? 'gibbon'
        : '';
  if (source !== 'moodle' && source !== 'gibbon') {
    return preparationErrorResponse(400);
  }

  try {
    const handoff = await createSourceHandoff(request.headers, source as SchoolSourceAudience);
    if (
      handoff.action !== SOURCE_ACTIONS[source] ||
      typeof handoff.grant !== 'string' ||
      handoff.grant.length === 0 ||
      handoff.grant.length > MAX_GRANT_LENGTH ||
      !GRANT_PATTERN.test(handoff.grant)
    ) {
      return preparationErrorResponse(503);
    }
    return NextResponse.json(
      {
        action: handoff.action,
        grant: handoff.grant,
      },
      {
        headers: noStoreHeaders,
      },
    );
  } catch (error) {
    const sessionRequired = error instanceof SchoolSessionRequiredError;
    return preparationErrorResponse(sessionRequired ? 401 : 503);
  }
};

export const GET = (request: NextRequest) =>
  errorResponse({
    messageKey: 'schoolPortal.connection.unavailable',
    request,
    status: 405,
  });
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
