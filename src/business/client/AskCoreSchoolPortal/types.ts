export type SchoolPortalState = 'conflict' | 'ready' | 'revoked' | 'unavailable' | 'unlinked';

export interface SchoolPortalDestination {
  description: string;
  key: string;
  label: string;
  launch_url: string;
}

export interface SchoolPortalSchool {
  destinations: SchoolPortalDestination[];
  key: string;
  name: string;
}

export interface SchoolPortalManifest {
  can_manage_integrations: boolean;
  contract: 'askcore.school-portal.v1';
  schools: SchoolPortalSchool[];
  selection_required: boolean;
  show_school_entry: boolean;
  state: SchoolPortalState;
}

export interface SchoolIntegrationOperations {
  live_pilot_connection?: { connection_ready?: boolean };
  production_preflight?: { status?: string };
  redaction_passed: boolean;
  roster_projection_rows: number;
  status: string;
}
