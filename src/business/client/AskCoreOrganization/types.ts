export type AskCoreOrganizationRole = 'owner' | 'admin' | 'member';
export type AskCoreInviteChannel = 'email' | 'link' | 'qr';
export type AskCoreInviteExpiry = '30m' | '1d' | '7d' | '30d';

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
