import fs from "node:fs";
import postgres from "postgres";

function loadEnvFile() {
  if (!fs.existsSync(".env.local")) return;
  const lines = fs.readFileSync(".env.local", "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index);
    let value = trimmed.slice(index + 1);
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

const suspiciousSegment = /[\u00c2-\u00c5][\u0080-\u00bf\u00c2-\u00c5\u0152\u0153\u0160\u0161\u0178\u017d\u017e\u02c6\u02dc\u2018\u2019\u201a\u201c\u201d\u201e\u2020\u2021\u2022\u2026\u2030\u2039\u203a\u20ac]*/g;
const stillSuspicious = /[\u00c2-\u00c5]/;
const replacementChar = String.fromCharCode(0xfffd);
const cp1252Reverse = new Map<number, number>([
  [0x20ac, 0x80],
  [0x201a, 0x82],
  [0x0192, 0x83],
  [0x201e, 0x84],
  [0x2026, 0x85],
  [0x2020, 0x86],
  [0x2021, 0x87],
  [0x02c6, 0x88],
  [0x2030, 0x89],
  [0x0160, 0x8a],
  [0x2039, 0x8b],
  [0x0152, 0x8c],
  [0x017d, 0x8e],
  [0x2018, 0x91],
  [0x2019, 0x92],
  [0x201c, 0x93],
  [0x201d, 0x94],
  [0x2022, 0x95],
  [0x2013, 0x96],
  [0x2014, 0x97],
  [0x02dc, 0x98],
  [0x2122, 0x99],
  [0x0161, 0x9a],
  [0x203a, 0x9b],
  [0x0153, 0x9c],
  [0x017e, 0x9e],
  [0x0178, 0x9f],
]);

function byteFor(char: string) {
  const code = char.charCodeAt(0);
  return code <= 0xff ? code : cp1252Reverse.get(code) ?? code & 0xff;
}

function decodeSegment(segment: string) {
  let current = segment;
  for (let index = 0; index < 5; index += 1) {
    const bytes = Uint8Array.from(Array.from(current, byteFor));
    const decoded = Buffer.from(bytes).toString("utf8");
    if (decoded === current || decoded.includes(replacementChar)) break;
    current = decoded;
    if (!stillSuspicious.test(current)) break;
  }
  return current;
}

function fixText(value: string) {
  if (!stillSuspicious.test(value)) return value;
  return value.replace(suspiciousSegment, decodeSegment);
}

function fixJson(value: unknown): unknown {
  if (typeof value === "string") return fixText(value);
  if (Array.isArray(value)) return value.map(fixJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, fixJson(entry)]));
  }
  return value;
}

function changedJson(before: unknown, after: unknown) {
  return JSON.stringify(before) !== JSON.stringify(after);
}

async function main() {
  loadEnvFile();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not configured.");

  const sql = postgres(databaseUrl, { ssl: "require", prepare: false, max: 1 });
  let updatedRows = 0;
  let updatedValues = 0;

  try {
    const tables = await sql<{ table_name: string }[]>`
      select table_name
      from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'
      order by table_name
    `;

    for (const table of tables) {
      const columns = await sql<{ column_name: string; data_type: string }[]>`
        select column_name, data_type
        from information_schema.columns
        where table_schema = 'public'
          and table_name = ${table.table_name}
          and data_type in ('text', 'character varying', 'json', 'jsonb')
        order by ordinal_position
      `;
      if (columns.length === 0) continue;

      const rows = await sql.unsafe(
        `select ctid::text as __ctid, ${columns.map((column) => `"${column.column_name}"`).join(", ")} from "${table.table_name}"`,
      );

      for (const row of rows) {
        const updates: Record<string, unknown> = {};
        for (const column of columns) {
          const current = row[column.column_name];
          if (typeof current === "string" && column.data_type !== "json" && column.data_type !== "jsonb") {
            const fixed = fixText(current);
            if (fixed !== current) updates[column.column_name] = fixed;
          } else if (current !== null && (column.data_type === "json" || column.data_type === "jsonb")) {
            const fixed = fixJson(current);
            if (changedJson(current, fixed)) updates[column.column_name] = fixed;
          }
        }

        const entries = Object.entries(updates);
        if (entries.length === 0) continue;

        const assignments = entries.map(([column], index) => `"${column}" = $${index + 1}`).join(", ");
        const values = entries.map(([, value]) => value);
        await sql.unsafe(`update "${table.table_name}" set ${assignments} where ctid = $${entries.length + 1}`, [...values, row.__ctid]);
        updatedRows += 1;
        updatedValues += entries.length;
      }
    }
  } finally {
    await sql.end();
  }

  console.log(`Encoding cleanup completed. Updated rows: ${updatedRows}, updated values: ${updatedValues}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
