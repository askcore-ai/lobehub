import { NextResponse } from 'next/server';

const retiredOrganizationResponse = () =>
  NextResponse.json(
    {
      code: 'askcore_school_organization_retired',
      detail: 'AskCore no longer manages school organizations. Use the connected SIS.',
    },
    { status: 410 },
  );

export const GET = retiredOrganizationResponse;
export const POST = retiredOrganizationResponse;
export const PATCH = retiredOrganizationResponse;
export const DELETE = retiredOrganizationResponse;
export const OPTIONS = retiredOrganizationResponse;

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
