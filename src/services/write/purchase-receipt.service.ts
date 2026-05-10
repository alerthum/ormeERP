import { sql } from "@/db/client";
import type { StockType } from "@/types/erp";
import type { Tx } from "@/services/write/write-types";

import {
  id,
  asJson,
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
} from "@/services/write/movement-balance.service";

import {
  checkSubsequentTransactions,
  assertTransactionIntegrity,
  assertNoOrphanOperationalData,
} from "@/services/write/integrity-validation.service";

import {
  removeMovementEffects,
} from "@/services/write/movement-balance.service";
import {
  recalculatePurchaseOrderStatus,
} from "@/services/write/operational-lifecycle.service";

import { assertCanCreate, assertCanUpdate, assertCanDelete, type PermissionUser } from "./permission-guard.service";
import { assertOperationDateUnlocked } from "./operation-lock.service";

export async function createPurchaseReceipt(payload: Record<string, unknown>, user: PermissionUser | null = null) {
  await assertCanCreate(user, 'purchase');
  await assertOperationDateUnlocked({
    operationDate: requireString(payload.receiptDate ?? new Date().toISOString().slice(0, 10), "Mal kabul tarihi"),
    user,
    operationType: 'create'
  });
  return sql.begin(async (tx) => {
    const purchaseOrderId = requireString(payload.purchaseOrderId, "Satıcı siparişi");
    const itemId = requireString(payload.purchaseOrderItemId, "Sipariş kalemi");
    const stockId = requireString(payload.stockId, "Stok");
    const receivedKg = numberValue(payload.receivedKg, "Gelen kg");
    const warehouseId = requireString(payload.warehouseId, "Depo");
    const receiptId = id("receipt");
    const receiptNo = await nextBusinessNo(tx, "receipt");
    const orders = await tx`select items, supplier_id, total_received_kg, total_ordered_kg from purchase_orders where id = ${purchaseOrderId} limit 1`;
    if (!orders[0]) throw new Error("Satıcı siparişi bulunamadı.");
    const items = jsonArray(orders[0].items);
    const nextItems = items.map((item) => {
      if (item.id !== itemId) return item;
      const nextReceived = Number(item.receivedKg ?? 0) + receivedKg;
      const ordered = Number(item.orderedKg ?? 0);
      return { ...item, receivedKg: nextReceived, remainingKg: Math.max(ordered - nextReceived, 0) };
    });
    const totalReceived = Number(orders[0].total_received_kg ?? 0) + receivedKg;
    const totalOrdered = Number(orders[0].total_ordered_kg ?? 0);
    const remaining = Math.max(totalOrdered - totalReceived, 0);
    const status = remaining === 0 ? "Tamamlandı" : "Kısmi Geldi";
    await tx`
      insert into purchase_receipts (id, purchase_order_id, receipt_no, receipt_date, warehouse_id, supplier_id, items, description, created_at, created_by)
      values (
        ${receiptId}, ${purchaseOrderId}, ${receiptNo}, ${requireString(payload.receiptDate ?? new Date().toISOString().slice(0, 10), "Mal kabul tarihi")},
        ${warehouseId}, ${String(orders[0].supplier_id)}, ${tx.json(asJson([{ purchaseOrderItemId: itemId, stockId, receivedKg, lotNo: optionalString(payload.lotNo), description: optionalString(payload.description) }]))},
        ${optionalString(payload.description) ?? ""}, now(), 'system'
      )
    `;
    await recalculatePurchaseOrderStatus(tx, purchaseOrderId);
    await addMovement(tx, {
      date: requireString(payload.receiptDate ?? new Date().toISOString().slice(0, 10), "Mal kabul tarihi"),
      stockId,
      warehouseId,
      lotNo: optionalString(payload.lotNo),
      movementType: "Satın Alma",
      direction: "IN",
      quantity: receivedKg,
      description: "Satıcı siparişi mal kabul",
      sourceTransactionId: receiptId,
      sourceTransactionType: "direct_purchase_receipt",
      supplierOrderId: purchaseOrderId,
    });

    await assertTransactionIntegrity(tx, "direct_purchase_receipt", receiptId);
    return { id: receiptId, receiptNo, status };
  });
}

export async function createDirectRawMaterialPurchase(payload: Record<string, unknown>, user: PermissionUser | null = null) {
  await assertCanCreate(user, 'purchase');
  await assertOperationDateUnlocked({
    operationDate: requireString(payload.receiptDate ?? new Date().toISOString().slice(0, 10), "Alış tarihi"),
    user,
    operationType: 'create'
  });
  return sql.begin(async (tx) => {
    const stockId = requireString(payload.stockId, "Hammadde stok kartı");
    const stockRows = await tx`
      select id, code, name, type, yarn_count_id, color_id
      from stock_cards
      where id = ${stockId}
      limit 1
    `;
    const stock = stockRows[0];
    if (!stock) throw new Error("Hammadde stok kartı bulunamadı.");
    const stockType = String(stock.type) as StockType;
    if (!["IP", "LYC", "POLY", "YM"].includes(stockType)) throw new Error("Doğrudan alış IP, LYC, POLY veya YM stokları için yapılır.");

    const quantityKg = numberValue(payload.quantityKg, "Gelen kg");
    const supplierId = requireString(payload.supplierId, "Satıcı");
    const warehouseId = requireString(payload.warehouseId, "Depo");
    const date = requireString(payload.receiptDate ?? new Date().toISOString().slice(0, 10), "Alış tarihi");
    const purchaseOrderId = id("po");
    const purchaseOrderNo = await nextBusinessNo(tx, "purchaseOrder");
    const receiptId = id("receipt");
    const receiptNo = await nextBusinessNo(tx, "receipt");
    const purchaseOrderItemId = id("poi");
    const item = {
      id: purchaseOrderItemId,
      stockId,
      stockCode: String(stock.code),
      stockName: String(stock.name),
      stockType,
      yarnCountId: stock.yarn_count_id ? String(stock.yarn_count_id) : null,
      colorId: stock.color_id ? String(stock.color_id) : null,
      orderedKg: quantityKg,
      receivedKg: quantityKg,
      remainingKg: 0,
      unitPrice: payload.unitPrice ? numberValue(payload.unitPrice, "Birim fiyat") : null,
      currency: optionalString(payload.currency) ?? "TRY",
      description: optionalString(payload.description) ?? "Siparişsiz hızlı hammadde alışı",
    };

    await tx`
      insert into purchase_orders (
        id, purchase_order_no, supplier_id, order_date, due_date, status, items,
        total_ordered_kg, total_received_kg, total_remaining_kg, description, created_at, updated_at
      )
      values (
        ${purchaseOrderId}, ${purchaseOrderNo}, ${supplierId}, ${date}, ${date}, 'Tamamlandı',
        ${tx.json(asJson([item]))}, ${quantityKg}, ${quantityKg}, 0,
        ${optionalString(payload.description) ?? "Siparişsiz hızlı hammadde alışı"}, now(), now()
      )
    `;
    await tx`
      insert into purchase_receipts (id, purchase_order_id, receipt_no, receipt_date, warehouse_id, supplier_id, items, description, created_at, created_by)
      values (
        ${receiptId}, ${purchaseOrderId}, ${receiptNo}, ${date}, ${warehouseId}, ${supplierId},
        ${tx.json(asJson([{ purchaseOrderItemId, stockId, receivedKg: quantityKg, lotNo: optionalString(payload.lotNo), description: optionalString(payload.description) }]))},
        ${optionalString(payload.description) ?? "Siparişsiz hızlı hammadde alışı"}, now(), 'system'
      )
    `;
    await recalculatePurchaseOrderStatus(tx, purchaseOrderId);
    await addMovement(tx, {
      date,
      stockId,
      warehouseId,
      lotNo: optionalString(payload.lotNo),
      movementType: "Satın Alma",
      direction: "IN",
      quantity: quantityKg,
      description: "Siparişsiz hammadde alışı",
      sourceTransactionId: receiptId,
      sourceTransactionType: "direct_purchase_receipt",
      supplierOrderId: purchaseOrderId,
    });

    await assertTransactionIntegrity(tx, "direct_purchase_receipt", receiptId);
    return { id: receiptId, receiptNo, purchaseOrderId, purchaseOrderNo };
  });
}

export async function deletePurchaseReceipt(recordId: string, user: PermissionUser | null = null, outerTx?: Tx) {
  await assertCanDelete(user, 'purchase');
  const [receiptRow] = await sql`select receipt_date from purchase_receipts where id = ${recordId}`;
  if (receiptRow) {
    await assertOperationDateUnlocked({
      operationDate: receiptRow.receipt_date,
      user,
      operationType: 'delete'
    });
  }
  const run = async (tx: Tx) => {
    // 0. Check for subsequent transactions (Transfer, Raw Production consuming this Lot)
    await checkSubsequentTransactions(tx, "direct_purchase_receipt", recordId);

    const rows = await tx`
      select id, purchase_order_id, items, warehouse_id
      from purchase_receipts
      where id = ${recordId}
      limit 1
    `;
    const receipt = rows[0];
    if (!receipt) throw new Error("Mal kabul kaydı bulunamadı.");

    const purchaseOrderId = String(receipt.purchase_order_id);
    const receiptItems = jsonArray(receipt.items);

    // 1. Remove all movements and reverse balances
    await removeMovementEffects(tx, [{ referenceType: "direct_purchase_receipt", referenceId: recordId }]);

    // 2. Delete the record
    await tx`delete from purchase_receipts where id = ${recordId}`;

    // 3. Recalculate Purchase Order
    await recalculatePurchaseOrderStatus(tx, purchaseOrderId);


    await assertNoOrphanOperationalData(tx);
    return { id: recordId };
  };
  return outerTx ? run(outerTx) : sql.begin(run);
}

export async function updatePurchaseReceipt(recordId: string, payload: Record<string, unknown>, user: PermissionUser | null = null) {
  await assertCanUpdate(user, 'purchase');
  await assertOperationDateUnlocked({
    operationDate: requireString(payload.receiptDate, "Fiş tarihi"),
    user,
    operationType: 'update'
  });
  return sql.begin(async (tx) => {
    // 0. Check for subsequent transactions
    await checkSubsequentTransactions(tx, "direct_purchase_receipt", recordId);

    const rows = await tx`select id, purchase_order_id, warehouse_id, supplier_id, items, description, receipt_date from purchase_receipts where id = ${recordId} limit 1`;
    const receipt = rows[0];
    if (!receipt) throw new Error("Mal kabul kaydı bulunamadı.");

    const purchaseOrderId = String(receipt.purchase_order_id);
    const oldItems = jsonArray(receipt.items);
    
    // For simplicity in this ERP, we currently support updating receipts with single items via this method
    // If multiple items, logic needs to be more complex.
    const oldItem = oldItems[0];
    if (!oldItem) throw new Error("Fiş kalemi bulunamadı.");

    const newDate = requireString(payload.receiptDate ?? receipt.receipt_date, "Tarih");
    const newWarehouseId = requireString(payload.warehouseId ?? receipt.warehouse_id, "Depo");
    const newReceivedKg = numberValue(payload.receivedKg ?? oldItem.receivedKg, "Miktar");
    const newDescription = optionalString(payload.description) ?? String(receipt.description || "");
    const newLotNo = optionalString(payload.lotNo ?? oldItem.lotNo);
    const newStockId = payload.stockId ? String(payload.stockId) : String(oldItem.stockId);

    const diffQty = newReceivedKg - Number(oldItem.receivedKg);

    // 1. Remove all old effects
    await removeMovementEffects(tx, [{ referenceType: "direct_purchase_receipt", referenceId: recordId }]);

    // 2. Add new effect
    await addMovement(tx, {
      date: newDate,
      stockId: newStockId,
      warehouseId: newWarehouseId,
      lotNo: newLotNo,
      movementType: "Satın Alma",
      direction: "IN",
      quantity: newReceivedKg,
      description: newDescription || "Mal kabul girişi",
      sourceTransactionId: recordId,
      sourceTransactionType: "direct_purchase_receipt",
      supplierOrderId: purchaseOrderId,
    });

    // 3. Update the receipt record
    const updatedItems = [{ ...oldItem, stockId: newStockId, receivedKg: newReceivedKg, lotNo: newLotNo }];
    await tx`
      update purchase_receipts 
      set receipt_date = ${newDate}, warehouse_id = ${newWarehouseId}, items = ${tx.json(asJson(updatedItems))}, description = ${newDescription}, updated_at = now()
      where id = ${recordId}
    `;

    // 4. Update purchase order totals
    await recalculatePurchaseOrderStatus(tx, purchaseOrderId);

    await assertTransactionIntegrity(tx, "direct_purchase_receipt", recordId);
    return { id: recordId };
  });
}
