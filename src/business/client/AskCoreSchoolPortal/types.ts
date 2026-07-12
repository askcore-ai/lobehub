export type SchoolPortalState = 'conflict' | 'ready' | 'unavailable';
export type SchoolSourceRole = 'administrator' | 'guardian' | 'student' | 'teacher';

export interface SchoolPortalDestination {
  description: string;
  key: string;
  label: string;
  launch_url: string;
  session_launch_url: string;
}

export interface SchoolPortalSchool {
  destinations: SchoolPortalDestination[];
  key: string;
  name: string;
  role_source_url: string;
}

export interface SchoolPortalManifest {
  can_manage_integrations: boolean;
  contract: 'askcore.school-portal.v2';
  schools: SchoolPortalSchool[];
  selection_required: boolean;
  show_school_entry: boolean;
  state: SchoolPortalState;
}

export interface SchoolSourceSession {
  authenticated: true;
  role: SchoolSourceRole;
}

export interface SchoolIntegrationOperations {
  production_preflight?: {
    active_deployments?: number;
    preflight_status?: string;
    status?: string;
  };
  redaction_passed: boolean;
  roster_projection_rows: number;
  status: string;
}
