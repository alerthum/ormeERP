import { sql } from "@/db/client";
import type { Tx } from "@/services/write/write-types";

import {
  id,
  requireString,
  optionalString,
  numberValue,
  jsonArray,
} from "@/services/write/write-utils";

import {
  nextBusinessNo,
} from "@/services/write/counter.service";

import {
  addMovement,
  removeMovementEffects,
} from "@/services/write/movement-balance.service";

import {
  checkSubsequentTransactions,
  assertTransactionIntegrity,
  assertNoOrphanOperationalData,
} from "@/services/write/integrity-validation.service";

import {
  recalculateOrderStatus,
  cleanupAfterOperationalChange,
} from "@/services/write/operational-lifecycle.service";
import { assertCanCreate, assertCanUpdate, assertCanDelete, type PermissionUser } from "./permission-guard.service";
import { assertOperationDateUnlocked } from "./operation-lock.service";

export async function createSale(payload: Record<string, unknown>, user: PermissionUser | null = null) {
  await assertCanCreate(user, 'sales');
  await assertOperationDateUnlocked({
    operationDate: requireString(payload.date ?? new Date().toISOString().slice(0, 10), "Sevkiyat tarihi"),
    user,
    operationType: 'create'
  });
  return sql.begin(async (tx) => {
    const saleId = id("sale");
    const saleNo = await nextBusinessNo(tx, "sale");
    const date = requireString(payload.date ?? new Date().toISOString().slice(0, 10), "Sevkiyat tarihi");
    const partyId = requireString(payload.partyId, "Parti");
    const stockId = requireString(payload.stockId, "Stok");
    const warehouseId = requireString(payload.warehouseId, "Depo");
    const quantityKg = numberValue(payload.quantityKg, "Satış kg");
    const customerName = requireString(payload.customerName, "Müşteri");
    const partyRows = await tx`select order_id, party_no from parties where id = ${partyId} limit 1`;
    const orderId = optionalString(payload.orderId) ?? (partyRows[0]?.order_id ? String(partyRows[0].order_id) : null);
    const partyNo = partyRows[0]?.party_no;

    await tx`
      insert into sales (
        id, sale_no, date, customer_name, warehouse_id, stock_id, party_id, order_id,
        quantity_kg, unit_price, currency, status, description, created_at, created_by
      )
      values (
        ${saleId}, ${saleNo}, ${date}, ${customerName}, ${warehouseId}, ${stockId}, ${partyId}, ${orderId},
        ${quantityKg}, ${payload.unitPrice ? numberValue(payload.unitPrice, "Birim fiyat") : null},
        ${optionalString(payload.currency) ?? "TRY"}, 'Sevk Edildi', ${optionalString(payload.description) ?? ""}, now(), 'system'
      )
    `;

    const sourceMmRows = await tx`
      select id from stock_movements 
      where stock_id = ${stockId} and warehouse_id = ${warehouseId} and party_id = ${partyId} and direction = 'IN'
      order by created_at desc limit 1
    `;

    await addMovement(tx, {
      date,
      stockId,
      warehouseId,
      partyId,
      partyNo,
      orderId,
      movementType: "Çıkış",
      direction: "OUT",
      quantity: quantityKg,
      description: optionalString(payload.description) ?? "Satış / sevkiyat çıkışı",
      sourceTransactionId: saleId,
      sourceTransactionType: "sale",
      sourceMovementId: sourceMmRows[0]?.id
    });

    await tx`
      update parties
      set status = 'Sevk Edildi',
          timeline = timeline || ${JSON.stringify([{ date, title: "Sevkiyat", description: `${saleNo} ile ${quantityKg} kg çıkış yapıldı.`, tone: "green" }])}::jsonb::jsonb,
          updated_at = now()
      where id = ${partyId}
    `;
    if (orderId) {
      await recalculateOrderStatus(tx, orderId);
    }

    await assertTransactionIntegrity(tx, "sale", saleId);
    return { id: saleId, saleNo };
  });
}

export async function deleteSale(recordId: string, user: PermissionUser | null = null, outerTx?: Tx, skipCleanup = false) {
  await assertCanDelete(user, 'sales');
  const [saleRow] = await sql`select date from sales where id = ${recordId}`;
  if (saleRow) {
    await assertOperationDateUnlocked({
      operationDate: saleRow.date,
      user,
      operationType: 'delete'
    });
  }
  const run = async (tx: Tx) => {
    // 0. Check for subsequent transactions
    await checkSubsequentTransactions(tx, "sale", recordId);

    const rows = await tx`select id, party_id, order_id from sales where id = ${recordId} limit 1`;
    const sale = rows[0];
    if (!sale) throw new Error("Sevkiyat kaydı bulunamadı.");

    // 1. Remove all movements and reverse balances
    await removeMovementEffects(tx, [{ referenceType: "sale", referenceId: recordId }]);

    // 2. Delete the record
    await tx`delete from sales where id = ${recordId}`;

    await assertNoOrphanOperationalData(tx);

    if (!skipCleanup) {
      await cleanupAfterOperationalChange(tx, { 
        orderId: sale.order_id ? String(sale.order_id) : null, 
        partyId: sale.party_id ? String(sale.party_id) : null 
      });
    }

    return { id: recordId };
  };
  return outerTx ? run(outerTx) : sql.begin(run);
}

export async function updateSale(recordId: string, payload: Record<string, unknown>, user: PermissionUser | null = null) {
  await assertCanUpdate(user, 'sales');
  await assertOperationDateUnlocked({
    operationDate: requireString(payload.date ?? new Date().toISOString().slice(0, 10), "Sevkiyat tarihi"),
    user,
    operationType: 'update'
  });
  return sql.begin(async (tx) => {
    // 0. Check for subsequent transactions
    await checkSubsequentTransactions(tx, "sale", recordId);

    // 1. Undo old state
    await deleteSale(recordId, user, tx, true);

    // 2. Create new state (with same ID)
    const saleId = recordId;
    const saleNo = await nextBusinessNo(tx, "sale");
    const date = requireString(payload.date ?? new Date().toISOString().slice(0, 10), "Sevkiyat tarihi");
    const partyId = requireString(payload.partyId, "Parti");
    const stockId = requireString(payload.stockId, "Stok");
    const warehouseId = requireString(payload.warehouseId, "Depo");
    const quantityKg = numberValue(payload.quantityKg, "Satış kg");
    const customerName = requireString(payload.customerName, "Müşteri");
    const partyRows = await tx`select order_id, party_no from parties where id = ${partyId} limit 1`;
    const orderId = optionalString(payload.orderId) ?? (partyRows[0]?.order_id ? String(partyRows[0].order_id) : null);
    const partyNo = partyRows[0]?.party_no;

    await tx`
      insert into sales (
        id, sale_no, date, customer_name, warehouse_id, stock_id, party_id, order_id,
        quantity_kg, unit_price, currency, status, description, created_at, created_by
      )
      values (
        ${saleId}, ${saleNo}, ${date}, ${customerName}, ${warehouseId}, ${stockId}, ${partyId}, ${orderId},
        ${quantityKg}, ${payload.unitPrice ? numberValue(payload.unitPrice, "Birim fiyat") : null},
        ${optionalString(payload.currency) ?? "TRY"}, 'Sevk Edildi', ${optionalString(payload.description) ?? ""}, now(), 'system'
      )
    `;

    const sourceMmRows = await tx`
      select id from stock_movements 
      where stock_id = ${stockId} and warehouse_id = ${warehouseId} and party_id = ${partyId} and direction = 'IN'
      order by created_at desc limit 1
    `;

    await addMovement(tx, {
      date,
      stockId,
      warehouseId,
      partyId,
      partyNo,
      orderId,
      movementType: "Çıkış",
      direction: "OUT",
      quantity: quantityKg,
      description: optionalString(payload.description) ?? "Güncellenmiş satış / sevkiyat çıkışı",
      sourceTransactionId: saleId,
      sourceTransactionType: "sale",
      sourceMovementId: sourceMmRows[0]?.id
    });

    await assertTransactionIntegrity(tx, "sale", saleId);
    if (orderId) await recalculateOrderStatus(tx, orderId);
    return { id: saleId, saleNo };
  });
}
