ALTER TABLE "askcore_organization_invites" ADD COLUMN IF NOT EXISTS "directory_invitation_token" text;--> statement-breakpoint
ALTER TABLE "askcore_organization_invites" ADD COLUMN IF NOT EXISTS "roster_kind" text;--> statement-breakpoint
ALTER TABLE "askcore_organization_invites" ADD COLUMN IF NOT EXISTS "primary_org_unit_id" integer;--> statement-breakpoint
ALTER TABLE "askcore_organization_invites" ADD COLUMN IF NOT EXISTS "preset_roles" jsonb;--> statement-breakpoint
ALTER TABLE "askcore_organization_invites" ADD COLUMN IF NOT EXISTS "person_id" integer;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "askcore_organization_invites_directory_token_idx" ON "askcore_organization_invites" USING btree ("directory_invitation_token");
