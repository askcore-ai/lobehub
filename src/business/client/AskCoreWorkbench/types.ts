'use client';

export type AskCoreWorkbenchTab = 'overview' | 'activities' | 'questions' | 'attempts';

export type JsonPrimitive = boolean | number | string | null;
export type JsonValue = JsonPrimitive | JsonValue[] | JsonRecord;
export interface JsonRecord {
  [key: string]: JsonValue;
}

export type ResourceKey =
  | 'activities'
  | 'attempts'
  | 'schools'
  | 'teachers'
  | 'classes'
  | 'students'
  | 'grades'
  | 'subjects'
  | 'assignments'
  | 'questions'
  | 'submissions'
  | 'submission-questions';

export type AnyResourceKey = ResourceKey | 'assignment-questions' | 'assignment-students';

export interface AskCoreWorkbenchColumn {
  dataIndex: string;
  displayIndex?: string;
  isStatus?: boolean;
  secondaryIndex?: string;
  title: string;
  width?: number;
}

export interface AskCoreWorkbenchTabConfig {
  columns?: AskCoreWorkbenchColumn[];
  key: AskCoreWorkbenchTab;
  label: string;
  newLabel?: string;
  resource?: string;
  searchPlaceholder?: string;
}

export type AskCoreWorkbenchRecord = JsonRecord;

export interface AskCoreWorkbenchListPayload {
  filters?: JsonRecord;
  has_more?: boolean;
  items: AskCoreWorkbenchRecord[];
  next_after_id?: number | null;
  page: number;
  page_size: number;
  resource: string;
  total?: number | null;
}

export interface AskCoreWorkbenchDashboardPayload {
  active_invocations?: AskCoreWorkbenchRecord[];
  counts?: Record<string, number>;
  drafts?: AskCoreWorkbenchRecord[];
  recent_invocations?: AskCoreWorkbenchRecord[];
}

export type AskCoreEducationPersona = {
  better_auth_user_id: string;
  display_name?: string | null;
  org_unit_id?: number | null;
  role: 'grade_admin' | 'homeroom_teacher' | 'school_admin' | 'student' | 'teacher';
  roster_id?: number | null;
  roster_kind: 'member' | 'student' | 'teacher';
};

export type AskCoreEducationWorkbenchMode =
  'identity_required' | 'student_managed' | 'student_restricted' | 'teacher';

export type AskCoreTeachingRuntime = {
  app_env: string;
  coherent: boolean;
  forbid_legacy_school_writes: boolean;
  production_preflight_required: boolean;
  production_preflight_status: string;
  protocol_enabled: boolean;
  protocol_mode: string;
  reason: string;
  require_lms_sis_in_production: boolean;
  teaching_available: boolean;
};

export type AskCoreEducationProfile = {
  active_persona?: AskCoreEducationPersona | null;
  capabilities: Record<string, boolean>;
  default_persona?: AskCoreEducationPersona | null;
  education_identities: AskCoreEducationPersona[];
  org_composition: Record<string, number>;
  teaching_runtime: AskCoreTeachingRuntime;
  workbench_mode: AskCoreEducationWorkbenchMode;
};

export type AskCoreOrganizationSummary = {
  created_at?: string | null;
  is_active: boolean;
  logo_url?: string | null;
  name: string;
  organization_id: string;
  permissions?: string[];
  role?: string | null;
  slug?: string | null;
  source?: string | null;
};

export type AskCoreOrganizationState = {
  is_super_admin?: boolean;
  organization: AskCoreOrganizationSummary | null;
  organization_role?: string | null;
  organizations: AskCoreOrganizationSummary[];
  permissions?: string[];
};

export type FileDescriptor = {
  download_url?: string | null;
  media_type?: string | null;
  name: string;
  object_key: string;
  preview_url?: string | null;
};

export type SubmissionReportDescriptor = FileDescriptor & {
  artifact_id?: string | null;
  error?: string | null;
  generated_at?: string | null;
  source_action?: string | null;
  status: 'failed' | 'missing' | 'ready';
};

export type AssignmentDetailResponse = {
  assignment: JsonRecord;
  files: FileDescriptor[];
  grade: JsonRecord | null;
  questions: JsonRecord[];
  students: JsonRecord[];
  subject: JsonRecord | null;
};

export type ActivityDetailResponse = {
  activity: JsonRecord;
  assignment_detail?: AssignmentDetailResponse | null;
  detail_kind: 'legacy_assignment' | 'protocol_activity';
  item: JsonRecord;
  legacy_assignment_id?: number | null;
  resource: 'activities';
};

export type SubmissionDetailResponse = {
  assignment: JsonRecord | null;
  assignment_questions: JsonRecord[];
  classroom: JsonRecord | null;
  explanation_artifact: PluginArtifact | null;
  files: FileDescriptor[];
  grade: JsonRecord | null;
  questions: JsonRecord[];
  report: SubmissionReportDescriptor | null;
  student: JsonRecord | null;
  students: JsonRecord[];
  subject: JsonRecord | null;
  submission: JsonRecord;
};

export type AttemptDetailResponse = {
  attempt: JsonRecord;
  detail_kind: 'legacy_submission' | 'protocol_attempt';
  item: JsonRecord;
  legacy_submission_id?: number | null;
  resource: 'attempts';
  submission_detail?: SubmissionDetailResponse | null;
};

export type StudentWrongQuestion = {
  consecutive_personalized_success_count: number;
  created_at: string;
  last_personalized_submission_id: number | null;
  last_wrong_submission_id: number | null;
  question: JsonRecord | null;
  question_id: number | null;
  question_preview: string | null;
  source_question_id: number;
  updated_at: string;
  wrong_count: number;
  wrong_question_id: number;
};

export type StudentDetailResponse = {
  classroom: JsonRecord | null;
  school: JsonRecord | null;
  student: JsonRecord;
  submissions: JsonRecord[];
  submissions_total: number;
  wrong_questions: StudentWrongQuestion[];
};

export type ResourceListResponse = AskCoreWorkbenchListPayload;

export type ResourceItemResponse = {
  item: JsonRecord;
  resource: string;
};

export type ResourceMutationResponse = {
  item: JsonRecord;
  operation: string;
  resource: string;
};

export type PluginArtifact = {
  artifact_id: string;
  content: JsonRecord;
  created_at: string;
  references: JsonRecord[];
  redaction: JsonRecord;
  run_id: number;
  schema_version: string;
  summary?: string | null;
  title?: string | null;
  type: string;
};

export type PluginInvocation = {
  action_id?: string | null;
  artifact_count?: number | null;
  created_at: string;
  current_question_order_index?: number | null;
  failure_reason?: string | null;
  finished_at?: string | null;
  invocation_id: string;
  last_event_at?: string | null;
  plugin_id?: string | null;
  progress_stage?: string | null;
  question_failed?: number | null;
  question_succeeded?: number | null;
  question_total?: number | null;
  run_id: number;
  started_at?: string | null;
  state: string;
  workflow_name: string;
};

export type PluginInvocationArtifacts = {
  artifacts: Array<{
    artifact_id: string;
    created_at: string;
    run_id: number;
    schema_version: string;
    summary?: string | null;
    title?: string | null;
    type: string;
  }>;
  invocation_id: string;
  run_id: number;
};

export type PresignUploadResponse = {
  expires_at: string;
  object_key: string;
  required_headers: Record<string, string>;
  upload_url: string;
};

export type ScannerDevice = {
  bridge_id?: string | null;
  capabilities: JsonRecord;
  display_name: string;
  kind: 'escl';
  online: boolean;
  scanner_id: string;
  source: string;
};

export type ScannerDeviceListResponse = {
  default_scanner_id: string | null;
  items: ScannerDevice[];
};

export type PrinterDevice = {
  bridge_id?: string | null;
  capabilities: JsonRecord;
  display_name: string;
  kind: 'ipp' | 'ipps';
  online: boolean;
  printer_id: string;
  source: string;
};

export type PrinterDeviceListResponse = {
  default_printer_id: string | null;
  items: PrinterDevice[];
};

export type RunState = {
  artifacts: PluginArtifact[];
  busy: boolean;
  error: string | null;
  invocation: PluginInvocation | null;
  notice: string | null;
  tracking: 'degraded' | 'polling' | 'stream' | null;
};
