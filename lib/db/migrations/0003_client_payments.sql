--> statement-breakpoint
CREATE TABLE "client_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"payment_date" date NOT NULL,
	"fund_account_id" integer NOT NULL,
	"payment_method" text,
	"reference" text,
	"notes" text,
	"created_by" text,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_allocations" (
	"id" serial PRIMARY KEY NOT NULL,
	"payment_id" integer NOT NULL,
	"event_id" integer NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client_payments" ADD CONSTRAINT "client_payments_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "client_payments" ADD CONSTRAINT "client_payments_fund_account_id_fund_accounts_id_fk" FOREIGN KEY ("fund_account_id") REFERENCES "public"."fund_accounts"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_client_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."client_payments"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "client_payments_client_id_idx" ON "client_payments" USING btree ("client_id");
--> statement-breakpoint
CREATE INDEX "client_payments_fund_account_id_idx" ON "client_payments" USING btree ("fund_account_id");
--> statement-breakpoint
CREATE INDEX "client_payments_payment_date_idx" ON "client_payments" USING btree ("payment_date");
--> statement-breakpoint
CREATE INDEX "payment_allocations_payment_id_idx" ON "payment_allocations" USING btree ("payment_id");
--> statement-breakpoint
CREATE INDEX "payment_allocations_event_id_idx" ON "payment_allocations" USING btree ("event_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "payment_allocations_payment_event_idx" ON "payment_allocations" USING btree ("payment_id", "event_id");
