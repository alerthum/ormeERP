import { sql } from "@/db/client";
import { id, requireString, optionalString, numberValue, boolValue } from "@/services/write/write-utils";
import { assertCanUpdate, assertCanDelete, type PermissionUser } from "./permission-guard.service";

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

export async function createSetting(entity: SettingEntity, payload: Record<string, unknown>, user: PermissionUser | null = null) {
  await assertCanUpdate(user, "settings");
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
    const dpw = optionalString(payload.defaultPurchaseWarehouseId);
    const dtw = optionalString(payload.defaultTransferTargetWarehouseId);
    const ddw = optionalString(payload.defaultDyehouseConsumptionWarehouseId);
    const dsw = optionalString(payload.defaultSalesWarehouseId);
    await sql`
      insert into ${sql(table)} (
        id, name, type, risk_score, is_active,
        default_purchase_warehouse_id, 
        default_transfer_target_warehouse_id, 
        default_dyehouse_consumption_warehouse_id, 
        default_sales_warehouse_id
      ) 
      values (
        ${recordId}, ${name}, ${type}, 0, true,
        ${dpw}, ${dtw}, ${ddw}, ${dsw}
      )
    `;
    return { id: recordId, name, type, defaultPurchaseWarehouseId: dpw, defaultTransferTargetWarehouseId: dtw, defaultDyehouseConsumptionWarehouseId: ddw, defaultSalesWarehouseId: dsw };
  }

  await sql`insert into ${sql(table)} (id, name, is_active) values (${recordId}, ${name}, true)`;
  return { id: recordId, name };
}

export async function updateSetting(entity: SettingEntity, recordId: string, payload: Record<string, unknown>, user: PermissionUser | null = null) {
  await assertCanUpdate(user, "settings");
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
    const dpw = optionalString(payload.defaultPurchaseWarehouseId);
    const dtw = optionalString(payload.defaultTransferTargetWarehouseId);
    const ddw = optionalString(payload.defaultDyehouseConsumptionWarehouseId);
    const dsw = optionalString(payload.defaultSalesWarehouseId);
    await sql`
      update ${sql(table)} set 
        name = ${name}, 
        type = ${type},
        default_purchase_warehouse_id = ${dpw},
        default_transfer_target_warehouse_id = ${dtw},
        default_dyehouse_consumption_warehouse_id = ${ddw},
        default_sales_warehouse_id = ${dsw}
      where id = ${recordId}
    `;
    return { id: recordId, name, type, defaultPurchaseWarehouseId: dpw, defaultTransferTargetWarehouseId: dtw, defaultDyehouseConsumptionWarehouseId: ddw, defaultSalesWarehouseId: dsw };
  }

  await sql`update ${sql(table)} set name = ${name} where id = ${recordId}`;
  return { id: recordId, name };
}

export async function deleteSetting(entity: SettingEntity, recordId: string, user: PermissionUser | null = null) {
  await assertCanDelete(user, "settings");
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
        (select count(*) from production_raw where consumed_items @> ${JSON.stringify([{ warehouseId: recordId }])}::jsonb::jsonb) +
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
      (select count(*) from orders where process_type_ids @> ${JSON.stringify([recordId])}::jsonb::jsonb) +
      (select count(*) from orders where dyehouse_process_type_ids @> ${JSON.stringify([recordId])}::jsonb::jsonb) +
      (select count(*) from production_dyehouse where process_type_ids @> ${JSON.stringify([recordId])}::jsonb::jsonb) as count
  `;
  return Number(rows[0]?.count ?? 0);
}
