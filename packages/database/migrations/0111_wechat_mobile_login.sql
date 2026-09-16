CREATE TABLE IF NOT EXISTS "wechat_mobile_login_transactions" (
	"account_switch_confirmed_at" timestamp,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"authorized_at" timestamp,
	"authorized_user_id" text,
	"browser_cookie_binding_hash" text NOT NULL,
	"callback_url" text NOT NULL,
	"completion_capability_hash" text NOT NULL,
	"consumed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"failure_code" text,
	"id" text PRIMARY KEY NOT NULL,
	"initiating_session_id_hash" text,
	"initiating_user_id" text,
	"issued_session_id" text,
	"oauth_state_hash" text NOT NULL,
	"purpose" text NOT NULL,
	"rebind_account_row_id" text,
	"recovery_until" timestamp,
	"state" text DEFAULT 'pending' NOT NULL,
	"tab_binding_hash" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wechat_rebind_claims" (
	"apply_before" timestamp,
	"confirmation_expires_at" timestamp NOT NULL,
	"confirmed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"legacy_account_row_id" text NOT NULL,
	"source_transaction_id" text NOT NULL,
	"state" text DEFAULT 'pending_confirmation' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"user_id" text NOT NULL,
	"verified_unionid" text NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wechat_mobile_login_transactions" ADD CONSTRAINT "wechat_mobile_login_transactions_authorized_user_id_users_id_fk" FOREIGN KEY ("authorized_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wechat_mobile_login_transactions" ADD CONSTRAINT "wechat_mobile_login_transactions_initiating_user_id_users_id_fk" FOREIGN KEY ("initiating_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wechat_mobile_login_transactions" ADD CONSTRAINT "wechat_mobile_login_transactions_rebind_account_row_id_accounts_id_fk" FOREIGN KEY ("rebind_account_row_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wechat_rebind_claims" ADD CONSTRAINT "wechat_rebind_claims_legacy_account_row_id_accounts_id_fk" FOREIGN KEY ("legacy_account_row_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wechat_rebind_claims" ADD CONSTRAINT "wechat_rebind_claims_source_transaction_id_wechat_mobile_login_transactions_id_fk" FOREIGN KEY ("source_transaction_id") REFERENCES "public"."wechat_mobile_login_transactions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wechat_rebind_claims" ADD CONSTRAINT "wechat_rebind_claims_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wechat_mobile_login_expires_at_idx" ON "wechat_mobile_login_transactions" USING btree ("expires_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wechat_mobile_login_state_expires_at_idx" ON "wechat_mobile_login_transactions" USING btree ("state","expires_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wechat_mobile_login_authorized_user_id_idx" ON "wechat_mobile_login_transactions" USING btree ("authorized_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wechat_rebind_claim_state_apply_before_idx" ON "wechat_rebind_claims" USING btree ("state","apply_before");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "wechat_rebind_claim_source_transaction_unique" ON "wechat_rebind_claims" USING btree ("source_transaction_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wechat_rebind_claim_user_id_idx" ON "wechat_rebind_claims" USING btree ("user_id");
