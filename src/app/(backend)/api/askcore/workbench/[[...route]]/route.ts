import { NextResponse } from 'next/server';

const retiredWorkbenchResponse = () =>
  NextResponse.json(
    {
      code: 'askcore_school_workbench_retired',
      detail: 'This school Workbench API is retired. Use an LMS-native AskCore processing launch.',
    },
    { status: 410 },
  );

export const GET = retiredWorkbenchResponse;
export const POST = retiredWorkbenchResponse;
export const PATCH = retiredWorkbenchResponse;
export const DELETE = retiredWorkbenchResponse;
export const OPTIONS = retiredWorkbenchResponse;

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
