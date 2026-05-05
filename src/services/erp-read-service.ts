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
  "allocatedKg",
  "producedFinishedKg",
  "shippedKg",
]);

function camelKey(key: string) {
  return key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function normalizeValue(key: string, value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((item) => normalizeObject(item as Row));
  if (typeof value === "object" && !(value instanceof Date)) return normalizeObject(value as Row);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && (value.trim().startsWith("[") || value.trim().startsWith("{"))) {
    try {
      return normalizeValue(key, JSON.parse(value));
    } catch {
      // Keep the original text when it is not actually JSON.
    }
  }
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

async function ensureUISettingsTable() {
  await sql`
    create table if not exists ui_settings (
      id text primary key,
      data jsonb not null
    )
  `;
  const rows = await sql`select count(*) from ui_settings`;
  if (Number(rows[0].count) === 0) {
    const defaults = {
      menuMode: "collapsible",
      submenuDefaultState: "open",
      modalPosition: "right",
      modalPositionMobile: "bottom",
      notificationsEnabled: true,
      notificationModules: ["siparişler", "üretim", "stok", "satın alma", "sevkiyat"],
      maxNotificationCount: 10,
      showCriticalStock: true,
      showDelayedOrders: true,
      showProductionAlerts: true,
      sidebarGroupBg: "#f8fafc",
      sidebarGroupText: "#64748b",
    };
    await sql`insert into ui_settings (id, data) values ('global', ${JSON.stringify(defaults)}::jsonb)`;
  }
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
  await ensureUISettingsTable();

  const rows = await sql`
    select
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from settings_fabric_types t), '[]'::jsonb) as fabric_types,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from settings_colors t), '[]'::jsonb) as colors,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from settings_yarn_counts t), '[]'::jsonb) as yarn_counts,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.code) from settings_yarn_types t), '[]'::jsonb) as yarn_types,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from settings_process_types t), '[]'::jsonb) as process_types,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from warehouses t), '[]'::jsonb) as warehouses,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from partners t), '[]'::jsonb) as partners,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from stock_cards t), '[]'::jsonb) as stock_cards,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from stock_movements t), '[]'::jsonb) as stock_movements,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from warehouse_balances t), '[]'::jsonb) as warehouse_balances,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from orders t), '[]'::jsonb) as orders,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from parties t), '[]'::jsonb) as parties,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from order_party_allocations t), '[]'::jsonb) as order_party_allocations,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from production_raw t), '[]'::jsonb) as production_raw,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from production_dyehouse t), '[]'::jsonb) as production_dyehouse,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from transfers t), '[]'::jsonb) as transfers,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from purchase_orders t), '[]'::jsonb) as purchase_orders,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from purchase_receipts t), '[]'::jsonb) as purchase_receipts,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from sales t), '[]'::jsonb) as sales,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from notifications t), '[]'::jsonb) as notifications,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from roles t), '[]'::jsonb) as roles,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from user_profiles t), '[]'::jsonb) as user_profiles,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.key) from counters t), '[]'::jsonb) as counters,
      (select data from ui_settings where id = 'global' limit 1) as ui_settings
  `;

  return normalizeObject(rows[0] as Row) as unknown as ErpData;
}
