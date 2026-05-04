const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL);

async function run() {
  const stocks = await sql`SELECT id, code, name FROM stock_cards WHERE code = 'IP-000001'`;
  console.log('STOCKS:', JSON.stringify(stocks));

  const warehouses = await sql`SELECT id, name FROM warehouses`;
  console.log('WAREHOUSES:', JSON.stringify(warehouses));

  const orders = await sql`SELECT id, order_no FROM orders LIMIT 10`;
  console.log('ORDERS:', JSON.stringify(orders));

  await sql.end();
}
run();
