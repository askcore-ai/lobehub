export type AskCoreOrganizationRole = 'owner' | 'admin' | 'member';
export type AskCoreInviteChannel = 'email' | 'link' | 'qr';
export type AskCoreInviteExpiry = '30m' | '1d' | '7d' | '30d';
export type AskCoreEducationOrgUnitType = 'school' | 'cohort' | 'class';
export type AskCoreEducationRole =
  | 'school_admin'
  | 'grade_admin'
  | 'homeroom_teacher'
  | 'teacher'
  | 'student';

export interface AskCoreOrganizationSummary {
  contact?: string;
  createdAt?: string;
  description?: string;
  id: string;
  isActive: boolean;
  logo?: string | null;
  name: string;
  role: AskCoreOrganizationRole;
  slug: string;
}

export interface AskCoreOrganizationMember {
  avatar?: string | null;
  createdAt?: string;
  email?: string | null;
  id: string;
  name: string;
  role: AskCoreOrganizationRole;
  userId: string;
}

export interface AskCoreOrganizationPayload {
  current: AskCoreOrganizationSummary | null;
  members: AskCoreOrganizationMember[];
  organizations: AskCoreOrganizationSummary[];
  permissions: {
    canInvite: boolean;
    canManageMembers: boolean;
    canUpdateMeta: boolean;
  };
}

export interface AskCoreInvitePayload {
  channel: AskCoreInviteChannel;
  email?: string;
  expiresIn: AskCoreInviteExpiry;
  link: string;
  role: Extract<AskCoreOrganizationRole, 'admin' | 'member'>;
  token: string;
}

export interface AskCoreEducationOrgUnit {
  description?: string | null;
  entry_year?: number | null;
  id: number;
  name: string;
  org_id: string;
  parent_id?: number | null;
  sort_order: number;
  unit_type: AskCoreEducationOrgUnitType;
}

export interface AskCoreEducationOrgUnitPayload {
  org_id: string;
  units: AskCoreEducationOrgUnit[];
}

export interface AskCoreEducationOrgUnitCreateInput {
  description?: string | null;
  entry_year?: number | null;
  name: string;
  parent_id?: number | null;
  sort_order?: number;
  unit_type: AskCoreEducationOrgUnitType;
}

export type AskCoreEducationRoleSubject =
  | { kind: 'member'; userId: string }
  | { kind: 'teacher'; teacherId: number }
  | { kind: 'student'; studentId: number };

export interface AskCoreEducationRoleAssignmentCreateInput {
  org_unit_id: number;
  role: AskCoreEducationRole;
  subject: AskCoreEducationRoleSubject;
}

export interface AskCoreEducationRoleAssignment {
  better_auth_user_id?: string | null;
  id: number;
  org_id: string;
  org_unit_id: number;
  role: AskCoreEducationRole;
  student_id?: number | null;
  subject_user_id: string;
  teacher_id?: number | null;
}

export interface AskCoreEducationRoleAssignmentPayload {
  items: AskCoreEducationRoleAssignment[];
}
