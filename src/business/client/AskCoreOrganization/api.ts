import {
  type AskCoreEducationOrgUnitCreateInput,
  type AskCoreEducationOrgUnitPayload,
  type AskCoreEducationRoleAssignment,
  type AskCoreEducationRoleAssignmentCreateInput,
  type AskCoreInviteChannel,
  type AskCoreInviteExpiry,
  type AskCoreInvitePayload,
  type AskCoreOrganizationPayload,
  type AskCoreOrganizationRole,
} from './types';

const ORGANIZATION_API_BASE = '/api/askcore/organizations';
const EDUCATION_ORG_API_BASE = '/api/askcore/workbench/organization';

export class AskCoreOrganizationApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'AskCoreOrganizationApiError';
    this.status = status;
  }
}

const readErrorMessage = async (response: Response) => {
  try {
    const payload = await response.json();
    const detail = payload?.detail;
    if (detail && typeof detail === 'object') return detail.message || JSON.stringify(detail);
    return detail || payload?.message || response.statusText;
  } catch {
    return response.statusText;
  }
};

const requestJson = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const response = await fetch(path, {
    credentials: 'include',
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });

  if (!response.ok) {
    throw new AskCoreOrganizationApiError(await readErrorMessage(response), response.status);
  }

  return response.json() as Promise<T>;
};

export const bootstrapAskCoreOrganization = (inviteToken?: string) =>
  requestJson<AskCoreOrganizationPayload>(`${ORGANIZATION_API_BASE}/bootstrap`, {
    body: inviteToken ? JSON.stringify({ invite_token: inviteToken }) : undefined,
    method: 'POST',
  });

export const fetchAskCoreOrganizations = () =>
  requestJson<AskCoreOrganizationPayload>(ORGANIZATION_API_BASE);

export const createAskCoreOrganization = (input: {
  contact?: string;
  description?: string;
  name: string;
}) =>
  requestJson<AskCoreOrganizationPayload>(ORGANIZATION_API_BASE, {
    body: JSON.stringify(input),
    method: 'POST',
  });

export const setActiveAskCoreOrganization = (organizationId: string) =>
  requestJson<AskCoreOrganizationPayload>(`${ORGANIZATION_API_BASE}/active`, {
    body: JSON.stringify({ organization_id: organizationId }),
    method: 'POST',
  });

export const updateAskCoreOrganization = (
  organizationId: string,
  input: { contact?: string; description?: string; name?: string },
) =>
  requestJson<AskCoreOrganizationPayload>(`${ORGANIZATION_API_BASE}/${organizationId}`, {
    body: JSON.stringify(input),
    method: 'PATCH',
  });

export const updateAskCoreOrganizationMemberRole = (
  organizationId: string,
  memberId: string,
  role: AskCoreOrganizationRole,
) =>
  requestJson<{ members: AskCoreOrganizationPayload['members'] }>(
    `${ORGANIZATION_API_BASE}/${organizationId}/members/${memberId}`,
    {
      body: JSON.stringify({ role }),
      method: 'PATCH',
    },
  );

export const removeAskCoreOrganizationMember = (organizationId: string, memberId: string) =>
  requestJson<{ members: AskCoreOrganizationPayload['members'] }>(
    `${ORGANIZATION_API_BASE}/${organizationId}/members/${memberId}`,
    { method: 'DELETE' },
  );

export const createAskCoreOrganizationInvite = (
  organizationId: string,
  input: {
    channel: AskCoreInviteChannel;
    email?: string;
    expiresIn: AskCoreInviteExpiry;
    role: Extract<AskCoreOrganizationRole, 'admin' | 'member'>;
  },
) =>
  requestJson<AskCoreInvitePayload>(`${ORGANIZATION_API_BASE}/${organizationId}/invites`, {
    body: JSON.stringify(input),
    method: 'POST',
  });

export const fetchAskCoreEducationOrgUnits = () =>
  requestJson<AskCoreEducationOrgUnitPayload>(`${EDUCATION_ORG_API_BASE}/units`);

export const createAskCoreEducationOrgUnit = (input: AskCoreEducationOrgUnitCreateInput) =>
  requestJson<AskCoreEducationOrgUnitPayload['units'][number]>(`${EDUCATION_ORG_API_BASE}/units`, {
    body: JSON.stringify(input),
    method: 'POST',
  });

export const createAskCoreSchoolUnit = (input: { description?: string; name: string }) =>
  createAskCoreEducationOrgUnit({
    description: input.description,
    name: input.name,
    unit_type: 'school',
  });

export const createAskCoreCohortUnit = (input: {
  description?: string;
  entryYear: number;
  name?: string;
  parentUnitId?: number;
}) =>
  createAskCoreEducationOrgUnit({
    description: input.description,
    entry_year: input.entryYear,
    name: input.name || `${input.entryYear}级`,
    parent_id: input.parentUnitId,
    unit_type: 'cohort',
  });

export const createAskCoreClassUnit = (input: {
  description?: string;
  name: string;
  parentUnitId: number;
}) =>
  createAskCoreEducationOrgUnit({
    description: input.description,
    name: input.name,
    parent_id: input.parentUnitId,
    unit_type: 'class',
  });

const roleAssignmentBody = (input: AskCoreEducationRoleAssignmentCreateInput) => {
  if (input.subject.kind === 'member') {
    return {
      better_auth_user_id: input.subject.userId,
      org_unit_id: input.org_unit_id,
      role: input.role,
    };
  }
  if (input.subject.kind === 'teacher') {
    return {
      org_unit_id: input.org_unit_id,
      role: input.role,
      teacher_id: input.subject.teacherId,
    };
  }
  return {
    org_unit_id: input.org_unit_id,
    role: input.role,
    student_id: input.subject.studentId,
  };
};

export const assignAskCoreEducationRole = (input: AskCoreEducationRoleAssignmentCreateInput) =>
  requestJson<AskCoreEducationRoleAssignment>(`${EDUCATION_ORG_API_BASE}/roles`, {
    body: JSON.stringify(roleAssignmentBody(input)),
    method: 'POST',
  });
