import { sql } from "../src/db/client";

async function repair() {
  console.log("Starting balance repair...");
  
  // 1. Clear current balances
  await sql`truncate table warehouse_balances`;
  console.log("Cleared balances table.");
  
  // 2. Aggregate movements
  const movements = await sql`
    select stock_id, warehouse_id, party_id, lot_no, sum(case when direction = 'IN' then quantity else -quantity end) as total
    from stock_movements
    group by stock_id, warehouse_id, party_id, lot_no
  `;
  
  console.log(`Found ${movements.length} balance groups.`);
  
  for (const m of movements) {
    const quantity = Number(m.total);
    // We keep balances even if 0, to show history, but user said "0 gösteriyor ama detaya baktığımda tutarsızlık var"
    // Actually, keeping 0 is fine, but the user wants it to BE 0 if it's 0.
    
    const balanceId = `bal-${m.stock_id}-${m.warehouse_id}-${m.party_id ?? "none"}-${m.lot_no ?? "none"}`;
    await sql`
      insert into warehouse_balances (id, stock_id, warehouse_id, party_id, lot_no, quantity, updated_at)
      values (${balanceId}, ${m.stock_id}, ${m.warehouse_id}, ${m.party_id}, ${m.lot_no}, ${quantity}, now())
    `;
  }
  
  // 3. Sync stock_cards current_stock_kg
  await sql`
    update stock_cards s
    set current_stock_kg = coalesce((select sum(quantity) from warehouse_balances where stock_id = s.id), 0),
        updated_at = now()
  `;
  
  console.log("Balance repair complete.");
}

repair().then(() => process.exit());
