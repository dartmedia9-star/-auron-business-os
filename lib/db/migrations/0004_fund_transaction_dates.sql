-- 0004: effective business date on fund ledger rows
--
-- Additive and production-safe:
--   * adds ONE nullable column, backfills it, then sets a default and NOT NULL
--   * never changes amount, transaction_type, fund_account_id or any other
--     existing value, so every fund balance (opening + ledger) is unchanged
--   * idempotent: re-running only fills rows that are still NULL
--   * runs in one transaction; any error rolls everything back
--
-- Backfill priority per row (first match wins), dates in Asia/Kolkata:
--   transfer_in / transfer_out     -> fund_transfers.date
--   expense / expense_reversal     -> operating_expenses.date
--   client_payment                 -> paymentDate written in the same DB
--                                     transaction's audit log (new values),
--                                     else client_payments.payment_date of the
--                                     payment named "#<id>" in the description,
--                                     else the payment created in the same DB
--                                     transaction (same created_at, fund, amount)
--   client_payment_reversal        -> paymentDate of the reversed payment from
--                                     the same DB transaction's audit log (old
--                                     values)
--   anything else / no source date -> created_at (entry date)
--
-- Apply manually (production has no __drizzle_migrations table):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f lib/db/migrations/0004_fund_transaction_dates.sql

BEGIN;

ALTER TABLE "fund_transactions" ADD COLUMN IF NOT EXISTS "transaction_date" date;

-- Fund transfers: the transfer's own date.
UPDATE "fund_transactions" ft
SET "transaction_date" = tr."date"
FROM "fund_transfers" tr
WHERE ft."transaction_date" IS NULL
  AND ft."related_transfer_id" = tr."id"
  AND ft."transaction_type" IN ('transfer_in', 'transfer_out')
  AND tr."date" IS NOT NULL;

-- Expenses and their reversals: the expense date.
UPDATE "fund_transactions" ft
SET "transaction_date" = oe."date"
FROM "operating_expenses" oe
WHERE ft."transaction_date" IS NULL
  AND ft."related_expense_id" = oe."id"
  AND ft."transaction_type" IN ('expense', 'expense_reversal')
  AND oe."date" IS NOT NULL;

-- Client payments: paymentDate recorded in the audit log by the same DB
-- transaction (create or edit). now() is per transaction, so the ledger row
-- and its audit row share the exact created_at.
UPDATE "fund_transactions" ft
SET "transaction_date" = (al."new_values"->>'paymentDate')::date
FROM "audit_logs" al
WHERE ft."transaction_date" IS NULL
  AND ft."transaction_type" = 'client_payment'
  AND al."entity_type" = 'client_payment'
  AND al."action" IN ('create', 'update')
  AND al."created_at" = ft."created_at"
  AND (al."new_values"->>'paymentDate') ~ '^\d{4}-\d{2}-\d{2}$';

-- Client payments: payment referenced as "#<id>" in the description.
UPDATE "fund_transactions" ft
SET "transaction_date" = cp."payment_date"
FROM "client_payments" cp
WHERE ft."transaction_date" IS NULL
  AND ft."transaction_type" = 'client_payment'
  AND substring(ft."description" from '#([0-9]+)') IS NOT NULL
  AND cp."id" = substring(ft."description" from '#([0-9]+)')::int;

-- Client payments: payment row created in the same DB transaction.
UPDATE "fund_transactions" ft
SET "transaction_date" = cp."payment_date"
FROM "client_payments" cp
WHERE ft."transaction_date" IS NULL
  AND ft."transaction_type" = 'client_payment'
  AND cp."created_at" = ft."created_at"
  AND cp."fund_account_id" = ft."fund_account_id"
  AND cp."amount" = ft."amount";

-- Client payment reversals: the reversed payment's date (old values of the
-- update/delete audit entry written in the same DB transaction).
UPDATE "fund_transactions" ft
SET "transaction_date" = (al."old_values"->>'paymentDate')::date
FROM "audit_logs" al
WHERE ft."transaction_date" IS NULL
  AND ft."transaction_type" = 'client_payment_reversal'
  AND al."entity_type" = 'client_payment'
  AND al."action" IN ('update', 'delete')
  AND al."created_at" = ft."created_at"
  AND (al."old_values"->>'paymentDate') ~ '^\d{4}-\d{2}-\d{2}$';

-- Fallback: the entry date (business time zone).
UPDATE "fund_transactions"
SET "transaction_date" = ("created_at" AT TIME ZONE 'Asia/Kolkata')::date
WHERE "transaction_date" IS NULL;

ALTER TABLE "fund_transactions" ALTER COLUMN "transaction_date" SET DEFAULT CURRENT_DATE;
ALTER TABLE "fund_transactions" ALTER COLUMN "transaction_date" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "fund_transactions_transaction_date_idx" ON "fund_transactions" USING btree ("transaction_date");

COMMIT;
