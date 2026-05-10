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

async function cleanupTestData() {
  console.log("🧹 Starting nuclear test data cleanup...");

  try {
    // 1. First, delete everything that has the TEST-AI- prefix in key fields
    await sql.begin(async (tx) => {
      // Collect all possible related IDs before deleting movements
      const testOrderIds = (await tx`select id from orders where order_no like 'TEST-AI-%' or customer_name like 'TEST-AI-%'`).map(r => r.id);
      const testStockIds = (await tx`select id from stock_cards where code like 'TEST-AI-%' or name like 'TEST-AI-%'`).map(r => r.id);
      
      const transactionIds = (await tx`
        select distinct source_transaction_id as id from stock_movements 
        where lot_no like 'TEST-AI-%' 
           or party_no like 'TEST-AI-%' 
           or source_transaction_id like 'TEST-AI-%'
           or reference_id like 'TEST-AI-%'
           or description like 'TEST-AI-%'
      `).map(r => r.id).filter(Boolean);

      // Delete Movements & Balances
      await tx`delete from stock_movements where lot_no like 'TEST-AI-%' or party_no like 'TEST-AI-%' or source_transaction_id = any(${transactionIds})`;
      await tx`delete from warehouse_balances where lot_no like 'TEST-AI-%' or id like 'TEST-AI-%' or id like 'bal-TEST-AI-%'`;

      // Delete Headers (By ID, No, or Description)
      const allPossibleHeaderIds = Array.from(new Set([...transactionIds, ...testOrderIds]));
      if (allPossibleHeaderIds.length > 0) {
        await tx`delete from sales where id = any(${allPossibleHeaderIds}) or sale_no like 'TEST-AI-%'`;
        await tx`delete from production_dyehouse where id = any(${allPossibleHeaderIds}) or description like 'TEST-AI-%'`;
        await tx`delete from production_raw where id = any(${allPossibleHeaderIds}) or description like 'TEST-AI-%'`;
        await tx`delete from transfers where id = any(${allPossibleHeaderIds}) or description like 'TEST-AI-%'`;
        await tx`delete from purchase_receipts where id = any(${allPossibleHeaderIds}) or receipt_no like 'TEST-AI-%'`;
      }

      // Delete Master Data
      await tx`delete from purchase_orders where purchase_order_no like 'TEST-AI-%' or id = any(${allPossibleHeaderIds})`;
      await tx`delete from order_party_allocations where order_id = any(${testOrderIds})`;
      await tx`delete from parties where party_no like 'TEST-AI-%' or order_id = any(${testOrderIds})`;
      await tx`delete from orders where order_no like 'TEST-AI-%' or customer_name like 'TEST-AI-%'`;
      await tx`delete from stock_cards where code like 'TEST-AI-%' or name like 'TEST-AI-%'`;
      await tx`delete from partners where name like 'TEST-AI-%'`;
      await tx`delete from warehouses where name like 'TEST-AI-%'`;
      await tx`delete from settings_process_types where name like 'TEST-AI-%'`;
      await tx`delete from settings_yarn_counts where name like 'TEST-AI-%'`;
      await tx`delete from settings_colors where name like 'TEST-AI-%'`;
      await tx`delete from settings_fabric_types where name like 'TEST-AI-%'`;
    });

    console.log("🧹 Running global orphan cleanup to ensure consistency...");
    // Use the service's cleanOrphanData logic
    const modules = [
      { type: 'production_raw', table: 'production_raw' },
      { type: 'production_dyehouse', table: 'production_dyehouse' },
      { type: 'transfer', table: 'transfers' },
      { type: 'sale', table: 'sales' },
      { type: 'direct_purchase_receipt', table: 'purchase_receipts' }
    ];

    await sql.begin(async (tx) => {
      for (const mod of modules) {
        await tx`
          delete from ${tx(mod.table)} h
          where not exists (
            select 1 from stock_movements m 
            where (m.source_transaction_type = ${mod.type} and m.source_transaction_id = h.id)
               or (m.reference_type = ${mod.type} and m.reference_id = h.id)
          )
        `;
      }
    });

    console.log("✅ Nuclear test data cleanup completed.");
  } catch (error) {
    console.error("❌ Error during cleanup:", error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

cleanupTestData();
