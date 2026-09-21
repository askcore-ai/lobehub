import { check, index, integer, pgTable, text } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { createdAt, timestamptz } from './_helpers';
import { users } from './user';

export const registrationIntents = pgTable('registration_intents', {
  id: text('id').primaryKey(),
  kind: text('kind', { enum: ['ordinary', 'invitation'] }).notNull(),
  invitationCiphertext: text('invitation_ciphertext'),
  returnPath: text('return_path').notNull(),
  expiresAt: timestamptz('expires_at').notNull(),
  claimedUser: text('claimed_user'),
  createdAt: createdAt(),
}, (t) => [check('registration_intents_kind_check', sql`${t.kind} in ('ordinary', 'invitation')`)]);

export const registrationMagicContexts = pgTable('registration_magic_contexts', {
  tokenHash: text('token_hash').primaryKey(),
  intentId: text('intent_id').notNull().references(() => registrationIntents.id),
  expiresAt: timestamptz('expires_at').notNull(),
});

export const registrationProvisioningJobs = pgTable('registration_provisioning_jobs', {
  userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  intentId: text('intent_id').references(() => registrationIntents.id),
  authReadyAt: timestamptz('auth_ready_at'),
  state: text('state', { enum: ['awaiting_intent', 'awaiting_auth', 'ready', 'leased', 'retry', 'identity_conflict', 'completed'] }).notNull(),
  attempt: integer('attempt').notNull().default(0),
  nextAttemptAt: timestamptz('next_attempt_at').notNull().defaultNow(),
  leaseToken: text('lease_token'),
  leaseUntil: timestamptz('lease_until'),
  subjectDigest: text('subject_digest'),
  identityLinkVersion: text('identity_link_version'),
  moodleDoneVersion: text('moodle_done_version'),
  gibbonDoneVersion: text('gibbon_done_version'),
  failureCode: text('failure_code'),
  createdAt: createdAt(),
  updatedAt: timestamptz('updated_at').notNull().defaultNow(),
}, (t) => [
  index('registration_jobs_due_idx').on(t.state, t.nextAttemptAt),
  check('registration_jobs_state_check', sql`${t.state} in ('awaiting_intent', 'awaiting_auth', 'ready', 'leased', 'retry', 'identity_conflict', 'completed')`),
]);
