import fs from "node:fs";
import postgres from "postgres";

function loadEnvFile() {
  if (!fs.existsSync(".env.local")) return;
  for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index);
    let value = trimmed.slice(index + 1);
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!process.env[key]) process.env[key] = value;
  }
}

function parseArray(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) return value as Array<Record<string, unknown>>;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed as Array<Record<string, unknown>> : [];
    } catch {
      return [];
    }
  }
  return [];
}

function stripLegacyItem(item: Record<string, unknown>) {
  const next = { ...item };
  delete next["0"];
  return next;
}

async function main() {
  loadEnvFile();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not configured.");
  const sql = postgres(databaseUrl, { ssl: "require", prepare: false, max: 1 });
  const asJson = (value: unknown) => value as Parameters<typeof sql.json>[0];
  let fixedOrders = 0;
  let fixedReceipts = 0;

  try {
    const receipts = await sql`
      select r.id, r.purchase_order_id, r.items
      from purchase_receipts r
      order by r.created_at
    `;
    const receiptStockByOrder = new Map<string, string>();
    for (const receipt of receipts) {
      const items = parseArray(receipt.items).map(stripLegacyItem);
      if (JSON.stringify(items) !== JSON.stringify(receipt.items)) {
        await sql`update purchase_receipts set items = ${sql.json(asJson(items))} where id = ${String(receipt.id)}`;
        fixedReceipts += 1;
      }
      const stockId = items.find((item) => item.stockId)?.stockId;
      if (stockId) receiptStockByOrder.set(String(receipt.purchase_order_id), String(stockId));
    }

    const orders = await sql`
      select id, items, total_ordered_kg, total_received_kg
      from purchase_orders
      order by purchase_order_no
    `;
    for (const order of orders) {
      let items = parseArray(order.items).map(stripLegacyItem);
      if (items.length === 0) items = [{}];
      const first = items[0];
      const inferredStockId = first.stockId ? String(first.stockId) : receiptStockByOrder.get(String(order.id));
      if (inferredStockId) {
        const stockRows = await sql`
          select id, code, name, type, yarn_count_id, color_id
          from stock_cards
          where id = ${inferredStockId}
          limit 1
        `;
        const stock = stockRows[0];
        if (stock) {
          first.stockId = String(stock.id);
          first.stockCode = String(stock.code);
          first.stockName = String(stock.name);
          first.stockType = String(stock.type);
          first.yarnCountId = stock.yarn_count_id ? String(stock.yarn_count_id) : null;
          first.colorId = stock.color_id ? String(stock.color_id) : null;
        }
      }
      first.orderedKg = Number(first.orderedKg ?? order.total_ordered_kg ?? 0);
      first.receivedKg = Number(first.receivedKg ?? order.total_received_kg ?? 0);
      first.remainingKg = Math.max(Number(first.orderedKg) - Number(first.receivedKg), 0);
      if (!first.id) {
        first.id = `poi-${crypto.randomUUID()}`;
      }
      items[0] = first;
      await sql`update purchase_orders set items = ${sql.json(asJson(items))} where id = ${String(order.id)}`;
      fixedOrders += 1;
    }
  } finally {
    await sql.end();
  }

  console.log(`Purchase order item cleanup completed. Orders: ${fixedOrders}, receipts: ${fixedReceipts}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
