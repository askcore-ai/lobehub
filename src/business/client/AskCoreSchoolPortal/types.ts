export type SchoolPortalState = 'conflict' | 'ready' | 'unavailable';

export interface SchoolPortalSchool {
  key: string;
  name: string;
}

export interface SchoolPortalManifest {
  can_manage_integrations: boolean;
  contract: 'askcore.native-school-shell.v1';
  schools: SchoolPortalSchool[];
  selection_required: boolean;
  show_school_entry: boolean;
  state: SchoolPortalState;
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

export interface SchoolSponsorshipSummary {
  contract: 'askcore.school-sponsorship.v1';
  credit_summary: SchoolMemberCreditSummary | null;
  current_funding_priority: 'personal_only' | 'school_then_personal';
  personal_fallback_enabled: true;
  safe_reason: string | null;
  school_key: string;
  school_status: 'active' | 'suspended' | 'unavailable';
  seat_id: number | null;
  sponsorship_status:
    'assigned' | 'available_to_claim' | 'inactive' | 'no_seat' | 'source_unavailable';
}

export interface SchoolMemberCreditSummary {
  period_end: string;
  period_start: string;
  rollover: false;
  school_available_credits: number;
  school_granted_credits: number;
  seat_monthly_credits: number;
  seat_settled_credits: number;
}

export interface SchoolCreditPeriod {
  available_credits: number;
  granted_credits: number;
  held_credits: number;
  period_end: string;
  period_id: number;
  period_start: string;
  rollover: false;
  settled_credits: number;
}

export interface SchoolSubscription {
  billing_anchor_at: string;
  current_period_end: string;
  current_period_start: string;
  interval: 'month' | 'year';
  plan_id: string;
  requested_seats_total: number;
  seat_change_status: 'action_required' | 'applied' | 'scheduled';
  seats_total: number;
  status: 'active' | 'expired' | 'suspended';
}

export interface SchoolBillingAdminSummary {
  period: SchoolCreditPeriod;
  school_key: string;
  seat_counts: {
    assigned: number;
    available: number;
    blocked: number;
    retiring: number;
    total: number;
  };
  subscription: SchoolSubscription;
}

export interface SchoolSponsoredSeat {
  assignment: null | {
    account_user_id: string;
    assigned_at: string;
    display_name: string;
    source: 'admin_preassign' | 'admin_reassign' | 'auto_claim' | 'system_correction';
  };
  assignment_blocked_until: string | null;
  assignment_version: number;
  seat_id: number;
  slot_number: number;
  status: 'active' | 'disabled' | 'retiring';
  voluntary_reassignment_available: boolean;
}

export interface SchoolUsageSummary {
  by_seat: {
    account_user_id: string;
    credits_used: number;
    seat_id: number;
    tokens_total: number;
  }[];
  credits: SchoolCreditPeriod;
  period_id: number;
  tokens_total: number;
}

export interface SchoolEligibleMember {
  display_name: string;
  eligibility_token: string;
}

export interface SchoolSourceProof {
  expires_at: number;
  source_proof: string;
  status: 'succeeded';
}
