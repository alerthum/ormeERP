const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/postgres');

async function fixSchema() {
  try {
    console.log('Checking parties table columns...');
    const columns = await sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'parties';
    `;
    const colNames = columns.map(c => c.column_name);
    console.log('Current columns in parties:', colNames.join(', '));

    if (!colNames.includes('raw_width')) {
      console.log('Adding raw_width to parties...');
      await sql`ALTER TABLE parties ADD COLUMN raw_width numeric;`;
    }
    if (!colNames.includes('raw_gsm')) {
      console.log('Adding raw_gsm to parties...');
      await sql`ALTER TABLE parties ADD COLUMN raw_gsm numeric;`;
    }

    console.log('Checking production_raw table columns...');
    const rawCols = await sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'production_raw';
    `;
    const rawColNames = rawCols.map(c => c.column_name);
    if (!rawColNames.includes('raw_width')) {
      console.log('Adding raw_width to production_raw...');
      await sql`ALTER TABLE production_raw ADD COLUMN raw_width numeric;`;
    }
    if (!rawColNames.includes('raw_gsm')) {
      console.log('Adding raw_gsm to production_raw...');
      await sql`ALTER TABLE production_raw ADD COLUMN raw_gsm numeric;`;
    }

    console.log('Schema fix completed.');
  } catch (err) {
    console.error('Error fixing schema:', err);
  } finally {
    await sql.end();
  }
}

fixSchema();
