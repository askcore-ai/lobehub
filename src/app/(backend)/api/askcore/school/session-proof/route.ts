import { type NextRequest, NextResponse } from 'next/server';

import { resolveSchoolOIDCSubject } from '@/libs/oidc-provider/provider';
import { getAskCoreAssertionAuthApi } from '@/server/services/askcoreAssertion';

const noStoreHeaders = { 'Cache-Control': 'private, no-store' };
const textValue = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

export const GET = async (request: NextRequest) => {
  const authApi = await getAskCoreAssertionAuthApi();
  const session = await authApi.getSession({ headers: request.headers });
  const record = session && typeof session === 'object' ? session : undefined;
  const user =
    record?.user && typeof record.user === 'object'
      ? (record.user as Record<string, unknown>)
      : undefined;
  const userId = textValue(user?.id);
  if (!userId) {
    return NextResponse.json(
      { detail: 'AskCore session is required' },
      { headers: noStoreHeaders, status: 401 },
    );
  }

  try {
    const schoolSubject = await resolveSchoolOIDCSubject({
      email: textValue(user?.email) || undefined,
      userId,
    });
    return NextResponse.json({ school_subject: schoolSubject }, { headers: noStoreHeaders });
  } catch {
    return NextResponse.json(
      { detail: 'School identity proof is unavailable' },
      { headers: noStoreHeaders, status: 503 },
    );
  }
};

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
