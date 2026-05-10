import { sql } from "@/db/client";
import { id } from "@/services/write/write-utils";
import type { Tx } from "@/services/write/write-types";

/**
 * Snapshot Immutability Guard
 * Snapshots should never be updated or deleted once created.
 */
export async function assertSnapshotImmutable(tx: Tx, table: string, snapshotDate: string) {
  const existing = await tx`select count(*)::int as count from ${sql(table)} where snapshot_date = ${snapshotDate}`;
  if (existing[0]?.count > 0) {
    throw new Error(`${snapshotDate} tarihli snapshot zaten mevcut ve değiştirilemez.`);
  }
}

/**
 * Inventory Snapshot
 */
export async function createInventorySnapshot(tx: Tx, snapshotDate: string) {
  await assertSnapshotImmutable(tx, 'inventory_snapshots', snapshotDate);
  
  // Get current balances
  const balances = await tx`
    select stock_id, warehouse_id, party_id, lot_no, quantity 
    from warehouse_balances 
    where quantity > 0
  `;

  for (const b of balances) {
    await tx`
      insert into inventory_snapshots (id, snapshot_date, stock_id, warehouse_id, party_id, lot_no, quantity_kg, created_at)
      values (${id('isn')}, ${snapshotDate}, ${b.stock_id}, ${b.warehouse_id}, ${b.party_id}, ${b.lot_no}, ${b.quantity}, now())
    `;
  }
}

/**
 * Customer Order Snapshot
 */
export async function createOrderSnapshot(tx: Tx, snapshotDate: string) {
  await assertSnapshotImmutable(tx, 'order_snapshots', snapshotDate);

  const orders = await tx`
    select id, status, quantity_kg, 
    (select coalesce(sum(produced_raw_kg), 0) from production_raw where order_id = orders.id) as produced_kg,
    (select coalesce(sum(quantity_kg), 0) from sales where order_id = orders.id) as shipped_kg
    from orders
    where status not in ('Sevk Edildi', 'İptal')
  `;

  for (const o of orders) {
    const produced = Number(o.produced_kg);
    const shipped = Number(o.shipped_kg);
    const ordered = Number(o.quantity_kg);
    const remaining = Math.max(ordered - shipped, 0);

    await tx`
      insert into order_snapshots (id, snapshot_date, order_id, status, ordered_kg, produced_kg, shipped_kg, remaining_kg, created_at)
      values (${id('osn')}, ${snapshotDate}, ${o.id}, ${o.status}, ${ordered}, ${produced}, ${shipped}, ${remaining}, now())
    `;
  }
}

/**
 * Purchase Order Snapshot
 */
export async function createPurchaseOrderSnapshot(tx: Tx, snapshotDate: string) {
  await assertSnapshotImmutable(tx, 'purchase_order_snapshots', snapshotDate);

  const purchaseOrders = await tx`
    select id, status, total_ordered_kg, total_received_kg, total_remaining_kg
    from purchase_orders
    where status not in ('Tamamlandı', 'İptal')
  `;

  for (const po of purchaseOrders) {
    await tx`
      insert into purchase_order_snapshots (id, snapshot_date, purchase_order_id, status, ordered_kg, received_kg, remaining_kg, created_at)
      values (${id('psn')}, ${snapshotDate}, ${po.id}, ${po.status}, ${po.total_ordered_kg}, ${po.total_received_kg}, ${po.total_remaining_kg}, now())
    `;
  }
}

/**
 * Financial Summary Snapshot
 */
export async function createFinancialSnapshot(tx: Tx, snapshotDate: string) {
  await assertSnapshotImmutable(tx, 'financial_snapshots', snapshotDate);

  const [invTotals] = await tx`select coalesce(sum(quantity), 0) as total_kg from warehouse_balances`;
  const [orderTotals] = await tx`select coalesce(sum(quantity_kg - (select coalesce(sum(quantity_kg), 0) from sales where order_id = orders.id)), 0) as remaining_kg from orders where status not in ('Sevk Edildi', 'İptal')`;
  const [purchaseTotals] = await tx`select coalesce(sum(total_remaining_kg), 0) as remaining_kg from purchase_orders where status not in ('Tamamlandı', 'İptal')`;
  const [wasteTotals] = await tx`
    select 
      (select coalesce(sum(waste_kg), 0) from production_raw) + 
      (select coalesce(sum(waste_kg), 0) from production_dyehouse) as total_waste
  `;

  await tx`
    insert into financial_snapshots (
      id, snapshot_date, total_inventory_kg, total_inventory_cost, 
      total_open_orders_kg, total_open_purchase_kg, total_waste_kg, created_at
    )
    values (
      ${id('fsn')}, ${snapshotDate}, ${invTotals.total_kg}, 0, 
      ${orderTotals.remaining_kg}, ${purchaseTotals.remaining_kg}, ${wasteTotals.total_waste}, now()
    )
  `;
}

/**
 * Full ERP Snapshot
 */
export async function createFullSnapshot(snapshotDate: string) {
  return sql.begin(async (tx) => {
    await createInventorySnapshot(tx, snapshotDate);
    await createOrderSnapshot(tx, snapshotDate);
    await createPurchaseOrderSnapshot(tx, snapshotDate);
    await createFinancialSnapshot(tx, snapshotDate);
    
    return { ok: true, snapshotDate };
  });
}

/**
 * Get Last Snapshot Date
 */
export async function getLastSnapshotDate() {
  const rows = await sql`select snapshot_date from financial_snapshots order by snapshot_date desc limit 1`;
  return rows[0]?.snapshot_date || null;
}

/**
 * Get Snapshot History
 */
export async function getSnapshotHistory() {
  return await sql`
    select snapshot_date, created_at, total_inventory_kg, total_open_orders_kg
    from financial_snapshots
    order by snapshot_date desc
  `;
}
