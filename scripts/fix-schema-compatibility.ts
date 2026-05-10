import postgres from "postgres";
import * as dotenv from "dotenv";
import * as path from "path";

// Load .env.local
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("❌ DATABASE_URL is not configured in .env.local");
  process.exit(1);
}

const sql = postgres(databaseUrl, { ssl: "require", prepare: false });

async function fixSchema() {
  console.log("🚀 Starting schema compatibility fix...");

  try {
    await sql.begin(async (tx) => {
      // 1. partners table
      console.log("Checking 'partners' table...");
      await tx`alter table partners add column if not exists default_purchase_warehouse_id text`;
      await tx`alter table partners add column if not exists default_transfer_target_warehouse_id text`;
      await tx`alter table partners add column if not exists default_dyehouse_consumption_warehouse_id text`;
      await tx`alter table partners add column if not exists default_sales_warehouse_id text`;

      // 2. user_profiles table
      console.log("Checking 'user_profiles' table...");
      await tx`alter table user_profiles add column if not exists default_purchase_warehouse_id text`;
      await tx`alter table user_profiles add column if not exists default_transfer_target_warehouse_id text`;
      await tx`alter table user_profiles add column if not exists default_dyehouse_consumption_warehouse_id text`;
      await tx`alter table user_profiles add column if not exists default_sales_warehouse_id text`;

      // 3. ui_settings table
      console.log("Checking 'ui_settings' table...");
      await tx`
        create table if not exists ui_settings (
          id text primary key,
          data jsonb not null default '{}'::jsonb
        )
      `;

      // 4. counters table
      console.log("Checking 'counters' table...");
      await tx`
        create table if not exists counters (
          key text primary key,
          prefix text not null,
          current_value integer not null default 0,
          updated_at timestamp with time zone not null default now()
        )
      `;

      // 5. warehouse_balances table
      console.log("Checking 'warehouse_balances' table...");
      await tx`alter table warehouse_balances add column if not exists party_id text`;
      await tx`alter table warehouse_balances add column if not exists lot_no text`;

      // 6. stock_movements table
      console.log("Checking 'stock_movements' table...");
      await tx`alter table stock_movements add column if not exists source_transaction_id text`;
      await tx`alter table stock_movements add column if not exists source_transaction_type text`;
      await tx`alter table stock_movements add column if not exists parent_movement_id text`;
      await tx`alter table stock_movements add column if not exists source_movement_id text`;
      await tx`alter table stock_movements add column if not exists party_no text`;
      await tx`alter table stock_movements add column if not exists lot_no text`;
      await tx`alter table stock_movements add column if not exists supplier_order_id text`;

      console.log("✅ Schema compatibility fix completed successfully.");
    });
  } catch (error) {
    console.error("❌ Error during schema fix:", error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

fixSchema();
