import { sql } from "../src/db/client";

async function checkParez() {
  const warehouses = await sql`select id, name from warehouses where name ilike '%Parez%'`;
  console.log("Warehouses:", warehouses);
  
  if (warehouses.length > 0) {
    const warehouseId = warehouses[0].id;
    const movements = await sql`
        select m.*, s.code, s.name as stock_name 
        from stock_movements m
        join stock_cards s on s.id = m.stock_id
        where m.warehouse_id = ${warehouseId} and s.code = 'IP-000001'
        order by m.date desc, m.created_at desc
    `;
    console.log("Movements in Parez for IP-000001:", movements);
  }
}

checkParez().then(() => process.exit());
