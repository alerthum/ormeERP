import { sql } from "../src/db/client";

async function createSnapshotTables() {
  console.log("🚀 Creating Financial & Inventory Snapshot Tables...");

  try {
    await sql.begin(async (tx) => {
      // A) inventory_snapshots
      await tx`
        create table if not exists inventory_snapshots (
          id text primary key,
          snapshot_date date not null,
          stock_id text not null,
          warehouse_id text not null,
          party_id text,
          lot_no text,
          quantity_kg numeric(12,3) not null default 0,
          unit_cost numeric(12,4) default 0,
          total_cost numeric(12,2) default 0,
          created_at timestamp with time zone default now()
        )
      `;
      await tx`create index if not exists idx_inv_snap_date on inventory_snapshots(snapshot_date)`;

      // B) order_snapshots
      await tx`
        create table if not exists order_snapshots (
          id text primary key,
          snapshot_date date not null,
          order_id text not null,
          status text not null,
          ordered_kg numeric(12,3) not null default 0,
          produced_kg numeric(12,3) not null default 0,
          shipped_kg numeric(12,3) not null default 0,
          remaining_kg numeric(12,3) not null default 0,
          created_at timestamp with time zone default now()
        )
      `;
      await tx`create index if not exists idx_ord_snap_date on order_snapshots(snapshot_date)`;

      // C) purchase_order_snapshots
      await tx`
        create table if not exists purchase_order_snapshots (
          id text primary key,
          snapshot_date date not null,
          purchase_order_id text not null,
          status text not null,
          ordered_kg numeric(12,3) not null default 0,
          received_kg numeric(12,3) not null default 0,
          remaining_kg numeric(12,3) not null default 0,
          created_at timestamp with time zone default now()
        )
      `;
      await tx`create index if not exists idx_po_snap_date on purchase_order_snapshots(snapshot_date)`;

      // D) financial_snapshots
      await tx`
        create table if not exists financial_snapshots (
          id text primary key,
          snapshot_date date not null,
          total_inventory_kg numeric(12,3) not null default 0,
          total_inventory_cost numeric(15,2) not null default 0,
          total_open_orders_kg numeric(12,3) not null default 0,
          total_open_purchase_kg numeric(12,3) not null default 0,
          total_waste_kg numeric(12,3) not null default 0,
          created_at timestamp with time zone default now()
        )
      `;
      await tx`create index if not exists idx_fin_snap_date on financial_snapshots(snapshot_date)`;

      console.log("✅ All snapshot tables created successfully.");
    });
  } catch (error) {
    console.error("❌ Error creating snapshot tables:", error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

createSnapshotTables();
