import { sql } from "@/db/client";
import type { Tx } from "@/services/write/write-types";
import {
  recalculateOrderStatus,
  recalculatePurchaseOrderStatus,
  cleanupOrphanParty
} from "@/services/write/operational-lifecycle.service";

/**
 * Rebuilds the warehouse_balances table from the ground truth stock_movements.
 * Also updates stock_cards.current_stock_kg.
 */
export async function rebuildWarehouseBalances(tx: Tx) {
  // 1. Reset balances
  await tx`truncate table warehouse_balances`;

  // 2. Re-apply all movements to balances using set-based SQL
  await tx`
    insert into warehouse_balances (id, stock_id, warehouse_id, party_id, lot_no, quantity, updated_at)
    select 
      'bal-' || md5(stock_id || '|' || warehouse_id || '|' || coalesce(party_id, 'none') || '|' || coalesce(lot_no, 'none')),
      stock_id,
      warehouse_id,
      party_id,
      lot_no,
      sum(case when direction = 'IN' then quantity else -quantity end),
      now()
    from stock_movements
    group by stock_id, warehouse_id, party_id, lot_no
    having sum(case when direction = 'IN' then quantity else -quantity end) != 0
  `;

  // 3. Update stock_cards.current_stock_kg
  const result = await tx`
    update stock_cards sc
    set current_stock_kg = coalesce((
      select sum(case when direction = 'IN' then quantity else -quantity end)
      from stock_movements
      where stock_id = sc.id
    ), 0),
    updated_at = now()
  `;

  const [balanceCount] = await tx`select count(*)::int from warehouse_balances`;

  return {
    warehouseBalancesRebuilt: balanceCount.count,
    stockCardsUpdated: result.count
  };
}

/**
 * Recalculates statuses for all orders.
 */
export async function rebuildOrderStatuses(tx: Tx) {
  const orders = await tx`select id from orders`;
  for (const order of orders) {
    await recalculateOrderStatus(tx, order.id);
  }
  return { ordersRecalculated: orders.length };
}

/**
 * Recalculates statuses and quantities for all purchase orders.
 */
export async function rebuildPurchaseOrderStatuses(tx: Tx) {
  const poRows = await tx`select id from purchase_orders`;
  for (const po of poRows) {
    await recalculatePurchaseOrderStatus(tx, po.id);
  }
  return { purchaseOrdersRecalculated: poRows.length };
}

/**
 * Cleans up all parties that have no operational references.
 */
export async function cleanupAllOrphanParties(tx: Tx) {
  const parties = await tx`select id from parties`;
  let cleanedCount = 0;
  for (const party of parties) {
    const [initialCount] = await tx`select count(*)::int from parties where id = ${party.id}`;
    if (initialCount.count === 0) continue; // Already deleted in this loop maybe?

    await cleanupOrphanParty(tx, party.id);

    const [finalCount] = await tx`select count(*)::int from parties where id = ${party.id}`;
    if (finalCount.count === 0) {
      cleanedCount++;
    }
  }
  return { orphanPartiesCleaned: cleanedCount };
}

/**
 * Orchestrates a full integrity rebuild of all projection and cache tables.
 */
export async function rebuildAllIntegrityProjections(tx: Tx) {
  const results: Record<string, number> = {};

  const balances = await rebuildWarehouseBalances(tx);
  Object.assign(results, balances);

  const orders = await rebuildOrderStatuses(tx);
  Object.assign(results, orders);

  const po = await rebuildPurchaseOrderStatuses(tx);
  Object.assign(results, po);

  const orphans = await cleanupAllOrphanParties(tx);
  Object.assign(results, orphans);

  return results;
}
