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

async function table<T>(name: string): Promise<T[]> {
  const rows = await sql`select * from ${sql(name)} order by id`;
  return rows.map((row) => normalizeObject(row as Row) as T);
}

export async function getErpDataFromDb(): Promise<ErpData> {
  const [
    fabricTypes,
    colors,
    yarnCounts,
    processTypes,
    warehouses,
    partners,
    stockCards,
    stockMovements,
    warehouseBalances,
    orders,
    parties,
    productionRaw,
    productionDyehouse,
    transfers,
    purchaseOrders,
    purchaseReceipts,
  ] = await Promise.all([
    table<ErpData["fabricTypes"][number]>("settings_fabric_types"),
    table<ErpData["colors"][number]>("settings_colors"),
    table<ErpData["yarnCounts"][number]>("settings_yarn_counts"),
    table<ErpData["processTypes"][number]>("settings_process_types"),
    table<ErpData["warehouses"][number]>("warehouses"),
    table<ErpData["partners"][number]>("partners"),
    table<ErpData["stockCards"][number]>("stock_cards"),
    table<ErpData["stockMovements"][number]>("stock_movements"),
    table<ErpData["warehouseBalances"][number]>("warehouse_balances"),
    table<ErpData["orders"][number]>("orders"),
    table<ErpData["parties"][number]>("parties"),
    table<ErpData["productionRaw"][number]>("production_raw"),
    table<ErpData["productionDyehouse"][number]>("production_dyehouse"),
    table<ErpData["transfers"][number]>("transfers"),
    table<ErpData["purchaseOrders"][number]>("purchase_orders"),
    table<ErpData["purchaseReceipts"][number]>("purchase_receipts"),
  ]);

  return {
    fabricTypes,
    colors,
    yarnCounts,
    processTypes,
    warehouses,
    partners,
    stockCards,
    stockMovements,
    warehouseBalances,
    orders,
    parties,
    productionRaw,
    productionDyehouse,
    transfers,
    purchaseOrders,
    purchaseReceipts,
  };
}
