import { sql } from "@/db/client";
import { calculateDyehouseWaste, calculateRawWaste } from "@/services/erp-service";
import type { StockType } from "@/types/erp";
import type { Tx } from "@/services/write/write-types";

import {
  id,
  asJson,
  requireString,
  optionalString,
  numberValue,
  boolValue,
  jsonArray,
} from "@/services/write/write-utils";

import {
  nextBusinessNo,
  nextPartyNo,
} from "@/services/write/counter.service";

import {
  addMovement,
  removeMovementEffects,
  assertAvailableBalance,
} from "@/services/write/movement-balance.service";

import {
  checkSubsequentTransactions,
  assertTransactionIntegrity,
  assertNoOrphanOperationalData,
} from "@/services/write/integrity-validation.service";

export * from "@/services/write/permission-guard.service";
export * from "@/services/write/operation-lock.service";

export {
  createSetting,
  updateSetting,
  deleteSetting,
} from "@/services/write/master-data.service";

export type {
  SettingEntity,
} from "@/services/write/master-data.service";

export {
  createRole,
  updateRole,
  deleteRole,
  createUserProfile,
  updateUserProfile,
  deactivateUserProfile,
} from "@/services/write/user-role.service";

export {
  createStockCard,
  updateStockCard,
  deleteStockCard,
} from "@/services/write/stock-card.service";

export {
  createCustomerOrder,
  updateCustomerOrder,
  deleteCustomerOrder,
  createPurchaseOrder,
  updatePurchaseOrder,
  deletePurchaseOrder,
} from "@/services/write/order.service";

export {
  createPurchaseReceipt,
  createDirectRawMaterialPurchase,
  deletePurchaseReceipt,
  updatePurchaseReceipt,
} from "@/services/write/purchase-receipt.service";

export {
  createTransfer,
  deleteTransfer,
  updateTransfer,
} from "@/services/write/transfer.service";

export {
  createRawProduction,
  deleteRawProduction,
  updateRawProduction,
} from "@/services/write/raw-production.service";

export {
  createDyehouseProduction,
  deleteDyehouseProduction,
  updateDyehouseProduction,
} from "@/services/write/dyehouse-production.service";

export {
  createSale,
  deleteSale,
  updateSale,
} from "@/services/write/sale.service";





/**
 * Checks for subsequent transactions that depend on the given reference.
 * Returns a list of dependent records that must be handled first.
 */
/**
 * Checks for subsequent transactions that depend on the given transaction.
 * Returns a list of dependent records that must be handled first.
 * Now uses movement-based relationship tracking (parent/source links).
 */










export async function updateOrderStatus(recordId: string, status: string, user: any = null) {
  await sql`update orders set status = ${status}, updated_at = now() where id = ${recordId}`;
  return { id: recordId, status };
}

export async function shiftPartyAllocation(payload: Record<string, unknown>) {
  return sql.begin(async (tx) => {
    const sourceOrderId = requireString(payload.sourceOrderId, "Kaynak sipariş");
    const targetOrderId = requireString(payload.targetOrderId, "Hedef sipariş");
    const partyId = requireString(payload.partyId, "Parti");
    const quantityKg = numberValue(payload.quantityKg, "Kaydırılacak kg");
    const mode = optionalString(payload.mode) ?? "partial";
    const date = new Date().toISOString().slice(0, 10);

    if (sourceOrderId === targetOrderId) throw new Error("Kaynak ve hedef sipariş aynı olamaz.");

    const sourceRows = await tx`
      select id, allocated_kg, produced_raw_kg, produced_finished_kg, shipped_kg
      from order_party_allocations
      where order_id = ${sourceOrderId} and party_id = ${partyId}
      order by created_at desc
      limit 1
    `;
    const source = sourceRows[0];
    const sourceAllocated = source ? Number(source.allocated_kg) : quantityKg;
    const shiftKg = mode === "all" ? sourceAllocated : quantityKg;
    if (source && sourceAllocated < shiftKg) throw new Error("Kaydırılacak kg kaynak bağlantı miktarından büyük olamaz.");

    if (source) {
      const remaining = Math.max(sourceAllocated - shiftKg, 0);
      await tx`
        update order_party_allocations
        set allocated_kg = ${remaining},
            status = case when ${remaining} > 0 then status else 'Kaydırıldı' end,
            updated_at = now()
        where id = ${String(source.id)}
      `;
    }

    await tx`
      insert into order_party_allocations (
        id, order_id, party_id, allocated_kg, produced_raw_kg, produced_finished_kg, shipped_kg, status, created_at, updated_at
      )
      values (${id("opa")}, ${targetOrderId}, ${partyId}, ${shiftKg}, 0, 0, 0, 'Aktif', now(), now())
    `;

    await tx`
      update parties
      set timeline = timeline || ${JSON.stringify([{ date, title: "Parti kaydırma", description: `${shiftKg} kg kaynak siparişten hedef siparişe bağlandı.`, tone: "amber" }])}::jsonb::jsonb,
          updated_at = now()
      where id = ${partyId}
    `;

    return { id: partyId, shiftedKg: shiftKg };
  });
}


export async function cancelPurchaseOrder(recordId: string) {
  await sql`update purchase_orders set status = 'İptal', updated_at = now() where id = ${recordId}`;
  return { id: recordId, status: "İptal" };
}

export async function updateUISettings(payload: Record<string, unknown>) {
  await sql`
    insert into ui_settings (id, data)
    values ('global', ${sql.json(asJson(payload))})
    on conflict (id) do update set data = ${sql.json(asJson(payload))}
  `;
  return { success: true };
}

/**
 * Assert that a transaction has all its required stock movements.
 * This is called at the end of create/update operations.
 */

/**
 * Global check for orphan operational data.
 */

/**
 * Rebuild all balances and summaries from scratch using stock_movements.
 */
export async function rebuildBalancesFromMovements() {
  return sql.begin(async (tx) => {
    // 1. Reset balances
    await tx`truncate table warehouse_balances`;
    
    // 2. Re-apply all movements to balances using set-based SQL (FAST)
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

    await tx`
      update stock_cards sc
      set current_stock_kg = coalesce((
        select sum(case when direction = 'IN' then quantity else -quantity end)
        from stock_movements
        where stock_id = sc.id
      ), 0),
      updated_at = now()
    `;

    // 3. Rebuild Party Summaries
    await tx`
      update parties p
      set raw_produced_kg = coalesce((
            select sum(quantity) from stock_movements 
            where stock_id = p.ym_stock_id and party_id = p.id and movement_type = 'Üretim giriş' and direction = 'IN'
          ), 0),
          raw_consumed_kg = coalesce((
            select sum(quantity) from stock_movements 
            where source_transaction_id in (select id from production_raw where party_id = p.id) 
              and movement_type = 'Üretim tüketim' and direction = 'OUT'
          ), 0),
          dyehouse_input_kg = coalesce((
            select sum(quantity) from stock_movements 
            where stock_id = p.ym_stock_id and party_id = p.id and movement_type = 'Boyahane çıkış' and direction = 'OUT'
          ), 0),
          finished_kg = coalesce((
            select sum(quantity) from stock_movements 
            where stock_id = p.mm_stock_id and party_id = p.id and movement_type = 'Boyahane giriş' and direction = 'IN'
          ), 0)
    `;
    
    await tx`
      update parties
      set raw_waste_kg = greatest(raw_consumed_kg - raw_produced_kg, 0),
          raw_waste_percent = case when raw_consumed_kg > 0 then (greatest(raw_consumed_kg - raw_produced_kg, 0) / raw_consumed_kg) * 100 else 0 end,
          dyehouse_waste_kg = greatest(dyehouse_input_kg - finished_kg, 0),
          dyehouse_waste_percent = case when dyehouse_input_kg > 0 then (greatest(dyehouse_input_kg - finished_kg, 0) / dyehouse_input_kg) * 100 else 0 end
    `;

    // 4. Rebuild Purchase Order Summaries
    const poRows = await tx`select id from purchase_orders`;
    for (const po of poRows) {
      const receipts = await tx`select items from purchase_receipts where purchase_order_id = ${po.id}`;
      const poData = await tx`select items, total_ordered_kg from purchase_orders where id = ${po.id} limit 1`;
      const poItems = jsonArray(poData[0].items);
      
      let totalReceived = 0;
      const nextItems = poItems.map(item => {
        let itemReceived = 0;
        for (const r of receipts) {
          const rItems = jsonArray(r.items);
          const rItem = rItems.find(ri => ri.purchaseOrderItemId === item.id);
          if (rItem) itemReceived += Number(rItem.receivedKg);
        }
        totalReceived += itemReceived;
        return { ...item, receivedKg: itemReceived, remainingKg: Math.max(Number(item.orderedKg) - itemReceived, 0) };
      });

      const totalOrdered = Number(poData[0].total_ordered_kg);
      const remaining = Math.max(totalOrdered - totalReceived, 0);
      const status = totalReceived === 0 ? "Açık" : remaining === 0 ? "Tamamlandı" : "Kısmi Geldi";

      await tx`
        update purchase_orders 
        set items = ${tx.json(asJson(nextItems))}, 
            total_received_kg = ${totalReceived}, 
            total_remaining_kg = ${remaining}, 
            status = ${status}
        where id = ${po.id}
      `;
    }

    // 5. Rebuild Order Party Allocations (Sipariş Özetleri)
    await tx`
      update order_party_allocations opa
      set produced_raw_kg = coalesce((
            select sum(quantity) from stock_movements 
            where order_id = opa.order_id and party_id = opa.party_id and movement_type = 'Üretim giriş' and direction = 'IN'
          ), 0),
          produced_finished_kg = coalesce((
            select sum(quantity) from stock_movements 
            where order_id = opa.order_id and party_id = opa.party_id and movement_type = 'Boyahane giriş' and direction = 'IN'
          ), 0),
          shipped_kg = coalesce((
            select sum(quantity) from stock_movements 
            where order_id = opa.order_id and party_id = opa.party_id and source_transaction_type = 'sale' and direction = 'OUT'
          ), 0)
    `;

    return { success: true };
  });
}

/**
 * Clean all orphan operational data.
 */
export async function cleanOrphanData() {
  return sql.begin(async (tx) => {
    // 1. Delete headers without movements
    const modules = [
      { type: 'production_raw', table: 'production_raw' },
      { type: 'production_dyehouse', table: 'production_dyehouse' },
      { type: 'transfer', table: 'transfers' },
      { type: 'sale', table: 'sales' },
      { type: 'direct_purchase_receipt', table: 'purchase_receipts' }
    ];

    for (const mod of modules) {
      await tx`
        delete from ${tx(mod.table)} h
        where not exists (
          select 1 from stock_movements m 
          where (m.source_transaction_type = ${mod.type} and m.source_transaction_id = h.id)
             or (m.reference_type = ${mod.type} and m.reference_id = h.id)
        )
      `;
    }

    // 2. Delete movements without headers (Split into individual queries for performance)
    for (const mod of modules) {
      await tx`
        delete from stock_movements m
        where m.source_transaction_type = ${mod.type}
          and not exists (select 1 from ${tx(mod.table)} h where h.id = m.source_transaction_id)
      `;
    }

    // 3. Clean up empty parties (no movements and no production records)
    await tx`
      delete from parties p
      where not exists (select 1 from stock_movements where party_id = p.id)
        and not exists (select 1 from production_raw where party_id = p.id)
        and not exists (select 1 from production_dyehouse where party_id = p.id)
    `;

    // 4. Final step: Rebuild balances to ensure consistency
    await rebuildBalancesFromMovements();

    return { success: true };
  });
}
