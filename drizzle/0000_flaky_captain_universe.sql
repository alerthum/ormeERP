CREATE TABLE "settings_colors" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "counters" (
	"key" text PRIMARY KEY NOT NULL,
	"prefix" text NOT NULL,
	"current_value" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings_fabric_types" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" text PRIMARY KEY NOT NULL,
	"order_no" text NOT NULL,
	"customer_name" text NOT NULL,
	"order_date" date NOT NULL,
	"due_date" date NOT NULL,
	"fabric_type_id" text NOT NULL,
	"color_id" text NOT NULL,
	"yarn_count_id" text NOT NULL,
	"has_polyester" boolean DEFAULT false NOT NULL,
	"has_lycra" boolean DEFAULT false NOT NULL,
	"raw_width" integer NOT NULL,
	"raw_gsm" integer NOT NULL,
	"finish_width" integer NOT NULL,
	"finish_gsm" integer NOT NULL,
	"quantity_kg" numeric(14, 3) NOT NULL,
	"ym_stock_id" text,
	"mm_stock_id" text,
	"status" text NOT NULL,
	"process_type_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_order_no_unique" UNIQUE("order_no")
);
--> statement-breakpoint
CREATE TABLE "parties" (
	"id" text PRIMARY KEY NOT NULL,
	"party_no" text NOT NULL,
	"order_id" text NOT NULL,
	"ym_stock_id" text NOT NULL,
	"mm_stock_id" text NOT NULL,
	"status" text NOT NULL,
	"raw_produced_kg" numeric(14, 3) DEFAULT '0' NOT NULL,
	"raw_consumed_kg" numeric(14, 3) DEFAULT '0' NOT NULL,
	"raw_waste_kg" numeric(14, 3) DEFAULT '0' NOT NULL,
	"raw_waste_percent" numeric(8, 3) DEFAULT '0' NOT NULL,
	"dyehouse_input_kg" numeric(14, 3) DEFAULT '0' NOT NULL,
	"finished_kg" numeric(14, 3) DEFAULT '0' NOT NULL,
	"dyehouse_waste_kg" numeric(14, 3) DEFAULT '0' NOT NULL,
	"dyehouse_waste_percent" numeric(8, 3) DEFAULT '0' NOT NULL,
	"current_warehouse_id" text,
	"timeline" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "parties_party_no_unique" UNIQUE("party_no")
);
--> statement-breakpoint
CREATE TABLE "partners" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"risk_score" integer DEFAULT 0,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings_process_types" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "production_dyehouse" (
	"id" text PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"order_id" text NOT NULL,
	"party_id" text NOT NULL,
	"dyehouse_partner_id" text NOT NULL,
	"input_warehouse_id" text NOT NULL,
	"output_warehouse_id" text NOT NULL,
	"ym_stock_id" text NOT NULL,
	"mm_stock_id" text NOT NULL,
	"input_raw_kg" numeric(14, 3) NOT NULL,
	"finished_kg" numeric(14, 3) NOT NULL,
	"waste_kg" numeric(14, 3) NOT NULL,
	"waste_percent" numeric(8, 3) NOT NULL,
	"process_type_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"finish_width" integer NOT NULL,
	"finish_gsm" integer NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "production_raw" (
	"id" text PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"order_id" text NOT NULL,
	"party_id" text NOT NULL,
	"knitter_partner_id" text NOT NULL,
	"warehouse_id" text NOT NULL,
	"ym_stock_id" text NOT NULL,
	"produced_raw_kg" numeric(14, 3) NOT NULL,
	"consumed_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"waste_kg" numeric(14, 3) NOT NULL,
	"waste_percent" numeric(8, 3) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"purchase_order_no" text NOT NULL,
	"supplier_id" text NOT NULL,
	"order_date" date NOT NULL,
	"due_date" date NOT NULL,
	"status" text NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"total_ordered_kg" numeric(14, 3) NOT NULL,
	"total_received_kg" numeric(14, 3) NOT NULL,
	"total_remaining_kg" numeric(14, 3) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_orders_purchase_order_no_unique" UNIQUE("purchase_order_no")
);
--> statement-breakpoint
CREATE TABLE "purchase_receipts" (
	"id" text PRIMARY KEY NOT NULL,
	"purchase_order_id" text NOT NULL,
	"receipt_no" text NOT NULL,
	"receipt_date" date NOT NULL,
	"warehouse_id" text NOT NULL,
	"supplier_id" text NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	CONSTRAINT "purchase_receipts_receipt_no_unique" UNIQUE("receipt_no")
);
--> statement-breakpoint
CREATE TABLE "stock_cards" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"fabric_type_id" text,
	"color_id" text,
	"yarn_count_id" text,
	"has_polyester" boolean DEFAULT false NOT NULL,
	"has_lycra" boolean DEFAULT false NOT NULL,
	"raw_width" integer,
	"raw_gsm" integer,
	"finish_width" integer,
	"finish_gsm" integer,
	"unit" text DEFAULT 'kg' NOT NULL,
	"current_stock_kg" numeric(14, 3) DEFAULT '0' NOT NULL,
	"critical_stock_kg" numeric(14, 3) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "stock_cards_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" text PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"stock_id" text NOT NULL,
	"warehouse_id" text NOT NULL,
	"party_id" text,
	"order_id" text,
	"movement_type" text NOT NULL,
	"direction" text NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"unit" text DEFAULT 'kg' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"reference_type" text NOT NULL,
	"reference_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text
);
--> statement-breakpoint
CREATE TABLE "transfers" (
	"id" text PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"from_warehouse_id" text NOT NULL,
	"to_warehouse_id" text NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warehouse_balances" (
	"id" text PRIMARY KEY NOT NULL,
	"stock_id" text NOT NULL,
	"warehouse_id" text NOT NULL,
	"party_id" text,
	"quantity" numeric(14, 3) DEFAULT '0' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warehouses" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings_yarn_counts" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
