import { sql } from "@/db/client";
import { calculateDyehouseWaste, calculateRawWaste } from "@/services/erp-service";
import type { StockType } from "@/types/erp";
import type postgres from "postgres";

type Tx = postgres.TransactionSql;

const id = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
const asJson = (value: unknown) => value as Parameters<typeof sql.json>[0];

const tableMap = {
  fabricTypes: "settings_fabric_types",
  colors: "settings_colors",
  yarnCounts: "settings_yarn_counts",
  yarnTypes: "settings_yarn_types",
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

async function yarnTypeCode(tx: Tx, yarnTypeId: string | null) {
  if (!yarnTypeId) return "";
  const rows = await tx`select code from settings_yarn_types where id = ${yarnTypeId} limit 1`;
  return typeof rows[0]?.code === "string" ? rows[0].code.trim().toUpperCase() : "";
}

async function buildRawMaterialStockName(
  tx: Tx,
  input: {
    type: StockType;
    yarnCountId: string | null;
    colorId: string | null;
    yarnTypeId: string | null;
    hasPolyester: boolean;
    hasLycra: boolean;
  },
) {
  const yarn = await settingName(tx, "settings_yarn_counts", input.yarnCountId);
  const color = await settingName(tx, "settings_colors", input.colorId);
  const yarnType = await yarnTypeCode(tx, input.yarnTypeId);
  const yarnTypePart = yarnType && yarnType !== "OE" ? yarnType : "";
  if (input.type === "IP") {
    return ["IPLIK", yarnTypePart, yarn, color, input.hasPolyester ? "POLY" : "", input.hasLycra ? "LYC" : ""]
      .filter(Boolean)
      .join(" ");
  }
  if (input.type === "LYC") return ["LYCRA", yarn, color].filter(Boolean).join(" ");
  if (input.type === "POLY") return ["POLYESTER", yarn, color].filter(Boolean).join(" ");
  return "";
}

async function buildFabricStockName(
  tx: Tx,
  type: "YM" | "MM",
  input: {
    fabricTypeId: string;
    colorId: string;
    yarnCountId: string;
    hasPolyester: boolean;
    hasLycra: boolean;
  },
) {
  const fabricName = await settingName(tx, "settings_fabric_types", input.fabricTypeId);
  const colorName = await settingName(tx, "settings_colors", input.colorId);
  const yarnName = await settingName(tx, "settings_yarn_counts", input.yarnCountId);
  return [
    yarnName,
    fabricName.toLocaleUpperCase("tr-TR"),
    colorName.toLocaleUpperCase("tr-TR"),
    type,
    type === "YM" ? "HAM" : "MAMÜL",
    input.hasLycra ? "LYC" : "",
    input.hasPolyester ? "POLY" : "",
  ].filter(Boolean).join(" ");
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
  },
) {
  const matches = await tx`
    select id from stock_cards
    where type = ${type}
      and fabric_type_id = ${input.fabricTypeId}
      and color_id = ${input.colorId}
      and yarn_count_id = ${input.yarnCountId}
      and has_polyester = ${input.hasPolyester}
      and has_lycra = ${input.hasLycra}
    limit 1
  `;

  if (matches[0]?.id) return String(matches[0].id);

  const stockId = id(type.toLowerCase());
  const code = await nextCode(tx, type);
  const name = await buildFabricStockName(tx, type, input);

  await tx`
    insert into stock_cards (
      id, code, type, name, fabric_type_id, color_id, yarn_count_id,
      has_polyester, has_lycra,
      unit, current_stock_kg, critical_stock_kg, created_at, updated_at, is_active
    )
    values (
      ${stockId}, ${code}, ${type}, ${name}, ${input.fabricTypeId}, ${input.colorId}, ${input.yarnCountId},
      ${input.hasPolyester}, ${input.hasLycra},
      'kg', 0, 0, now(), now(), true
    )
  `;

  return stockId;
}

async function addBalance(tx: Tx, stockId: string, warehouseId: string, partyId: string | null, lotNo: string | null, delta: number) {
  const balanceId = `bal-${stockId}-${warehouseId}-${partyId ?? "none"}-${lotNo ?? "none"}`;
  await tx`
    insert into warehouse_balances (id, stock_id, warehouse_id, party_id, lot_no, quantity, updated_at)
    values (${balanceId}, ${stockId}, ${warehouseId}, ${partyId}, ${lotNo}, ${delta}, now())
    on conflict (id) do update
      set quantity = warehouse_balances.quantity + ${delta},
          updated_at = now()
  `;
}

async function removeMovementEffects(
  tx: Tx,
  references: Array<{ referenceType: string; referenceId: string }>,
) {
  if (references.length === 0) return;
  const rows = await tx`
    select id, stock_id, warehouse_id, party_id, lot_no, direction, quantity
    from stock_movements
    where ${references.map((ref) => tx`(reference_type = ${ref.referenceType} and reference_id = ${ref.referenceId})`).reduce((prev, curr) => tx`${prev} or ${curr}`)}
    order by case when direction = 'OUT' then 0 else 1 end, created_at desc
  `;

  for (const movement of rows) {
    const stockId = String(movement.stock_id);
    const warehouseId = String(movement.warehouse_id);
    const partyId = movement.party_id ? String(movement.party_id) : null;
    const lotNo = movement.lot_no ? String(movement.lot_no) : null;
    const quantity = Number(movement.quantity);
    if (String(movement.direction) === "IN") {
      await assertAvailableBalance(tx, stockId, warehouseId, partyId, lotNo, quantity);
      await addBalance(tx, stockId, warehouseId, partyId, lotNo, -quantity);
      await tx`update stock_cards set current_stock_kg = current_stock_kg - ${quantity}, updated_at = now() where id = ${stockId}`;
    } else {
      await addBalance(tx, stockId, warehouseId, partyId, lotNo, quantity);
      await tx`update stock_cards set current_stock_kg = current_stock_kg + ${quantity}, updated_at = now() where id = ${stockId}`;
    }
  }

  await tx`
    delete from stock_movements
    where ${references.map((ref) => tx`(reference_type = ${ref.referenceType} and reference_id = ${ref.referenceId})`).reduce((prev, curr) => tx`${prev} or ${curr}`)}
  `;
}

async function assertAvailableBalance(tx: Tx, stockId: string, warehouseId: string, partyId: string | null, lotNo: string | null, quantity: number) {
  const balanceId = `bal-${stockId}-${warehouseId}-${partyId ?? "none"}-${lotNo ?? "none"}`;
  const rows = await tx`select quantity from warehouse_balances where id = ${balanceId} limit 1`;
  const available = Number(rows[0]?.quantity ?? 0);
  if (available < quantity) {
    throw new Error(`Yetersiz stok. Mevcut bakiye ${available.toFixed(3)} kg, istenen ${quantity.toFixed(3)} kg.`);
  }
}

function jsonArray(value: unknown): Array<Record<string, unknown>> {
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

async function addMovement(
  tx: Tx,
  input: {
    date: string;
    stockId: string;
    warehouseId: string;
    partyId?: string | null;
    lotNo?: string | null;
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
    await assertAvailableBalance(tx, input.stockId, input.warehouseId, input.partyId ?? null, input.lotNo ?? null, input.quantity);
  }
  await tx`
    insert into stock_movements (
      id, date, stock_id, warehouse_id, party_id, lot_no, order_id, movement_type, direction,
      quantity, unit, description, reference_type, reference_id, created_at, created_by
    )
    values (
      ${movementId}, ${input.date}, ${input.stockId}, ${input.warehouseId}, ${input.partyId ?? null}, ${input.lotNo ?? null}, ${input.orderId ?? null},
      ${input.movementType}, ${input.direction}, ${input.quantity}, 'kg', ${input.description},
      ${input.referenceType}, ${input.referenceId}, now(), 'system'
    )
  `;
  await addBalance(tx, input.stockId, input.warehouseId, input.partyId ?? null, input.lotNo ?? null, signedQuantity);
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

  if (entity === "yarnTypes") {
    const code = requireString(payload.code, "Kod").toUpperCase();
    await sql`insert into ${sql(table)} (id, code, name, is_active) values (${recordId}, ${code}, ${name}, true)`;
    return { id: recordId, code, name };
  }

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

  if (entity === "yarnTypes") {
    const code = requireString(payload.code, "Kod").toUpperCase();
    const isActive = payload.isActive === undefined ? true : boolValue(payload.isActive);
    await sql`update ${sql(table)} set code = ${code}, name = ${name}, is_active = ${isActive} where id = ${recordId}`;
    return { id: recordId, code, name, isActive };
  }

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
    throw new Error(`Bu tanım ${usageCount} kayıt tarafından kullanılıyor. Önce bağlı hareketleri/siparişleri düzenleyin.`);
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

  if (entity === "yarnTypes") {
    const rows = await sql`
      select count(*) as count from stock_cards where yarn_type_id = ${recordId}
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
  const category = payload.category as "RAW" | "FABRIC";
  
  if (category === "FABRIC") {
    return sql.begin(async (tx) => {
      const fabricTypeId = requireString(payload.fabricTypeId, "Kumaş cinsi");
      const colorId = requireString(payload.colorId, "Renk");
      const yarnCountId = requireString(payload.yarnCountId, "Ne");
      const hasPolyester = boolValue(payload.hasPolyester);
      const hasLycra = boolValue(payload.hasLycra);

      const ymId = await findOrCreateFabricStock(tx, "YM", { fabricTypeId, colorId, yarnCountId, hasPolyester, hasLycra });
      const mmId = await findOrCreateFabricStock(tx, "MM", { fabricTypeId, colorId, yarnCountId, hasPolyester, hasLycra });
      const criticalStockKg = payload.criticalStockKg ? numberValue(payload.criticalStockKg, "Kritik stok") : 0;
      await tx`
        update stock_cards
        set critical_stock_kg = ${criticalStockKg}, updated_at = now()
        where id in (${ymId}, ${mmId})
      `;

      return { id: ymId, pairedId: mmId };
    });
  }

  const type = requireString(payload.type, "Stok tipi") as StockType;
  if (!["IP", "LYC", "POLY"].includes(type)) throw new Error("Hammadde stok tipi IP, LYC veya POLY olmalı.");

  return sql.begin(async (tx) => {
    const code = typeof payload.code === "string" && payload.code.trim() ? payload.code.trim() : await nextCode(tx, type);
    const recordId = id("stock");
    const yarnCountId = optionalString(payload.yarnCountId);
    const colorId = optionalString(payload.colorId);
    const yarnTypeId = optionalString(payload.yarnTypeId);
    const hasPolyester = boolValue(payload.hasPolyester);
    const hasLycra = boolValue(payload.hasLycra);
    const generatedName = await buildRawMaterialStockName(tx, { type, yarnCountId, colorId, yarnTypeId, hasPolyester, hasLycra });
    await tx`
      insert into stock_cards (
        id, code, type, name, fabric_type_id, color_id, yarn_count_id, yarn_type_id, has_polyester, has_lycra,
        unit, current_stock_kg, critical_stock_kg, created_at, updated_at, is_active
      )
      values (
        ${recordId}, ${code}, ${type}, ${generatedName || requireString(payload.name, "Stok adı")},
        ${optionalString(payload.fabricTypeId)}, ${colorId}, ${yarnCountId}, ${yarnTypeId},
        ${hasPolyester}, ${hasLycra},
        ${optionalString(payload.unit) ?? "kg"}, 0, ${payload.criticalStockKg ? numberValue(payload.criticalStockKg, "Kritik stok") : 0},
        now(), now(), true
      )
    `;
    return { id: recordId, code };
  });
}

export async function updateStockCard(recordId: string, payload: Record<string, unknown>) {
  const type = requireString(payload.type, "Stok tipi") as StockType;
  if (!["YM", "MM", "IP", "LYC", "POLY"].includes(type)) throw new Error("Geçersiz stok tipi.");
  return sql.begin(async (tx) => {
    const yarnCountId = optionalString(payload.yarnCountId);
    const colorId = optionalString(payload.colorId);
    const yarnTypeId = optionalString(payload.yarnTypeId);
    const hasPolyester = boolValue(payload.hasPolyester);
    const hasLycra = boolValue(payload.hasLycra);
    const generatedName = ["IP", "LYC", "POLY"].includes(type)
      ? await buildRawMaterialStockName(tx, { type, yarnCountId, colorId, yarnTypeId, hasPolyester, hasLycra })
      : "";
    await tx`
      update stock_cards
      set type = ${type},
          name = ${generatedName || requireString(payload.name, "Stok adı")},
          fabric_type_id = ${optionalString(payload.fabricTypeId)},
          color_id = ${colorId},
          yarn_count_id = ${yarnCountId},
          yarn_type_id = ${yarnTypeId},
          has_polyester = ${hasPolyester},
          has_lycra = ${hasLycra},
          critical_stock_kg = ${payload.criticalStockKg ? numberValue(payload.criticalStockKg, "Kritik stok") : 0},
          updated_at = now()
      where id = ${recordId}
    `;
    return { id: recordId };
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
        ${orderInput.hasPolyester}, ${orderInput.hasLycra}, ${numberValue(payload.rawWidth, "Ham en")}, ${numberValue(payload.rawGsm, "Ham gramaj")},
        ${numberValue(payload.finishWidth, "Finish en")}, ${numberValue(payload.finishGsm, "Finish gramaj")}, ${numberValue(payload.quantityKg, "Sipariş kg")},
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
    set customer_name = ${requireString(payload.customerName, "Müşteri")},
        order_date = ${requireString(payload.orderDate, "Sipariş tarihi")},
        due_date = ${requireString(payload.dueDate, "Termin tarihi")},
        quantity_kg = ${numberValue(payload.quantityKg, "Sipariş kg")},
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

export async function updatePurchaseOrder(recordId: string, payload: Record<string, unknown>) {
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
    await tx`
      update purchase_orders
      set items = ${tx.json(asJson(nextItems))}, total_received_kg = ${totalReceived}, total_remaining_kg = ${remaining}, status = ${status}, updated_at = now()
      where id = ${purchaseOrderId}
    `;
    await addMovement(tx, {
      date: requireString(payload.receiptDate ?? new Date().toISOString().slice(0, 10), "Mal kabul tarihi"),
      stockId,
      warehouseId,
      lotNo: optionalString(payload.lotNo),
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

export async function createDirectRawMaterialPurchase(payload: Record<string, unknown>) {
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
    await addMovement(tx, {
      date,
      stockId,
      warehouseId,
      lotNo: optionalString(payload.lotNo),
      movementType: "Giriş",
      direction: "IN",
      quantity: quantityKg,
      description: "Siparişsiz hammadde alışı",
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
      const trackingId = optionalString(item.partyId);
      const partyRows = trackingId ? await tx`select id from parties where id = ${trackingId} limit 1` : [];
      const partyId = partyRows[0]?.id ? trackingId : null;
      const lotNo = partyId ? optionalString(item.lotNo) : trackingId ?? optionalString(item.lotNo);
      const quantity = numberValue(item.quantity, "Miktar");
      await addMovement(tx, { date, stockId, warehouseId: fromWarehouseId, partyId, lotNo, movementType: "Transfer", direction: "OUT", quantity, description: "Depolar arası transfer çıkışı", referenceType: "transfer", referenceId: transferId });
      await addMovement(tx, { date, stockId, warehouseId: toWarehouseId, partyId, lotNo, movementType: "Transfer", direction: "IN", quantity, description: "Depolar arası transfer girişi", referenceType: "transfer", referenceId: transferId });
    }
    return { id: transferId };
  });
}

export async function cancelTransfer(recordId: string) {
  return sql.begin(async (tx) => {
    const existingCancel = await tx`select id from stock_movements where reference_type = 'transfer_cancel' and reference_id = ${recordId} limit 1`;
    if (existingCancel[0]) return { id: recordId, status: "İptal" };

    const rows = await tx`
      select id, date, from_warehouse_id, to_warehouse_id, items, description
      from transfers
      where id = ${recordId}
      limit 1
    `;
    const transfer = rows[0];
    if (!transfer) throw new Error("Transfer kaydı bulunamadı.");

    const cancelDate = new Date().toISOString().slice(0, 10);
    const items = (Array.isArray(transfer.items) ? transfer.items : []) as Array<Record<string, unknown>>;
    for (const item of items) {
      const stockId = requireString(item.stockId, "Stok");
      const trackingId = optionalString(item.partyId);
      const partyRows = trackingId ? await tx`select id from parties where id = ${trackingId} limit 1` : [];
      const partyId = partyRows[0]?.id ? trackingId : null;
      const lotNo = partyId ? optionalString(item.lotNo) : trackingId ?? optionalString(item.lotNo);
      const quantity = numberValue(item.quantity, "Miktar");
      await addMovement(tx, {
        date: cancelDate,
        stockId,
        warehouseId: String(transfer.to_warehouse_id),
        partyId,
        lotNo,
        movementType: "Düzeltme",
        direction: "OUT",
        quantity,
        description: "Transfer iptal çıkışı",
        referenceType: "transfer_cancel",
        referenceId: recordId,
      });
      await addMovement(tx, {
        date: cancelDate,
        stockId,
        warehouseId: String(transfer.from_warehouse_id),
        partyId,
        lotNo,
        movementType: "Düzeltme",
        direction: "IN",
        quantity,
        description: "Transfer iptal iadesi",
        referenceType: "transfer_cancel",
        referenceId: recordId,
      });
    }

    await tx`
      update transfers
      set description = trim(concat(coalesce(description, ''), ' [İPTAL: ', ${cancelDate}, ']'))
      where id = ${recordId}
    `;
    return { id: recordId, status: "İptal" };
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
      const rawWidth = numberValue(payload.rawWidth, "Ham en");
      const rawGsm = numberValue(payload.rawGsm, "Ham gramaj");
      partyNo = await nextPartyNo(tx);
      await tx`
        insert into parties (id, party_no, order_id, ym_stock_id, mm_stock_id, status, current_warehouse_id, raw_width, raw_gsm, timeline, created_at, updated_at)
        values (
          ${partyId}, ${partyNo}, ${orderId}, ${String(orderRows[0].ym_stock_id)}, ${String(orderRows[0].mm_stock_id)},
          'Örmede', ${requireString(payload.warehouseId, "Ham depo")}, ${rawWidth}, ${rawGsm},
          ${JSON.stringify([{ date, title: "Parti oluşturuldu", description: "Ham üretim kaydı ile otomatik açıldı.", tone: "blue" }])},
          now(), now()
        )
      `;
    }
    const consumedItems = (payload.consumedItems as Array<Record<string, unknown>> | undefined) ?? [];
    const consumedKg = consumedItems.reduce((sum, item) => sum + numberValue(item.quantityKg, "Tüketim kg"), 0);
    const producedRawKg = numberValue(payload.producedRawKg, "Üretilen ham kg");
    const waste = calculateRawWaste(consumedKg, producedRawKg);
    const rawWidth = numberValue(payload.rawWidth, "Ham en");
    const rawGsm = numberValue(payload.rawGsm, "Ham gramaj");
    await tx`
      insert into production_raw (
        id, date, order_id, party_id, knitter_partner_id, warehouse_id, ym_stock_id, produced_raw_kg,
        raw_width, raw_gsm, consumed_items, waste_kg, waste_percent, description, created_at
      )
      values (
        ${productionId}, ${date}, ${orderId}, ${partyId}, ${requireString(payload.knitterPartnerId, "Fason örmeci")},
        ${requireString(payload.warehouseId, "Ham depo")}, ${String(orderRows[0].ym_stock_id)}, ${producedRawKg},
        ${rawWidth}, ${rawGsm}, ${JSON.stringify(consumedItems)}, ${waste.wasteKg}, ${waste.wastePercent}, ${optionalString(payload.description) ?? ""}, now()
      )
    `;
    for (const item of consumedItems) {
      await addMovement(tx, {
        date,
        stockId: requireString(item.stockId, "Tüketilen stok"),
        warehouseId: requireString(item.warehouseId, "Tüketim deposu"),
        lotNo: optionalString(item.lotNo),
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
    await tx`
      insert into order_party_allocations (
        id, order_id, party_id, allocated_kg, produced_raw_kg, produced_finished_kg, shipped_kg, status, created_at, updated_at
      )
      values (${id("opa")}, ${orderId}, ${partyId}, ${producedRawKg}, ${producedRawKg}, 0, 0, 'Aktif', now(), now())
    `;
    await tx`update orders set status = 'Ham Geldi', updated_at = now() where id = ${orderId}`;
    return { id: productionId, partyId, partyNo, waste };
  });
}

export async function cancelRawProduction(recordId: string) {
  return sql.begin(async (tx) => {
    const existingCancel = await tx`select id from stock_movements where reference_type = 'production_raw_cancel' and reference_id = ${recordId} limit 1`;
    if (existingCancel[0]) return { id: recordId, status: "İptal" };

    const rows = await tx`
      select id, date, order_id, party_id, warehouse_id, ym_stock_id, produced_raw_kg, consumed_items, waste_kg, description
      from production_raw
      where id = ${recordId}
      limit 1
    `;
    const production = rows[0];
    if (!production) throw new Error("Ham üretim kaydı bulunamadı.");

    const cancelDate = new Date().toISOString().slice(0, 10);
    const orderId = String(production.order_id);
    const partyId = String(production.party_id);
    const producedRawKg = Number(production.produced_raw_kg);
    const wasteKg = Number(production.waste_kg);
    const consumedItems = (Array.isArray(production.consumed_items) ? production.consumed_items : []) as Array<Record<string, unknown>>;
    const consumedKg = consumedItems.reduce((sum, item) => sum + numberValue(item.quantityKg, "Tüketim kg"), 0);

    await addMovement(tx, {
      date: cancelDate,
      stockId: String(production.ym_stock_id),
      warehouseId: String(production.warehouse_id),
      partyId,
      orderId,
      movementType: "Düzeltme",
      direction: "OUT",
      quantity: producedRawKg,
      description: "Ham üretim iptal çıkışı",
      referenceType: "production_raw_cancel",
      referenceId: recordId,
    });

    for (const item of consumedItems) {
      await addMovement(tx, {
        date: cancelDate,
        stockId: requireString(item.stockId, "Tüketilen stok"),
        warehouseId: requireString(item.warehouseId, "Tüketim deposu"),
        lotNo: optionalString(item.lotNo),
        orderId,
        movementType: "Düzeltme",
        direction: "IN",
        quantity: numberValue(item.quantityKg, "Tüketim kg"),
        description: "Ham üretim iptal iplik iadesi",
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
          status = case when greatest(raw_produced_kg - ${producedRawKg}, 0) > 0 then status else 'Onaylandı' end,
          timeline = timeline || ${JSON.stringify([{ date: cancelDate, title: "Ham üretim iptal", description: `${producedRawKg} kg ham üretim ters hareketle iptal edildi.`, tone: "red" }])}::jsonb,
          updated_at = now()
      where id = ${partyId}
    `;
    await tx`update orders set status = 'Onaylandı', updated_at = now() where id = ${orderId}`;
    await tx`
      update production_raw
      set description = trim(concat(coalesce(description, ''), ' [İPTAL: ', ${cancelDate}, ']'))
      where id = ${recordId}
    `;
    return { id: recordId, status: "İptal" };
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
    const finishWidth = numberValue(payload.finishWidth, "Finish en");
    const finishGsm = numberValue(payload.finishGsm, "Finish gramaj");
    await tx`
      update parties
      set dyehouse_input_kg = dyehouse_input_kg + ${inputRawKg},
          finished_kg = finished_kg + ${finishedKg},
          dyehouse_waste_kg = dyehouse_waste_kg + ${waste.wasteKg},
          dyehouse_waste_percent = case when dyehouse_input_kg + ${inputRawKg} > 0 then ((dyehouse_waste_kg + ${waste.wasteKg}) / (dyehouse_input_kg + ${inputRawKg})) * 100 else 0 end,
          finish_width = ${finishWidth},
          finish_gsm = ${finishGsm},
          status = 'Mamül Hazır',
          updated_at = now()
      where id = ${partyId}
    `;
    await tx`
      update order_party_allocations
      set produced_finished_kg = produced_finished_kg + ${finishedKg},
          updated_at = now()
      where order_id = ${String(partyRows[0].order_id)} and party_id = ${partyId}
    `;
    await tx`update orders set status = 'Mamül Hazır', updated_at = now() where id = ${String(partyRows[0].order_id)}`;
    return { id: productionId, waste };
  });
}

export async function cancelDyehouseProduction(recordId: string) {
  return sql.begin(async (tx) => {
    const existingCancel = await tx`select id from stock_movements where reference_type = 'production_dyehouse_cancel' and reference_id = ${recordId} limit 1`;
    if (existingCancel[0]) return { id: recordId, status: "İptal" };

    const rows = await tx`
      select id, order_id, party_id, input_warehouse_id, output_warehouse_id, ym_stock_id, mm_stock_id, input_raw_kg, finished_kg, waste_kg, description
      from production_dyehouse
      where id = ${recordId}
      limit 1
    `;
    const production = rows[0];
    if (!production) throw new Error("Boyahane üretim kaydı bulunamadı.");

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
      movementType: "Düzeltme",
      direction: "OUT",
      quantity: finishedKg,
      description: "Boyahane üretim iptal mamül çıkışı",
      referenceType: "production_dyehouse_cancel",
      referenceId: recordId,
    });
    await addMovement(tx, {
      date: cancelDate,
      stockId: String(production.ym_stock_id),
      warehouseId: String(production.input_warehouse_id),
      partyId,
      orderId,
      movementType: "Düzeltme",
      direction: "IN",
      quantity: inputRawKg,
      description: "Boyahane üretim iptal ham iadesi",
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
          timeline = timeline || ${JSON.stringify([{ date: cancelDate, title: "Boyahane iptal", description: `${finishedKg} kg mamül girişi ters hareketle iptal edildi.`, tone: "red" }])}::jsonb,
          updated_at = now()
      where id = ${partyId}
    `;
    await tx`update orders set status = 'Ham Geldi', updated_at = now() where id = ${orderId}`;
    await tx`
      update production_dyehouse
      set description = trim(concat(coalesce(description, ''), ' [İPTAL: ', ${cancelDate}, ']'))
      where id = ${recordId}
    `;
    return { id: recordId, status: "İptal" };
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
      set timeline = timeline || ${JSON.stringify([{ date, title: "Parti kaydırma", description: `${shiftKg} kg kaynak siparişten hedef siparişe bağlandı.`, tone: "amber" }])}::jsonb,
          updated_at = now()
      where id = ${partyId}
    `;

    return { id: partyId, shiftedKg: shiftKg };
  });
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
    throw new Error(`Bu sipariş ${usageCount} üretim/hareket kaydında kullanılıyor. Silmek yerine durumunu iptal edin.`);
  }
  await sql`delete from orders where id = ${recordId}`;
  return { id: recordId };
}

export async function cancelPurchaseOrder(recordId: string) {
  await sql`update purchase_orders set status = 'İptal', updated_at = now() where id = ${recordId}`;
  return { id: recordId, status: "İptal" };
}

export async function deletePurchaseOrder(recordId: string) {
  const rows = await sql`
    select
      (select count(*) from purchase_receipts where purchase_order_id = ${recordId}) +
      (select count(*) from stock_movements where reference_type = 'purchase_receipt' and reference_id in (select id from purchase_receipts where purchase_order_id = ${recordId})) as count
  `;
  const usageCount = Number(rows[0]?.count ?? 0);
  if (usageCount > 0) {
    throw new Error(`Bu satıcı siparişi ${usageCount} mal kabul/hareket kaydında kullanılıyor. Silmek yerine iptal edin.`);
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

    const items = jsonArray(receipt.items);
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
      const orderItems = jsonArray(orderRows[0].items);
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
        set items = ${tx.json(asJson(nextItems))}, total_received_kg = ${totalReceived}, total_remaining_kg = ${remaining}, status = ${status}, updated_at = now()
        where id = ${purchaseOrderId}
      `;
    }

    return { id: recordId, status: "İptal" };
  });
}

export async function deletePurchaseReceipt(recordId: string) {
  return sql.begin(async (tx) => {
    const rows = await tx`
      select id, purchase_order_id, items
      from purchase_receipts
      where id = ${recordId}
      limit 1
    `;
    const receipt = rows[0];
    if (!receipt) throw new Error("Mal kabul kaydı bulunamadı.");

    const items = jsonArray(receipt.items);
    const purchaseOrderId = String(receipt.purchase_order_id);
    const directRows = await tx`
      select id from stock_movements
      where reference_type = 'direct_purchase_receipt' and reference_id = ${recordId}
      limit 1
    `;
    const isDirectPurchase = Boolean(directRows[0]);

    const movementTypes = ["purchase_receipt", "direct_purchase_receipt", "purchase_receipt_cancel", "purchase_receipt_edit"];
    await removeMovementEffects(
      tx,
      movementTypes.map((referenceType) => ({ referenceType, referenceId: recordId })),
    );

    const orderRows = await tx`select items, total_received_kg, total_ordered_kg from purchase_orders where id = ${purchaseOrderId} limit 1`;
    if (orderRows[0]) {
      const orderItems = jsonArray(orderRows[0].items);
      let totalReceived = Number(orderRows[0].total_received_kg ?? 0);
      const nextItems = orderItems.map((orderItem) => {
        const receiptItem = items.find((item) => item.purchaseOrderItemId === orderItem.id);
        if (!receiptItem) return orderItem;
        const removedQty = numberValue(receiptItem.receivedKg, "Miktar");
        const nextReceived = Math.max(Number(orderItem.receivedKg ?? 0) - removedQty, 0);
        const ordered = Number(orderItem.orderedKg ?? 0);
        totalReceived = Math.max(totalReceived - removedQty, 0);
        return { ...orderItem, receivedKg: nextReceived, remainingKg: Math.max(ordered - nextReceived, 0) };
      });
      const totalOrdered = Number(orderRows[0].total_ordered_kg ?? 0);
      const remaining = Math.max(totalOrdered - totalReceived, 0);
      const status = totalReceived === 0 ? "Açık" : remaining === 0 ? "Tamamlandı" : "Kısmi Geldi";
      await tx`
        update purchase_orders
        set items = ${tx.json(asJson(nextItems))},
            total_received_kg = ${totalReceived},
            total_remaining_kg = ${remaining},
            status = ${status},
            updated_at = now()
        where id = ${purchaseOrderId}
      `;
    }

    await tx`delete from purchase_receipts where id = ${recordId}`;
    const remainingReceipts = await tx`select count(*) as count from purchase_receipts where purchase_order_id = ${purchaseOrderId}`;
    if (isDirectPurchase && Number(remainingReceipts[0]?.count ?? 0) === 0) {
      await tx`delete from purchase_orders where id = ${purchaseOrderId}`;
    }
    return { id: recordId, deleted: true };
  });
}

export async function updatePurchaseReceipt(recordId: string, payload: Record<string, unknown>) {
  return sql.begin(async (tx) => {
    const rows = await tx`select id, purchase_order_id, warehouse_id, supplier_id, items, description from purchase_receipts where id = ${recordId} limit 1`;
    const receipt = rows[0];
    if (!receipt) throw new Error("Mal kabul kaydı bulunamadı.");
    if (String(receipt.description).startsWith("[İPTAL]")) throw new Error("İptal edilmiş kayıt düzenlenemez.");

    const newDate = requireString(payload.receiptDate, "Tarih");
    const newWarehouseId = requireString(payload.warehouseId, "Depo");
    const newReceivedKg = numberValue(payload.receivedKg, "Miktar");
    const newDescription = optionalString(payload.description) ?? "";
    const newLotNo = optionalString(payload.lotNo);

    const oldItems = jsonArray(receipt.items);
    const oldItem = oldItems[0];
    if (!oldItem) throw new Error("Fiş kalemi bulunamadı.");

    const oldQty = numberValue(oldItem.receivedKg, "Eski Miktar");
    const diffQty = newReceivedKg - oldQty;

    await addMovement(tx, {
      date: new Date().toISOString().slice(0, 10),
      stockId: String(oldItem.stockId),
      warehouseId: String(receipt.warehouse_id),
      lotNo: optionalString(oldItem.lotNo),
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
      lotNo: newLotNo,
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
    await tx`update purchase_receipts set receipt_date = ${newDate}, warehouse_id = ${newWarehouseId}, supplier_id = ${newSupplierId}, items = ${tx.json(asJson(updatedItems))}, description = ${newDescription} where id = ${recordId}`;

    // Update purchase order
    const purchaseOrderId = String(receipt.purchase_order_id);
    const orderRows = await tx`select items, total_received_kg, total_ordered_kg from purchase_orders where id = ${purchaseOrderId} limit 1`;
    if (orderRows[0]) {
      const orderItems = jsonArray(orderRows[0].items);
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
        set items = ${tx.json(asJson(nextItems))}, total_received_kg = ${totalReceived}, total_remaining_kg = ${remaining}, status = ${status}, updated_at = now()
        where id = ${purchaseOrderId}
      `;
    }

    return { id: recordId };
  });
}
