--> statement-breakpoint
CREATE TABLE "fund_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"opening_balance" numeric(15, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fund_transfers" (
	"id" serial PRIMARY KEY NOT NULL,
	"from_account_id" integer NOT NULL,
	"to_account_id" integer NOT NULL,
	"amount" numeric(15, 2) DEFAULT '0' NOT NULL,
	"date" date,
	"description" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fund_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"fund_account_id" integer NOT NULL,
	"transaction_type" text NOT NULL,
	"amount" numeric(15, 2) DEFAULT '0' NOT NULL,
	"description" text,
	"related_expense_id" integer,
	"related_transfer_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"content" text NOT NULL,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "operating_expenses" ADD COLUMN "paid_by" text;
--> statement-breakpoint
ALTER TABLE "operating_expenses" ADD COLUMN "payment_method" text;
--> statement-breakpoint
CREATE INDEX "fund_accounts_name_idx" ON "fund_accounts" USING btree ("name");
--> statement-breakpoint
CREATE INDEX "fund_transfers_from_to_idx" ON "fund_transfers" USING btree ("from_account_id", "to_account_id");
--> statement-breakpoint
CREATE INDEX "fund_transactions_fk_idx" ON "fund_transactions" USING btree ("fund_account_id");
--> statement-breakpoint
CREATE INDEX "fund_transactions_transfer_fk_idx" ON "fund_transactions" USING btree ("related_transfer_id");
--> statement-breakpoint
CREATE INDEX "fund_transactions_expense_fk_idx" ON "fund_transactions" USING btree ("related_expense_id");
--> statement-breakpoint
CREATE INDEX "notes_pinned_idx" ON "notes" USING btree ("is_pinned" DESC, "created_at" DESC);