import { createClient } from "@supabase/supabase-js";
import { erpSeed } from "../src/data/seed";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

function toSnakeCase(value: string) {
  return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function toDbValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => toDbValue(item));
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [toSnakeCase(entryKey), toDbValue(entryValue)]),
    );
  }
  return value;
}

async function main() {
  if (!url || !key) {
    console.log("Seed demo data is bundled in src/data/seed.ts.");
    console.log("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to seed Supabase.");
    console.log({
      fabricTypes: erpSeed.fabricTypes.length,
      colors: erpSeed.colors.length,
      warehouses: erpSeed.warehouses.length,
      partners: erpSeed.partners.length,
      stockCards: erpSeed.stockCards.length,
      orders: erpSeed.orders.length,
      parties: erpSeed.parties.length,
      purchaseOrders: erpSeed.purchaseOrders.length,
    });
    return;
  }

  const supabase = createClient(url, key);
  const tables = [
    ["settings_fabric_types", erpSeed.fabricTypes],
    ["settings_colors", erpSeed.colors],
    ["settings_yarn_counts", erpSeed.yarnCounts],
    ["settings_process_types", erpSeed.processTypes],
    ["warehouses", erpSeed.warehouses],
    ["partners", erpSeed.partners],
    ["stock_cards", erpSeed.stockCards],
    ["orders", erpSeed.orders],
    ["parties", erpSeed.parties],
    ["stock_movements", erpSeed.stockMovements],
    ["warehouse_balances", erpSeed.warehouseBalances],
    ["production_raw", erpSeed.productionRaw],
    ["production_dyehouse", erpSeed.productionDyehouse],
    ["transfers", erpSeed.transfers],
    ["purchase_orders", erpSeed.purchaseOrders],
    ["purchase_receipts", erpSeed.purchaseReceipts],
  ] as const;

  for (const [table, rows] of tables) {
    const dbRows = rows.map((row) => toDbValue(row));
    const { error } = await supabase.from(table).upsert(dbRows);
    if (error) throw new Error(`${table}: ${error.message}`);
    console.log(`Seeded ${rows.length} rows into ${table}`);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
