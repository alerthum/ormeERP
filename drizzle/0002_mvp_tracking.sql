CREATE TABLE IF NOT EXISTS "settings_yarn_types" (
  "id" text PRIMARY KEY NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  CONSTRAINT "settings_yarn_types_code_unique" UNIQUE("code")
);
--> statement-breakpoint
INSERT INTO "settings_yarn_types" ("id", "code", "name", "is_active")
VALUES ('yt-oe', 'OE', 'Open End', true)
ON CONFLICT ("code") DO UPDATE
  SET "name" = excluded."name",
      "is_active" = true;
--> statement-breakpoint
ALTER TABLE "stock_cards" ADD COLUMN IF NOT EXISTS "yarn_type_id" text;
--> statement-breakpoint
ALTER TABLE "stock_movements" ADD COLUMN IF NOT EXISTS "lot_no" text;
--> statement-breakpoint
ALTER TABLE "warehouse_balances" ADD COLUMN IF NOT EXISTS "lot_no" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "order_party_allocations" (
  "id" text PRIMARY KEY NOT NULL,
  "order_id" text NOT NULL,
  "party_id" text NOT NULL,
  "allocated_kg" numeric(14, 3) DEFAULT '0' NOT NULL,
  "produced_raw_kg" numeric(14, 3) DEFAULT '0' NOT NULL,
  "produced_finished_kg" numeric(14, 3) DEFAULT '0' NOT NULL,
  "shipped_kg" numeric(14, 3) DEFAULT '0' NOT NULL,
  "status" text DEFAULT 'Aktif' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notifications" (
  "id" text PRIMARY KEY NOT NULL,
  "type" text NOT NULL,
  "title" text NOT NULL,
  "message" text NOT NULL,
  "severity" text NOT NULL,
  "related_type" text,
  "related_id" text,
  "is_read" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
