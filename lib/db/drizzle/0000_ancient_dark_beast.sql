CREATE TABLE "sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" varchar(64),
	"password_hash" varchar,
	"role" varchar(32) DEFAULT 'admin' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"email" varchar,
	"first_name" varchar,
	"last_name" varchar,
	"profile_image_url" varchar,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"company" text,
	"contact_person" text,
	"phone" text,
	"email" text,
	"location" text,
	"client_type" text DEFAULT 'Corporate' NOT NULL,
	"industry" text,
	"lead_source" text,
	"notes" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_by" text,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"client_id" integer NOT NULL,
	"event_type" text NOT NULL,
	"status" text DEFAULT 'upcoming' NOT NULL,
	"event_date" date NOT NULL,
	"venue" text,
	"location" text,
	"salesperson_id" integer,
	"operations_manager_id" integer,
	"lead_source" text,
	"notes" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_by" text,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_revenue" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" integer NOT NULL,
	"contract_value" numeric(15, 2) DEFAULT '0' NOT NULL,
	"discount" numeric(15, 2) DEFAULT '0' NOT NULL,
	"gst" numeric(15, 2) DEFAULT '0' NOT NULL,
	"total_invoice_value" numeric(15, 2) DEFAULT '0' NOT NULL,
	"net_revenue" numeric(15, 2) DEFAULT '0' NOT NULL,
	"advance_received" numeric(15, 2) DEFAULT '0' NOT NULL,
	"second_payment" numeric(15, 2) DEFAULT '0' NOT NULL,
	"final_payment" numeric(15, 2) DEFAULT '0' NOT NULL,
	"total_collected" numeric(15, 2) DEFAULT '0' NOT NULL,
	"outstanding_amount" numeric(15, 2) DEFAULT '0' NOT NULL,
	"payment_status" text DEFAULT 'pending' NOT NULL,
	"invoice_number" text,
	"due_date" date,
	"created_by" text,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_revenue_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
CREATE TABLE "event_costs" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" integer NOT NULL,
	"vendor_id" integer,
	"category" text NOT NULL,
	"description" text,
	"amount" numeric(15, 2) DEFAULT '0' NOT NULL,
	"gst" numeric(15, 2) DEFAULT '0' NOT NULL,
	"total_amount" numeric(15, 2) DEFAULT '0' NOT NULL,
	"payment_status" text DEFAULT 'pending' NOT NULL,
	"date" date,
	"reference_number" text,
	"created_by" text,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer,
	"contact_name" text NOT NULL,
	"contact_phone" text,
	"contact_email" text,
	"source" text,
	"event_type" text,
	"expected_value" numeric(15, 2),
	"expected_profit" numeric(15, 2),
	"probability" integer,
	"salesperson_id" integer,
	"date_received" date,
	"follow_up_date" date,
	"status" text DEFAULT 'new' NOT NULL,
	"lost_reason" text,
	"notes" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_by" text,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketing_channels" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketing_spend" (
	"id" serial PRIMARY KEY NOT NULL,
	"channel_id" integer NOT NULL,
	"amount" numeric(15, 2) DEFAULT '0' NOT NULL,
	"leads_generated" integer DEFAULT 0 NOT NULL,
	"qualified_leads" integer DEFAULT 0 NOT NULL,
	"customers_acquired" integer DEFAULT 0 NOT NULL,
	"revenue_generated" numeric(15, 2) DEFAULT '0' NOT NULL,
	"gross_profit_generated" numeric(15, 2) DEFAULT '0' NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operating_expenses" (
	"id" serial PRIMARY KEY NOT NULL,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"amount" numeric(15, 2) DEFAULT '0' NOT NULL,
	"gst" numeric(15, 2) DEFAULT '0' NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"date" date,
	"reference_number" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendors" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"contact_person" text,
	"phone" text,
	"email" text,
	"location" text,
	"payment_terms" text,
	"rating" integer,
	"notes" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_by" text,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"purchase_date" date NOT NULL,
	"purchase_cost" numeric(15, 2) DEFAULT '0' NOT NULL,
	"current_book_value" numeric(15, 2),
	"storage_location" text,
	"condition" text DEFAULT 'good' NOT NULL,
	"maintenance_cost" numeric(15, 2) DEFAULT '0' NOT NULL,
	"rental_value" numeric(15, 2),
	"notes" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_by" text,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"department" text NOT NULL,
	"salary" numeric(15, 2),
	"joining_date" date NOT NULL,
	"responsibilities" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "valuation_scenarios" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"scenario_type" text DEFAULT 'custom' NOT NULL,
	"target_valuation" numeric(18, 2) DEFAULT '900000000' NOT NULL,
	"current_revenue" numeric(15, 2) DEFAULT '0' NOT NULL,
	"current_ebitda" numeric(15, 2),
	"current_net_profit" numeric(15, 2),
	"revenue_growth_rate" numeric(8, 4) DEFAULT '0.20' NOT NULL,
	"ebitda_margin" numeric(8, 4) DEFAULT '0.15' NOT NULL,
	"revenue_multiple" numeric(8, 2) DEFAULT '3' NOT NULL,
	"ebitda_multiple" numeric(8, 2) DEFAULT '10' NOT NULL,
	"notes" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"entity_type" text,
	"entity_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_name" text DEFAULT 'Auron Event Productions' NOT NULL,
	"country" text DEFAULT 'India' NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"gst_number" text,
	"gst_rate" numeric(5, 2) DEFAULT '18' NOT NULL,
	"excellent_margin_threshold" numeric(5, 2) DEFAULT '35' NOT NULL,
	"healthy_margin_threshold" numeric(5, 2) DEFAULT '20' NOT NULL,
	"warning_margin_threshold" numeric(5, 2) DEFAULT '10' NOT NULL,
	"ltv_cac_target" numeric(8, 2) DEFAULT '3' NOT NULL,
	"cac_target" numeric(15, 2),
	"valuation_target" numeric(18, 2) DEFAULT '900000000' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"user_email" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" integer NOT NULL,
	"old_values" jsonb,
	"new_values" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_revenue" ADD CONSTRAINT "event_revenue_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_costs" ADD CONSTRAINT "event_costs_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_spend" ADD CONSTRAINT "marketing_spend_channel_id_marketing_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."marketing_channels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "IDX_session_expire" ON "sessions" USING btree ("expire");