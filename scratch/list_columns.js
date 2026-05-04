const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL);

async function run() {
  const tables = ['stock_cards', 'warehouses', 'orders'];
  for (const table of tables) {
    const columns = await sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = ${table};
    `;
    console.log(`Columns in ${table}:`, columns.map(c => c.column_name).join(', '));
  }
  await sql.end();
}
run();
