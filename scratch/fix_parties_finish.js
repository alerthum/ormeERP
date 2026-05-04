const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL);

async function run() {
  try {
    const tables = ['parties', 'production_dyehouse'];
    for (const table of tables) {
      const columns = await sql`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = ${table};
      `;
      console.log(`Columns in ${table}:`, columns.map(c => c.column_name).join(', '));
    }

    console.log('Adding finish_width and finish_gsm to parties...');
    await sql`ALTER TABLE parties ADD COLUMN IF NOT EXISTS finish_width numeric;`;
    await sql`ALTER TABLE parties ADD COLUMN IF NOT EXISTS finish_gsm numeric;`;
    
    console.log('Final columns in parties:');
    const finalCols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'parties';`;
    console.log(finalCols.map(c => c.column_name).join(', '));

  } catch (err) {
    console.error(err);
  } finally {
    await sql.end();
  }
}
run();
