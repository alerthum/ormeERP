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

async function table<T>(name: string): Promise<T[]> {
  const rows = await sql`select * from ${sql(name)} order by id`;
  return rows.map((row) => normalizeObject(row as Row) as T);
}

export async function getErpDataFromDb(): Promise<ErpData> {
  const fabricTypes = await table<ErpData["fabricTypes"][number]>("settings_fabric_types");
  const colors = await table<ErpData["colors"][number]>("settings_colors");
  const yarnCounts = await table<ErpData["yarnCounts"][number]>("settings_yarn_counts");
  const processTypes = await table<ErpData["processTypes"][number]>("settings_process_types");
  const warehouses = await table<ErpData["warehouses"][number]>("warehouses");
  const partners = await table<ErpData["partners"][number]>("partners");
  const stockCards = await table<ErpData["stockCards"][number]>("stock_cards");
  const stockMovements = await table<ErpData["stockMovements"][number]>("stock_movements");
  const warehouseBalances = await table<ErpData["warehouseBalances"][number]>("warehouse_balances");
  const orders = await table<ErpData["orders"][number]>("orders");
  const parties = await table<ErpData["parties"][number]>("parties");
  const productionRaw = await table<ErpData["productionRaw"][number]>("production_raw");
  const productionDyehouse = await table<ErpData["productionDyehouse"][number]>("production_dyehouse");
  const transfers = await table<ErpData["transfers"][number]>("transfers");
  const purchaseOrders = await table<ErpData["purchaseOrders"][number]>("purchase_orders");
  const purchaseReceipts = await table<ErpData["purchaseReceipts"][number]>("purchase_receipts");
  const sales = await table<ErpData["sales"][number]>("sales");
  const roles = await table<ErpData["roles"][number]>("roles");
  const userProfiles = await table<ErpData["userProfiles"][number]>("user_profiles");

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
    sales,
    roles,
    userProfiles,
  };
}
