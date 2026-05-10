import { createFullSnapshot, getLastSnapshotDate, getSnapshotHistory } from "../src/services/snapshot.service";
import { sql } from "../src/db/client";

async function smokeTestSnapshots() {
  console.log("🚀 Starting Financial & Inventory Snapshot Smoke Test...");

  try {
    const testDate = "2026-05-01";

    // 1. Clean existing test snapshot if any (Only for test script)
    await sql`delete from inventory_snapshots where snapshot_date = ${testDate}`;
    await sql`delete from order_snapshots where snapshot_date = ${testDate}`;
    await sql`delete from purchase_order_snapshots where snapshot_date = ${testDate}`;
    await sql`delete from financial_snapshots where snapshot_date = ${testDate}`;

    // 2. Create Snapshot
    console.log(`\nCreating snapshot for ${testDate}...`);
    const result = await createFullSnapshot(testDate);
    console.log("✅ Snapshot created successfully.");

    // 3. Verify Data
    console.log("\nVerifying snapshot data...");
    const [fin] = await sql`select * from financial_snapshots where snapshot_date = ${testDate}`;
    if (!fin) throw new Error("Financial snapshot not found!");
    console.log(`✅ Financial snapshot found: Inventory Kg = ${fin.total_inventory_kg}`);

    const invCount = await sql`select count(*)::int as count from inventory_snapshots where snapshot_date = ${testDate}`;
    console.log(`✅ Inventory snapshots count: ${invCount[0].count}`);

    // 4. Test Immutability (Should Fail)
    console.log("\nTesting Snapshot Immutability (Should Fail)...");
    try {
      await createFullSnapshot(testDate);
      console.error("❌ FAIL: Snapshot was re-created/overwritten!");
    } catch (error: any) {
      console.log("✅ PASS: Immutability guard blocked duplicate: " + error.message);
    }

    // 5. Test History
    const history = await getSnapshotHistory();
    console.log(`✅ History records found: ${history.length}`);

    console.log("\n🚀 Snapshot Smoke Test Completed Successfully!");

  } catch (err) {
    console.error("💥 Smoke test failed with fatal error:", err);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

smokeTestSnapshots();
