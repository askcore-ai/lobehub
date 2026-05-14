import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  assignAskCoreEducationRole,
  bootstrapAskCoreOrganization,
  createAskCoreEducationOrgUnit,
  createAskCoreCohortUnit,
  createAskCoreClassUnit,
  createAskCoreOrganization,
  createAskCoreOrganizationInvite,
  createAskCoreSchoolUnit,
  fetchAskCoreEducationOrgUnits,
  fetchAskCoreOrganizations,
  setActiveAskCoreOrganization,
  updateAskCoreOrganizationMemberRole,
} from './api';

describe('AskCoreOrganization api client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('builds organization endpoints with same-origin credentials', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await fetchAskCoreOrganizations();
    await bootstrapAskCoreOrganization('token-1');
    await createAskCoreOrganization({ name: 'Seed 的组织' });
    await setActiveAskCoreOrganization('org-1');
    await updateAskCoreOrganizationMemberRole('org-1', 'mem-1', 'admin');
    await createAskCoreOrganizationInvite('org-1', {
      channel: 'qr',
      expiresIn: '7d',
      role: 'member',
    });
    await fetchAskCoreEducationOrgUnits();
    await createAskCoreEducationOrgUnit({ entry_year: 2025, name: '2025级', parent_id: 1, unit_type: 'cohort' });
    await createAskCoreSchoolUnit({ name: 'Seed School' });
    await createAskCoreCohortUnit({ entryYear: 2025, parentUnitId: 3 });
    await createAskCoreClassUnit({ name: '高一 1 班', parentUnitId: 4 });
    await assignAskCoreEducationRole({
      subject: { kind: 'member', userId: 'user-1' },
      org_unit_id: 2,
      role: 'grade_admin',
    });

    const calls = fetchMock.mock.calls as [RequestInfo | URL, RequestInit?][];

    expect(calls.map(([input]) => String(input))).toEqual([
      '/api/askcore/organizations',
      '/api/askcore/organizations/bootstrap',
      '/api/askcore/organizations',
      '/api/askcore/organizations/active',
      '/api/askcore/organizations/org-1/members/mem-1',
      '/api/askcore/organizations/org-1/invites',
      '/api/askcore/workbench/organization/units',
      '/api/askcore/workbench/organization/units',
      '/api/askcore/workbench/organization/units',
      '/api/askcore/workbench/organization/units',
      '/api/askcore/workbench/organization/units',
      '/api/askcore/workbench/organization/roles',
    ]);
    expect(calls[1][1]).toMatchObject({
      body: JSON.stringify({ invite_token: 'token-1' }),
      credentials: 'include',
      method: 'POST',
    });
    expect(calls[4][1]).toMatchObject({
      body: JSON.stringify({ role: 'admin' }),
      method: 'PATCH',
    });
    expect(calls[7][1]).toMatchObject({
      body: JSON.stringify({ entry_year: 2025, name: '2025级', parent_id: 1, unit_type: 'cohort' }),
      method: 'POST',
    });
    expect(calls[8][1]).toMatchObject({
      body: JSON.stringify({ name: 'Seed School', unit_type: 'school' }),
      method: 'POST',
    });
    expect(calls[9][1]).toMatchObject({
      body: JSON.stringify({ entry_year: 2025, name: '2025级', parent_id: 3, unit_type: 'cohort' }),
      method: 'POST',
    });
    expect(calls[10][1]).toMatchObject({
      body: JSON.stringify({ name: '高一 1 班', parent_id: 4, unit_type: 'class' }),
      method: 'POST',
    });
    expect(calls[11][1]).toMatchObject({
      body: JSON.stringify({
        better_auth_user_id: 'user-1',
        org_unit_id: 2,
        role: 'grade_admin',
      }),
      method: 'POST',
    });
  });
});
