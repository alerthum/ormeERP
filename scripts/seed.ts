import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import postgres from "postgres";
import { erpSeed } from "../src/data/seed";

function loadLocalEnv() {
  if (!existsSync(".env.local")) return;
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([^#][^=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] = match[2].trim();
  }
}

loadLocalEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const databaseUrl = process.env.DATABASE_URL;

const tables = [
  ["settings_fabric_types", erpSeed.fabricTypes],
  ["settings_colors", erpSeed.colors],
  ["settings_yarn_counts", erpSeed.yarnCounts],
  ["settings_yarn_types", erpSeed.yarnTypes],
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

function isConfigured(value: string | undefined) {
  return Boolean(value && !value.includes("your-") && !value.includes("example.supabase.co"));
}

function normalizeJsonValues(row: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(row).map(([entryKey, entryValue]) => {
      if (entryValue === undefined) return [entryKey, null];
      if (Array.isArray(entryValue) || (entryValue && typeof entryValue === "object" && !(entryValue instanceof Date))) {
        return [entryKey, JSON.stringify(entryValue)];
      }
      return [entryKey, entryValue];
    }),
  );
}

async function seedViaPostgres() {
  if (!databaseUrl) return false;

  const sql = postgres(databaseUrl, { ssl: "require", max: 1, prepare: false });
  try {
    for (const [table, rows] of tables) {
      const normalizedRows = rows.map((row) => normalizeJsonValues(toDbValue(row) as Record<string, unknown>));
      const allColumns = [...new Set(normalizedRows.flatMap((row) => Object.keys(row)))];
      const dbRows = normalizedRows.map((row) =>
        Object.fromEntries(allColumns.map((column) => [column, row[column] ?? null])),
      );
      if (dbRows.length === 0) continue;
      await sql`
        insert into ${sql(table)} ${sql(dbRows)}
        on conflict (id) do nothing
      `;
      console.log(`Seeded ${rows.length} rows into ${table}`);
    }
  } finally {
    await sql.end({ timeout: 1 });
  }

  return true;
}

async function main() {
  if (!isConfigured(url) || !isConfigured(key)) {
    if (await seedViaPostgres()) return;
    console.log("Seed demo data is bundled in src/data/seed.ts.");
    console.log("Set Supabase API keys or DATABASE_URL to seed Supabase.");
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

  const supabase = createClient(url!, key!);

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
