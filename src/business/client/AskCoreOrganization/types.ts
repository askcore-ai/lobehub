export type AskCoreOrganizationRole = 'owner' | 'admin' | 'member';
export type AskCoreInviteChannel = 'email' | 'link' | 'qr';
export type AskCoreInviteExpiry = '30m' | '1d' | '7d' | '30d';
export type AskCoreEducationOrgUnitType = 'school' | 'cohort' | 'class' | 'department';
export type AskCoreEducationRole =
  'school_admin' | 'grade_admin' | 'homeroom_teacher' | 'teacher' | 'student';

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

export interface AskCoreIntegrationOperationsStatusPayload {
  diagnostics?: {
    diagnostic_count?: number;
    overall_severity?: string;
    runbook_owners?: Record<string, string>;
    subsystem_statuses?: Record<string, string>;
  };
  external_calls?: number;
  frontend_contract_version: 'integration_operations_status@v1';
  generated_at?: string;
  operations?: Record<string, unknown>;
  phase: string;
  pilot_registry?: {
    pilot_registry_ready?: boolean;
    pilot_registry_status?: string;
  };
  production_preflight?: {
    preflight_required?: boolean;
    preflight_status?: string;
  };
  redaction_passed?: boolean;
  roster_projection_rows?: number;
  safe?: boolean;
  status: string;
}

export type AskCoreMoodleGibbonPilotActivationAction = 'validate' | 'dry_run' | 'apply';

export interface AskCoreMoodleGibbonPilotActivationInput {
  action: AskCoreMoodleGibbonPilotActivationAction;
  bundle: Record<string, unknown>;
}

export interface AskCoreMoodleGibbonPilotActivationPayload {
  action: AskCoreMoodleGibbonPilotActivationAction;
  activation?: {
    activation_ready?: boolean;
    activation_status?: string;
    operation_counts?: Record<string, number>;
    pilot_registry_ready?: boolean;
    pilot_registry_status?: string;
    ready_check_count?: number;
    redaction_passed?: boolean;
    status?: string;
    validation_issue_codes?: string[];
    validation_issue_count?: number;
  };
  external_calls?: number;
  frontend_contract_version: 'moodle_gibbon_pilot_activation@v1';
  operations_status?: AskCoreIntegrationOperationsStatusPayload;
  redaction_passed?: boolean;
  roster_projection_rows?: number;
}

export interface AskCoreInvitePayload {
  channel: AskCoreInviteChannel;
  directoryInvitationToken: string;
  email?: string;
  expiresIn: AskCoreInviteExpiry;
  link: string;
  personId?: number;
  presetRoles: AskCoreEducationRole[];
  primaryOrgUnitId?: number;
  role: Extract<AskCoreOrganizationRole, 'admin' | 'member'>;
  rosterKind: AskCoreDirectoryRosterKind;
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

export type AskCoreEducationOrgUnitPatchInput = AskCoreEducationOrgUnitCreateInput;

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
  person_id?: number | null;
  role: AskCoreEducationRole;
  student_id?: number | null;
  subject_user_id: string;
  teacher_id?: number | null;
}

export interface AskCoreEducationRoleAssignmentPayload {
  items: AskCoreEducationRoleAssignment[];
}

export type AskCoreEducationIdentityRosterKind = 'student' | 'teacher';

export interface AskCoreEducationIdentityBindingInput {
  better_auth_user_id: string;
  roster_id: number;
  roster_kind: AskCoreEducationIdentityRosterKind;
}

export interface AskCoreEducationIdentityBinding {
  better_auth_user_id?: string | null;
  org_id: string;
  roster_id: number;
  roster_kind: AskCoreEducationIdentityRosterKind;
}

export interface AskCoreEducationIdentityClaimInput {
  roster_id: number;
  roster_kind: AskCoreEducationIdentityRosterKind;
}

export interface AskCoreEducationIdentityClaim {
  better_auth_user_id: string;
  id: number;
  org_id: string;
  requested_by_user_id: string;
  reviewed_at?: string | null;
  reviewed_by_user_id?: string | null;
  roster_id: number;
  roster_kind: AskCoreEducationIdentityRosterKind;
  status: 'approved' | 'pending' | 'rejected';
}

export interface AskCoreEducationIdentityClaimPayload {
  items: AskCoreEducationIdentityClaim[];
}

export type AskCoreDirectoryRegistrationStatus = 'invited' | 'registered' | 'unregistered';
export type AskCoreDirectoryLifecycleStatus = 'active' | 'archived';
export type AskCoreDirectoryRosterKind = 'student' | 'teacher';
export type AskCoreDirectoryInvitationKind = 'directed' | 'open';
export type AskCoreDirectoryInvitationStatus = 'accepted' | 'expired' | 'pending' | 'revoked';

export interface AskCoreDirectoryPerson {
  better_auth_user_id?: string | null;
  display_name: string;
  email?: string | null;
  id: number;
  lifecycle_status: AskCoreDirectoryLifecycleStatus;
  org_id: string;
  phone?: string | null;
  primary_org_unit_id?: number | null;
  registration_status: AskCoreDirectoryRegistrationStatus;
  source?: string | null;
}

export interface AskCoreDirectoryRosterLink {
  id: number;
  org_id: string;
  person_id: number;
  roster_id: number;
  roster_kind: AskCoreDirectoryRosterKind;
}

export interface AskCoreDirectoryInvitation {
  accepted_at?: string | null;
  accepted_by_user_id?: string | null;
  email?: string | null;
  expires_at?: string | null;
  id: number;
  invitation_kind: AskCoreDirectoryInvitationKind;
  member_role: Extract<AskCoreOrganizationRole, 'admin' | 'member'>;
  org_id: string;
  person_id?: number | null;
  preset_roles: AskCoreEducationRole[];
  primary_org_unit_id?: number | null;
  status: AskCoreDirectoryInvitationStatus;
  token: string;
}

export interface AskCoreDirectoryMemberSummary {
  email?: string | null;
  member_id: string;
  name?: string | null;
  organization_role?: AskCoreOrganizationRole | null;
}

export interface AskCoreOrganizationDirectoryPayload {
  invitations: AskCoreDirectoryInvitation[];
  member_summaries?: Record<string, AskCoreDirectoryMemberSummary>;
  org_id: string;
  people: AskCoreDirectoryPerson[];
  role_assignments: AskCoreEducationRoleAssignment[];
  roster_links: AskCoreDirectoryRosterLink[];
  units: AskCoreEducationOrgUnit[];
}

export interface AskCoreDirectoryBackedInviteInput {
  channel?: AskCoreInviteChannel;
  email?: string | null;
  expiresIn?: AskCoreInviteExpiry;
  invitation_kind: AskCoreDirectoryInvitationKind;
  member_role?: Extract<AskCoreOrganizationRole, 'admin' | 'member'>;
  person_id?: number | null;
  preset_roles?: AskCoreEducationRole[];
  primary_org_unit_id?: number | null;
  roster_kind: AskCoreDirectoryRosterKind;
}

export interface AskCoreDirectoryPersonCreateInput {
  better_auth_user_id?: string | null;
  display_name: string;
  education_org_unit_id: number;
  education_role: AskCoreEducationRole;
  email?: string | null;
  phone?: string | null;
  primary_org_unit_id?: number | null;
  roster_kind?: AskCoreDirectoryRosterKind | null;
  student_number?: string | null;
  teacher_number?: string | null;
}

export interface AskCoreDirectoryPersonPatchInput {
  archived?: boolean;
  display_name?: string;
  email?: string | null;
  phone?: string | null;
  primary_org_unit_id?: number | null;
}

export interface AskCoreDirectoryPersonRoleInput {
  org_unit_id: number;
  role: AskCoreEducationRole;
}

export interface AskCoreDirectoryInvitationCreateInput {
  email?: string | null;
  expires_at?: string | null;
  invitation_kind: AskCoreDirectoryInvitationKind;
  member_role?: Extract<AskCoreOrganizationRole, 'admin' | 'member'>;
  person_id?: number | null;
  preset_roles?: AskCoreEducationRole[];
  primary_org_unit_id?: number | null;
}

export interface AskCorePresignUploadPayload {
  content_type: string;
  filename?: string | null;
  purpose: 'csv' | 'scan';
  sha256?: string | null;
}

export interface AskCorePresignUploadResult {
  expires_at: string;
  object_key: string;
  required_headers: Record<string, string>;
  upload_url: string;
}

export interface AskCoreDirectoryImportInput {
  csv_ref: {
    locator: {
      kind: 'object_store';
      object_key: string;
    };
    media_type?: string | null;
    purpose?: 'csv' | null;
  };
  default_role?: AskCoreEducationRole | null;
  primary_org_unit_id?: number | null;
  roster_kind?: AskCoreDirectoryRosterKind | null;
  scope: 'organization' | 'unit';
}

export interface AskCoreDirectoryImportResult {
  created_count: number;
  errors: Array<{ message: string; row_number: number }>;
  skipped_count: number;
  updated_count: number;
}
