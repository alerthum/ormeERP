import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
    throw new Error("DATABASE_URL bulunamadı.");
}

const sql = postgres(databaseUrl, {
    ssl: "require",
    prepare: false,
    max: 1,
});

const tables = [
    "settings_fabric_types",
    "settings_colors",
    "settings_yarn_counts",
    "settings_yarn_types",
    "settings_process_types",
    "warehouses",
    "partners",
    "stock_cards",
    "orders",
    "purchase_orders",
    "purchase_receipts",
    "stock_movements",
    "warehouse_balances",
    "parties",
    "order_party_allocations",
    "production_raw",
    "production_dyehouse",
    "transfers",
    "sales",
    "notifications",
    "roles",
    "user_profiles",
    "counters",
    "ui_settings",
    "audit_logs",
];

async function tableExists(tableName: string) {
    const rows = await sql`
    select exists (
      select 1
      from information_schema.tables
      where table_schema = 'public'
        and table_name = ${tableName}
    ) as exists
  `;

    return Boolean(rows[0]?.exists);
}

async function main() {
    const backup: Record<string, unknown> = {
        meta: {
            createdAt: new Date().toISOString(),
            source: "ERP Supabase PostgreSQL JSON Backup",
            note: "Bu dosya veri taşıma/refactor öncesi alınmıştır.",
        },
        tables: {},
    };

    for (const table of tables) {
        const exists = await tableExists(table);

        if (!exists) {
            console.log(`Atlandı: ${table} tablosu yok.`);
            continue;
        }

        const rows = await sql`
      select *
      from ${sql(table)}
    `;

        (backup.tables as Record<string, unknown>)[table] = rows;
        console.log(`${table}: ${rows.length} kayıt yedeklendi.`);
    }

    const backupDir = path.join(process.cwd(), "backups");
    fs.mkdirSync(backupDir, { recursive: true });

    const fileName = `erp-backup-${new Date()
        .toISOString()
        .replace(/[:.]/g, "-")}.json`;

    const filePath = path.join(backupDir, fileName);

    fs.writeFileSync(filePath, JSON.stringify(backup, null, 2), "utf8");

    await sql.end();

    console.log("");
    console.log(`Yedek oluşturuldu: ${filePath}`);
}

main().catch(async (error) => {
    console.error("Yedek alınırken hata oluştu:", error);
    await sql.end();
    process.exit(1);
});