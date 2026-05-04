const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL);

async function run() {
  const rows = await sql`
    SELECT date, movement_type, direction, quantity, lot_no, reference_type, reference_id
    FROM stock_movements
    WHERE warehouse_id = (SELECT id FROM warehouses WHERE name = 'Nevesan Depo' LIMIT 1)
    ORDER BY created_at ASC;
  `;
  console.table(rows);
  await sql.end();
}
run();
