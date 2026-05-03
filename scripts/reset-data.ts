import postgres from "postgres";
import { existsSync, readFileSync } from "node:fs";

function loadLocalEnv() {
  if (!existsSync(".env.local")) return;
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([^#][^=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] = match[2].trim();
  }
}

loadLocalEnv();

const databaseUrl = process.env.DATABASE_URL;

const tables = [
  "user_profiles",
  "roles",
  "sales",
  "purchase_receipts",
  "purchase_orders",
  "transfers",
  "production_dyehouse",
  "production_raw",
  "warehouse_balances",
  "stock_movements",
  "parties",
  "orders",
  "stock_cards",
  "partners",
  "warehouses",
  "settings_process_types",
  "settings_yarn_counts",
  "settings_colors",
  "settings_fabric_types",
  "counters",
];

async function main() {
  if (!databaseUrl || databaseUrl.includes("your-")) {
    console.log("DATABASE_URL is missing. Set .env.local before resetting data.");
    return;
  }

  const sql = postgres(databaseUrl, { ssl: "require", max: 1, prepare: false });
  try {
    await sql.unsafe(`truncate table ${tables.map((table) => `"${table}"`).join(", ")} restart identity cascade`);
    console.log("ERP data reset completed.");
  } finally {
    await sql.end({ timeout: 1 });
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
