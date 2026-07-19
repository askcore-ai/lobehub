import { type NextRequest, NextResponse } from 'next/server';

import {
  askCoreProxyBodyInit,
  validateAskCoreRouteSegments,
} from '@/server/services/askcoreAssertion';

type RouteContext = {
  params: Promise<{
    route?: string[];
  }>;
};

const DEFAULT_API_BASE_URL = 'http://api:8000';
const REQUIRED_SIGNATURE_HEADERS = [
  'x-askcore-deployment',
  'x-askcore-nonce',
  'x-askcore-signature',
  'x-askcore-timestamp',
] as const;

const jsonError = (status: number, detail: string) => NextResponse.json({ detail }, { status });

const isAllowedConnectorRoute = (method: string, route: string[]) => {
  const path = route.join('/');
  if (method === 'POST') {
    return (
      path === 'v1/processing/runs' ||
      /^v1\/processing\/runs\/[1-9]\d*\/(?:launch-token|seal)$/.test(path)
    );
  }
  if (method === 'GET') {
    return /^v1\/processing\/runs\/[1-9]\d*(?:\/report)?$/.test(path);
  }
  return false;
};

export const buildConnectorAuthorityUrl = (route: string[]) => {
  const baseUrl =
    process.env.AITUTOR_API_BASE_URL?.trim() ||
    process.env.WORKBENCH_API_BASE_URL?.trim() ||
    DEFAULT_API_BASE_URL;
  const path = route.map((segment) => encodeURIComponent(segment)).join('/');
  return new URL(`/api/lms-connectors/${path}`, baseUrl);
};

const forwardConnectorRequest = async (request: NextRequest, context: RouteContext) => {
  const { route = [] } = await context.params;
  if (
    !route.length ||
    !validateAskCoreRouteSegments(route) ||
    !isAllowedConnectorRoute(request.method, route) ||
    request.nextUrl.search
  ) {
    return jsonError(404, 'AskCore connector route is unavailable');
  }
  if (REQUIRED_SIGNATURE_HEADERS.some((name) => !request.headers.get(name)?.trim())) {
    return jsonError(401, 'AskCore connector signature is required');
  }

  const headers = new Headers();
  for (const name of REQUIRED_SIGNATURE_HEADERS) {
    headers.set(name, request.headers.get(name)!);
  }
  for (const name of ['accept', 'content-type']) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  let upstream: Response;
  try {
    upstream = await fetch(buildConnectorAuthorityUrl(route), {
      ...askCoreProxyBodyInit(request),
      cache: 'no-store',
      headers,
      method: request.method,
      redirect: 'manual',
    });
  } catch {
    return jsonError(502, 'AskCore connector authority is unavailable');
  }

  const responseHeaders = new Headers();
  for (const name of ['content-disposition', 'content-length', 'content-type']) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  return new NextResponse(upstream.body, {
    headers: responseHeaders,
    status: upstream.status,
    statusText: upstream.statusText,
  });
};

export const GET = (request: NextRequest, context: RouteContext) =>
  forwardConnectorRequest(request, context);
export const POST = (request: NextRequest, context: RouteContext) =>
  forwardConnectorRequest(request, context);

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
