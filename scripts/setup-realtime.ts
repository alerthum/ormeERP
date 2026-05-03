import { existsSync, readFileSync } from "node:fs";
import postgres from "postgres";

function loadLocalEnv() {
  if (!existsSync(".env.local")) return;
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([^#][^=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] = match[2].trim();
  }
}

loadLocalEnv();

const tables = [
  "settings_fabric_types",
  "settings_colors",
  "settings_yarn_counts",
  "settings_process_types",
  "warehouses",
  "partners",
  "stock_cards",
  "stock_movements",
  "warehouse_balances",
  "orders",
  "parties",
  "production_raw",
  "production_dyehouse",
  "transfers",
  "purchase_orders",
  "purchase_receipts",
  "sales",
  "roles",
  "user_profiles",
];

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured.");
  const sql = postgres(process.env.DATABASE_URL, { ssl: "require", max: 1, prepare: false });
  try {
    for (const table of tables) {
      await sql.unsafe(`alter table "${table}" replica identity full`);
      try {
        await sql.unsafe(`alter publication supabase_realtime add table "${table}"`);
        console.log(`Realtime enabled for ${table}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (!message.includes("already member")) throw error;
        console.log(`Realtime already enabled for ${table}`);
      }
    }
  } finally {
    await sql.end({ timeout: 1 });
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
