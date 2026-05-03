CREATE TABLE "roles" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "sales" (
	"id" text PRIMARY KEY NOT NULL,
	"sale_no" text NOT NULL,
	"date" date NOT NULL,
	"customer_name" text NOT NULL,
	"warehouse_id" text NOT NULL,
	"stock_id" text NOT NULL,
	"party_id" text NOT NULL,
	"order_id" text,
	"quantity_kg" numeric(14, 3) NOT NULL,
	"unit_price" numeric(14, 3),
	"currency" text DEFAULT 'TRY' NOT NULL,
	"status" text DEFAULT 'Sevk Edildi' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	CONSTRAINT "sales_sale_no_unique" UNIQUE("sale_no")
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"full_name" text NOT NULL,
	"role_id" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_profiles_email_unique" UNIQUE("email")
);
