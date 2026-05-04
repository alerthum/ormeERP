const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL);

async function run() {
  try {
    console.log('Starting balance repair...');
    
    // 1. Clear current balances
    console.log('Truncating warehouse_balances...');
    await sql`TRUNCATE TABLE warehouse_balances;`;

    // 2. Fetch all movements
    console.log('Fetching movements...');
    const movements = await sql`
      SELECT stock_id, warehouse_id, party_id, lot_no, direction, quantity 
      FROM stock_movements 
      ORDER BY created_at ASC;
    `;

    console.log(`Processing ${movements.length} movements...`);

    for (const m of movements) {
      const delta = m.direction === 'IN' ? Number(m.quantity) : -Number(m.quantity);
      const balanceId = `bal-${m.stock_id}-${m.warehouse_id}-${m.party_id ?? "none"}-${m.lot_no ?? "none"}`;
      
      await sql`
        INSERT INTO warehouse_balances (id, stock_id, warehouse_id, party_id, lot_no, quantity, updated_at)
        VALUES (${balanceId}, ${m.stock_id}, ${m.warehouse_id}, ${m.party_id}, ${m.lot_no}, ${delta}, now())
        ON CONFLICT (id) DO UPDATE
        SET quantity = warehouse_balances.quantity + ${delta},
            updated_at = now()
      `;
    }

    console.log('Balance repair completed successfully.');

    // 3. Show Nevesan balance for IP-000001 (or similar) to verify
    const verify = await sql`
      SELECT w.name as warehouse, s.code as stock, b.quantity, b.lot_no
      FROM warehouse_balances b
      JOIN warehouses w ON w.id = b.warehouse_id
      JOIN stock_cards s ON s.id = b.stock_id
      WHERE b.quantity != 0
      LIMIT 10;
    `;
    console.log('Sample non-zero balances:', verify);

  } catch (err) {
    console.error('Repair failed:', err);
  } finally {
    await sql.end();
  }
}
run();
