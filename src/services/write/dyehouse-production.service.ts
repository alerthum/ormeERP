import { sql } from "@/db/client";
import { calculateDyehouseWaste } from "@/services/erp-service";
import type { Tx } from "@/services/write/write-types";

import {
  requireString,
  optionalString,
  numberValue,
  jsonArray,
  id,
} from "@/services/write/write-utils";

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

export async function createDyehouseProduction(payload: Record<string, unknown>, user: PermissionUser | null = null) {
  await assertCanCreate(user, 'production');
  await assertOperationDateUnlocked({
    operationDate: requireString(payload.date ?? new Date().toISOString().slice(0, 10), "Boyahane tarihi"),
    user,
    operationType: 'create'
  });
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
        ${JSON.stringify(payload.processTypeIds ?? [])}::jsonb, ${numberValue(payload.finishWidth, "Finish en")}, ${numberValue(payload.finishGsm, "Finish gramaj")},
        ${optionalString(payload.description) ?? ""}, now()
      )
    `;
    const ymStockId = String(partyRows[0].ym_stock_id);
    const mmStockId = String(partyRows[0].mm_stock_id);
    const inputWarehouseId = requireString(payload.inputWarehouseId, "Giriş deposu");
    const outputWarehouseId = requireString(payload.outputWarehouseId, "Çıkış deposu");
    const partyNo = await tx`select party_no from parties where id = ${partyId}`.then(r => r[0]?.party_no);

    // Find source movement for YM consumption
    const sourceYmRows = await tx`
      select id from stock_movements 
      where stock_id = ${ymStockId} and warehouse_id = ${inputWarehouseId} and party_id = ${partyId} and direction = 'IN'
      order by created_at desc limit 1
    `;
    const sourceYmMovementId = sourceYmRows[0]?.id;

    // 1. OUT movement (YM)
    const ymOutMovId = await addMovement(tx, {
      date,
      stockId: ymStockId,
      warehouseId: inputWarehouseId,
      partyId,
      partyNo,
      orderId: String(partyRows[0].order_id),
      movementType: "Boyahane çıkış",
      direction: "OUT",
      quantity: inputRawKg,
      description: "Boyahaneye ham kumaş tüketimi",
      sourceTransactionId: productionId,
      sourceTransactionType: "production_dyehouse",
      sourceMovementId: sourceYmMovementId
    });

    // 2. IN movement (MM)
    await addMovement(tx, {
      date,
      stockId: mmStockId,
      warehouseId: outputWarehouseId,
      partyId,
      partyNo,
      orderId: String(partyRows[0].order_id),
      movementType: "Boyahane giriş",
      direction: "IN",
      quantity: finishedKg,
      description: "Boyahaneden mamül kumaş girişi",
      sourceTransactionId: productionId,
      sourceTransactionType: "production_dyehouse",
      parentMovementId: ymOutMovId
    });
    const finishWidth = numberValue(payload.finishWidth, "Finish en");
    const finishGsm = numberValue(payload.finishGsm, "Finish gramaj");
    await tx`
      update parties
      set dyehouse_input_kg = dyehouse_input_kg + ${inputRawKg},
          finished_kg = finished_kg + ${finishedKg},
          dyehouse_waste_kg = dyehouse_waste_kg + ${waste.wasteKg},
          dyehouse_waste_percent = case when (dyehouse_input_kg + ${inputRawKg}::numeric) > 0 then ((dyehouse_waste_kg + ${waste.wasteKg}::numeric) / (dyehouse_input_kg + ${inputRawKg}::numeric)) * 100 else 0 end,
          finish_width = ${finishWidth},
          finish_gsm = ${finishGsm},
          status = 'Mamül Hazır',
          updated_at = now()
      where id = ${partyId}
    `;
    await tx`update order_party_allocations
      set produced_finished_kg = produced_finished_kg + ${finishedKg},
          updated_at = now()
      where order_id = ${String(partyRows[0].order_id)} and party_id = ${partyId}
    `;
    await recalculateOrderStatus(tx, String(partyRows[0].order_id));

    await assertTransactionIntegrity(tx, "production_dyehouse", productionId);
    return { id: productionId, waste };
  });
}

export async function deleteDyehouseProduction(recordId: string, user: PermissionUser | null = null, outerTx?: Tx, skipCleanup = false) {
  await assertCanDelete(user, 'production');
  const [prodRow] = await sql`select date from production_dyehouse where id = ${recordId}`;
  if (prodRow) {
    await assertOperationDateUnlocked({
      operationDate: prodRow.date,
      user,
      operationType: 'delete'
    });
  }
  const run = async (tx: Tx) => {
    // 0. Check for subsequent transactions
    await checkSubsequentTransactions(tx, "production_dyehouse", recordId);

    const rows = await tx`
      select id, order_id, party_id, input_raw_kg, finished_kg, waste_kg
      from production_dyehouse
      where id = ${recordId}
      limit 1
    `;
    const production = rows[0];
    if (!production) throw new Error("Boyahane üretim kaydı bulunamadı.");

    const orderId = String(production.order_id);
    const partyId = String(production.party_id);
    const inputRawKg = Number(production.input_raw_kg);
    const finishedKg = Number(production.finished_kg);
    const wasteKg = Number(production.waste_kg);

    // 1. Remove all movements and reverse balances
    await removeMovementEffects(tx, [{ referenceType: "production_dyehouse", referenceId: recordId }]);

    // 2. Delete record
    await tx`delete from production_dyehouse where id = ${recordId}`;

    // 3. Update parties metrics
    await tx`
      update parties
      set dyehouse_input_kg = greatest(dyehouse_input_kg - ${inputRawKg}, 0),
          finished_kg = greatest(finished_kg - ${finishedKg}, 0),
          dyehouse_waste_kg = greatest(dyehouse_waste_kg - ${wasteKg}, 0),
          dyehouse_waste_percent = case when greatest(dyehouse_input_kg - ${inputRawKg}, 0) > 0 then (greatest(dyehouse_waste_kg - ${wasteKg}, 0) / greatest(dyehouse_input_kg - ${inputRawKg}, 0)) * 100 else 0 end,
          updated_at = now()
      where id = ${partyId}
    `;

    await assertNoOrphanOperationalData(tx);

    if (!skipCleanup) {
      await cleanupAfterOperationalChange(tx, { orderId, partyId });
    }

    return { id: recordId };
  };
  return outerTx ? run(outerTx) : sql.begin(run);
}

export async function updateDyehouseProduction(recordId: string, payload: Record<string, unknown>, user: PermissionUser | null = null) {
  await assertCanUpdate(user, 'production');
  await assertOperationDateUnlocked({
    operationDate: requireString(payload.date ?? new Date().toISOString().slice(0, 10), "Boyahane tarihi"),
    user,
    operationType: 'update'
  });
  return sql.begin(async (tx) => {
    // 0. Check for subsequent transactions
    await checkSubsequentTransactions(tx, "production_dyehouse", recordId);

    // 1. Undo old state
    await deleteDyehouseProduction(recordId, user, tx, true);

    // 2. Create new state
    const productionId = recordId;
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
        ${JSON.stringify(payload.processTypeIds ?? [])}::jsonb, ${numberValue(payload.finishWidth, "Finish en")}, ${numberValue(payload.finishGsm, "Finish gramaj")},
        ${optionalString(payload.description) ?? ""}, now()
      )
    `;

    const partyNo = await tx`select party_no from parties where id = ${partyId}`.then(r => r[0]?.party_no);
    const ymStockId = String(partyRows[0].ym_stock_id);
    const mmStockId = String(partyRows[0].mm_stock_id);
    const inputWarehouseId = requireString(payload.inputWarehouseId, "Giriş deposu");
    const outputWarehouseId = requireString(payload.outputWarehouseId, "Çıkış deposu");
    const orderId = String(partyRows[0].order_id);

    const sourceYmRows = await tx`
      select id from stock_movements 
      where stock_id = ${ymStockId} and warehouse_id = ${inputWarehouseId} and party_id = ${partyId} and direction = 'IN'
      order by created_at desc limit 1
    `;
    const ymOutMovId = await addMovement(tx, {
      date,
      stockId: ymStockId,
      warehouseId: inputWarehouseId,
      partyId,
      partyNo,
      orderId,
      movementType: "Boyahane çıkış",
      direction: "OUT",
      quantity: inputRawKg,
      description: "Boyahane güncelleme tüketimi",
      sourceTransactionId: productionId,
      sourceTransactionType: "production_dyehouse",
      sourceMovementId: sourceYmRows[0]?.id
    });
    await addMovement(tx, {
      date,
      stockId: mmStockId,
      warehouseId: outputWarehouseId,
      partyId,
      partyNo,
      orderId,
      movementType: "Boyahane giriş",
      direction: "IN",
      quantity: finishedKg,
      description: "Boyahane güncelleme girişi",
      sourceTransactionId: productionId,
      sourceTransactionType: "production_dyehouse",
      parentMovementId: ymOutMovId
    });

    await tx`
      update parties
      set dyehouse_input_kg = dyehouse_input_kg + ${inputRawKg},
          finished_kg = finished_kg + ${finishedKg},
          dyehouse_waste_kg = dyehouse_waste_kg + ${waste.wasteKg},
          dyehouse_waste_percent = case when (dyehouse_input_kg + ${inputRawKg}::numeric) > 0 then ((dyehouse_waste_kg + ${waste.wasteKg}::numeric) / (dyehouse_input_kg + ${inputRawKg}::numeric)) * 100 else 0 end,
          finish_width = ${numberValue(payload.finishWidth, "Finish en")},
          finish_gsm = ${numberValue(payload.finishGsm, "Finish gramaj")},
          updated_at = now()
      where id = ${partyId}
    `;

    await assertTransactionIntegrity(tx, "production_dyehouse", productionId);
    await recalculateOrderStatus(tx, orderId);
    return { id: productionId };
  });
}
