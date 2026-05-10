import { sql } from "@/db/client";
import type { StockType } from "@/types/erp";
import { id, requireString, optionalString, numberValue, boolValue } from "@/services/write/write-utils";
import { findOrCreateFabricStock, buildRawMaterialStockName } from "@/services/write/stock-name.service";
import { nextCode } from "@/services/write/counter.service";
import { assertCanCreate, assertCanUpdate, assertCanDelete, type PermissionUser } from "./permission-guard.service";

export async function createStockCard(payload: Record<string, unknown>, user: PermissionUser | null = null) {
  await assertCanCreate(user, 'settings');
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

export async function updateStockCard(recordId: string, payload: Record<string, unknown>, user: PermissionUser | null = null) {
  await assertCanUpdate(user, 'settings');
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

export async function deleteStockCard(recordId: string, user: PermissionUser | null = null) {
  await assertCanDelete(user, 'settings');
  const [usage] = await sql`
    select
      (select count(*)::int from stock_movements where stock_id = ${recordId}) +
      (select count(*)::int from warehouse_balances where stock_id = ${recordId}) +
      (select count(*)::int from purchase_receipts where items @> ${sql.json([{ stockId: recordId }])}::jsonb) +
      (select count(*)::int from purchase_orders where items @> ${sql.json([{ stockId: recordId }])}::jsonb) +
      (select count(*)::int from production_raw where consumed_items @> ${sql.json([{ stockId: recordId }])}::jsonb) +
      (select count(*)::int from production_raw where ym_stock_id = ${recordId}) +
      (select count(*)::int from production_dyehouse where ym_stock_id = ${recordId}) +
      (select count(*)::int from production_dyehouse where mm_stock_id = ${recordId}) +
      (select count(*)::int from sales where stock_id = ${recordId}) +
      (select count(*)::int from transfers where items @> ${sql.json([{ stockId: recordId }])}::jsonb) as count
  `;

  if (Number(usage.count) > 0) {
    throw new Error("Bu stok kartı silinemez. Çünkü operasyonel kayıtlarda kullanılmıştır.");
  }

  await sql`delete from stock_cards where id = ${recordId}`;
  return { id: recordId };
}
