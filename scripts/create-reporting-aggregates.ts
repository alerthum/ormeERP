import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

async function createReportingAggregates() {
  console.log("🚀 Creating reporting aggregate tables...");

  const { sql } = await import("../src/db/client");

  try {
    await sql.begin(async (tx) => {
      console.log("🗑️ Dropping existing aggregate tables...");
      await tx`drop table if exists report_daily_stock_summary cascade`;
      await tx`drop table if exists report_daily_order_summary cascade`;
      await tx`drop table if exists report_daily_purchase_summary cascade`;
      await tx`drop table if exists report_daily_waste_summary cascade`;

      // A) report_daily_stock_summary
      await tx`
        create table if not exists report_daily_stock_summary (
          id uuid primary key default gen_random_uuid(),
          report_date date not null,
          stock_id text not null,
          stock_code text,
          stock_name text,
          total_in_kg numeric(15,3) default 0,
          total_out_kg numeric(15,3) default 0,
          net_kg numeric(15,3) default 0,
          warehouse_count integer default 0,
          created_at timestamp with time zone default now()
        )
      `;
      await tx`create index if not exists idx_report_stock_date on report_daily_stock_summary(report_date)`;
      await tx`create index if not exists idx_report_stock_id on report_daily_stock_summary(stock_id)`;

      // B) report_daily_order_summary
      await tx`
        create table if not exists report_daily_order_summary (
          id uuid primary key default gen_random_uuid(),
          report_date date not null,
          order_id text not null,
          customer_name text,
          ordered_kg numeric(15,3) default 0,
          raw_produced_kg numeric(15,3) default 0,
          dyehouse_kg numeric(15,3) default 0,
          shipped_kg numeric(15,3) default 0,
          remaining_kg numeric(15,3) default 0,
          status text,
          created_at timestamp with time zone default now(),
          unique(report_date, order_id)
        )
      `;
      await tx`create index if not exists idx_report_order_date on report_daily_order_summary(report_date)`;
      await tx`create index if not exists idx_report_order_id on report_daily_order_summary(order_id)`;

      // C) report_daily_purchase_summary
      await tx`
        create table if not exists report_daily_purchase_summary (
          id uuid primary key default gen_random_uuid(),
          report_date date not null,
          purchase_order_id text not null,
          supplier_id text,
          ordered_kg numeric(15,3) default 0,
          received_kg numeric(15,3) default 0,
          remaining_kg numeric(15,3) default 0,
          status text,
          created_at timestamp with time zone default now(),
          unique(report_date, purchase_order_id)
        )
      `;
      await tx`create index if not exists idx_report_purchase_date on report_daily_purchase_summary(report_date)`;
      await tx`create index if not exists idx_report_purchase_id on report_daily_purchase_summary(purchase_order_id)`;

      // D) report_daily_waste_summary
      await tx`
        create table if not exists report_daily_waste_summary (
          id uuid primary key default gen_random_uuid(),
          report_date date not null,
          raw_waste_kg numeric(15,3) default 0,
          dyehouse_waste_kg numeric(15,3) default 0,
          total_waste_kg numeric(15,3) default 0,
          created_at timestamptz default now(),
          unique(report_date)
        )
      `;

      console.log("✅ Reporting aggregate tables created successfully.");
    });
  } catch (error) {
    console.error("❌ Error creating reporting aggregate tables:", error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

createReportingAggregates();
