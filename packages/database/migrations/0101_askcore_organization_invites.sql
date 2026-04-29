CREATE TABLE IF NOT EXISTS "askcore_organization_invites" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE cascade,
  "token_hash" text NOT NULL,
  "role" text DEFAULT 'member' NOT NULL,
  "channel" text NOT NULL,
  "email" text,
  "expires_at" timestamp NOT NULL,
  "created_by_user_id" text NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "revoked_at" timestamp,
  "last_used_at" timestamp,
  "use_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "askcore_organization_invites_token_hash_unique" ON "askcore_organization_invites" USING btree ("token_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "askcore_organization_invites_organization_id_idx" ON "askcore_organization_invites" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "askcore_organization_invites_email_idx" ON "askcore_organization_invites" USING btree ("email");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "askcore_organization_invites_expires_at_idx" ON "askcore_organization_invites" USING btree ("expires_at");
