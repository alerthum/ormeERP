import { sql } from "@/db/client";
import { calculateDyehouseWaste, calculateRawWaste } from "@/services/erp-service";
import type { StockType } from "@/types/erp";
import type postgres from "postgres";

type Tx = postgres.TransactionSql;

const id = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

const tableMap = {
  fabricTypes: "settings_fabric_types",
  colors: "settings_colors",
  yarnCounts: "settings_yarn_counts",
  processTypes: "settings_process_types",
  warehouses: "warehouses",
  partners: "partners",
} as const;

export type SettingEntity = keyof typeof tableMap;

function requireString(value: unknown, field: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} zorunlu.`);
  }
  return value.trim();
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function numberValue(value: unknown, field: string) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${field} sayısal olmalı.`);
  return parsed;
}

function boolValue(value: unknown) {
  return value === true || value === "true" || value === "on";
}

async function nextCounter(tx: Tx, key: string, prefix: string) {
  const rows = await tx`
    insert into counters (key, prefix, current_value, updated_at)
    values (${key}, ${prefix}, 1, now())
    on conflict (key) do update
      set current_value = counters.current_value + 1,
          updated_at = now()
    returning current_value
  `;
  return Number(rows[0].current_value);
}

async function nextCode(tx: Tx, type: StockType) {
  const sequence = await nextCounter(tx, `stock:${type}`, type);
  return `${type}-${String(sequence).padStart(6, "0")}`;
}

async function nextBusinessNo(tx: Tx, key: "order" | "purchaseOrder" | "receipt" | "sale") {
  const year = new Date().getFullYear();
  const yy = String(year).slice(-2);
  const prefix = key === "order" ? "MS" : key === "purchaseOrder" ? "SS" : key === "receipt" ? "MK" : "SV";
  const sequence = await nextCounter(tx, `${key}:${year}`, prefix);
  return `${prefix}-${yy}${String(sequence).padStart(4, "0")}`;
}

async function nextPartyNo(tx: Tx) {
  const year = new Date().getFullYear();
  const yy = String(year).slice(-2);
  const sequence = await nextCounter(tx, `party:${year}`, yy);
  return `${yy}${String(sequence).padStart(4, "0")}`;
}

async function settingName(tx: Tx, table: string, entityId: string | null) {
  if (!entityId) return "";
  const rows = await tx`select name from ${tx(table)} where id = ${entityId} limit 1`;
  return typeof rows[0]?.name === "string" ? rows[0].name : "";
}

async function findOrCreateFabricStock(
  tx: Tx,
  type: "YM" | "MM",
  input: {
    fabricTypeId: string;
    colorId: string;
    yarnCountId: string;
    hasPolyester: boolean;
    hasLycra: boolean;
    rawWidth: number;
    rawGsm: number;
    finishWidth: number;
    finishGsm: number;
  },
) {
  const matches =
    type === "YM"
      ? await tx`
          select id from stock_cards
          where type = ${type}
            and fabric_type_id = ${input.fabricTypeId}
            and color_id = ${input.colorId}
            and yarn_count_id = ${input.yarnCountId}
            and has_polyester = ${input.hasPolyester}
            and has_lycra = ${input.hasLycra}
            and raw_width = ${input.rawWidth}
            and raw_gsm = ${input.rawGsm}
          limit 1
        `
      : await tx`
          select id from stock_cards
          where type = ${type}
            and fabric_type_id = ${input.fabricTypeId}
            and color_id = ${input.colorId}
            and yarn_count_id = ${input.yarnCountId}
            and has_polyester = ${input.hasPolyester}
            and has_lycra = ${input.hasLycra}
            and raw_width = ${input.rawWidth}
            and raw_gsm = ${input.rawGsm}
            and finish_width = ${input.finishWidth}
            and finish_gsm = ${input.finishGsm}
          limit 1
        `;

  if (matches[0]?.id) return String(matches[0].id);

  const fabricName = await settingName(tx, "settings_fabric_types", input.fabricTypeId);
  const colorName = await settingName(tx, "settings_colors", input.colorId);
  const yarnName = await settingName(tx, "settings_yarn_counts", input.yarnCountId);
  const stockId = id(type.toLowerCase());
  const code = await nextCode(tx, type);
  const name =
    type === "YM"
      ? `${fabricName} Ham ${yarnName} ${colorName} ${input.rawWidth}cm ${input.rawGsm}gsm`
      : `${fabricName} Mamül ${yarnName} ${colorName} ${input.finishWidth}cm ${input.finishGsm}gsm`;

  await tx`
    insert into stock_cards (
      id, code, type, name, fabric_type_id, color_id, yarn_count_id,
      has_polyester, has_lycra, raw_width, raw_gsm, finish_width, finish_gsm,
      unit, current_stock_kg, critical_stock_kg, created_at, updated_at, is_active
    )
    values (
      ${stockId}, ${code}, ${type}, ${name}, ${input.fabricTypeId}, ${input.colorId}, ${input.yarnCountId},
      ${input.hasPolyester}, ${input.hasLycra}, ${input.rawWidth}, ${input.rawGsm},
      ${type === "MM" ? input.finishWidth : null}, ${type === "MM" ? input.finishGsm : null},
      'kg', 0, 0, now(), now(), true
    )
  `;

  return stockId;
}

async function addBalance(tx: Tx, stockId: string, warehouseId: string, partyId: string | null, delta: number) {
  const balanceId = `bal-${stockId}-${warehouseId}-${partyId ?? "none"}`;
  await tx`
    insert into warehouse_balances (id, stock_id, warehouse_id, party_id, quantity, updated_at)
    values (${balanceId}, ${stockId}, ${warehouseId}, ${partyId}, ${delta}, now())
    on conflict (id) do update
      set quantity = warehouse_balances.quantity + ${delta},
          updated_at = now()
  `;
}

async function assertAvailableBalance(tx: Tx, stockId: string, warehouseId: string, partyId: string | null, quantity: number) {
  const balanceId = `bal-${stockId}-${warehouseId}-${partyId ?? "none"}`;
  const rows = await tx`select quantity from warehouse_balances where id = ${balanceId} limit 1`;
  const available = Number(rows[0]?.quantity ?? 0);
  if (available < quantity) {
    throw new Error(`Yetersiz stok. Mevcut bakiye ${available.toFixed(3)} kg, istenen ${quantity.toFixed(3)} kg.`);
  }
}

async function addMovement(
  tx: Tx,
  input: {
    date: string;
    stockId: string;
    warehouseId: string;
    partyId?: string | null;
    orderId?: string | null;
    movementType: string;
    direction: "IN" | "OUT";
    quantity: number;
    description: string;
    referenceType: string;
    referenceId: string;
  },
) {
  const movementId = id("mov");
  const signedQuantity = input.direction === "IN" ? input.quantity : -input.quantity;
  if (input.direction === "OUT") {
    await assertAvailableBalance(tx, input.stockId, input.warehouseId, input.partyId ?? null, input.quantity);
  }
  await tx`
    insert into stock_movements (
      id, date, stock_id, warehouse_id, party_id, order_id, movement_type, direction,
      quantity, unit, description, reference_type, reference_id, created_at, created_by
    )
    values (
      ${movementId}, ${input.date}, ${input.stockId}, ${input.warehouseId}, ${input.partyId ?? null}, ${input.orderId ?? null},
      ${input.movementType}, ${input.direction}, ${input.quantity}, 'kg', ${input.description},
      ${input.referenceType}, ${input.referenceId}, now(), 'system'
    )
  `;
  await addBalance(tx, input.stockId, input.warehouseId, input.partyId ?? null, signedQuantity);
  await tx`
    update stock_cards
    set current_stock_kg = current_stock_kg + ${signedQuantity}, updated_at = now()
    where id = ${input.stockId}
  `;
}

export async function createSetting(entity: SettingEntity, payload: Record<string, unknown>) {
  const name = requireString(payload.name, "Ad");
  const table = tableMap[entity];
  const recordId = id(entity);

  if (entity === "warehouses") {
    const kind = requireString(payload.kind ?? "RAW", "Depo tipi");
    await sql`insert into ${sql(table)} (id, name, kind, is_active) values (${recordId}, ${name}, ${kind}, true)`;
    return { id: recordId, name, kind };
  }

  if (entity === "partners") {
    const type = requireString(payload.type ?? "SUPPLIER", "Cari tipi");
    await sql`insert into ${sql(table)} (id, name, type, risk_score, is_active) values (${recordId}, ${name}, ${type}, 0, true)`;
    return { id: recordId, name, type };
  }

  await sql`insert into ${sql(table)} (id, name, is_active) values (${recordId}, ${name}, true)`;
  return { id: recordId, name };
}

export async function updateSetting(entity: SettingEntity, recordId: string, payload: Record<string, unknown>) {
  const table = tableMap[entity];
  const name = requireString(payload.name, "Ad");

  if (entity === "warehouses") {
    const kind = requireString(payload.kind ?? "RAW", "Depo tipi");
    await sql`update ${sql(table)} set name = ${name}, kind = ${kind} where id = ${recordId}`;
    return { id: recordId, name, kind };
  }

  if (entity === "partners") {
    const type = requireString(payload.type ?? "SUPPLIER", "Cari tipi");
    await sql`update ${sql(table)} set name = ${name}, type = ${type} where id = ${recordId}`;
    return { id: recordId, name, type };
  }

  await sql`update ${sql(table)} set name = ${name} where id = ${recordId}`;
  return { id: recordId, name };
}

export async function deleteSetting(entity: SettingEntity, recordId: string) {
  const table = tableMap[entity];
  await sql`delete from ${sql(table)} where id = ${recordId}`;
  return { id: recordId };
}

export async function createRole(payload: Record<string, unknown>) {
  const recordId = id("role");
  const permissions = Array.isArray(payload.permissions) ? payload.permissions.map(String) : [];
  await sql`
    insert into roles (id, name, description, permissions, is_active, created_at, updated_at)
    values (${recordId}, ${requireString(payload.name, "Rol adı")}, ${optionalString(payload.description) ?? ""}, ${JSON.stringify(permissions)}, true, now(), now())
  `;
  return { id: recordId };
}

export async function updateRole(recordId: string, payload: Record<string, unknown>) {
  const permissions = Array.isArray(payload.permissions) ? payload.permissions.map(String) : [];
  await sql`
    update roles
    set name = ${requireString(payload.name, "Rol adı")},
        description = ${optionalString(payload.description) ?? ""},
        permissions = ${JSON.stringify(permissions)},
        is_active = ${payload.isActive === undefined ? true : boolValue(payload.isActive)},
        updated_at = now()
    where id = ${recordId}
  `;
  return { id: recordId };
}

export async function deleteRole(recordId: string) {
  await sql`delete from roles where id = ${recordId}`;
  return { id: recordId };
}

export async function createUserProfile(payload: Record<string, unknown>) {
  const recordId = id("user");
  await sql`
    insert into user_profiles (id, email, full_name, role_id, is_active, created_at, updated_at)
    values (${recordId}, ${requireString(payload.email, "E-posta")}, ${requireString(payload.fullName, "Ad soyad")}, ${requireString(payload.roleId, "Rol")}, true, now(), now())
  `;
  return { id: recordId };
}

export async function deactivateUserProfile(recordId: string) {
  await sql`update user_profiles set is_active = false, updated_at = now() where id = ${recordId}`;
  return { id: recordId };
}

export async function createStockCard(payload: Record<string, unknown>) {
  const type = requireString(payload.type, "Stok tipi") as StockType;
  if (!["YM", "MM", "IP", "LYC", "POLY"].includes(type)) throw new Error("Geçersiz stok tipi.");

  return sql.begin(async (tx) => {
    const code = typeof payload.code === "string" && payload.code.trim() ? payload.code.trim() : await nextCode(tx, type);
    const recordId = id("stock");
    await tx`
      insert into stock_cards (
        id, code, type, name, fabric_type_id, color_id, yarn_count_id, has_polyester, has_lycra,
        raw_width, raw_gsm, finish_width, finish_gsm, unit, current_stock_kg, critical_stock_kg,
        created_at, updated_at, is_active
      )
      values (
        ${recordId}, ${code}, ${type}, ${requireString(payload.name, "Stok adı")},
        ${optionalString(payload.fabricTypeId)}, ${optionalString(payload.colorId)}, ${optionalString(payload.yarnCountId)},
        ${boolValue(payload.hasPolyester)}, ${boolValue(payload.hasLycra)},
        ${payload.rawWidth ? numberValue(payload.rawWidth, "Ham en") : null},
        ${payload.rawGsm ? numberValue(payload.rawGsm, "Ham gramaj") : null},
        ${payload.finishWidth ? numberValue(payload.finishWidth, "Finish en") : null},
        ${payload.finishGsm ? numberValue(payload.finishGsm, "Finish gramaj") : null},
        ${optionalString(payload.unit) ?? "kg"}, 0, ${payload.criticalStockKg ? numberValue(payload.criticalStockKg, "Kritik stok") : 0},
        now(), now(), true
      )
    `;
    return { id: recordId, code };
  });
}

export async function createCustomerOrder(payload: Record<string, unknown>) {
  return sql.begin(async (tx) => {
    const orderInput = {
      fabricTypeId: requireString(payload.fabricTypeId, "Kumaş cinsi"),
      colorId: requireString(payload.colorId, "Renk"),
      yarnCountId: requireString(payload.yarnCountId, "Ne"),
      hasPolyester: boolValue(payload.hasPolyester),
      hasLycra: boolValue(payload.hasLycra),
      rawWidth: numberValue(payload.rawWidth, "Ham en"),
      rawGsm: numberValue(payload.rawGsm, "Ham gramaj"),
      finishWidth: numberValue(payload.finishWidth, "Finish en"),
      finishGsm: numberValue(payload.finishGsm, "Finish gramaj"),
    };
    const ymStockId = await findOrCreateFabricStock(tx, "YM", orderInput);
    const mmStockId = await findOrCreateFabricStock(tx, "MM", orderInput);
    const recordId = id("order");
    const orderNo = await nextBusinessNo(tx, "order");
    await tx`
      insert into orders (
        id, order_no, customer_name, order_date, due_date, fabric_type_id, color_id, yarn_count_id,
        has_polyester, has_lycra, raw_width, raw_gsm, finish_width, finish_gsm, quantity_kg,
        ym_stock_id, mm_stock_id, status, process_type_ids, description, created_at, updated_at
      )
      values (
        ${recordId}, ${orderNo}, ${requireString(payload.customerName, "Müşteri")},
        ${requireString(payload.orderDate ?? new Date().toISOString().slice(0, 10), "Sipariş tarihi")},
        ${requireString(payload.dueDate, "Termin tarihi")},
        ${orderInput.fabricTypeId}, ${orderInput.colorId}, ${orderInput.yarnCountId},
        ${orderInput.hasPolyester}, ${orderInput.hasLycra}, ${orderInput.rawWidth}, ${orderInput.rawGsm},
        ${orderInput.finishWidth}, ${orderInput.finishGsm}, ${numberValue(payload.quantityKg, "Sipariş kg")},
        ${ymStockId}, ${mmStockId}, 'Taslak', ${JSON.stringify(payload.processTypeIds ?? [])},
        ${optionalString(payload.description) ?? ""}, now(), now()
      )
    `;
    return { id: recordId, orderNo, ymStockId, mmStockId };
  });
}

export async function createPurchaseOrder(payload: Record<string, unknown>) {
  return sql.begin(async (tx) => {
    const item = payload.item as Record<string, unknown> | undefined;
    if (!item) throw new Error("Satıcı sipariş kalemi zorunlu.");
    const stockType = requireString(item.stockType, "Hammadde tipi") as StockType;
    if (!["IP", "LYC", "POLY"].includes(stockType)) throw new Error("Satıcı siparişi yalnızca IP, LYC veya POLY için açılır.");
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
        ${requireString(payload.dueDate, "Termin tarihi")}, 'Taslak', ${JSON.stringify([poItem])},
        ${orderedKg}, 0, ${orderedKg}, ${optionalString(payload.description) ?? ""}, now(), now()
      )
    `;
    return { id: recordId, purchaseOrderNo };
  });
}

export async function createPurchaseReceipt(payload: Record<string, unknown>) {
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
    const items = orders[0].items as Array<Record<string, unknown>>;
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
        ${warehouseId}, ${String(orders[0].supplier_id)}, ${JSON.stringify([{ purchaseOrderItemId: itemId, stockId, receivedKg, lotNo: optionalString(payload.lotNo), description: optionalString(payload.description) }])},
        ${optionalString(payload.description) ?? ""}, now(), 'system'
      )
    `;
    await tx`
      update purchase_orders
      set items = ${JSON.stringify(nextItems)}, total_received_kg = ${totalReceived}, total_remaining_kg = ${remaining}, status = ${status}, updated_at = now()
      where id = ${purchaseOrderId}
    `;
    await addMovement(tx, {
      date: requireString(payload.receiptDate ?? new Date().toISOString().slice(0, 10), "Mal kabul tarihi"),
      stockId,
      warehouseId,
      movementType: "Giriş",
      direction: "IN",
      quantity: receivedKg,
      description: "Satıcı siparişi mal kabul",
      referenceType: "purchase_receipt",
      referenceId: receiptId,
    });
    return { id: receiptId, receiptNo, status };
  });
}

export async function createTransfer(payload: Record<string, unknown>) {
  return sql.begin(async (tx) => {
    const transferId = id("transfer");
    const date = requireString(payload.date ?? new Date().toISOString().slice(0, 10), "Transfer tarihi");
    const fromWarehouseId = requireString(payload.fromWarehouseId, "Kaynak depo");
    const toWarehouseId = requireString(payload.toWarehouseId, "Hedef depo");
    const items = (payload.items as Array<Record<string, unknown>> | undefined) ?? [];
    if (items.length === 0) throw new Error("Transfer kalemi zorunlu.");
    await tx`
      insert into transfers (id, date, from_warehouse_id, to_warehouse_id, items, description, created_at)
      values (${transferId}, ${date}, ${fromWarehouseId}, ${toWarehouseId}, ${JSON.stringify(items)}, ${optionalString(payload.description) ?? ""}, now())
    `;
    for (const item of items) {
      const stockId = requireString(item.stockId, "Stok");
      const partyId = optionalString(item.partyId);
      const quantity = numberValue(item.quantity, "Miktar");
      await addMovement(tx, { date, stockId, warehouseId: fromWarehouseId, partyId, movementType: "Transfer", direction: "OUT", quantity, description: "Depolar arası transfer çıkışı", referenceType: "transfer", referenceId: transferId });
      await addMovement(tx, { date, stockId, warehouseId: toWarehouseId, partyId, movementType: "Transfer", direction: "IN", quantity, description: "Depolar arası transfer girişi", referenceType: "transfer", referenceId: transferId });
    }
    return { id: transferId };
  });
}

export async function createRawProduction(payload: Record<string, unknown>) {
  return sql.begin(async (tx) => {
    const productionId = id("raw");
    const date = requireString(payload.date ?? new Date().toISOString().slice(0, 10), "Üretim tarihi");
    const orderId = requireString(payload.orderId, "Sipariş");
    const orderRows = await tx`select ym_stock_id, mm_stock_id from orders where id = ${orderId} limit 1`;
    if (!orderRows[0]) throw new Error("Sipariş bulunamadı.");
    const partyId = optionalString(payload.partyId) ?? id("party");
    let partyNo = optionalString(payload.partyNo);
    if (!optionalString(payload.partyId)) {
      partyNo = await nextPartyNo(tx);
      await tx`
        insert into parties (id, party_no, order_id, ym_stock_id, mm_stock_id, status, current_warehouse_id, timeline, created_at, updated_at)
        values (
          ${partyId}, ${partyNo}, ${orderId}, ${String(orderRows[0].ym_stock_id)}, ${String(orderRows[0].mm_stock_id)},
          'Örmede', ${requireString(payload.warehouseId, "Ham depo")},
          ${JSON.stringify([{ date, title: "Parti oluşturuldu", description: "Ham üretim kaydı ile otomatik açıldı.", tone: "blue" }])},
          now(), now()
        )
      `;
    }
    const consumedItems = (payload.consumedItems as Array<Record<string, unknown>> | undefined) ?? [];
    const consumedKg = consumedItems.reduce((sum, item) => sum + numberValue(item.quantityKg, "Tüketim kg"), 0);
    const producedRawKg = numberValue(payload.producedRawKg, "Üretilen ham kg");
    const waste = calculateRawWaste(consumedKg, producedRawKg);
    await tx`
      insert into production_raw (
        id, date, order_id, party_id, knitter_partner_id, warehouse_id, ym_stock_id, produced_raw_kg,
        consumed_items, waste_kg, waste_percent, description, created_at
      )
      values (
        ${productionId}, ${date}, ${orderId}, ${partyId}, ${requireString(payload.knitterPartnerId, "Fason örmeci")},
        ${requireString(payload.warehouseId, "Ham depo")}, ${String(orderRows[0].ym_stock_id)}, ${producedRawKg},
        ${JSON.stringify(consumedItems)}, ${waste.wasteKg}, ${waste.wastePercent}, ${optionalString(payload.description) ?? ""}, now()
      )
    `;
    for (const item of consumedItems) {
      await addMovement(tx, {
        date,
        stockId: requireString(item.stockId, "Tüketilen stok"),
        warehouseId: requireString(item.warehouseId, "Tüketim deposu"),
        partyId,
        orderId,
        movementType: "Üretim tüketim",
        direction: "OUT",
        quantity: numberValue(item.quantityKg, "Tüketim kg"),
        description: "Ham üretimde iplik tüketimi",
        referenceType: "production_raw",
        referenceId: productionId,
      });
    }
    await addMovement(tx, {
      date,
      stockId: String(orderRows[0].ym_stock_id),
      warehouseId: requireString(payload.warehouseId, "Ham depo"),
      partyId,
      orderId,
      movementType: "Üretim giriş",
      direction: "IN",
      quantity: producedRawKg,
      description: "Ham kumaş üretim girişi",
      referenceType: "production_raw",
      referenceId: productionId,
    });
    await tx`
      update parties
      set raw_produced_kg = raw_produced_kg + ${producedRawKg},
          raw_consumed_kg = raw_consumed_kg + ${consumedKg},
          raw_waste_kg = raw_waste_kg + ${waste.wasteKg},
          raw_waste_percent = case when raw_consumed_kg + ${consumedKg} > 0 then ((raw_waste_kg + ${waste.wasteKg}) / (raw_consumed_kg + ${consumedKg})) * 100 else 0 end,
          status = 'Ham Geldi',
          updated_at = now()
      where id = ${partyId}
    `;
    await tx`update orders set status = 'Ham Geldi', updated_at = now() where id = ${orderId}`;
    return { id: productionId, partyId, partyNo, waste };
  });
}

export async function createDyehouseProduction(payload: Record<string, unknown>) {
  return sql.begin(async (tx) => {
    const productionId = id("dye");
    const date = requireString(payload.date ?? new Date().toISOString().slice(0, 10), "Boyahane tarihi");
    const partyId = requireString(payload.partyId, "Parti");
    const partyRows = await tx`select order_id, ym_stock_id, mm_stock_id from parties where id = ${partyId} limit 1`;
    if (!partyRows[0]) throw new Error("Parti bulunamadı.");
    const inputRawKg = numberValue(payload.inputRawKg, "Giden ham kg");
    const finishedKg = numberValue(payload.finishedKg, "Dönen mamül kg");
    const waste = calculateDyehouseWaste(inputRawKg, finishedKg);
    await tx`
      insert into production_dyehouse (
        id, date, order_id, party_id, dyehouse_partner_id, input_warehouse_id, output_warehouse_id,
        ym_stock_id, mm_stock_id, input_raw_kg, finished_kg, waste_kg, waste_percent,
        process_type_ids, finish_width, finish_gsm, description, created_at
      )
      values (
        ${productionId}, ${date}, ${String(partyRows[0].order_id)}, ${partyId}, ${requireString(payload.dyehousePartnerId, "Boyahane")},
        ${requireString(payload.inputWarehouseId, "Giriş deposu")}, ${requireString(payload.outputWarehouseId, "Çıkış deposu")},
        ${String(partyRows[0].ym_stock_id)}, ${String(partyRows[0].mm_stock_id)}, ${inputRawKg}, ${finishedKg}, ${waste.wasteKg}, ${waste.wastePercent},
        ${JSON.stringify(payload.processTypeIds ?? [])}, ${numberValue(payload.finishWidth, "Finish en")}, ${numberValue(payload.finishGsm, "Finish gramaj")},
        ${optionalString(payload.description) ?? ""}, now()
      )
    `;
    await addMovement(tx, { date, stockId: String(partyRows[0].ym_stock_id), warehouseId: requireString(payload.inputWarehouseId, "Giriş deposu"), partyId, orderId: String(partyRows[0].order_id), movementType: "Üretim tüketim", direction: "OUT", quantity: inputRawKg, description: "Boyahanede ham kumaş tüketimi", referenceType: "production_dyehouse", referenceId: productionId });
    await addMovement(tx, { date, stockId: String(partyRows[0].mm_stock_id), warehouseId: requireString(payload.outputWarehouseId, "Çıkış deposu"), partyId, orderId: String(partyRows[0].order_id), movementType: "Üretim giriş", direction: "IN", quantity: finishedKg, description: "Boyahaneden mamül kumaş girişi", referenceType: "production_dyehouse", referenceId: productionId });
    await tx`
      update parties
      set dyehouse_input_kg = dyehouse_input_kg + ${inputRawKg},
          finished_kg = finished_kg + ${finishedKg},
          dyehouse_waste_kg = dyehouse_waste_kg + ${waste.wasteKg},
          dyehouse_waste_percent = case when dyehouse_input_kg + ${inputRawKg} > 0 then ((dyehouse_waste_kg + ${waste.wasteKg}) / (dyehouse_input_kg + ${inputRawKg})) * 100 else 0 end,
          status = 'Mamül Hazır',
          updated_at = now()
      where id = ${partyId}
    `;
    await tx`update orders set status = 'Mamül Hazır', updated_at = now() where id = ${String(partyRows[0].order_id)}`;
    return { id: productionId, waste };
  });
}

export async function createSale(payload: Record<string, unknown>) {
  return sql.begin(async (tx) => {
    const saleId = id("sale");
    const saleNo = await nextBusinessNo(tx, "sale");
    const date = requireString(payload.date ?? new Date().toISOString().slice(0, 10), "Sevkiyat tarihi");
    const partyId = requireString(payload.partyId, "Parti");
    const stockId = requireString(payload.stockId, "Stok");
    const warehouseId = requireString(payload.warehouseId, "Depo");
    const quantityKg = numberValue(payload.quantityKg, "Satış kg");
    const customerName = requireString(payload.customerName, "Müşteri");
    const partyRows = await tx`select order_id from parties where id = ${partyId} limit 1`;
    const orderId = optionalString(payload.orderId) ?? (partyRows[0]?.order_id ? String(partyRows[0].order_id) : null);

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

    await addMovement(tx, {
      date,
      stockId,
      warehouseId,
      partyId,
      orderId,
      movementType: "Çıkış",
      direction: "OUT",
      quantity: quantityKg,
      description: "Satış / sevkiyat çıkışı",
      referenceType: "sale",
      referenceId: saleId,
    });

    await tx`
      update parties
      set status = 'Sevk Edildi',
          timeline = timeline || ${JSON.stringify([{ date, title: "Sevkiyat", description: `${saleNo} ile ${quantityKg} kg çıkış yapıldı.`, tone: "green" }])}::jsonb,
          updated_at = now()
      where id = ${partyId}
    `;
    if (orderId) {
      await tx`update orders set status = 'Sevk Edildi', updated_at = now() where id = ${orderId}`;
    }
    return { id: saleId, saleNo };
  });
}

export async function cancelSale(recordId: string) {
  return sql.begin(async (tx) => {
    const rows = await tx`
      select id, sale_no, date, stock_id, warehouse_id, party_id, order_id, quantity_kg, status
      from sales
      where id = ${recordId}
      limit 1
    `;
    const sale = rows[0];
    if (!sale) throw new Error("Sevkiyat kaydı bulunamadı.");
    if (String(sale.status) === "İptal") return { id: recordId, status: "İptal" };

    await addMovement(tx, {
      date: new Date().toISOString().slice(0, 10),
      stockId: String(sale.stock_id),
      warehouseId: String(sale.warehouse_id),
      partyId: String(sale.party_id),
      orderId: sale.order_id ? String(sale.order_id) : null,
      movementType: "Düzeltme",
      direction: "IN",
      quantity: Number(sale.quantity_kg),
      description: `Sevkiyat iptal iadesi: ${String(sale.sale_no)}`,
      referenceType: "sale_cancel",
      referenceId: recordId,
    });
    await tx`update sales set status = 'İptal' where id = ${recordId}`;
    await tx`
      update parties
      set timeline = timeline || ${JSON.stringify([{ date: new Date().toISOString().slice(0, 10), title: "Sevkiyat iptal", description: `${String(sale.sale_no)} için stok iadesi işlendi.`, tone: "red" }])}::jsonb,
          updated_at = now()
      where id = ${String(sale.party_id)}
    `;
    return { id: recordId, status: "İptal" };
  });
}

export async function updateOrderStatus(recordId: string, status: string) {
  await sql`update orders set status = ${status}, updated_at = now() where id = ${recordId}`;
  return { id: recordId, status };
}

export async function cancelPurchaseOrder(recordId: string) {
  await sql`update purchase_orders set status = 'İptal', updated_at = now() where id = ${recordId}`;
  return { id: recordId, status: "İptal" };
}

export async function deactivateStockCard(recordId: string) {
  await sql`update stock_cards set is_active = false, updated_at = now() where id = ${recordId}`;
  return { id: recordId };
}
