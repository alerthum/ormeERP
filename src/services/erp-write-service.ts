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
  if (!Number.isFinite(parsed)) throw new Error(`${field} sayÄ±sal olmalÄ±.`);
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
      : `${fabricName} MamÃ¼l ${yarnName} ${colorName} ${input.finishWidth}cm ${input.finishGsm}gsm`;

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
  const usageCount = await getSettingUsageCount(entity, recordId);
  if (usageCount > 0) {
    throw new Error(`Bu tanÄ±m ${usageCount} kayÄ±t tarafÄ±ndan kullanÄ±lÄ±yor. Ã–nce baÄŸlÄ± hareketleri/sipariÅŸleri dÃ¼zenleyin.`);
  }
  await sql`delete from ${sql(table)} where id = ${recordId}`;
  return { id: recordId };
}

async function getSettingUsageCount(entity: SettingEntity, recordId: string) {
  if (entity === "warehouses") {
    const rows = await sql`
      select
        (select count(*) from stock_movements where warehouse_id = ${recordId}) +
        (select count(*) from warehouse_balances where warehouse_id = ${recordId}) +
        (select count(*) from transfers where from_warehouse_id = ${recordId} or to_warehouse_id = ${recordId}) +
        (select count(*) from production_raw where warehouse_id = ${recordId}) +
        (select count(*) from production_raw where consumed_items @> ${JSON.stringify([{ warehouseId: recordId }])}::jsonb) +
        (select count(*) from production_dyehouse where input_warehouse_id = ${recordId} or output_warehouse_id = ${recordId}) +
        (select count(*) from purchase_receipts where warehouse_id = ${recordId}) +
        (select count(*) from sales where warehouse_id = ${recordId}) +
        (select count(*) from parties where current_warehouse_id = ${recordId}) as count
    `;
    return Number(rows[0]?.count ?? 0);
  }

  if (entity === "partners") {
    const rows = await sql`
      select
        (select count(*) from production_raw where knitter_partner_id = ${recordId}) +
        (select count(*) from production_dyehouse where dyehouse_partner_id = ${recordId}) +
        (select count(*) from purchase_orders where supplier_id = ${recordId}) +
        (select count(*) from purchase_receipts where supplier_id = ${recordId}) as count
    `;
    return Number(rows[0]?.count ?? 0);
  }

  if (entity === "fabricTypes") {
    const rows = await sql`
      select
        (select count(*) from stock_cards where fabric_type_id = ${recordId}) +
        (select count(*) from orders where fabric_type_id = ${recordId}) as count
    `;
    return Number(rows[0]?.count ?? 0);
  }

  if (entity === "colors") {
    const rows = await sql`
      select
        (select count(*) from stock_cards where color_id = ${recordId}) +
        (select count(*) from orders where color_id = ${recordId}) as count
    `;
    return Number(rows[0]?.count ?? 0);
  }

  if (entity === "yarnCounts") {
    const rows = await sql`
      select
        (select count(*) from stock_cards where yarn_count_id = ${recordId}) +
        (select count(*) from orders where yarn_count_id = ${recordId}) as count
    `;
    return Number(rows[0]?.count ?? 0);
  }

  const rows = await sql`
    select
      (select count(*) from orders where process_type_ids @> ${JSON.stringify([recordId])}::jsonb) +
      (select count(*) from production_dyehouse where process_type_ids @> ${JSON.stringify([recordId])}::jsonb) as count
  `;
  return Number(rows[0]?.count ?? 0);
}

export async function createRole(payload: Record<string, unknown>) {
  const recordId = id("role");
  const permissions = Array.isArray(payload.permissions) ? payload.permissions.map(String) : [];
  await sql`
    insert into roles (id, name, description, permissions, is_active, created_at, updated_at)
    values (${recordId}, ${requireString(payload.name, "Rol adÄ±")}, ${optionalString(payload.description) ?? ""}, ${JSON.stringify(permissions)}, true, now(), now())
  `;
  return { id: recordId };
}

export async function updateRole(recordId: string, payload: Record<string, unknown>) {
  const permissions = Array.isArray(payload.permissions) ? payload.permissions.map(String) : [];
  await sql`
    update roles
    set name = ${requireString(payload.name, "Rol adÄ±")},
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
  if (!["YM", "MM", "IP", "LYC", "POLY"].includes(type)) throw new Error("GeÃ§ersiz stok tipi.");

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
        ${recordId}, ${code}, ${type}, ${requireString(payload.name, "Stok adÄ±")},
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

export async function updateStockCard(recordId: string, payload: Record<string, unknown>) {
  const type = requireString(payload.type, "Stok tipi") as StockType;
  if (!["YM", "MM", "IP", "LYC", "POLY"].includes(type)) throw new Error("GeÃ§ersiz stok tipi.");
  await sql`
    update stock_cards
    set type = ${type},
        name = ${requireString(payload.name, "Stok adÄ±")},
        fabric_type_id = ${optionalString(payload.fabricTypeId)},
        color_id = ${optionalString(payload.colorId)},
        yarn_count_id = ${optionalString(payload.yarnCountId)},
        has_polyester = ${boolValue(payload.hasPolyester)},
        has_lycra = ${boolValue(payload.hasLycra)},
        raw_width = ${payload.rawWidth ? numberValue(payload.rawWidth, "Ham en") : null},
        raw_gsm = ${payload.rawGsm ? numberValue(payload.rawGsm, "Ham gramaj") : null},
        finish_width = ${payload.finishWidth ? numberValue(payload.finishWidth, "Finish en") : null},
        finish_gsm = ${payload.finishGsm ? numberValue(payload.finishGsm, "Finish gramaj") : null},
        critical_stock_kg = ${payload.criticalStockKg ? numberValue(payload.criticalStockKg, "Kritik stok") : 0},
        updated_at = now()
    where id = ${recordId}
  `;
  return { id: recordId };
}

export async function createCustomerOrder(payload: Record<string, unknown>) {
  return sql.begin(async (tx) => {
    const orderInput = {
      fabricTypeId: requireString(payload.fabricTypeId, "KumaÅŸ cinsi"),
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
        ${recordId}, ${orderNo}, ${requireString(payload.customerName, "MÃ¼ÅŸteri")},
        ${requireString(payload.orderDate ?? new Date().toISOString().slice(0, 10), "SipariÅŸ tarihi")},
        ${requireString(payload.dueDate, "Termin tarihi")},
        ${orderInput.fabricTypeId}, ${orderInput.colorId}, ${orderInput.yarnCountId},
        ${orderInput.hasPolyester}, ${orderInput.hasLycra}, ${orderInput.rawWidth}, ${orderInput.rawGsm},
        ${orderInput.finishWidth}, ${orderInput.finishGsm}, ${numberValue(payload.quantityKg, "SipariÅŸ kg")},
        ${ymStockId}, ${mmStockId}, 'Taslak', ${JSON.stringify(payload.processTypeIds ?? [])},
        ${optionalString(payload.description) ?? ""}, now(), now()
      )
    `;
    return { id: recordId, orderNo, ymStockId, mmStockId };
  });
}

export async function updateCustomerOrder(recordId: string, payload: Record<string, unknown>) {
  await sql`
    update orders
    set customer_name = ${requireString(payload.customerName, "MÃ¼ÅŸteri")},
        order_date = ${requireString(payload.orderDate, "SipariÅŸ tarihi")},
        due_date = ${requireString(payload.dueDate, "Termin tarihi")},
        quantity_kg = ${numberValue(payload.quantityKg, "SipariÅŸ kg")},
        status = ${requireString(payload.status ?? "Taslak", "Durum")},
        description = ${optionalString(payload.description) ?? ""},
        updated_at = now()
    where id = ${recordId}
  `;
  return { id: recordId };
}

export async function createPurchaseOrder(payload: Record<string, unknown>) {
  return sql.begin(async (tx) => {
    const item = payload.item as Record<string, unknown> | undefined;
    if (!item) throw new Error("SatÄ±cÄ± sipariÅŸ kalemi zorunlu.");
    const stockType = requireString(item.stockType, "Hammadde tipi") as StockType;
    if (!["IP", "LYC", "POLY"].includes(stockType)) throw new Error("SatÄ±cÄ± sipariÅŸi yalnÄ±zca IP, LYC veya POLY iÃ§in aÃ§Ä±lÄ±r.");
    const orderedKg = numberValue(item.orderedKg, "SipariÅŸ kg");
    const recordId = id("po");
    const purchaseOrderNo = await nextBusinessNo(tx, "purchaseOrder");
    const poItem = {
      id: id("poi"),
      stockId: requireString(item.stockId, "Stok kartÄ±"),
      stockCode: requireString(item.stockCode, "Stok kodu"),
      stockName: requireString(item.stockName, "Stok adÄ±"),
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
        ${recordId}, ${purchaseOrderNo}, ${requireString(payload.supplierId, "SatÄ±cÄ±")},
        ${requireString(payload.orderDate ?? new Date().toISOString().slice(0, 10), "SipariÅŸ tarihi")},
        ${requireString(payload.dueDate, "Termin tarihi")}, 'Taslak', ${JSON.stringify([poItem])},
        ${orderedKg}, 0, ${orderedKg}, ${optionalString(payload.description) ?? ""}, now(), now()
      )
    `;
    return { id: recordId, purchaseOrderNo };
  });
}

export async function updatePurchaseOrder(recordId: string, payload: Record<string, unknown>) {
  const rows = await sql`select items, total_received_kg from purchase_orders where id = ${recordId} limit 1`;
  if (!rows[0]) throw new Error("SatÄ±cÄ± sipariÅŸi bulunamadÄ±.");
  const items = (rows[0].items as Array<Record<string, unknown>>) ?? [];
  const firstItem = items[0];
  if (!firstItem) throw new Error("SatÄ±cÄ± sipariÅŸ kalemi bulunamadÄ±.");
  const orderedKg = numberValue(payload.orderedKg, "SipariÅŸ kg");
  const receivedKg = Number(firstItem.receivedKg ?? 0);
  const nextItems = [{ ...firstItem, orderedKg, remainingKg: Math.max(orderedKg - receivedKg, 0), unitPrice: payload.unitPrice ? numberValue(payload.unitPrice, "Birim fiyat") : null, currency: optionalString(payload.currency) ?? "TRY" }];
  const totalReceived = Number(rows[0].total_received_kg ?? 0);
  const totalRemaining = Math.max(orderedKg - totalReceived, 0);
  await sql`
    update purchase_orders
    set supplier_id = ${requireString(payload.supplierId, "SatÄ±cÄ±")},
        order_date = ${requireString(payload.orderDate, "SipariÅŸ tarihi")},
        due_date = ${requireString(payload.dueDate, "Termin tarihi")},
        status = ${requireString(payload.status ?? "Taslak", "Durum")},
        items = ${JSON.stringify(nextItems)},
        total_ordered_kg = ${orderedKg},
        total_remaining_kg = ${totalRemaining},
        description = ${optionalString(payload.description) ?? ""},
        updated_at = now()
    where id = ${recordId}
  `;
  return { id: recordId };
}

export async function createPurchaseReceipt(payload: Record<string, unknown>) {
  return sql.begin(async (tx) => {
    const purchaseOrderId = requireString(payload.purchaseOrderId, "SatÄ±cÄ± sipariÅŸi");
    const itemId = requireString(payload.purchaseOrderItemId, "SipariÅŸ kalemi");
    const stockId = requireString(payload.stockId, "Stok");
    const receivedKg = numberValue(payload.receivedKg, "Gelen kg");
    const warehouseId = requireString(payload.warehouseId, "Depo");
    const receiptId = id("receipt");
    const receiptNo = await nextBusinessNo(tx, "receipt");
    const orders = await tx`select items, supplier_id, total_received_kg, total_ordered_kg from purchase_orders where id = ${purchaseOrderId} limit 1`;
    if (!orders[0]) throw new Error("SatÄ±cÄ± sipariÅŸi bulunamadÄ±.");
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
    const status = remaining === 0 ? "TamamlandÄ±" : "KÄ±smi Geldi";
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
      movementType: "GiriÅŸ",
      direction: "IN",
      quantity: receivedKg,
      description: "SatÄ±cÄ± sipariÅŸi mal kabul",
      referenceType: "purchase_receipt",
      referenceId: receiptId,
    });
    return { id: receiptId, receiptNo, status };
  });
}

export async function createDirectRawMaterialPurchase(payload: Record<string, unknown>) {
  return sql.begin(async (tx) => {
    const stockId = requireString(payload.stockId, "Hammadde stok kartÄ±");
    const stockRows = await tx`
      select id, code, name, type, yarn_count_id, color_id
      from stock_cards
      where id = ${stockId}
      limit 1
    `;
    const stock = stockRows[0];
    if (!stock) throw new Error("Hammadde stok kartÄ± bulunamadÄ±.");
    const stockType = String(stock.type) as StockType;
    if (!["IP", "LYC", "POLY"].includes(stockType)) throw new Error("DoÄŸrudan alÄ±ÅŸ yalnÄ±zca IP, LYC veya POLY stoklarÄ± iÃ§in yapÄ±lÄ±r.");

    const quantityKg = numberValue(payload.quantityKg, "Gelen kg");
    const supplierId = requireString(payload.supplierId, "SatÄ±cÄ±");
    const warehouseId = requireString(payload.warehouseId, "Depo");
    const date = requireString(payload.receiptDate ?? new Date().toISOString().slice(0, 10), "AlÄ±ÅŸ tarihi");
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
      description: optionalString(payload.description) ?? "SipariÅŸsiz hÄ±zlÄ± hammadde alÄ±ÅŸÄ±",
    };

    await tx`
      insert into purchase_orders (
        id, purchase_order_no, supplier_id, order_date, due_date, status, items,
        total_ordered_kg, total_received_kg, total_remaining_kg, description, created_at, updated_at
      )
      values (
        ${purchaseOrderId}, ${purchaseOrderNo}, ${supplierId}, ${date}, ${date}, 'TamamlandÄ±',
        ${JSON.stringify([item])}, ${quantityKg}, ${quantityKg}, 0,
        ${optionalString(payload.description) ?? "SipariÅŸsiz hÄ±zlÄ± hammadde alÄ±ÅŸÄ±"}, now(), now()
      )
    `;
    await tx`
      insert into purchase_receipts (id, purchase_order_id, receipt_no, receipt_date, warehouse_id, supplier_id, items, description, created_at, created_by)
      values (
        ${receiptId}, ${purchaseOrderId}, ${receiptNo}, ${date}, ${warehouseId}, ${supplierId},
        ${JSON.stringify([{ purchaseOrderItemId, stockId, receivedKg: quantityKg, lotNo: optionalString(payload.lotNo), description: optionalString(payload.description) }])},
        ${optionalString(payload.description) ?? "SipariÅŸsiz hÄ±zlÄ± hammadde alÄ±ÅŸÄ±"}, now(), 'system'
      )
    `;
    await addMovement(tx, {
      date,
      stockId,
      warehouseId,
      movementType: "GiriÅŸ",
      direction: "IN",
      quantity: quantityKg,
      description: "SipariÅŸsiz hammadde alÄ±ÅŸÄ±",
      referenceType: "direct_purchase_receipt",
      referenceId: receiptId,
    });
    return { id: receiptId, receiptNo, purchaseOrderId, purchaseOrderNo };
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
      await addMovement(tx, { date, stockId, warehouseId: fromWarehouseId, partyId, movementType: "Transfer", direction: "OUT", quantity, description: "Depolar arasÄ± transfer Ã§Ä±kÄ±ÅŸÄ±", referenceType: "transfer", referenceId: transferId });
      await addMovement(tx, { date, stockId, warehouseId: toWarehouseId, partyId, movementType: "Transfer", direction: "IN", quantity, description: "Depolar arasÄ± transfer giriÅŸi", referenceType: "transfer", referenceId: transferId });
    }
    return { id: transferId };
  });
}

export async function cancelTransfer(recordId: string) {
  return sql.begin(async (tx) => {
    const existingCancel = await tx`select id from stock_movements where reference_type = 'transfer_cancel' and reference_id = ${recordId} limit 1`;
    if (existingCancel[0]) return { id: recordId, status: "Ä°ptal" };

    const rows = await tx`
      select id, date, from_warehouse_id, to_warehouse_id, items, description
      from transfers
      where id = ${recordId}
      limit 1
    `;
    const transfer = rows[0];
    if (!transfer) throw new Error("Transfer kaydÄ± bulunamadÄ±.");

    const cancelDate = new Date().toISOString().slice(0, 10);
    const items = (Array.isArray(transfer.items) ? transfer.items : []) as Array<Record<string, unknown>>;
    for (const item of items) {
      const stockId = requireString(item.stockId, "Stok");
      const partyId = optionalString(item.partyId);
      const quantity = numberValue(item.quantity, "Miktar");
      await addMovement(tx, {
        date: cancelDate,
        stockId,
        warehouseId: String(transfer.to_warehouse_id),
        partyId,
        movementType: "DÃ¼zeltme",
        direction: "OUT",
        quantity,
        description: "Transfer iptal Ã§Ä±kÄ±ÅŸÄ±",
        referenceType: "transfer_cancel",
        referenceId: recordId,
      });
      await addMovement(tx, {
        date: cancelDate,
        stockId,
        warehouseId: String(transfer.from_warehouse_id),
        partyId,
        movementType: "DÃ¼zeltme",
        direction: "IN",
        quantity,
        description: "Transfer iptal iadesi",
        referenceType: "transfer_cancel",
        referenceId: recordId,
      });
    }

    await tx`
      update transfers
      set description = trim(concat(coalesce(description, ''), ' [Ä°PTAL: ', ${cancelDate}, ']'))
      where id = ${recordId}
    `;
    return { id: recordId, status: "Ä°ptal" };
  });
}

export async function createRawProduction(payload: Record<string, unknown>) {
  return sql.begin(async (tx) => {
    const productionId = id("raw");
    const date = requireString(payload.date ?? new Date().toISOString().slice(0, 10), "Ãœretim tarihi");
    const orderId = requireString(payload.orderId, "SipariÅŸ");
    const orderRows = await tx`select ym_stock_id, mm_stock_id from orders where id = ${orderId} limit 1`;
    if (!orderRows[0]) throw new Error("SipariÅŸ bulunamadÄ±.");
    const partyId = optionalString(payload.partyId) ?? id("party");
    let partyNo = optionalString(payload.partyNo);
    if (!optionalString(payload.partyId)) {
      partyNo = await nextPartyNo(tx);
      await tx`
        insert into parties (id, party_no, order_id, ym_stock_id, mm_stock_id, status, current_warehouse_id, timeline, created_at, updated_at)
        values (
          ${partyId}, ${partyNo}, ${orderId}, ${String(orderRows[0].ym_stock_id)}, ${String(orderRows[0].mm_stock_id)},
          'Ã–rmede', ${requireString(payload.warehouseId, "Ham depo")},
          ${JSON.stringify([{ date, title: "Parti oluÅŸturuldu", description: "Ham Ã¼retim kaydÄ± ile otomatik aÃ§Ä±ldÄ±.", tone: "blue" }])},
          now(), now()
        )
      `;
    }
    const consumedItems = (payload.consumedItems as Array<Record<string, unknown>> | undefined) ?? [];
    const consumedKg = consumedItems.reduce((sum, item) => sum + numberValue(item.quantityKg, "TÃ¼ketim kg"), 0);
    const producedRawKg = numberValue(payload.producedRawKg, "Ãœretilen ham kg");
    const waste = calculateRawWaste(consumedKg, producedRawKg);
    await tx`
      insert into production_raw (
        id, date, order_id, party_id, knitter_partner_id, warehouse_id, ym_stock_id, produced_raw_kg,
        consumed_items, waste_kg, waste_percent, description, created_at
      )
      values (
        ${productionId}, ${date}, ${orderId}, ${partyId}, ${requireString(payload.knitterPartnerId, "Fason Ã¶rmeci")},
        ${requireString(payload.warehouseId, "Ham depo")}, ${String(orderRows[0].ym_stock_id)}, ${producedRawKg},
        ${JSON.stringify(consumedItems)}, ${waste.wasteKg}, ${waste.wastePercent}, ${optionalString(payload.description) ?? ""}, now()
      )
    `;
    for (const item of consumedItems) {
      await addMovement(tx, {
        date,
        stockId: requireString(item.stockId, "TÃ¼ketilen stok"),
        warehouseId: requireString(item.warehouseId, "TÃ¼ketim deposu"),
        partyId,
        orderId,
        movementType: "Ãœretim tÃ¼ketim",
        direction: "OUT",
        quantity: numberValue(item.quantityKg, "TÃ¼ketim kg"),
        description: "Ham Ã¼retimde iplik tÃ¼ketimi",
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
      movementType: "Ãœretim giriÅŸ",
      direction: "IN",
      quantity: producedRawKg,
      description: "Ham kumaÅŸ Ã¼retim giriÅŸi",
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

export async function cancelRawProduction(recordId: string) {
  return sql.begin(async (tx) => {
    const existingCancel = await tx`select id from stock_movements where reference_type = 'production_raw_cancel' and reference_id = ${recordId} limit 1`;
    if (existingCancel[0]) return { id: recordId, status: "Ä°ptal" };

    const rows = await tx`
      select id, date, order_id, party_id, warehouse_id, ym_stock_id, produced_raw_kg, consumed_items, waste_kg, description
      from production_raw
      where id = ${recordId}
      limit 1
    `;
    const production = rows[0];
    if (!production) throw new Error("Ham Ã¼retim kaydÄ± bulunamadÄ±.");

    const cancelDate = new Date().toISOString().slice(0, 10);
    const orderId = String(production.order_id);
    const partyId = String(production.party_id);
    const producedRawKg = Number(production.produced_raw_kg);
    const wasteKg = Number(production.waste_kg);
    const consumedItems = (Array.isArray(production.consumed_items) ? production.consumed_items : []) as Array<Record<string, unknown>>;
    const consumedKg = consumedItems.reduce((sum, item) => sum + numberValue(item.quantityKg, "TÃ¼ketim kg"), 0);

    await addMovement(tx, {
      date: cancelDate,
      stockId: String(production.ym_stock_id),
      warehouseId: String(production.warehouse_id),
      partyId,
      orderId,
      movementType: "DÃ¼zeltme",
      direction: "OUT",
      quantity: producedRawKg,
      description: "Ham Ã¼retim iptal Ã§Ä±kÄ±ÅŸÄ±",
      referenceType: "production_raw_cancel",
      referenceId: recordId,
    });

    for (const item of consumedItems) {
      await addMovement(tx, {
        date: cancelDate,
        stockId: requireString(item.stockId, "TÃ¼ketilen stok"),
        warehouseId: requireString(item.warehouseId, "TÃ¼ketim deposu"),
        partyId,
        orderId,
        movementType: "DÃ¼zeltme",
        direction: "IN",
        quantity: numberValue(item.quantityKg, "TÃ¼ketim kg"),
        description: "Ham Ã¼retim iptal iplik iadesi",
        referenceType: "production_raw_cancel",
        referenceId: recordId,
      });
    }

    await tx`
      update parties
      set raw_produced_kg = greatest(raw_produced_kg - ${producedRawKg}, 0),
          raw_consumed_kg = greatest(raw_consumed_kg - ${consumedKg}, 0),
          raw_waste_kg = greatest(raw_waste_kg - ${wasteKg}, 0),
          raw_waste_percent = case when greatest(raw_consumed_kg - ${consumedKg}, 0) > 0 then (greatest(raw_waste_kg - ${wasteKg}, 0) / greatest(raw_consumed_kg - ${consumedKg}, 0)) * 100 else 0 end,
          status = case when greatest(raw_produced_kg - ${producedRawKg}, 0) > 0 then status else 'OnaylandÄ±' end,
          timeline = timeline || ${JSON.stringify([{ date: cancelDate, title: "Ham Ã¼retim iptal", description: `${producedRawKg} kg ham Ã¼retim ters hareketle iptal edildi.`, tone: "red" }])}::jsonb,
          updated_at = now()
      where id = ${partyId}
    `;
    await tx`update orders set status = 'OnaylandÄ±', updated_at = now() where id = ${orderId}`;
    await tx`
      update production_raw
      set description = trim(concat(coalesce(description, ''), ' [Ä°PTAL: ', ${cancelDate}, ']'))
      where id = ${recordId}
    `;
    return { id: recordId, status: "Ä°ptal" };
  });
}

export async function createDyehouseProduction(payload: Record<string, unknown>) {
  return sql.begin(async (tx) => {
    const productionId = id("dye");
    const date = requireString(payload.date ?? new Date().toISOString().slice(0, 10), "Boyahane tarihi");
    const partyId = requireString(payload.partyId, "Parti");
    const partyRows = await tx`select order_id, ym_stock_id, mm_stock_id from parties where id = ${partyId} limit 1`;
    if (!partyRows[0]) throw new Error("Parti bulunamadÄ±.");
    const inputRawKg = numberValue(payload.inputRawKg, "Giden ham kg");
    const finishedKg = numberValue(payload.finishedKg, "DÃ¶nen mamÃ¼l kg");
    const waste = calculateDyehouseWaste(inputRawKg, finishedKg);
    await tx`
      insert into production_dyehouse (
        id, date, order_id, party_id, dyehouse_partner_id, input_warehouse_id, output_warehouse_id,
        ym_stock_id, mm_stock_id, input_raw_kg, finished_kg, waste_kg, waste_percent,
        process_type_ids, finish_width, finish_gsm, description, created_at
      )
      values (
        ${productionId}, ${date}, ${String(partyRows[0].order_id)}, ${partyId}, ${requireString(payload.dyehousePartnerId, "Boyahane")},
        ${requireString(payload.inputWarehouseId, "GiriÅŸ deposu")}, ${requireString(payload.outputWarehouseId, "Ã‡Ä±kÄ±ÅŸ deposu")},
        ${String(partyRows[0].ym_stock_id)}, ${String(partyRows[0].mm_stock_id)}, ${inputRawKg}, ${finishedKg}, ${waste.wasteKg}, ${waste.wastePercent},
        ${JSON.stringify(payload.processTypeIds ?? [])}, ${numberValue(payload.finishWidth, "Finish en")}, ${numberValue(payload.finishGsm, "Finish gramaj")},
        ${optionalString(payload.description) ?? ""}, now()
      )
    `;
    await addMovement(tx, { date, stockId: String(partyRows[0].ym_stock_id), warehouseId: requireString(payload.inputWarehouseId, "GiriÅŸ deposu"), partyId, orderId: String(partyRows[0].order_id), movementType: "Ãœretim tÃ¼ketim", direction: "OUT", quantity: inputRawKg, description: "Boyahanede ham kumaÅŸ tÃ¼ketimi", referenceType: "production_dyehouse", referenceId: productionId });
    await addMovement(tx, { date, stockId: String(partyRows[0].mm_stock_id), warehouseId: requireString(payload.outputWarehouseId, "Ã‡Ä±kÄ±ÅŸ deposu"), partyId, orderId: String(partyRows[0].order_id), movementType: "Ãœretim giriÅŸ", direction: "IN", quantity: finishedKg, description: "Boyahaneden mamÃ¼l kumaÅŸ giriÅŸi", referenceType: "production_dyehouse", referenceId: productionId });
    await tx`
      update parties
      set dyehouse_input_kg = dyehouse_input_kg + ${inputRawKg},
          finished_kg = finished_kg + ${finishedKg},
          dyehouse_waste_kg = dyehouse_waste_kg + ${waste.wasteKg},
          dyehouse_waste_percent = case when dyehouse_input_kg + ${inputRawKg} > 0 then ((dyehouse_waste_kg + ${waste.wasteKg}) / (dyehouse_input_kg + ${inputRawKg})) * 100 else 0 end,
          status = 'MamÃ¼l HazÄ±r',
          updated_at = now()
      where id = ${partyId}
    `;
    await tx`update orders set status = 'MamÃ¼l HazÄ±r', updated_at = now() where id = ${String(partyRows[0].order_id)}`;
    return { id: productionId, waste };
  });
}

export async function cancelDyehouseProduction(recordId: string) {
  return sql.begin(async (tx) => {
    const existingCancel = await tx`select id from stock_movements where reference_type = 'production_dyehouse_cancel' and reference_id = ${recordId} limit 1`;
    if (existingCancel[0]) return { id: recordId, status: "Ä°ptal" };

    const rows = await tx`
      select id, order_id, party_id, input_warehouse_id, output_warehouse_id, ym_stock_id, mm_stock_id, input_raw_kg, finished_kg, waste_kg, description
      from production_dyehouse
      where id = ${recordId}
      limit 1
    `;
    const production = rows[0];
    if (!production) throw new Error("Boyahane Ã¼retim kaydÄ± bulunamadÄ±.");

    const cancelDate = new Date().toISOString().slice(0, 10);
    const orderId = String(production.order_id);
    const partyId = String(production.party_id);
    const inputRawKg = Number(production.input_raw_kg);
    const finishedKg = Number(production.finished_kg);
    const wasteKg = Number(production.waste_kg);

    await addMovement(tx, {
      date: cancelDate,
      stockId: String(production.mm_stock_id),
      warehouseId: String(production.output_warehouse_id),
      partyId,
      orderId,
      movementType: "DÃ¼zeltme",
      direction: "OUT",
      quantity: finishedKg,
      description: "Boyahane Ã¼retim iptal mamÃ¼l Ã§Ä±kÄ±ÅŸÄ±",
      referenceType: "production_dyehouse_cancel",
      referenceId: recordId,
    });
    await addMovement(tx, {
      date: cancelDate,
      stockId: String(production.ym_stock_id),
      warehouseId: String(production.input_warehouse_id),
      partyId,
      orderId,
      movementType: "DÃ¼zeltme",
      direction: "IN",
      quantity: inputRawKg,
      description: "Boyahane Ã¼retim iptal ham iadesi",
      referenceType: "production_dyehouse_cancel",
      referenceId: recordId,
    });

    await tx`
      update parties
      set dyehouse_input_kg = greatest(dyehouse_input_kg - ${inputRawKg}, 0),
          finished_kg = greatest(finished_kg - ${finishedKg}, 0),
          dyehouse_waste_kg = greatest(dyehouse_waste_kg - ${wasteKg}, 0),
          dyehouse_waste_percent = case when greatest(dyehouse_input_kg - ${inputRawKg}, 0) > 0 then (greatest(dyehouse_waste_kg - ${wasteKg}, 0) / greatest(dyehouse_input_kg - ${inputRawKg}, 0)) * 100 else 0 end,
          status = case when greatest(finished_kg - ${finishedKg}, 0) > 0 then status else 'Ham Geldi' end,
          timeline = timeline || ${JSON.stringify([{ date: cancelDate, title: "Boyahane iptal", description: `${finishedKg} kg mamÃ¼l giriÅŸi ters hareketle iptal edildi.`, tone: "red" }])}::jsonb,
          updated_at = now()
      where id = ${partyId}
    `;
    await tx`update orders set status = 'Ham Geldi', updated_at = now() where id = ${orderId}`;
    await tx`
      update production_dyehouse
      set description = trim(concat(coalesce(description, ''), ' [Ä°PTAL: ', ${cancelDate}, ']'))
      where id = ${recordId}
    `;
    return { id: recordId, status: "Ä°ptal" };
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
    const quantityKg = numberValue(payload.quantityKg, "SatÄ±ÅŸ kg");
    const customerName = requireString(payload.customerName, "MÃ¼ÅŸteri");
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
      movementType: "Ã‡Ä±kÄ±ÅŸ",
      direction: "OUT",
      quantity: quantityKg,
      description: "SatÄ±ÅŸ / sevkiyat Ã§Ä±kÄ±ÅŸÄ±",
      referenceType: "sale",
      referenceId: saleId,
    });

    await tx`
      update parties
      set status = 'Sevk Edildi',
          timeline = timeline || ${JSON.stringify([{ date, title: "Sevkiyat", description: `${saleNo} ile ${quantityKg} kg Ã§Ä±kÄ±ÅŸ yapÄ±ldÄ±.`, tone: "green" }])}::jsonb,
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
    if (!sale) throw new Error("Sevkiyat kaydÄ± bulunamadÄ±.");
    if (String(sale.status) === "Ä°ptal") return { id: recordId, status: "Ä°ptal" };

    await addMovement(tx, {
      date: new Date().toISOString().slice(0, 10),
      stockId: String(sale.stock_id),
      warehouseId: String(sale.warehouse_id),
      partyId: String(sale.party_id),
      orderId: sale.order_id ? String(sale.order_id) : null,
      movementType: "DÃ¼zeltme",
      direction: "IN",
      quantity: Number(sale.quantity_kg),
      description: `Sevkiyat iptal iadesi: ${String(sale.sale_no)}`,
      referenceType: "sale_cancel",
      referenceId: recordId,
    });
    await tx`update sales set status = 'Ä°ptal' where id = ${recordId}`;
    await tx`
      update parties
      set timeline = timeline || ${JSON.stringify([{ date: new Date().toISOString().slice(0, 10), title: "Sevkiyat iptal", description: `${String(sale.sale_no)} iÃ§in stok iadesi iÅŸlendi.`, tone: "red" }])}::jsonb,
          updated_at = now()
      where id = ${String(sale.party_id)}
    `;
    return { id: recordId, status: "Ä°ptal" };
  });
}

export async function updateOrderStatus(recordId: string, status: string) {
  await sql`update orders set status = ${status}, updated_at = now() where id = ${recordId}`;
  return { id: recordId, status };
}

export async function deleteCustomerOrder(recordId: string) {
  const rows = await sql`
    select
      (select count(*) from parties where order_id = ${recordId}) +
      (select count(*) from stock_movements where order_id = ${recordId}) +
      (select count(*) from production_raw where order_id = ${recordId}) +
      (select count(*) from production_dyehouse where order_id = ${recordId}) +
      (select count(*) from sales where order_id = ${recordId}) as count
  `;
  const usageCount = Number(rows[0]?.count ?? 0);
  if (usageCount > 0) {
    throw new Error(`Bu sipariÅŸ ${usageCount} Ã¼retim/hareket kaydÄ±nda kullanÄ±lÄ±yor. Silmek yerine durumunu iptal edin.`);
  }
  await sql`delete from orders where id = ${recordId}`;
  return { id: recordId };
}

export async function cancelPurchaseOrder(recordId: string) {
  await sql`update purchase_orders set status = 'Ä°ptal', updated_at = now() where id = ${recordId}`;
  return { id: recordId, status: "Ä°ptal" };
}

export async function deletePurchaseOrder(recordId: string) {
  const rows = await sql`
    select
      (select count(*) from purchase_receipts where purchase_order_id = ${recordId}) +
      (select count(*) from stock_movements where reference_type = 'purchase_receipt' and reference_id in (select id from purchase_receipts where purchase_order_id = ${recordId})) as count
  `;
  const usageCount = Number(rows[0]?.count ?? 0);
  if (usageCount > 0) {
    throw new Error(`Bu satÄ±cÄ± sipariÅŸi ${usageCount} mal kabul/hareket kaydÄ±nda kullanÄ±lÄ±yor. Silmek yerine iptal edin.`);
  }
  await sql`delete from purchase_orders where id = ${recordId}`;
  return { id: recordId };
}

export async function deactivateStockCard(recordId: string) {
  const rows = await sql`
    select
      (select count(*) from stock_movements where stock_id = ${recordId}) +
      (select count(*) from warehouse_balances where stock_id = ${recordId}) +
      (select count(*) from orders where ym_stock_id = ${recordId} or mm_stock_id = ${recordId}) +
      (select count(*) from parties where ym_stock_id = ${recordId} or mm_stock_id = ${recordId}) +
      (select count(*) from production_raw where ym_stock_id = ${recordId}) +
      (select count(*) from production_raw where consumed_items @> ${JSON.stringify([{ stockId: recordId }])}::jsonb) +
      (select count(*) from production_dyehouse where ym_stock_id = ${recordId} or mm_stock_id = ${recordId}) +
      (select count(*) from sales where stock_id = ${recordId}) as count
  `;
  const usageCount = Number(rows[0]?.count ?? 0);
  if (usageCount === 0) {
    await sql`delete from stock_cards where id = ${recordId}`;
    return { id: recordId, deleted: true };
  }
  await sql`update stock_cards set is_active = false, updated_at = now() where id = ${recordId}`;
  return { id: recordId, deleted: false };
}
export async function cancelPurchaseReceipt(recordId: string) {
  return sql.begin(async (tx) => {
    const rows = await tx`select id, purchase_order_id, warehouse_id, items, description from purchase_receipts where id = ${recordId} limit 1`;
    const receipt = rows[0];
    if (!receipt) throw new Error("Mal kabul kaydı bulunamadı.");
    if (String(receipt.description).startsWith("[İPTAL]")) return { id: recordId, status: "İptal" };

    const items = (Array.isArray(receipt.items) ? receipt.items : []) as Array<Record<string, unknown>>;
    const purchaseOrderId = String(receipt.purchase_order_id);
    const cancelDate = new Date().toISOString().slice(0, 10);

    for (const item of items) {
      const stockId = requireString(item.stockId, "Stok");
      const quantity = numberValue(item.receivedKg, "Miktar");
      await addMovement(tx, {
        date: cancelDate,
        stockId,
        warehouseId: String(receipt.warehouse_id),
        movementType: "İptal",
        direction: "OUT",
        quantity,
        description: "Mal kabul iptal çıkışı",
        referenceType: "purchase_receipt_cancel",
        referenceId: recordId,
      });
    }

    await tx`update purchase_receipts set description = '[İPTAL] ' || description where id = ${recordId}`;

    // Update purchase order
    const orderRows = await tx`select items, total_received_kg, total_ordered_kg from purchase_orders where id = ${purchaseOrderId} limit 1`;
    if (orderRows[0]) {
      const orderItems = (Array.isArray(orderRows[0].items) ? orderRows[0].items : []) as Array<Record<string, unknown>>;
      let totalReceived = Number(orderRows[0].total_received_kg ?? 0);
      
      const nextItems = orderItems.map((oItem) => {
        const matchingReceiptItem = items.find((i) => i.purchaseOrderItemId === oItem.id);
        if (matchingReceiptItem) {
          const removedQty = numberValue(matchingReceiptItem.receivedKg, "Miktar");
          const nextReceived = Math.max(Number(oItem.receivedKg ?? 0) - removedQty, 0);
          const ordered = Number(oItem.orderedKg ?? 0);
          totalReceived = Math.max(totalReceived - removedQty, 0);
          return { ...oItem, receivedKg: nextReceived, remainingKg: Math.max(ordered - nextReceived, 0) };
        }
        return oItem;
      });

      const totalOrdered = Number(orderRows[0].total_ordered_kg ?? 0);
      const remaining = Math.max(totalOrdered - totalReceived, 0);
      const status = totalReceived === 0 ? "Açık" : (remaining === 0 ? "Tamamlandı" : "Kısmi Geldi");
      
      await tx`
        update purchase_orders
        set items = ${JSON.stringify(nextItems)}, total_received_kg = ${totalReceived}, total_remaining_kg = ${remaining}, status = ${status}, updated_at = now()
        where id = ${purchaseOrderId}
      `;
    }

    return { id: recordId, status: "İptal" };
  });
}

export async function updatePurchaseReceipt(recordId: string, payload: Record<string, unknown>) {
  return sql.begin(async (tx) => {
    const rows = await tx`select id, purchase_order_id, warehouse_id, items, description from purchase_receipts where id = ${recordId} limit 1`;
    const receipt = rows[0];
    if (!receipt) throw new Error("Mal kabul kaydı bulunamadı.");
    if (String(receipt.description).startsWith("[İPTAL]")) throw new Error("İptal edilmiş kayıt düzenlenemez.");

    const newDate = requireString(payload.receiptDate, "Tarih");
    const newWarehouseId = requireString(payload.warehouseId, "Depo");
    const newReceivedKg = numberValue(payload.receivedKg, "Miktar");
    const newDescription = optionalString(payload.description) ?? "";
    const newLotNo = optionalString(payload.lotNo);

    const oldItems = (Array.isArray(receipt.items) ? receipt.items : []) as Array<Record<string, unknown>>;
    const oldItem = oldItems[0];
    if (!oldItem) throw new Error("Fiş kalemi bulunamadı.");

    const oldQty = numberValue(oldItem.receivedKg, "Eski Miktar");
    const diffQty = newReceivedKg - oldQty;

    await addMovement(tx, {
      date: new Date().toISOString().slice(0, 10),
      stockId: String(oldItem.stockId),
      warehouseId: String(receipt.warehouse_id),
      movementType: "Düzeltme Çıkışı",
      direction: "OUT",
      quantity: oldQty,
      description: "Mal kabul düzeltme çıkışı",
      referenceType: "purchase_receipt_edit",
      referenceId: recordId,
    });

    await addMovement(tx, {
      date: newDate,
      stockId: payload.stockId ? String(payload.stockId) : String(oldItem.stockId),
      warehouseId: newWarehouseId,
      movementType: "Düzeltme Girişi",
      direction: "IN",
      quantity: newReceivedKg,
      description: "Mal kabul düzeltme girişi",
      referenceType: "purchase_receipt",
      referenceId: recordId,
    });

    // Update receipt
    const newSupplierId = payload.supplierId ? String(payload.supplierId) : String(receipt.supplier_id);
    const newStockId = payload.stockId ? String(payload.stockId) : String(oldItem.stockId);
    const newUnitPrice = payload.unitPrice ? Number(payload.unitPrice) : Number(oldItem.unitPrice || 0);

    const updatedItems = [{ ...oldItem, stockId: newStockId, receivedKg: newReceivedKg, unitPrice: newUnitPrice, lotNo: newLotNo, description: newDescription }];
    await tx`update purchase_receipts set receipt_date = ${newDate}, warehouse_id = ${newWarehouseId}, supplier_id = ${newSupplierId}, items = ${JSON.stringify(updatedItems)}, description = ${newDescription} where id = ${recordId}`;

    // Update purchase order
    const purchaseOrderId = String(receipt.purchase_order_id);
    const orderRows = await tx`select items, total_received_kg, total_ordered_kg from purchase_orders where id = ${purchaseOrderId} limit 1`;
    if (orderRows[0]) {
      const orderItems = (Array.isArray(orderRows[0].items) ? orderRows[0].items : []) as Array<Record<string, unknown>>;
      let totalReceived = Number(orderRows[0].total_received_kg ?? 0);
      
      const nextItems = orderItems.map((oItem) => {
        if (oItem.id === oldItem.purchaseOrderItemId) {
          const nextReceived = Math.max(Number(oItem.receivedKg ?? 0) + diffQty, 0);
          const ordered = Number(oItem.orderedKg ?? 0);
          totalReceived = Math.max(totalReceived + diffQty, 0);
          return { ...oItem, receivedKg: nextReceived, remainingKg: Math.max(ordered - nextReceived, 0) };
        }
        return oItem;
      });

      const totalOrdered = Number(orderRows[0].total_ordered_kg ?? 0);
      const remaining = Math.max(totalOrdered - totalReceived, 0);
      const status = totalReceived === 0 ? "Açık" : (remaining === 0 ? "Tamamlandı" : "Kısmi Geldi");
      
      await tx`
        update purchase_orders
        set items = ${JSON.stringify(nextItems)}, total_received_kg = ${totalReceived}, total_remaining_kg = ${remaining}, status = ${status}, updated_at = now()
        where id = ${purchaseOrderId}
      `;
    }

    return { id: recordId };
  });
}
