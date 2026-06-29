import { createHash, randomBytes } from 'node:crypto';

import { createNanoId, type LobeChatDatabase, serverDB } from '@lobechat/database';
import {
  askcoreOrganizationInvites,
  member,
  organization,
  session as authSession,
  users,
} from '@lobechat/database/schemas';
import { and, asc, eq, sql } from 'drizzle-orm';

import {
  askCoreAssertionHeaderName,
  buildWorkbenchAssertion,
} from '@/server/services/askcoreAssertion';
import { EmailService } from '@/server/services/email';

export type AskCoreOrganizationRole = 'owner' | 'admin' | 'member';
export type AskCoreInviteChannel = 'email' | 'link' | 'qr';
export type AskCoreInviteExpiry = '30m' | '1d' | '7d' | '30d';
export type AskCoreDirectoryRosterKind = 'student' | 'teacher';
export type AskCoreEducationRole =
  'grade_admin' | 'homeroom_teacher' | 'school_admin' | 'student' | 'teacher';

export interface AskCoreSessionRecord {
  [key: string]: unknown;
}

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

type UserSession = {
  displayName: string;
  email: string;
  id: string;
  role?: string;
  sessionId?: string;
  sessionToken?: string;
};

const id = createNanoId(12);
const tokenId = createNanoId(16);

const INVITE_EXPIRY_MS: Record<AskCoreInviteExpiry, number> = {
  '30m': 30 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

const ROLE_LABELS: Record<AskCoreOrganizationRole, string> = {
  admin: '管理员',
  member: '成员',
  owner: '所有者',
};

const WORKBENCH_API_PLUGIN_ID = 'aitutor-suite';
const DEFAULT_WORKBENCH_API_BASE_URL = 'http://api:8000';
const EDUCATION_ROLES = new Set<AskCoreEducationRole>([
  'grade_admin',
  'homeroom_teacher',
  'school_admin',
  'student',
  'teacher',
]);

export class AskCoreOrganizationError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'AskCoreOrganizationError';
    this.status = status;
  }
}

const stringValue = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

const recordValue = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;

const normalizeRole = (value: unknown): AskCoreOrganizationRole => {
  if (value === 'owner' || value === 'admin' || value === 'member') return value;
  return 'member';
};

const normalizeInviteRole = (
  value: unknown,
): Extract<AskCoreOrganizationRole, 'admin' | 'member'> => (value === 'admin' ? 'admin' : 'member');

const normalizeInviteChannel = (value: unknown): AskCoreInviteChannel => {
  if (value === 'email' || value === 'link' || value === 'qr') return value;
  throw new AskCoreOrganizationError(400, 'Unsupported invite channel');
};

const normalizeInviteExpiry = (value: unknown): AskCoreInviteExpiry => {
  if (value === '30m' || value === '1d' || value === '7d' || value === '30d') return value;
  throw new AskCoreOrganizationError(400, 'Unsupported invite expiry');
};

const normalizeRosterKind = (value: unknown): AskCoreDirectoryRosterKind | undefined => {
  if (value === 'teacher' || value === 'student') return value;
  return undefined;
};

const normalizeEducationRoles = (value: unknown): AskCoreEducationRole[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is AskCoreEducationRole => EDUCATION_ROLES.has(item));
};

const positiveIntegerValue = (value: unknown): number | undefined => {
  const numberValue = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : undefined;
};

const parseMetadata = (metadata?: string | null): Record<string, unknown> => {
  if (!metadata) return {};
  try {
    const value = JSON.parse(metadata);
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
};

const serializeDate = (value?: Date | null) => (value ? value.toISOString() : undefined);

const hashInviteToken = (token: string) => createHash('sha256').update(token).digest('hex');

const cleanEmail = (email?: string | null) => email?.trim().toLowerCase() || undefined;

const readUpstreamErrorMessage = async (response: Response) => {
  try {
    const payload = await response.json();
    const detail = payload?.detail;
    if (detail && typeof detail === 'object') return detail.message || JSON.stringify(detail);
    return detail || payload?.message || response.statusText;
  } catch {
    return response.statusText;
  }
};

const buildDisplayName = (user: Record<string, unknown>): string => {
  const fullName = stringValue(user.fullName) ?? stringValue(user.name);
  if (fullName) return fullName;

  const composed = [stringValue(user.firstName), stringValue(user.lastName)]
    .filter(Boolean)
    .join('');
  if (composed) return composed;

  const username = stringValue(user.username);
  if (username) return username;

  const email = stringValue(user.email);
  return email?.split('@')[0] || '我的';
};

const memberDisplayName = (row: {
  email?: string | null;
  firstName?: string | null;
  fullName?: string | null;
  lastName?: string | null;
  username?: string | null;
}) =>
  row.fullName ||
  [row.firstName, row.lastName].filter(Boolean).join('') ||
  row.username ||
  row.email?.split('@')[0] ||
  '成员';

export const userFromSession = (session: AskCoreSessionRecord | null): UserSession => {
  const user = recordValue(session?.user);
  const sessionData = recordValue(session?.session);
  const id = stringValue(user?.id);
  const email = stringValue(user?.email);
  if (!user || !id || !email)
    throw new AskCoreOrganizationError(401, 'LobeHub session is required');

  return {
    displayName: buildDisplayName(user),
    email,
    id,
    role: stringValue(user.role),
    sessionId: stringValue(sessionData?.id) ?? stringValue(session?.sessionId),
    sessionToken: stringValue(sessionData?.token) ?? stringValue(session?.sessionToken),
  };
};

export const activeOrganizationIdFromSessionRecord = (session: AskCoreSessionRecord) => {
  const sessionData = recordValue(session.session);
  const organizationRecord =
    recordValue(session.organization) ?? recordValue(session.activeOrganization);

  return (
    stringValue(sessionData?.activeOrganizationId) ??
    stringValue(sessionData?.active_organization_id) ??
    stringValue(session.activeOrganizationId) ??
    stringValue(session.active_organization_id) ??
    stringValue(organizationRecord?.id)
  );
};

export const persistedActiveOrganizationIdFromSession = async (
  session: AskCoreSessionRecord,
  db: LobeChatDatabase = serverDB,
) => {
  const sessionData = recordValue(session.session);
  const sessionId = stringValue(sessionData?.id) ?? stringValue(session.sessionId);
  const sessionToken = stringValue(sessionData?.token) ?? stringValue(session.sessionToken);
  const rows = sessionId
    ? await db
        .select({ activeOrganizationId: authSession.activeOrganizationId })
        .from(authSession)
        .where(eq(authSession.id, sessionId))
        .limit(1)
    : sessionToken
      ? await db
          .select({ activeOrganizationId: authSession.activeOrganizationId })
          .from(authSession)
          .where(eq(authSession.token, sessionToken))
          .limit(1)
      : [];
  return stringValue(rows[0]?.activeOrganizationId);
};

const organizationFromRow = (row: {
  createdAt: Date;
  id: string;
  logo: string | null;
  metadata: string | null;
  name: string;
  role: string;
  slug: string;
}): Omit<AskCoreOrganizationSummary, 'isActive'> => {
  const metadata = parseMetadata(row.metadata);
  return {
    contact: stringValue(metadata.contact),
    createdAt: serializeDate(row.createdAt),
    description: stringValue(metadata.description),
    id: row.id,
    logo: row.logo,
    name: row.name,
    role: normalizeRole(row.role),
    slug: row.slug,
  };
};

export class AskCoreOrganizationService {
  private db: LobeChatDatabase;
  private emailService?: EmailService;
  private origin: string;

  constructor(
    options: {
      db?: LobeChatDatabase;
      emailService?: EmailService;
      origin?: string;
    } = {},
  ) {
    this.db = options.db ?? serverDB;
    this.emailService = options.emailService;
    this.origin = options.origin ?? 'https://askcore.cn';
  }

  async bootstrap(
    session: AskCoreSessionRecord,
    inviteToken?: string,
  ): Promise<AskCoreOrganizationPayload> {
    const user = userFromSession(session);

    if (inviteToken) {
      const organizationId = await this.acceptInvite(user, inviteToken);
      await this.setActiveOrganizationForSession(user, organizationId);
      return this.payloadForUser(user, organizationId);
    }

    const memberships = await this.listOrganizationsForUser(user.id);
    if (memberships.length === 0) {
      const organizationId = await this.createDefaultOrganization(user);
      await this.setActiveOrganizationForSession(user, organizationId);
      return this.payloadForUser(user, organizationId);
    }

    const organizations = await this.listOrganizationsForUser(user.id, {
      includeAll: this.isSuperAdmin(user),
    });
    const activeId =
      (await this.persistedActiveOrganizationId(session)) ??
      activeOrganizationIdFromSessionRecord(session);
    const activeIsValid = activeId && organizations.some((item) => item.id === activeId);
    const organizationId = activeIsValid
      ? activeId
      : organizations.length === 1
        ? organizations[0].id
        : undefined;
    return this.payloadForUser(user, organizationId);
  }

  async list(session: AskCoreSessionRecord): Promise<AskCoreOrganizationPayload> {
    const user = userFromSession(session);
    const activeId =
      (await this.persistedActiveOrganizationId(session)) ??
      activeOrganizationIdFromSessionRecord(session);
    return this.payloadForUser(user, activeId);
  }

  async createOrganization(
    session: AskCoreSessionRecord,
    input: { contact?: string; description?: string; logo?: string; name?: string },
  ): Promise<AskCoreOrganizationPayload> {
    const user = userFromSession(session);
    const name = stringValue(input.name);
    if (!name) throw new AskCoreOrganizationError(400, 'Organization name is required');

    const metadata = JSON.stringify({
      contact: stringValue(input.contact) || '',
      description: stringValue(input.description) || '',
    });
    const organizationId = `org_${id()}`;
    await this.db.insert(organization).values({
      id: organizationId,
      logo: stringValue(input.logo) || null,
      metadata,
      name,
      slug: `askcore-${tokenId().toLowerCase()}`,
    });
    try {
      await this.addMembership(organizationId, user.id, 'owner');
      await this.createDirectoryTeacherPerson({
        organizationId,
        organizationRole: 'owner',
        user,
      });
    } catch (error) {
      await this.db.delete(organization).where(eq(organization.id, organizationId));
      throw error;
    }
    await this.setActiveOrganizationForSession(user, organizationId);
    return this.payloadForUser(user, organizationId);
  }

  async setActive(
    session: AskCoreSessionRecord,
    organizationId: string,
  ): Promise<AskCoreOrganizationPayload> {
    const user = userFromSession(session);
    await this.requireMembership(user, organizationId);
    await this.setActiveOrganizationForSession(user, organizationId);
    return this.payloadForUser(user, organizationId);
  }

  async updateOrganization(
    session: AskCoreSessionRecord,
    organizationId: string,
    input: { contact?: string; description?: string; logo?: string | null; name?: string },
  ): Promise<AskCoreOrganizationPayload> {
    const user = userFromSession(session);
    await this.requireAdmin(user, organizationId);

    const current = await this.getOrganization(organizationId);
    const metadata = {
      ...parseMetadata(current.metadata),
      contact: stringValue(input.contact) || '',
      description: stringValue(input.description) || '',
    };

    await this.db
      .update(organization)
      .set({
        logo: input.logo === null ? null : (stringValue(input.logo) ?? current.logo),
        metadata: JSON.stringify(metadata),
        name: stringValue(input.name) || current.name,
      })
      .where(eq(organization.id, organizationId));

    return this.payloadForUser(user, organizationId);
  }

  async listMembers(session: AskCoreSessionRecord, organizationId: string) {
    const user = userFromSession(session);
    await this.requireMembership(user, organizationId);
    return this.membersForOrganization(organizationId);
  }

  async updateMemberRole(
    session: AskCoreSessionRecord,
    organizationId: string,
    memberId: string,
    role: AskCoreOrganizationRole,
  ) {
    const user = userFromSession(session);
    const actor = await this.requireAdmin(user, organizationId);
    const target = await this.getMember(memberId, organizationId);
    if (!['owner', 'admin', 'member'].includes(role)) {
      throw new AskCoreOrganizationError(400, 'Unsupported member role');
    }
    if (
      !this.isSuperAdmin(user) &&
      actor.role !== 'owner' &&
      (target.role === 'owner' || role === 'owner')
    ) {
      throw new AskCoreOrganizationError(403, 'Only owners can modify owner membership');
    }
    if (target.role === 'owner' && role !== 'owner')
      await this.assertMoreThanOneOwner(organizationId);

    await this.db.update(member).set({ role }).where(eq(member.id, memberId));
    return this.membersForOrganization(organizationId);
  }

  async removeMember(session: AskCoreSessionRecord, organizationId: string, memberId: string) {
    const user = userFromSession(session);
    const actor = await this.requireAdmin(user, organizationId);
    const target = await this.getMember(memberId, organizationId);
    if (target.role === 'owner') {
      if (!this.isSuperAdmin(user) && actor.role !== 'owner') {
        throw new AskCoreOrganizationError(403, 'Only owners can remove owner membership');
      }
      await this.assertMoreThanOneOwner(organizationId);
    }

    await this.db.delete(member).where(eq(member.id, memberId));
    return this.membersForOrganization(organizationId);
  }

  async createInvite(
    session: AskCoreSessionRecord,
    organizationId: string,
    input: {
      channel?: string;
      directory_invitation_token?: string;
      directoryInvitationToken?: string;
      email?: string;
      expiresIn?: string;
      person_id?: number;
      personId?: number;
      preset_roles?: unknown;
      presetRoles?: unknown;
      primary_org_unit_id?: number;
      primaryOrgUnitId?: number;
      role?: string;
      roster_kind?: string;
      rosterKind?: string;
    },
  ): Promise<AskCoreInvitePayload> {
    const user = userFromSession(session);
    await this.requireAdmin(user, organizationId);
    const org = await this.getOrganization(organizationId);
    const channel = normalizeInviteChannel(input.channel);
    const expiresIn = normalizeInviteExpiry(input.expiresIn);
    const role = normalizeInviteRole(input.role);
    const directoryInvitationToken =
      stringValue(input.directory_invitation_token) ?? stringValue(input.directoryInvitationToken);
    const rosterKind = normalizeRosterKind(input.roster_kind ?? input.rosterKind);
    const primaryOrgUnitId = positiveIntegerValue(
      input.primary_org_unit_id ?? input.primaryOrgUnitId,
    );
    const personId = positiveIntegerValue(input.person_id ?? input.personId);
    const presetRoles = normalizeEducationRoles(input.preset_roles ?? input.presetRoles);
    const email = cleanEmail(input.email);
    if (channel === 'email' && !email)
      throw new AskCoreOrganizationError(400, 'Invite email is required');
    if (!directoryInvitationToken)
      throw new AskCoreOrganizationError(400, 'Directory invitation token is required');
    if (!rosterKind) throw new AskCoreOrganizationError(400, 'Directory roster kind is required');
    if (rosterKind === 'student' && !primaryOrgUnitId && !personId) {
      throw new AskCoreOrganizationError(400, 'Student invitation requires a class primary unit');
    }

    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + INVITE_EXPIRY_MS[expiresIn]);
    await this.db.insert(askcoreOrganizationInvites).values({
      channel,
      createdByUserId: user.id,
      directoryInvitationToken,
      email: channel === 'email' ? email! : (email ?? null),
      expiresAt,
      id: `orginv_${id()}`,
      organizationId,
      personId: personId ?? null,
      presetRoles,
      primaryOrgUnitId: primaryOrgUnitId ?? null,
      role,
      rosterKind,
      tokenHash: hashInviteToken(token),
    });

    const link = `${this.origin.replace(/\/$/, '')}/join/organization/${encodeURIComponent(token)}`;
    if (channel === 'email' && email) {
      await this.getEmailService().sendMail({
        html: `<p>${user.displayName} 邀请你加入 ${org.name}。</p><p><a href="${link}">点击加入组织</a></p><p>该邀请将在 ${this.expiryLabel(expiresIn)} 后过期。</p>`,
        subject: `邀请加入 ${org.name}`,
        text: `${user.displayName} 邀请你加入 ${org.name}。\n${link}\n该邀请将在 ${this.expiryLabel(expiresIn)} 后过期。`,
        to: email,
      });
    }

    return {
      channel,
      directoryInvitationToken,
      email,
      expiresIn,
      link,
      personId,
      presetRoles,
      primaryOrgUnitId,
      role,
      rosterKind,
      token,
    };
  }

  async persistedActiveOrganizationId(session: AskCoreSessionRecord): Promise<string | undefined> {
    const user = userFromSession(session);
    const rows = user.sessionId
      ? await this.db
          .select({ activeOrganizationId: authSession.activeOrganizationId })
          .from(authSession)
          .where(eq(authSession.id, user.sessionId))
          .limit(1)
      : user.sessionToken
        ? await this.db
            .select({ activeOrganizationId: authSession.activeOrganizationId })
            .from(authSession)
            .where(eq(authSession.token, user.sessionToken))
            .limit(1)
        : [];
    return stringValue(rows[0]?.activeOrganizationId);
  }

  private async createDefaultOrganization(user: UserSession) {
    const name = `${user.displayName} 的组织`;
    const organizationId = `org_${id()}`;
    await this.db.insert(organization).values({
      id: organizationId,
      metadata: JSON.stringify({ contact: user.email, description: '' }),
      name,
      slug: `askcore-${tokenId().toLowerCase()}`,
    });
    try {
      await this.addMembership(organizationId, user.id, 'owner');
      await this.createDirectoryTeacherPerson({
        organizationId,
        organizationRole: 'owner',
        user,
      });
    } catch (error) {
      await this.db.delete(organization).where(eq(organization.id, organizationId));
      throw error;
    }
    return organizationId;
  }

  private async acceptInvite(user: UserSession, token: string) {
    const [invite] = await this.db
      .select()
      .from(askcoreOrganizationInvites)
      .where(eq(askcoreOrganizationInvites.tokenHash, hashInviteToken(token)))
      .limit(1);
    if (!invite || invite.revokedAt)
      throw new AskCoreOrganizationError(404, 'Invitation is not available');
    if (invite.expiresAt.getTime() <= Date.now()) {
      throw new AskCoreOrganizationError(410, 'Invitation has expired');
    }
    const boundEmail = cleanEmail(invite.email);
    if (boundEmail && boundEmail !== cleanEmail(user.email)) {
      throw new AskCoreOrganizationError(403, 'Invitation email does not match current user');
    }
    const directoryInvitationToken = stringValue(invite.directoryInvitationToken);
    const rosterKind = normalizeRosterKind(invite.rosterKind);
    if (!directoryInvitationToken || !rosterKind) {
      throw new AskCoreOrganizationError(400, 'Invitation is missing education identity preset');
    }

    await this.getOrganization(invite.organizationId);
    const membership = await this.addMembership(
      invite.organizationId,
      user.id,
      normalizeInviteRole(invite.role),
    );
    try {
      await this.acceptDirectoryInvitation({
        directoryInvitationToken,
        organizationId: invite.organizationId,
        user,
      });
    } catch (error) {
      if (membership.created) await this.removeMembershipRecord(membership.id);
      throw error;
    }
    await this.db
      .update(askcoreOrganizationInvites)
      .set({
        lastUsedAt: new Date(),
        useCount: sql`${askcoreOrganizationInvites.useCount} + 1`,
      })
      .where(eq(askcoreOrganizationInvites.id, invite.id));
    return invite.organizationId;
  }

  private async setActiveOrganizationForSession(user: UserSession, organizationId: string) {
    if (user.sessionId) {
      await this.db
        .update(authSession)
        .set({ activeOrganizationId: organizationId })
        .where(eq(authSession.id, user.sessionId));
      return;
    }
    if (user.sessionToken) {
      await this.db
        .update(authSession)
        .set({ activeOrganizationId: organizationId })
        .where(eq(authSession.token, user.sessionToken));
    }
  }

  private async payloadForUser(
    user: UserSession,
    activeOrganizationId?: string,
  ): Promise<AskCoreOrganizationPayload> {
    const persistedActiveId =
      activeOrganizationId ||
      (await this.persistedActiveOrganizationId({
        session: { id: user.sessionId, token: user.sessionToken },
        user,
      }));
    const organizations = await this.listOrganizationsForUser(user.id, {
      includeAll: this.isSuperAdmin(user),
    });
    const selectedOrganizationId =
      persistedActiveId ?? (organizations.length === 1 ? organizations[0]?.id : undefined);
    const withActive = organizations.map((item) => ({
      ...item,
      isActive: item.id === selectedOrganizationId,
    }));
    const current = withActive.find((item) => item.isActive) ?? null;
    const role = current?.role;
    const canManage = this.isSuperAdmin(user) || role === 'owner' || role === 'admin';
    const members = current ? await this.membersForOrganization(current.id) : [];

    return {
      current,
      members,
      organizations: withActive,
      permissions: {
        canInvite: canManage,
        canManageMembers: canManage,
        canUpdateMeta: canManage,
      },
    };
  }

  private async listOrganizationsForUser(userId: string, options: { includeAll?: boolean } = {}) {
    const rows = options.includeAll
      ? await this.db
          .select({
            createdAt: organization.createdAt,
            id: organization.id,
            logo: organization.logo,
            metadata: organization.metadata,
            name: organization.name,
            role: sql<string>`coalesce(${member.role}, 'owner')`,
            slug: organization.slug,
          })
          .from(organization)
          .leftJoin(
            member,
            and(eq(member.organizationId, organization.id), eq(member.userId, userId)),
          )
          .orderBy(asc(organization.createdAt))
      : await this.db
          .select({
            createdAt: organization.createdAt,
            id: organization.id,
            logo: organization.logo,
            metadata: organization.metadata,
            name: organization.name,
            role: member.role,
            slug: organization.slug,
          })
          .from(member)
          .innerJoin(organization, eq(member.organizationId, organization.id))
          .where(eq(member.userId, userId))
          .orderBy(asc(member.createdAt));

    return rows.map((row) => ({ ...organizationFromRow(row), isActive: false }));
  }

  private async membersForOrganization(
    organizationId: string,
  ): Promise<AskCoreOrganizationMember[]> {
    const rows = await this.db
      .select({
        avatar: users.avatar,
        createdAt: member.createdAt,
        email: users.email,
        firstName: users.firstName,
        fullName: users.fullName,
        id: member.id,
        lastName: users.lastName,
        role: member.role,
        userId: member.userId,
        username: users.username,
      })
      .from(member)
      .innerJoin(users, eq(member.userId, users.id))
      .where(eq(member.organizationId, organizationId))
      .orderBy(asc(member.createdAt));

    return rows.map((row) => ({
      avatar: row.avatar,
      createdAt: serializeDate(row.createdAt),
      email: row.email,
      id: row.id,
      name: memberDisplayName(row),
      role: normalizeRole(row.role),
      userId: row.userId,
    }));
  }

  private async addMembership(
    organizationId: string,
    userId: string,
    role: AskCoreOrganizationRole,
  ) {
    const [existing] = await this.db
      .select({ id: member.id })
      .from(member)
      .where(and(eq(member.organizationId, organizationId), eq(member.userId, userId)))
      .limit(1);
    if (existing) return { created: false, id: existing.id };

    const memberId = `mem_${id()}`;
    await this.db.insert(member).values({
      id: memberId,
      organizationId,
      role,
      userId,
    });
    return { created: true, id: memberId };
  }

  private async removeMembershipRecord(memberId: string) {
    await this.db.delete(member).where(eq(member.id, memberId));
  }

  private workbenchApiBaseUrl() {
    return (
      process.env.AITUTOR_API_BASE_URL?.trim() ||
      process.env.WORKBENCH_API_BASE_URL?.trim() ||
      DEFAULT_WORKBENCH_API_BASE_URL
    );
  }

  private async requestWorkbenchOrganizationJson(input: {
    body?: Record<string, unknown>;
    method?: 'DELETE' | 'POST';
    organizationId: string;
    organizationRole: AskCoreOrganizationRole;
    path: string;
    user: UserSession;
  }) {
    const assertion = await buildWorkbenchAssertion({
      active_org_id: input.organizationId,
      email: input.user.email,
      org_id: input.organizationId,
      organization_role: input.organizationRole,
      permissions:
        input.organizationRole === 'owner' || input.organizationRole === 'admin'
          ? ['organization:update', 'project:read', 'project:write']
          : ['project:read'],
      roles: [input.user.role || 'workbench_user'],
      scopes: ['plugin.invoke', 'plugin.read'],
      sub: input.user.id,
    });
    const url = new URL(
      `/api/lobe/plugins/v1/${WORKBENCH_API_PLUGIN_ID}/ui/organization/${input.path}`,
      this.workbenchApiBaseUrl(),
    );
    const response = await fetch(url, {
      body: input.body ? JSON.stringify(input.body) : undefined,
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        ...(input.body ? { 'Content-Type': 'application/json' } : {}),
        [askCoreAssertionHeaderName()]: assertion,
      },
      method: input.method ?? 'POST',
    });
    if (!response.ok) {
      throw new AskCoreOrganizationError(response.status, await readUpstreamErrorMessage(response));
    }
    return response.json();
  }

  private async postWorkbenchOrganizationJson(input: {
    body: Record<string, unknown>;
    organizationId: string;
    organizationRole: AskCoreOrganizationRole;
    path: string;
    user: UserSession;
  }) {
    return this.requestWorkbenchOrganizationJson({ ...input, method: 'POST' });
  }

  async createDirectoryInvite(
    session: AskCoreSessionRecord,
    organizationId: string,
    input: {
      channel?: string;
      email?: string | null;
      expiresIn?: string;
      invitation_kind?: string;
      invitationKind?: string;
      member_role?: string;
      memberRole?: string;
      person_id?: number | null;
      personId?: number | null;
      preset_roles?: unknown;
      presetRoles?: unknown;
      primary_org_unit_id?: number | null;
      primaryOrgUnitId?: number | null;
      roster_kind?: string;
      rosterKind?: string;
    },
  ): Promise<AskCoreInvitePayload> {
    const user = userFromSession(session);
    const actor = await this.requireAdmin(user, organizationId);
    const memberRole = normalizeInviteRole(input.member_role ?? input.memberRole);
    const presetRoles = normalizeEducationRoles(input.preset_roles ?? input.presetRoles);
    const primaryOrgUnitId = positiveIntegerValue(
      input.primary_org_unit_id ?? input.primaryOrgUnitId,
    );
    const personId = positiveIntegerValue(input.person_id ?? input.personId);
    const invitationKind = stringValue(input.invitation_kind ?? input.invitationKind) || 'open';
    const directoryInvitation = (await this.postWorkbenchOrganizationJson({
      body: {
        email: cleanEmail(input.email) ?? null,
        invitation_kind: invitationKind,
        member_role: memberRole,
        person_id: personId ?? null,
        preset_roles: presetRoles,
        primary_org_unit_id: primaryOrgUnitId ?? null,
      },
      organizationId,
      organizationRole: actor.role,
      path: 'directory-invitations',
      user,
    })) as { token?: string };
    const token = stringValue(directoryInvitation.token);
    if (!token) throw new AskCoreOrganizationError(502, 'Directory invitation token is missing');
    try {
      return await this.createInvite(session, organizationId, {
        channel: input.channel,
        directory_invitation_token: token,
        email: input.email ?? undefined,
        expiresIn: input.expiresIn,
        person_id: personId,
        preset_roles: presetRoles,
        primary_org_unit_id: primaryOrgUnitId,
        role: memberRole,
        roster_kind: input.roster_kind ?? input.rosterKind,
      });
    } catch (error) {
      await this.requestWorkbenchOrganizationJson({
        organizationId,
        organizationRole: actor.role,
        path: `directory-invitations/${encodeURIComponent(token)}`,
        method: 'DELETE',
        user,
      }).catch(() => undefined);
      throw error;
    }
  }

  private async createDirectoryTeacherPerson(input: {
    organizationId: string;
    organizationRole: AskCoreOrganizationRole;
    user: UserSession;
  }) {
    await this.postWorkbenchOrganizationJson({
      body: {
        better_auth_user_id: input.user.id,
        display_name: input.user.displayName,
        email: input.user.email,
        primary_org_unit_id: null,
        roster_kind: 'teacher',
      },
      organizationId: input.organizationId,
      organizationRole: input.organizationRole,
      path: 'people',
      user: input.user,
    });
  }

  private async acceptDirectoryInvitation(input: {
    directoryInvitationToken: string;
    organizationId: string;
    user: UserSession;
  }) {
    await this.postWorkbenchOrganizationJson({
      body: {
        better_auth_user_id: input.user.id,
        display_name: input.user.displayName,
      },
      organizationId: input.organizationId,
      organizationRole: 'member',
      path: `directory-invitations/${encodeURIComponent(input.directoryInvitationToken)}/accept`,
      user: input.user,
    });
  }

  private async getOrganization(organizationId: string) {
    const [row] = await this.db
      .select()
      .from(organization)
      .where(eq(organization.id, organizationId))
      .limit(1);
    if (!row) throw new AskCoreOrganizationError(404, 'Organization not found');
    return row;
  }

  private async getMember(memberId: string, organizationId: string) {
    const [row] = await this.db
      .select()
      .from(member)
      .where(and(eq(member.id, memberId), eq(member.organizationId, organizationId)))
      .limit(1);
    if (!row) throw new AskCoreOrganizationError(404, 'Member not found');
    return { ...row, role: normalizeRole(row.role) };
  }

  private isSuperAdmin(user: UserSession) {
    return user.role === 'super_admin';
  }

  private getEmailService() {
    this.emailService ??= new EmailService();
    return this.emailService;
  }

  private async requireMembership(user: UserSession, organizationId: string) {
    if (this.isSuperAdmin(user)) {
      await this.getOrganization(organizationId);
      return {
        id: `super_admin:${user.id}`,
        organizationId,
        role: 'owner' as AskCoreOrganizationRole,
        userId: user.id,
      };
    }
    const [row] = await this.db
      .select()
      .from(member)
      .where(and(eq(member.organizationId, organizationId), eq(member.userId, user.id)))
      .limit(1);
    if (!row) throw new AskCoreOrganizationError(403, 'User is not a member of the organization');
    return { ...row, role: normalizeRole(row.role) };
  }

  private async requireAdmin(user: UserSession, organizationId: string) {
    const row = await this.requireMembership(user, organizationId);
    if (row.role !== 'owner' && row.role !== 'admin') {
      throw new AskCoreOrganizationError(403, 'Organization admin permission is required');
    }
    return row;
  }

  private async assertMoreThanOneOwner(organizationId: string) {
    const owners = await this.db
      .select({ id: member.id })
      .from(member)
      .where(and(eq(member.organizationId, organizationId), eq(member.role, 'owner')));
    if (owners.length <= 1) throw new AskCoreOrganizationError(400, 'Cannot remove the last owner');
  }

  private expiryLabel(expiresIn: AskCoreInviteExpiry) {
    if (expiresIn === '30m') return '30 分钟';
    if (expiresIn === '1d') return '1 天';
    if (expiresIn === '7d') return '7 天';
    return '30 天';
  }
}

export { ROLE_LABELS as ASKCORE_ORGANIZATION_ROLE_LABELS };
