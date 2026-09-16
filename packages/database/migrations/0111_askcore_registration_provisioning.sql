-- Additive registration protocol only. Never backfill historical users.
-- Rollback pauses the consumer; retain these tables and triggers for recovery.
CREATE TABLE IF NOT EXISTS "registration_intents" (
  "id" text PRIMARY KEY,
  "kind" text NOT NULL CHECK ("kind" IN ('ordinary', 'invitation')),
  "invitation_ciphertext" text,
  "return_path" text NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "claimed_user" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "registration_magic_contexts" (
  "token_hash" text PRIMARY KEY,
  "intent_id" text NOT NULL REFERENCES "registration_intents"("id"),
  "expires_at" timestamptz NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "registration_intent_id" text REFERENCES "registration_intents"("id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "registration_provisioning_jobs" (
  "user_id" text PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "intent_id" text REFERENCES "registration_intents"("id"),
  "auth_ready_at" timestamptz,
  "state" text NOT NULL CONSTRAINT "registration_jobs_state_check" CHECK
    ("state" IN ('awaiting_intent', 'awaiting_auth', 'ready', 'leased', 'retry', 'identity_conflict', 'completed')),
  "attempt" integer NOT NULL DEFAULT 0,
  "next_attempt_at" timestamptz NOT NULL DEFAULT now(),
  "lease_token" text,
  "lease_until" timestamptz,
  "subject_digest" text,
  "identity_link_version" text,
  "moodle_done_version" text,
  "gibbon_done_version" text,
  "failure_code" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "registration_jobs_due_idx" ON "registration_provisioning_jobs" ("state", "next_attempt_at");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "askcore_registration_user_created"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.registration_intent_id IS NOT NULL THEN
    UPDATE registration_intents SET claimed_user = NEW.id
    WHERE id = NEW.registration_intent_id
      AND claimed_user IS NULL AND expires_at > clock_timestamp();
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'registration_intent_unavailable';
    END IF;
  END IF;
  INSERT INTO registration_provisioning_jobs(user_id, intent_id, state)
  VALUES (NEW.id, NEW.registration_intent_id,
    CASE WHEN NEW.registration_intent_id IS NULL THEN 'awaiting_intent' ELSE 'awaiting_auth' END);
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE OR REPLACE TRIGGER "askcore_registration_user_created" AFTER INSERT ON "users"
FOR EACH ROW EXECUTE FUNCTION "askcore_registration_user_created"();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "askcore_registration_authenticated"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.impersonated_by IS NULL AND NEW.expires_at > clock_timestamp() THEN
    UPDATE registration_provisioning_jobs
    SET auth_ready_at = COALESCE(auth_ready_at, clock_timestamp()),
        state = CASE WHEN state = 'awaiting_auth' AND intent_id IS NOT NULL THEN 'ready' ELSE state END,
        updated_at = clock_timestamp()
    WHERE user_id = NEW.user_id AND auth_ready_at IS NULL;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE OR REPLACE TRIGGER "askcore_registration_authenticated" AFTER INSERT ON "auth_sessions"
FOR EACH ROW EXECUTE FUNCTION "askcore_registration_authenticated"();
