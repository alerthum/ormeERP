import { sql } from "../src/db/client";

async function checkNevesan() {
  const warehouses = await sql`select id, name from warehouses where name ilike '%Nevesan%'`;
  console.log("Warehouses:", warehouses);
  
  if (warehouses.length > 0) {
    const warehouseId = warehouses[0].id;
    const balances = await sql`select * from warehouse_balances where warehouse_id = ${warehouseId}`;
    console.log("Balances in Nevesan:", balances);

    const movements = await sql`
        select m.*, s.code, s.name as stock_name 
        from stock_movements m
        join stock_cards s on s.id = m.stock_id
        where m.warehouse_id = ${warehouseId}
        order by m.date desc, m.created_at desc
    `;
    console.log("Movements in Nevesan:", movements);
  }
}

checkNevesan().then(() => process.exit());
