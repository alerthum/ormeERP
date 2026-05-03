import { sql } from "@/db/client";
import type { ErpData } from "@/types/erp";

type Row = Record<string, unknown>;

const numericKeys = new Set([
  "rawProducedKg",
  "rawConsumedKg",
  "rawWasteKg",
  "rawWastePercent",
  "dyehouseInputKg",
  "finishedKg",
  "dyehouseWasteKg",
  "dyehouseWastePercent",
  "quantity",
  "quantityKg",
  "currentStockKg",
  "criticalStockKg",
  "producedRawKg",
  "wasteKg",
  "wastePercent",
  "inputRawKg",
  "totalOrderedKg",
  "totalReceivedKg",
  "totalRemainingKg",
  "orderedKg",
  "receivedKg",
  "remainingKg",
  "unitPrice",
  "quantityKg",
  "riskScore",
  "rawWidth",
  "rawGsm",
  "finishWidth",
  "finishGsm",
]);

function camelKey(key: string) {
  return key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function normalizeValue(key: string, value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((item) => normalizeObject(item as Row));
  if (typeof value === "object" && !(value instanceof Date)) return normalizeObject(value as Row);
  if (value instanceof Date) return value.toISOString();
  if (numericKeys.has(key) && typeof value === "string") return Number(value);
  return value;
}

function normalizeObject(row: Row) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => {
      const camel = camelKey(key);
      return [camel, normalizeValue(camel, value)];
    }),
  );
}

async function ensureCountersTable() {
  await sql`
    create table if not exists counters (
      key text primary key,
      prefix text not null,
      current_value integer not null default 0,
      updated_at timestamptz not null default now()
    )
  `;
}

export async function getErpDataFromDb(): Promise<ErpData> {
  await ensureCountersTable();

  const rows = await sql`
    select
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from settings_fabric_types t), '[]'::jsonb) as fabric_types,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from settings_colors t), '[]'::jsonb) as colors,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from settings_yarn_counts t), '[]'::jsonb) as yarn_counts,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from settings_process_types t), '[]'::jsonb) as process_types,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from warehouses t), '[]'::jsonb) as warehouses,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from partners t), '[]'::jsonb) as partners,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from stock_cards t), '[]'::jsonb) as stock_cards,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from stock_movements t), '[]'::jsonb) as stock_movements,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from warehouse_balances t), '[]'::jsonb) as warehouse_balances,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from orders t), '[]'::jsonb) as orders,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from parties t), '[]'::jsonb) as parties,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from production_raw t), '[]'::jsonb) as production_raw,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from production_dyehouse t), '[]'::jsonb) as production_dyehouse,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from transfers t), '[]'::jsonb) as transfers,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from purchase_orders t), '[]'::jsonb) as purchase_orders,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from purchase_receipts t), '[]'::jsonb) as purchase_receipts,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from sales t), '[]'::jsonb) as sales,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from roles t), '[]'::jsonb) as roles,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from user_profiles t), '[]'::jsonb) as user_profiles,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.key) from counters t), '[]'::jsonb) as counters
  `;

  return normalizeObject(rows[0] as Row) as unknown as ErpData;
}
