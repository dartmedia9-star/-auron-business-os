-- 0005: ledger link to client payments + duplicate-submit protection
--
-- Additive and production-safe:
--   * adds TWO nullable columns and two indexes; drops and rewrites nothing
--   * never changes amount, transaction_type, fund_account_id,
--     transaction_date or description on any row, so every fund balance,
--     receivable and report total is unchanged
--   * the backfill only fills the new link column, from the "#<id>" every
--     client payment ledger row already carries in its description
--   * idempotent: re-running only touches rows whose link is still NULL
--   * runs in one transaction; any error rolls everything back
--
-- fund_transactions.related_client_payment_id deliberately has NO foreign key:
-- reversal rows of a deleted payment keep its id, so the payment's audit trail
-- stays reachable from the ledger.
--
-- Apply manually (production has no __drizzle_migrations table):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f lib/db/migrations/0005_ledger_links_and_idempotency.sql

BEGIN;

ALTER TABLE "fund_transactions" ADD COLUMN IF NOT EXISTS "related_client_payment_id" integer;

CREATE INDEX IF NOT EXISTS "fund_transactions_related_client_payment_id_idx"
  ON "fund_transactions" USING btree ("related_client_payment_id");

-- Link existing client payment ledger rows ("Client payment #12 from ...",
-- "Reversal of client payment #12 (edited)", "Reversal of deleted client
-- payment #12").
UPDATE "fund_transactions"
SET "related_client_payment_id" = substring("description" from '#([0-9]+)')::int
WHERE "related_client_payment_id" IS NULL
  AND "transaction_type" IN ('client_payment', 'client_payment_reversal')
  AND "description" ~ '#[0-9]+';

ALTER TABLE "client_payments" ADD COLUMN IF NOT EXISTS "idempotency_key" text;

CREATE UNIQUE INDEX IF NOT EXISTS "client_payments_idempotency_key_idx"
  ON "client_payments" USING btree ("idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;

COMMIT;
