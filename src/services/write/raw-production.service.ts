import { sql } from "@/db/client";
import { calculateRawWaste } from "@/services/erp-service";
import type { Tx } from "@/services/write/write-types";

import {
  id,
  requireString,
  optionalString,
  numberValue,
  jsonArray,
} from "@/services/write/write-utils";

import {
  nextPartyNo,
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

export async function createRawProduction(payload: Record<string, unknown>, user: PermissionUser | null = null) {
  await assertCanCreate(user, 'production');
  await assertOperationDateUnlocked({
    operationDate: requireString(payload.date ?? new Date().toISOString().slice(0, 10), "Üretim tarihi"),
    user,
    operationType: 'create'
  });
  return sql.begin(async (tx) => {
    const productionId = id("raw");
    const date = requireString(payload.date ?? new Date().toISOString().slice(0, 10), "Üretim tarihi");
    const orderId = requireString(payload.orderId, "Sipariş");
    const orderRows = await tx`select ym_stock_id, mm_stock_id from orders where id = ${orderId} limit 1`;
    if (!orderRows[0]) throw new Error("Sipariş bulunamadı.");
    let partyId = optionalString(payload.partyId) ?? id("party");
    let partyNo = optionalString(payload.partyNo);

    // Check if we need to create or link a party
    if (!optionalString(payload.partyId)) {
      // If partyNo is provided, check if it already exists for this order
      if (partyNo) {
        const existingParty = await tx`select id from parties where party_no = ${partyNo} and order_id = ${orderId} limit 1`;
        if (existingParty[0]) {
          // Use existing party ID if found
          partyId = existingParty[0].id;
        } else {
          // Create new party with provided partyNo
          await tx`
            insert into parties (id, party_no, order_id, ym_stock_id, mm_stock_id, status, current_warehouse_id, raw_width, raw_gsm, timeline, created_at, updated_at)
            values (
              ${partyId}, ${partyNo}, ${orderId}, ${String(orderRows[0].ym_stock_id)}, ${String(orderRows[0].mm_stock_id)},
              'Örmede', ${requireString(payload.warehouseId, "Ham depo")}, ${numberValue(payload.rawWidth, "Ham en")}, ${numberValue(payload.rawGsm, "Ham gramaj")},
              ${JSON.stringify([{ date, title: "Parti oluşturuldu", description: "Manuel parti numarası ile ham üretim başlatıldı.", tone: "blue" }])}::jsonb,
              now(), now()
            )
          `;
        }
      } else {
        // Fallback to automatic if neither ID nor No provided (though UI should provide No)
        partyNo = await nextPartyNo(tx);
        await tx`
          insert into parties (id, party_no, order_id, ym_stock_id, mm_stock_id, status, current_warehouse_id, raw_width, raw_gsm, timeline, created_at, updated_at)
          values (
            ${partyId}, ${partyNo}, ${orderId}, ${String(orderRows[0].ym_stock_id)}, ${String(orderRows[0].mm_stock_id)},
            'Örmede', ${requireString(payload.warehouseId, "Ham depo")}, ${numberValue(payload.rawWidth, "Ham en")}, ${numberValue(payload.rawGsm, "Ham gramaj")},
            ${JSON.stringify([{ date, title: "Parti oluşturuldu", description: "Ham üretim kaydı ile otomatik açıldı.", tone: "blue" }])}::jsonb,
            now(), now()
          )
        `;
      }
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
        ${rawWidth}, ${rawGsm}, ${JSON.stringify(consumedItems)}::jsonb, ${waste.wasteKg}, ${waste.wastePercent}, ${optionalString(payload.description) ?? ""}, now()
      )
    `;
    const consumedMovIds: string[] = [];
    for (const item of consumedItems) {
      const sId = requireString(item.stockId, "Tüketilen stok");
      const wId = requireString(item.warehouseId, "Tüketim deposu");
      const lNo = optionalString(item.lotNo);

      // Find source movement for this consumption (latest IN movement for this lot/warehouse)
      const sourceMovRows = await tx`
        select id from stock_movements 
        where stock_id = ${sId} and warehouse_id = ${wId} and lot_no = ${lNo}::text and direction = 'IN'
        order by created_at desc limit 1
      `;
      const sourceMovementId = sourceMovRows[0]?.id;

      const movId = await addMovement(tx, {
        date,
        stockId: sId,
        warehouseId: wId,
        lotNo: lNo,
        orderId,
        movementType: "Üretim tüketim",
        direction: "OUT",
        quantity: numberValue(item.quantityKg, "Tüketim kg"),
        description: "Ham üretimde iplik tüketimi",
        sourceTransactionId: productionId,
        sourceTransactionType: "production_raw",
        sourceMovementId: sourceMovementId,
      });
      consumedMovIds.push(movId);
    }
    await addMovement(tx, {
      date,
      stockId: String(orderRows[0].ym_stock_id),
      warehouseId: requireString(payload.warehouseId, "Ham depo"),
      partyId,
      partyNo,
      orderId,
      movementType: "Üretim giriş",
      direction: "IN",
      quantity: producedRawKg,
      description: "Ham kumaş üretim girişi",
      sourceTransactionId: productionId,
      sourceTransactionType: "production_raw",
      parentMovementId: consumedMovIds[0]
    });
    await tx`
      update parties
      set raw_produced_kg = raw_produced_kg + ${producedRawKg},
          raw_consumed_kg = raw_consumed_kg + ${consumedKg},
          raw_waste_kg = raw_waste_kg + ${waste.wasteKg},
          raw_waste_percent = case when (raw_consumed_kg + ${consumedKg}::numeric) > 0 then ((raw_waste_kg + ${waste.wasteKg}::numeric) / (raw_consumed_kg + ${consumedKg}::numeric)) * 100 else 0 end,
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
    await recalculateOrderStatus(tx, orderId);

    await assertTransactionIntegrity(tx, "production_raw", productionId);
    return { id: productionId, partyId, partyNo, waste };
  });
}

export async function deleteRawProduction(recordId: string, user: PermissionUser | null = null, outerTx?: Tx, skipCleanup = false) {
  await assertCanDelete(user, 'production');
  const [prodRow] = await sql`select date from production_raw where id = ${recordId}`;
  if (prodRow) {
    await assertOperationDateUnlocked({
      operationDate: prodRow.date,
      user,
      operationType: 'delete'
    });
  }
  const run = async (tx: Tx) => {
    // 0. Check for subsequent transactions
    await checkSubsequentTransactions(tx, "production_raw", recordId);

    const rows = await tx`
      select id, order_id, party_id, produced_raw_kg, consumed_items, waste_kg
      from production_raw
      where id = ${recordId}
      limit 1
    `;
    const production = rows[0];
    if (!production) throw new Error("Ham üretim kaydı bulunamadı.");

    const orderId = String(production.order_id);
    const partyId = String(production.party_id);
    const producedRawKg = Number(production.produced_raw_kg);
    const wasteKg = Number(production.waste_kg);
    const consumedItems = jsonArray(production.consumed_items);
    const consumedKg = consumedItems.reduce((sum, item) => sum + numberValue(item.quantityKg, "Tüketim kg"), 0);

    // 1. Remove all movements and reverse balances
    await removeMovementEffects(tx, [{ referenceType: "production_raw", referenceId: recordId }]);

    // 2. Delete the record
    await tx`delete from production_raw where id = ${recordId}`;

    // 3. Update parties metrics
    await tx`
      update parties
      set raw_produced_kg = greatest(raw_produced_kg - ${producedRawKg}, 0),
          raw_consumed_kg = greatest(raw_consumed_kg - ${consumedKg}, 0),
          raw_waste_kg = greatest(raw_waste_kg - ${wasteKg}, 0),
          raw_waste_percent = case when greatest(raw_consumed_kg - ${consumedKg}, 0) > 0 then (greatest(raw_waste_kg - ${wasteKg}, 0) / greatest(raw_consumed_kg - ${consumedKg}, 0)) * 100 else 0 end,
          updated_at = now()
      where id = ${partyId}
    `;

    await assertNoOrphanOperationalData(tx);

    // 4. Cleanup after operational change
    if (!skipCleanup) {
      await cleanupAfterOperationalChange(tx, { orderId, partyId });
    }

    return { id: recordId };
  };
  return outerTx ? run(outerTx) : sql.begin(run);
}



export async function updateRawProduction(recordId: string, payload: Record<string, unknown>, user: PermissionUser | null = null) {
  await assertCanUpdate(user, 'production');
  await assertOperationDateUnlocked({
    operationDate: requireString(payload.date ?? new Date().toISOString().slice(0, 10), "Üretim tarihi"),
    user,
    operationType: 'update'
  });
  return sql.begin(async (tx) => {
    // 0. Check for subsequent transactions
    await checkSubsequentTransactions(tx, "production_raw", recordId);

    // 1. Undo old state
    await deleteRawProduction(recordId, user, tx, true);
    // 2. Create new state (with the same ID)
    const productionId = recordId;
    const date = requireString(payload.date ?? new Date().toISOString().slice(0, 10), "Üretim tarihi");
    const orderId = requireString(payload.orderId, "Sipariş");
    const orderRows = await tx`select ym_stock_id, mm_stock_id from orders where id = ${orderId} limit 1`;
    if (!orderRows[0]) throw new Error("Sipariş bulunamadı.");

    let partyId = optionalString(payload.partyId) ?? id("party");
    const partyNo = optionalString(payload.partyNo);
    const producedRawKg = numberValue(payload.producedRawKg, "Üretilen ham kg");
    const consumedItems = (payload.consumedItems as Array<Record<string, unknown>> | undefined) ?? [];
    const consumedKg = consumedItems.reduce((sum, item) => sum + numberValue(item.quantityKg, "Tüketim kg"), 0);
    const waste = calculateRawWaste(consumedKg, producedRawKg);

    // Handle party creation/linking for updates if needed
    if (!optionalString(payload.partyId)) {
      if (partyNo) {
        const existingParty = await tx`select id from parties where party_no = ${partyNo} and order_id = ${orderId} limit 1`;
        if (existingParty[0]) {
          partyId = existingParty[0].id;
        } else {
          await tx`
            insert into parties (id, party_no, order_id, ym_stock_id, mm_stock_id, status, current_warehouse_id, raw_width, raw_gsm, timeline, created_at, updated_at)
            values (
              ${partyId}, ${partyNo}, ${orderId}, ${String(orderRows[0].ym_stock_id)}, ${String(orderRows[0].mm_stock_id)},
              'Örmede', ${requireString(payload.warehouseId, "Ham depo")}, ${numberValue(payload.rawWidth, "Ham en")}, ${numberValue(payload.rawGsm, "Ham gramaj")},
              ${JSON.stringify([{ date, title: "Parti oluşturuldu", description: "Güncelleme sırasında manuel parti numarası ile açıldı.", tone: "blue" }])}::jsonb,
              now(), now()
            )
          `;
        }
      } else {
        const autoNo = await nextPartyNo(tx);
        await tx`
          insert into parties (id, party_no, order_id, ym_stock_id, mm_stock_id, status, current_warehouse_id, raw_width, raw_gsm, timeline, created_at, updated_at)
          values (
            ${partyId}, ${autoNo}, ${orderId}, ${String(orderRows[0].ym_stock_id)}, ${String(orderRows[0].mm_stock_id)},
            'Örmede', ${requireString(payload.warehouseId, "Ham depo")}, ${numberValue(payload.rawWidth, "Ham en")}, ${numberValue(payload.rawGsm, "Ham gramaj")},
            ${JSON.stringify([{ date, title: "Parti oluşturuldu", description: "Güncelleme sırasında otomatik açıldı.", tone: "blue" }])}::jsonb,
            now(), now()
          )
        `;
      }
    }

    await tx`
      insert into production_raw (
        id, date, order_id, party_id, knitter_partner_id, warehouse_id, ym_stock_id, produced_raw_kg,
        raw_width, raw_gsm, consumed_items, waste_kg, waste_percent, description, created_at
      )
      values (
        ${productionId}, ${date}, ${orderId}, ${partyId}::text, ${requireString(payload.knitterPartnerId, "Fason örmeci")},
        ${requireString(payload.warehouseId, "Ham depo")}, ${String(orderRows[0].ym_stock_id)}, ${producedRawKg}::numeric,
        ${numberValue(payload.rawWidth, "Ham en")}::numeric, ${numberValue(payload.rawGsm, "Ham gramaj")}::numeric, ${JSON.stringify(consumedItems)}::jsonb, 
        ${waste.wasteKg}::numeric, ${waste.wastePercent}::numeric, ${optionalString(payload.description) ?? ""}::text, now()
      )
    `;

    const consumedMovIds: string[] = [];
    for (const item of consumedItems) {
      const sId = requireString(item.stockId, "Tüketilen stok");
      const wId = requireString(item.warehouseId, "Tüketim deposu");
      const lNo = optionalString(item.lotNo);

      const sourceMovRows = await tx`
        select id from stock_movements 
        where stock_id = ${sId} and warehouse_id = ${wId} and lot_no = ${lNo}::text and direction = 'IN'
        order by created_at desc limit 1
      `;
      const sourceMovementId = sourceMovRows[0]?.id;

      const movId = await addMovement(tx, {
        date,
        stockId: sId,
        warehouseId: wId,
        lotNo: lNo,
        orderId,
        movementType: "Üretim tüketim",
        direction: "OUT",
        quantity: numberValue(item.quantityKg, "Tüketim kg"),
        description: "Ham üretim güncelleme tüketimi",
        sourceTransactionId: productionId,
        sourceTransactionType: "production_raw",
        sourceMovementId: sourceMovementId,
      });
      consumedMovIds.push(movId);
    }

    await addMovement(tx, {
      date,
      stockId: String(orderRows[0].ym_stock_id),
      warehouseId: requireString(payload.warehouseId, "Ham depo"),
      partyId,
      partyNo: await tx`select party_no from parties where id = ${partyId}`.then(r => r[0]?.party_no),
      orderId,
      movementType: "Üretim giriş",
      direction: "IN",
      quantity: producedRawKg,
      description: "Ham kumaş üretim güncelleme girişi",
      sourceTransactionId: productionId,
      sourceTransactionType: "production_raw",
      parentMovementId: consumedMovIds[0],
    });

    await tx`
      update parties
      set raw_produced_kg = raw_produced_kg + ${producedRawKg},
          raw_consumed_kg = raw_consumed_kg + ${consumedKg},
          raw_waste_kg = raw_waste_kg + ${waste.wasteKg},
          raw_waste_percent = case when (raw_consumed_kg + ${consumedKg}::numeric) > 0 then ((raw_waste_kg + ${waste.wasteKg}::numeric) / (raw_consumed_kg + ${consumedKg}::numeric)) * 100 else 0 end,
          updated_at = now()
      where id = ${partyId}
    `;

    await assertTransactionIntegrity(tx, "production_raw", productionId);

    // 3. Recalculate status
    await recalculateOrderStatus(tx, orderId);

    return { id: recordId };
  });
}
