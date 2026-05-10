import { sql } from "@/db/client";
import type { StockType } from "@/types/erp";

import {
  requireString,
  optionalString,
  numberValue,
  boolValue,
  id,
  jsonArray,
  asJson,
} from "@/services/write/write-utils";

import {
  nextBusinessNo,
} from "@/services/write/counter.service";

import {
  findOrCreateFabricStock,
} from "@/services/write/stock-name.service";
import { assertCanCreate, assertCanUpdate, assertCanDelete, type PermissionUser } from "./permission-guard.service";
import { assertOperationDateUnlocked } from "./operation-lock.service";

export async function createCustomerOrder(payload: Record<string, unknown>, user: PermissionUser | null = null) {
  await assertCanCreate(user, 'orders');
  await assertOperationDateUnlocked({
    operationDate: requireString(payload.orderDate ?? new Date().toISOString().slice(0, 10), "Sipariş tarihi"),
    user,
    operationType: 'create'
  });
  return sql.begin(async (tx) => {
    const orderInput = {
      fabricTypeId: requireString(payload.fabricTypeId, "Kumaş cinsi"),
      colorId: requireString(payload.colorId, "Renk"),
      yarnCountId: requireString(payload.yarnCountId, "Ne"),
      hasPolyester: boolValue(payload.hasPolyester),
      hasLycra: boolValue(payload.hasLycra),
    };
    const ymStockId = await findOrCreateFabricStock(tx, "YM", orderInput);
    const mmStockId = await findOrCreateFabricStock(tx, "MM", orderInput);
    const recordId = id("order");
    const orderNo = await nextBusinessNo(tx, "order");
    await tx`
      insert into orders (
        id, order_no, customer_name, order_date, due_date, fabric_type_id, color_id, yarn_count_id,
        has_polyester, has_lycra, raw_width, raw_gsm, finish_width, finish_gsm, quantity_kg,
        ym_stock_id, mm_stock_id, status, process_type_ids, dyehouse_process_type_ids, description, created_at, updated_at
      )
      values (
        ${recordId}, ${orderNo}, ${requireString(payload.customerName, "Müşteri")},
        ${requireString(payload.orderDate ?? new Date().toISOString().slice(0, 10), "Sipariş tarihi")},
        ${requireString(payload.dueDate, "Termin tarihi")},
        ${orderInput.fabricTypeId}, ${orderInput.colorId}, ${orderInput.yarnCountId},
        ${orderInput.hasPolyester}, ${orderInput.hasLycra}, ${numberValue(payload.rawWidth, "Ham en")}, ${numberValue(payload.rawGsm, "Ham gramaj")},
        ${numberValue(payload.finishWidth, "Finish en")}, ${numberValue(payload.finishGsm, "Finish gramaj")}, ${numberValue(payload.quantityKg, "Sipariş kg")},
        ${ymStockId}, ${mmStockId}, 'Taslak', ${JSON.stringify(payload.processTypeIds ?? [])}::jsonb, ${JSON.stringify(payload.dyehouseProcessTypeIds ?? [])}::jsonb,
        ${optionalString(payload.description) ?? ""}, now(), now()
      )
    `;
    return { id: recordId, orderNo, ymStockId, mmStockId };
  });
}

export async function updateCustomerOrder(recordId: string, payload: Record<string, unknown>, user: PermissionUser | null = null) {
  await assertCanUpdate(user, 'orders');
  await assertOperationDateUnlocked({
    operationDate: requireString(payload.orderDate, "Sipariş tarihi"),
    user,
    operationType: 'update'
  });
  await sql`
    update orders
    set customer_name = ${requireString(payload.customerName, "Müşteri")},
        order_date = ${requireString(payload.orderDate, "Sipariş tarihi")},
        due_date = ${requireString(payload.dueDate, "Termin tarihi")},
        raw_width = ${numberValue(payload.rawWidth, "Ham en")},
        raw_gsm = ${numberValue(payload.rawGsm, "Ham gramaj")},
        finish_width = ${numberValue(payload.finishWidth, "Finish en")},
        finish_gsm = ${numberValue(payload.finishGsm, "Finish gramaj")},
        quantity_kg = ${numberValue(payload.quantityKg, "Sipariş kg")},
        status = ${requireString(payload.status ?? "Taslak", "Durum")},
        process_type_ids = ${JSON.stringify(payload.processTypeIds ?? [])}::jsonb,
        dyehouse_process_type_ids = ${JSON.stringify(payload.dyehouseProcessTypeIds ?? [])}::jsonb,
        description = ${optionalString(payload.description) ?? ""},
        updated_at = now()
    where id = ${recordId}
  `;
  return { id: recordId };
}

export async function createPurchaseOrder(payload: Record<string, unknown>, user: PermissionUser | null = null) {
  await assertCanCreate(user, 'purchase');
  await assertOperationDateUnlocked({
    operationDate: requireString(payload.orderDate ?? new Date().toISOString().slice(0, 10), "Sipariş tarihi"),
    user,
    operationType: 'create'
  });
  return sql.begin(async (tx) => {
    const item = payload.item as Record<string, unknown> | undefined;
    if (!item) throw new Error("Satıcı sipariş kalemi zorunlu.");
    const stockType = requireString(item.stockType, "Hammadde tipi") as StockType;
    if (!["IP", "LYC", "POLY", "YM"].includes(stockType)) throw new Error("Satıcı siparişi IP, LYC, POLY veya YM için açılır.");
    const orderedKg = numberValue(item.orderedKg, "Sipariş kg");
    const recordId = id("po");
    const purchaseOrderNo = await nextBusinessNo(tx, "purchaseOrder");
    const poItem = {
      id: id("poi"),
      stockId: requireString(item.stockId, "Stok kartı"),
      stockCode: requireString(item.stockCode, "Stok kodu"),
      stockName: requireString(item.stockName, "Stok adı"),
      stockType,
      yarnCountId: optionalString(item.yarnCountId),
      colorId: optionalString(item.colorId),
      orderedKg,
      receivedKg: 0,
      remainingKg: orderedKg,
      unitPrice: item.unitPrice ? numberValue(item.unitPrice, "Birim fiyat") : null,
      currency: optionalString(item.currency) ?? "TRY",
      description: optionalString(item.description) ?? "",
    };
    await tx`
      insert into purchase_orders (
        id, purchase_order_no, supplier_id, order_date, due_date, status, items,
        total_ordered_kg, total_received_kg, total_remaining_kg, description, created_at, updated_at
      )
      values (
        ${recordId}, ${purchaseOrderNo}, ${requireString(payload.supplierId, "Satıcı")},
        ${requireString(payload.orderDate ?? new Date().toISOString().slice(0, 10), "Sipariş tarihi")},
        ${requireString(payload.dueDate, "Termin tarihi")}, 'Taslak', ${tx.json(asJson([poItem]))},
        ${orderedKg}, 0, ${orderedKg}, ${optionalString(payload.description) ?? ""}, now(), now()
      )
    `;
    return { id: recordId, purchaseOrderNo };
  });
}

export async function updatePurchaseOrder(recordId: string, payload: Record<string, unknown>, user: PermissionUser | null = null) {
  await assertCanUpdate(user, 'purchase');
  await assertOperationDateUnlocked({
    operationDate: requireString(payload.orderDate, "Sipariş tarihi"),
    user,
    operationType: 'update'
  });
  const rows = await sql`select items, total_received_kg from purchase_orders where id = ${recordId} limit 1`;
  if (!rows[0]) throw new Error("Satıcı siparişi bulunamadı.");
  const items = jsonArray(rows[0].items);
  const firstItem = items[0];
  if (!firstItem) throw new Error("Satıcı sipariş kalemi bulunamadı.");
  const orderedKg = numberValue(payload.orderedKg, "Sipariş kg");
  const receivedKg = Number(firstItem.receivedKg ?? 0);
  const stockId = optionalString(payload.stockId) ?? String(firstItem.stockId);
  const stockCode = optionalString(payload.stockCode) ?? String(firstItem.stockCode ?? "");
  const stockName = optionalString(payload.stockName) ?? String(firstItem.stockName ?? "");
  const stockType = optionalString(payload.stockType) ?? String(firstItem.stockType ?? "");
  const nextItems = [{
    ...firstItem,
    stockId,
    stockCode,
    stockName,
    stockType,
    yarnCountId: optionalString(payload.yarnCountId) ?? optionalString(firstItem.yarnCountId),
    colorId: optionalString(payload.colorId) ?? optionalString(firstItem.colorId),
    orderedKg,
    remainingKg: Math.max(orderedKg - receivedKg, 0),
    unitPrice: payload.unitPrice ? numberValue(payload.unitPrice, "Birim fiyat") : null,
    currency: optionalString(payload.currency) ?? "TRY",
  }];
  const totalReceived = Number(rows[0].total_received_kg ?? 0);
  const totalRemaining = Math.max(orderedKg - totalReceived, 0);
  await sql`
    update purchase_orders
    set supplier_id = ${requireString(payload.supplierId, "Satıcı")},
        order_date = ${requireString(payload.orderDate, "Sipariş tarihi")},
        due_date = ${requireString(payload.dueDate, "Termin tarihi")},
        status = ${requireString(payload.status ?? "Taslak", "Durum")},
        items = ${sql.json(asJson(nextItems))},
        total_ordered_kg = ${orderedKg},
        total_remaining_kg = ${totalRemaining},
        description = ${optionalString(payload.description) ?? ""},
        updated_at = now()
    where id = ${recordId}
  `;
  return { id: recordId };
}

export async function deleteCustomerOrder(recordId: string, user: PermissionUser | null = null) {
  await assertCanDelete(user, 'orders');
  const [orderRow] = await sql`select order_date from orders where id = ${recordId}`;
  if (orderRow) {
    await assertOperationDateUnlocked({
      operationDate: orderRow.order_date,
      user,
      operationType: 'delete'
    });
  }
  return sql.begin(async (tx) => {
    // Check dependencies
    const [partyCount] = await tx`select count(*)::int from parties where order_id = ${recordId}`;
    if (partyCount.count > 0) throw new Error("Bu siparişe bağlı parti kaydı var, silinemez.");

    const [rawProdCount] = await tx`select count(*)::int from production_raw where order_id = ${recordId}`;
    if (rawProdCount.count > 0) throw new Error("Bu siparişe bağlı ham üretim kaydı var, silinemez.");

    const [dyehouseProdCount] = await tx`select count(*)::int from production_dyehouse where order_id = ${recordId}`;
    if (dyehouseProdCount.count > 0) throw new Error("Bu siparişe bağlı boyahane üretim kaydı var, silinemez.");

    const [salesCount] = await tx`select count(*)::int from sales where order_id = ${recordId}`;
    if (salesCount.count > 0) throw new Error("Bu siparişe bağlı sevkiyat kaydı var, silinemez.");

    const [movementCount] = await tx`select count(*)::int from stock_movements where order_id = ${recordId}`;
    if (movementCount.count > 0) throw new Error("Bu siparişe bağlı stok hareketi var, silinemez.");

    const [allocationCount] = await tx`select count(*)::int from order_party_allocations where order_id = ${recordId}`;
    if (allocationCount.count > 0) throw new Error("Bu siparişe bağlı parti tahsisi var, silinemez.");

    // If safe, delete the order
    await tx`delete from orders where id = ${recordId}`;
    
    return { id: recordId };
  });
}

export async function deletePurchaseOrder(recordId: string, user: PermissionUser | null = null) {
  await assertCanDelete(user, 'purchase');
  const [poRow] = await sql`select order_date from purchase_orders where id = ${recordId}`;
  if (poRow) {
    await assertOperationDateUnlocked({
      operationDate: poRow.order_date,
      user,
      operationType: 'delete'
    });
  }
  const [usage] = await sql`
    select
      (select count(*)::int from purchase_receipts where purchase_order_id = ${recordId}) +
      (select count(*)::int from stock_movements where supplier_order_id = ${recordId}) +
      (select total_received_kg::numeric::int from purchase_orders where id = ${recordId}) as count
  `;

  if (Number(usage.count) > 0) {
    throw new Error("Bu hammadde siparişi silinemez. Çünkü bu siparişe bağlı mal kabul kaydı vardır.");
  }

  await sql`delete from purchase_orders where id = ${recordId}`;
  return { id: recordId };
}
