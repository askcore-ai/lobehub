import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { users } from './user';

// export const user = pgTable('betterauth_user', {
//   createdAt: timestamp('created_at').defaultNow().notNull(),
//   email: text('email').notNull().unique(),
//   emailVerified: boolean('email_verified').default(false).notNull(),
//   id: text('id').primaryKey(),
//   image: text('image'),
//   name: text('name').notNull(),
//   updatedAt: timestamp('updated_at')
//     .defaultNow()
//     .$onUpdate(() => /* @__PURE__ */ new Date())
//     .notNull(),
// });

export const organization = pgTable(
  'organization',
  {
    createdAt: timestamp('created_at').defaultNow().notNull(),
    id: text('id').primaryKey(),
    logo: text('logo'),
    metadata: text('metadata'),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
  },
  (table) => [uniqueIndex('organization_slug_unique').on(table.slug)],
);

export const session = pgTable(
  'auth_sessions',
  {
    activeOrganizationId: text('active_organization_id'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    id: text('id').primaryKey(),
    impersonatedBy: text('impersonated_by'),
    ipAddress: text('ip_address'),
    token: text('token').notNull().unique(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (table) => [
    index('auth_session_userId_idx').on(table.userId),
    index('auth_session_active_organization_id_idx').on(table.activeOrganizationId),
  ],
);

export const account = pgTable(
  'accounts',
  {
    accessToken: text('access_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at'),
    accountId: text('account_id').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    id: text('id').primaryKey(),
    idToken: text('id_token'),
    password: text('password'),
    providerId: text('provider_id').notNull(),
    refreshToken: text('refresh_token'),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
    scope: text('scope'),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (table) => [index('account_userId_idx').on(table.userId)],
);

export const member = pgTable(
  'member',
  {
    createdAt: timestamp('created_at').defaultNow().notNull(),
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    role: text('role').default('member').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (table) => [
    index('member_organization_id_idx').on(table.organizationId),
    index('member_user_id_idx').on(table.userId),
    uniqueIndex('member_organization_user_unique').on(table.organizationId, table.userId),
  ],
);

export const invitation = pgTable(
  'invitation',
  {
    createdAt: timestamp('created_at').defaultNow().notNull(),
    email: text('email').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    id: text('id').primaryKey(),
    inviterId: text('inviter_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    role: text('role'),
    status: text('status').default('pending').notNull(),
  },
  (table) => [
    index('invitation_organization_id_idx').on(table.organizationId),
    index('invitation_email_idx').on(table.email),
  ],
);

export const verification = pgTable(
  'verifications',
  {
    createdAt: timestamp('created_at').defaultNow().notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    value: text('value').notNull(),
  },
  (table) => [index('verification_identifier_idx').on(table.identifier)],
);

export const twoFactor = pgTable(
  'two_factor',
  {
    backupCodes: text('backup_codes').notNull(),
    id: text('id').primaryKey(),
    secret: text('secret').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (table) => [
    index('two_factor_secret_idx').on(table.secret),
    index('two_factor_user_id_idx').on(table.userId),
  ],
);

export const passkey = pgTable(
  'passkey',
  {
    aaguid: text('aaguid'),
    backedUp: boolean('backedUp'),
    counter: integer('counter'),
    createdAt: timestamp('createdAt').defaultNow(),
    credentialID: text('credentialID').notNull(),
    deviceType: text('deviceType'),
    id: text('id').primaryKey(),
    name: text('name'),
    publicKey: text('publicKey').notNull(),
    transports: text('transports'),
    userId: text('userId')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (table) => [
    uniqueIndex('passkey_credential_id_unique').on(table.credentialID),
    index('passkey_user_id_idx').on(table.userId),
  ],
);

export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(account),
  invitations: many(invitation),
  memberships: many(member),
  passkeys: many(passkey),
  sessions: many(session),
  twoFactors: many(twoFactor),
}));

export const organizationRelations = relations(organization, ({ many }) => ({
  invitations: many(invitation),
  members: many(member),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  users: one(users, {
    fields: [session.userId],
    references: [users.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  users: one(users, {
    fields: [account.userId],
    references: [users.id],
  }),
}));

export const memberRelations = relations(member, ({ one }) => ({
  organization: one(organization, {
    fields: [member.organizationId],
    references: [organization.id],
  }),
  user: one(users, {
    fields: [member.userId],
    references: [users.id],
  }),
}));

export const invitationRelations = relations(invitation, ({ one }) => ({
  inviter: one(users, {
    fields: [invitation.inviterId],
    references: [users.id],
  }),
  organization: one(organization, {
    fields: [invitation.organizationId],
    references: [organization.id],
  }),
}));

export const twoFactorRelations = relations(twoFactor, ({ one }) => ({
  users: one(users, {
    fields: [twoFactor.userId],
    references: [users.id],
  }),
}));

export const passkeysRelations = relations(passkey, ({ one }) => ({
  users: one(users, {
    fields: [passkey.userId],
    references: [users.id],
  }),
}));
