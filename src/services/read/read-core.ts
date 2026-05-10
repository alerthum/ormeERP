import { sql } from "@/db/client";
import { emptyErpData } from "@/data/empty";
import type { ErpData } from "@/types/erp";

export type Row = Record<string, unknown>;

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
            return value;
        }
    }

    if (numericKeys.has(key) && typeof value === "string") return Number(value);

    return value;
}

export function normalizeObject(row: Row) {
    return Object.fromEntries(
        Object.entries(row).map(([key, value]) => {
            const camel = camelKey(key);
            return [camel, normalizeValue(camel, value)];
        }),
    );
}

export function withErpDefaults(partial: Partial<ErpData>): ErpData {
    return {
        ...emptyErpData,
        ...partial,
    } as ErpData;
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

        await sql`
      insert into ui_settings (id, data)
      values ('global', ${JSON.stringify(defaults)}::jsonb)
    `;
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

export async function ensureReadBasics() {
    await ensureCountersTable();
    await ensureUISettingsTable();
}