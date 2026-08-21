CREATE TYPE "public"."request_status" AS ENUM('awaiting_type', 'awaiting_review', 'quoted', 'confirmed', 'awaiting_address', 'awaiting_time', 'scheduled', 'collected', 'completed', 'low_value_queued', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TABLE "bot_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_states" (
	"id" serial PRIMARY KEY NOT NULL,
	"chat_id" text NOT NULL,
	"state" text NOT NULL,
	"request_id" integer,
	"data" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_states_chat_id_unique" UNIQUE("chat_id")
);
--> statement-breakpoint
CREATE TABLE "credit_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"amount" integer NOT NULL,
	"type" text NOT NULL,
	"request_id" integer,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" serial PRIMARY KEY NOT NULL,
	"chat_id" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"username" text,
	"phone" text,
	"invite_code" text,
	"invited_by_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_chat_id_unique" UNIQUE("chat_id"),
	CONSTRAINT "customers_invite_code_unique" UNIQUE("invite_code")
);
--> statement-breakpoint
CREATE TABLE "material_rates" (
	"id" serial PRIMARY KEY NOT NULL,
	"material" text NOT NULL,
	"label" text NOT NULL,
	"price_per_kg" integer NOT NULL,
	"co2_per_kg" numeric(8, 2),
	"active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "material_rates_material_unique" UNIQUE("material")
);
--> statement-breakpoint
CREATE TABLE "pickup_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"status" "request_status" DEFAULT 'awaiting_type' NOT NULL,
	"waste_type" text,
	"photo_file_id" text,
	"photo_local_path" text,
	"estimated_weight_band" text,
	"estimated_weight_kg" numeric(10, 2),
	"estimated_min" integer,
	"estimated_max" integer,
	"quoted_price" integer,
	"province" text,
	"city" text,
	"address" text,
	"location_lat" numeric(10, 7),
	"location_lng" numeric(10, 7),
	"phone" text,
	"preferred_time" text,
	"final_weight_kg" numeric(10, 2),
	"final_price" integer,
	"reward_percent" integer DEFAULT 12,
	"reward_amount" integer,
	"co2_saved_kg" numeric(10, 2),
	"rating" integer,
	"referral_bonus_granted" boolean DEFAULT false NOT NULL,
	"admin_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"quoted_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"scheduled_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "request_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"request_id" integer NOT NULL,
	"status" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickup_requests" ADD CONSTRAINT "pickup_requests_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_events" ADD CONSTRAINT "request_events_request_id_pickup_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."pickup_requests"("id") ON DELETE cascade ON UPDATE no action;