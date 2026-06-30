import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  approveAskCoreEducationIdentityClaim,
  assignAskCoreEducationRole,
  bindAskCoreDirectoryPersonAccount,
  bindAskCoreEducationIdentity,
  bootstrapAskCoreOrganization,
  createAskCoreClassUnit,
  createAskCoreCohortUnit,
  createAskCoreDirectoryInvitation,
  createAskCoreDirectoryPerson,
  createAskCoreDirectoryPersonRole,
  createAskCoreEducationIdentityClaim,
  createAskCoreEducationOrgUnit,
  createAskCoreOrganization,
  createAskCoreOrganizationInvite,
  createAskCoreSchoolUnit,
  deleteAskCoreDirectoryPersonRole,
  deleteAskCoreEducationOrgUnit,
  deleteAskCoreEducationRoleAssignment,
  fetchAskCoreEducationIdentityClaims,
  fetchAskCoreEducationOrgUnits,
  fetchAskCoreEducationRoleAssignments,
  fetchAskCoreOrganizationDirectory,
  fetchAskCoreOrganizations,
  importAskCoreDirectoryPeople,
  presignAskCoreWorkbenchUpload,
  rejectAskCoreEducationIdentityClaim,
  setActiveAskCoreOrganization,
  unbindAskCoreDirectoryPersonAccount,
  unbindAskCoreEducationIdentity,
  updateAskCoreDirectoryPerson,
  updateAskCoreEducationOrgUnit,
  updateAskCoreOrganizationMemberRole,
} from './api';

describe('AskCoreOrganization api client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('builds organization endpoints with same-origin credentials', async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
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
      directory_invitation_token: 'dir-token',
      expiresIn: '7d',
      preset_roles: ['student'],
      primary_org_unit_id: 4,
      role: 'member',
    });
    await fetchAskCoreEducationOrgUnits();
    await createAskCoreEducationOrgUnit({
      entry_year: 2025,
      name: '2025级',
      parent_id: 1,
      unit_type: 'cohort',
    });
    await updateAskCoreEducationOrgUnit(4, {
      description: '负责高一年级',
      entry_year: 2025,
      name: '高一年级',
      parent_id: 1,
      sort_order: 2,
      unit_type: 'cohort',
    });
    await deleteAskCoreEducationOrgUnit(4);
    await createAskCoreSchoolUnit({ name: 'Seed School' });
    await createAskCoreCohortUnit({ entryYear: 2025, parentUnitId: 3 });
    await createAskCoreClassUnit({ name: '高一 1 班', parentUnitId: 4 });
    await fetchAskCoreOrganizationDirectory();
    await createAskCoreDirectoryPerson({
      display_name: '李老师',
      primary_org_unit_id: 4,
    });
    await updateAskCoreDirectoryPerson(10, { primary_org_unit_id: 5 });
    await createAskCoreDirectoryPersonRole(10, { org_unit_id: 4, role: 'teacher' });
    await deleteAskCoreDirectoryPersonRole(10, 99);
    await bindAskCoreDirectoryPersonAccount(10, 'user-10');
    await unbindAskCoreDirectoryPersonAccount(10);
    await createAskCoreDirectoryInvitation({
      invitation_kind: 'open',
      primary_org_unit_id: 4,
      preset_roles: ['student'],
    });
    await presignAskCoreWorkbenchUpload({
      content_type: 'text/csv',
      filename: 'people.csv',
      purpose: 'csv',
    });
    await importAskCoreDirectoryPeople({
      csv_ref: {
        locator: { kind: 'object_store', object_key: 'uploads/org-1/tmp/people.csv' },
        media_type: 'text/csv',
        purpose: 'csv',
      },
      default_role: 'student',
      primary_org_unit_id: 4,
      scope: 'unit',
    });
    await assignAskCoreEducationRole({
      subject: { kind: 'member', userId: 'user-1' },
      org_unit_id: 2,
      role: 'grade_admin',
    });
    await bindAskCoreEducationIdentity({
      better_auth_user_id: 'user-1',
      roster_id: 7001,
      roster_kind: 'student',
    });
    await createAskCoreEducationIdentityClaim({ roster_id: 9001, roster_kind: 'teacher' });
    await fetchAskCoreEducationIdentityClaims();
    await approveAskCoreEducationIdentityClaim(31);
    await rejectAskCoreEducationIdentityClaim(32);
    await unbindAskCoreEducationIdentity('student', 7001);
    await fetchAskCoreEducationRoleAssignments(2);
    await deleteAskCoreEducationRoleAssignment(9);

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
      '/api/askcore/workbench/organization/units/4',
      '/api/askcore/workbench/organization/units/4',
      '/api/askcore/workbench/organization/units',
      '/api/askcore/workbench/organization/units',
      '/api/askcore/workbench/organization/units',
      '/api/askcore/workbench/organization/directory',
      '/api/askcore/workbench/organization/people',
      '/api/askcore/workbench/organization/people/10',
      '/api/askcore/workbench/organization/people/10/roles',
      '/api/askcore/workbench/organization/people/10/roles/99',
      '/api/askcore/workbench/organization/people/10/bind-account',
      '/api/askcore/workbench/organization/people/10/bind-account',
      '/api/askcore/workbench/organization/directory-invitations',
      '/api/askcore/workbench/uploads/presign',
      '/api/askcore/workbench/organization/directory-imports',
      '/api/askcore/workbench/organization/roles',
      '/api/askcore/workbench/organization/identity-bindings',
      '/api/askcore/workbench/organization/identity-claims',
      '/api/askcore/workbench/organization/identity-claims?status=pending',
      '/api/askcore/workbench/organization/identity-claims/31/approve',
      '/api/askcore/workbench/organization/identity-claims/32/reject',
      '/api/askcore/workbench/organization/identity-bindings/student/7001',
      '/api/askcore/workbench/organization/roles?org_unit_id=2',
      '/api/askcore/workbench/organization/roles/9',
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
      body: JSON.stringify({
        description: '负责高一年级',
        entry_year: 2025,
        name: '高一年级',
        parent_id: 1,
        sort_order: 2,
        unit_type: 'cohort',
      }),
      method: 'PATCH',
    });
    expect(calls[9][1]).toMatchObject({ method: 'DELETE' });
    expect(calls[10][1]).toMatchObject({
      body: JSON.stringify({ name: 'Seed School', unit_type: 'school' }),
      method: 'POST',
    });
    expect(calls[11][1]).toMatchObject({
      body: JSON.stringify({ entry_year: 2025, name: '2025级', parent_id: 3, unit_type: 'cohort' }),
      method: 'POST',
    });
    expect(calls[12][1]).toMatchObject({
      body: JSON.stringify({ name: '高一 1 班', parent_id: 4, unit_type: 'class' }),
      method: 'POST',
    });
    expect(calls[14][1]).toMatchObject({
      body: JSON.stringify({
        display_name: '李老师',
        primary_org_unit_id: 4,
        roster_kind: 'teacher',
      }),
      method: 'POST',
    });
    expect(calls[15][1]).toMatchObject({
      body: JSON.stringify({ primary_org_unit_id: 5 }),
      method: 'PATCH',
    });
    expect(calls[16][1]).toMatchObject({
      body: JSON.stringify({ org_unit_id: 4, role: 'teacher' }),
      method: 'POST',
    });
    expect(calls[17][1]).toMatchObject({ method: 'DELETE' });
    expect(calls[18][1]).toMatchObject({
      body: JSON.stringify({ better_auth_user_id: 'user-10' }),
      method: 'POST',
    });
    expect(calls[19][1]).toMatchObject({ method: 'DELETE' });
    expect(calls[20][1]).toMatchObject({
      body: JSON.stringify({
        invitation_kind: 'open',
        primary_org_unit_id: 4,
        preset_roles: ['student'],
      }),
      method: 'POST',
    });
    expect(calls[21][1]).toMatchObject({
      body: JSON.stringify({
        content_type: 'text/csv',
        filename: 'people.csv',
        purpose: 'csv',
      }),
      method: 'POST',
    });
    expect(calls[22][1]).toMatchObject({
      body: JSON.stringify({
        csv_ref: {
          locator: { kind: 'object_store', object_key: 'uploads/org-1/tmp/people.csv' },
          media_type: 'text/csv',
          purpose: 'csv',
        },
        default_role: 'student',
        primary_org_unit_id: 4,
        roster_kind: 'student',
        scope: 'unit',
      }),
      method: 'POST',
    });
    expect(calls[23][1]).toMatchObject({
      body: JSON.stringify({
        better_auth_user_id: 'user-1',
        org_unit_id: 2,
        role: 'grade_admin',
      }),
      method: 'POST',
    });
    expect(calls[24][1]).toMatchObject({
      body: JSON.stringify({
        better_auth_user_id: 'user-1',
        roster_id: 7001,
        roster_kind: 'student',
      }),
      method: 'POST',
    });
    expect(calls[25][1]).toMatchObject({
      body: JSON.stringify({ roster_id: 9001, roster_kind: 'teacher' }),
      method: 'POST',
    });
    expect(calls[27][1]).toMatchObject({ method: 'POST' });
    expect(calls[28][1]).toMatchObject({ method: 'POST' });
    expect(calls[29][1]).toMatchObject({ method: 'DELETE' });
    expect(calls[31][1]).toMatchObject({ method: 'DELETE' });
  });
});
