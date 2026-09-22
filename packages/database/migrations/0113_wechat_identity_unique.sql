-- Release B only: reconcile all historical WeChat identities before applying.
-- Registration changes from the snapshot gap already shipped in 0112; do not replay them.
CREATE UNIQUE INDEX IF NOT EXISTS "accounts_wechat_identity_unique" ON "accounts" USING btree ("provider_id","account_id") WHERE "accounts"."provider_id" = 'wechat';
