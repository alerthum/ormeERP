import { sql } from "../src/db/client";

async function fix() {
  await sql`update stock_movements set lot_no = null where id = 'mov-a0ba53f0-00c3-4fe1-91ed-4f511ca81450'`;
  console.log("Fixed movement mov-a0ba53f0-00c3-4fe1-91ed-4f511ca81450");
}

fix().then(() => process.exit());
