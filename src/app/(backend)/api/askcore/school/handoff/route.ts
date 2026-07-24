import { randomBytes } from 'node:crypto';

import { type NextRequest, NextResponse } from 'next/server';

import { isAllowedAskCoreSameOriginWrite } from '@/server/services/askcoreAssertion';
import {
  createSourceHandoff,
  SchoolSessionRequiredError,
  type SchoolSourceAudience,
} from '@/server/services/schoolSessionBroker';
import { translation } from '@/server/translation';
import { BodyLimitError, readBoundedStream } from '@/server/utils/readBoundedStream';

import {
  handoffFailureDocumentCSP,
  renderHandoffFailureDocument,
  renderHandoffSuccessDocument,
} from './document';

const REQUEST_BODY_MAX_BYTES = 128;
const noStoreHeaders = {
  'Cache-Control': 'private, no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
};

const isTopLevelNavigation = (request: NextRequest) => {
  const origin = request.headers.get('origin');
  const site = request.headers.get('sec-fetch-site');
  const mode = request.headers.get('sec-fetch-mode');
  const destination = request.headers.get('sec-fetch-dest');
  return Boolean(origin) && site === 'same-origin' && mode === 'navigate' && destination === 'document';
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

export const POST = async (request: NextRequest) => {
  if (!isAllowedAskCoreSameOriginWrite(request) || !isTopLevelNavigation(request)) {
    return errorResponse({
      messageKey: 'schoolPortal.connection.unavailable',
      request,
      status: 403,
    });
  }
  const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
  if (contentType !== 'application/x-www-form-urlencoded') {
    return errorResponse({
      messageKey: 'schoolPortal.connection.unavailable',
      request,
      status: 400,
    });
  }
  const declaredLength = request.headers.get('content-length')?.trim();
  if (declaredLength && !/^\d+$/.test(declaredLength)) {
    return errorResponse({
      messageKey: 'schoolPortal.connection.unavailable',
      request,
      status: 400,
    });
  }
  if (declaredLength && Number(declaredLength) > REQUEST_BODY_MAX_BYTES) {
    return errorResponse({
      messageKey: 'schoolPortal.connection.unavailable',
      request,
      status: 413,
    });
  }
  let body: Uint8Array<ArrayBuffer>;
  try {
    body = await readBoundedStream(request.body, REQUEST_BODY_MAX_BYTES);
  } catch (error) {
    return errorResponse({
      messageKey: 'schoolPortal.connection.unavailable',
      request,
      status: error instanceof BodyLimitError ? 413 : 400,
    });
  }
  let encodedBody: string;
  try {
    encodedBody = new TextDecoder('utf-8', { fatal: true }).decode(body);
  } catch {
    return errorResponse({
      messageKey: 'schoolPortal.connection.unavailable',
      request,
      status: 400,
    });
  }
  const source = encodedBody === 'source=moodle' ? 'moodle' : encodedBody === 'source=gibbon' ? 'gibbon' : '';
  if (source !== 'moodle' && source !== 'gibbon') {
    return errorResponse({
      messageKey: 'schoolPortal.connection.unavailable',
      request,
      status: 400,
    });
  }

  try {
    const handoff = await createSourceHandoff(request.headers, source as SchoolSourceAudience);
    const nonce = randomBytes(18).toString('base64url');
    const { locale, t } = await translation('common', requestedLocale(request));
    const keyPrefix = `schoolPortal.handoff.${source}` as const;
    const html = renderHandoffSuccessDocument({
      action: handoff.action,
      continueLabel: t(`${keyPrefix}.continue`),
      grant: handoff.grant,
      locale,
      message: t(`${keyPrefix}.message`),
      nonce,
      title: t(`${keyPrefix}.title`),
    });
    return new NextResponse(html, {
      headers: {
        ...noStoreHeaders,
        'Content-Security-Policy': `default-src 'none'; form-action 'self'; script-src 'nonce-${nonce}'; base-uri 'none'; frame-ancestors 'none'`,
        'Content-Type': 'text/html; charset=utf-8',
      },
    });
  } catch (error) {
    const sessionRequired = error instanceof SchoolSessionRequiredError;
    return errorResponse({
      messageKey: sessionRequired
        ? 'schoolPortal.identity.denied'
        : 'schoolPortal.state.unavailable.message',
      recoveryHref: source === 'gibbon' ? '/settings/school-affairs' : '/school',
      request,
      status: sessionRequired ? 401 : 503,
      titleKey: sessionRequired
        ? 'schoolPortal.identity.denied'
        : 'schoolPortal.state.unavailable.title',
    });
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
