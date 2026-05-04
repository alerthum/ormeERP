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

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl || databaseUrl.includes("your-")) {
    console.log("DATABASE_URL bulunamadı. Migration atlandı.");
    return;
  }

  const sql = postgres(databaseUrl, { ssl: "require", max: 1, prepare: false });
  try {
    const content = readFileSync("drizzle/0002_mvp_tracking.sql", "utf8");
    const statements = content
      .split("--> statement-breakpoint")
      .map((statement) => statement.trim())
      .filter(Boolean);

    for (const statement of statements) {
      await sql.unsafe(statement);
    }
    console.log("MVP tracking migration uygulandı.");
  } finally {
    await sql.end({ timeout: 1 });
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
