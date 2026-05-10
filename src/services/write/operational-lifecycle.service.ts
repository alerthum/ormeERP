import { sql } from "@/db/client";
import type { Tx } from "@/services/write/write-types";
import { jsonArray, asJson } from "@/services/write/write-utils";

/**
 * Recalculates the status of an order based on its operational movements.
 * Priority: Sales -> Dyehouse Production -> Raw Production -> Approved
 */
export async function recalculateOrderStatus(tx: Tx, orderId: string) {
  // 1. Get order target quantity
  const [order] = await tx`select quantity_kg from orders where id = ${orderId} limit 1`;
  if (!order) return;

  const targetKg = Number(order.quantity_kg || 0);

  // 2. Check for sales/shipments
  const [salesUsage] = await tx`
    select coalesce(sum(quantity_kg), 0)::numeric as total_shipped
    from sales
    where order_id = ${orderId}
  `;
  const shippedKg = Number(salesUsage.total_shipped);

  if (shippedKg > 0) {
    const status = shippedKg >= targetKg ? "Sevk Edildi" : "Kısmi Sevk Edildi";
    await tx`update orders set status = ${status}, updated_at = now() where id = ${orderId}`;
    return;
  }

  // 3. Check for dyehouse production (MM)
  const [dyehouseUsage] = await tx`
    select coalesce(sum(finished_kg), 0)::numeric as total_finished 
    from production_dyehouse 
    where order_id = ${orderId}
  `;
  const finishedKg = Number(dyehouseUsage.total_finished);

  if (finishedKg > 0) {
    await tx`update orders set status = 'Mamül Hazır', updated_at = now() where id = ${orderId}`;
    return;
  }

  // 4. Check for raw production (YM)
  const [rawUsage] = await tx`
    select coalesce(sum(produced_raw_kg), 0)::numeric as total_raw
    from production_raw 
    where order_id = ${orderId}
  `;
  const rawKg = Number(rawUsage.total_raw);

  if (rawKg > 0) {
    await tx`update orders set status = 'Ham Geldi', updated_at = now() where id = ${orderId}`;
    return;
  }

  // 5. Default to Approved if no operational data remains
  await tx`update orders set status = 'Onaylandı', updated_at = now() where id = ${orderId}`;
}

/**
 * Removes a party and its allocations if it is no longer used in any operational transaction.
 */
export async function cleanupOrphanParty(tx: Tx, partyId: string) {
  if (!partyId) return;

  // Check operational usage across all modules
  const [usage] = await tx`
    select 
      (select count(*)::int from production_raw where party_id = ${partyId}) +
      (select count(*)::int from production_dyehouse where party_id = ${partyId}) +
      (select count(*)::int from sales where party_id = ${partyId}) +
      (select count(*)::int from stock_movements where party_id = ${partyId}) +
      (select count(*)::int from transfers where items @> ${tx.json([{ partyId: partyId }])}::jsonb) as total
  `;

  if (Number(usage.total) === 0) {
    // 1. Remove order-party allocations first
    await tx`delete from order_party_allocations where party_id = ${partyId}`;
    
    // 2. Remove the party itself
    await tx`delete from parties where id = ${partyId}`;
  }
}

/**
 * Common entry point for cleaning up after an operational change.
 */
export async function cleanupAfterOperationalChange(tx: Tx, input: { orderId?: string | null; partyId?: string | null }) {
  if (input.partyId) {
    await cleanupOrphanParty(tx, input.partyId);
  }
  if (input.orderId) {
    await recalculateOrderStatus(tx, input.orderId);
  }
}

/**
 * Recalculates the status and quantities of a purchase order based on its receipts.
 */
export async function recalculatePurchaseOrderStatus(tx: Tx, purchaseOrderId: string) {
  // 1. Get the purchase order
  const [po] = await tx`
    select items, total_ordered_kg, status
    from purchase_orders 
    where id = ${purchaseOrderId} 
    limit 1
  `;
  if (!po) return;

  const poItems = jsonArray(po.items);
  const totalOrdered = Number(po.total_ordered_kg || 0);

  // 2. Get all receipts for this purchase order
  const receipts = await tx`
    select items 
    from purchase_receipts 
    where purchase_order_id = ${purchaseOrderId}
  `;

  // 3. Recalculate each item's received quantity
  let totalReceived = 0;
  const nextItems = poItems.map(item => {
    let itemReceived = 0;
    
    // Sum up received quantity for this specific item across all receipts
    for (const receipt of receipts) {
      const receiptItems = jsonArray(receipt.items);
      const matchingItem = receiptItems.find(ri => ri.purchaseOrderItemId === item.id);
      if (matchingItem) {
        itemReceived += Number(matchingItem.receivedKg || 0);
      }
    }

    const ordered = Number(item.orderedKg || 0);
    totalReceived += itemReceived;

    return {
      ...item,
      receivedKg: itemReceived,
      remainingKg: Math.max(ordered - itemReceived, 0)
    };
  });

  // 4. Determine status
  const totalRemaining = Math.max(totalOrdered - totalReceived, 0);
  let status = po.status; // Default to existing status
  
  if (totalReceived > 0) {
    status = totalReceived >= totalOrdered ? "Tamamlandı" : "Kısmi Geldi";
  } else {
    // If receipts are 0, return to Onaylandı (unless it was Taslak, but we prefer a safe active state)
    status = "Onaylandı";
  }

  // 5. Update the purchase order
  await tx`
    update purchase_orders
    set 
      items = ${tx.json(asJson(nextItems))},
      total_received_kg = ${totalReceived},
      total_remaining_kg = ${totalRemaining},
      status = ${status},
      updated_at = now()
    where id = ${purchaseOrderId}
  `;
}
