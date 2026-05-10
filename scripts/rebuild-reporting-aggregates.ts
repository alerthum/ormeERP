import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

async function main() {
  const { sql } = await import("../src/db/client");
  const { rebuildAllReportingAggregates } = await import("../src/services/reporting-aggregate.service");

  console.log("🚀 Starting reporting aggregates rebuild...");

  try {
    await sql.begin(async (tx) => {
      await rebuildAllReportingAggregates(tx);
    });
    console.log("✨ Rebuild process finished successfully.");
  } catch (error) {
    console.error("❌ Rebuild failed:", error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

main();
