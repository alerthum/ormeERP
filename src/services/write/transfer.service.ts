import { sql } from "@/db/client";
import type { Tx } from "@/services/write/write-types";

import {
  id,
  requireString,
  optionalString,
  numberValue,
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
  cleanupOrphanParty,
} from "@/services/write/operational-lifecycle.service";

import { assertCanCreate, assertCanUpdate, assertCanDelete, type PermissionUser } from "./permission-guard.service";
import { assertOperationDateUnlocked } from "./operation-lock.service";

export async function createTransfer(payload: Record<string, unknown>, user: PermissionUser | null = null) {
  await assertCanCreate(user, 'transfers');
  await assertOperationDateUnlocked({
    operationDate: requireString(payload.date ?? new Date().toISOString().slice(0, 10), "Transfer tarihi"),
    user,
    operationType: 'create'
  });
  return sql.begin(async (tx) => {
    const transferId = id("transfer");
    const date = requireString(payload.date ?? new Date().toISOString().slice(0, 10), "Transfer tarihi");
    const fromWarehouseId = requireString(payload.fromWarehouseId, "Kaynak depo");
    const toWarehouseId = requireString(payload.toWarehouseId, "Hedef depo");
    const items = (payload.items as Array<Record<string, unknown>> | undefined) ?? [];
    if (items.length === 0) throw new Error("Transfer kalemi zorunlu.");
    await tx`
      insert into transfers (id, date, from_warehouse_id, to_warehouse_id, items, description, created_at)
      values (${transferId}, ${date}, ${fromWarehouseId}, ${toWarehouseId}, ${JSON.stringify(items)}::jsonb, ${optionalString(payload.description) ?? ""}, now())
    `;
    for (const item of items) {
      const stockId = requireString(item.stockId, "Stok");
      const trackingId = optionalString(item.partyId);
      const partyRows = trackingId ? await tx`select id from parties where id = ${trackingId} limit 1` : [];
      const partyId = partyRows[0]?.id ? trackingId : null;
      const lotNo = partyId ? optionalString(item.lotNo) : trackingId ?? optionalString(item.lotNo);
      const quantity = numberValue(item.quantity, "Miktar");

      // 1. OUT movement from source warehouse
      const outMovId = await addMovement(tx, {
        date,
        stockId,
        warehouseId: fromWarehouseId,
        partyId,
        lotNo,
        movementType: "Transfer",
        direction: "OUT",
        quantity,
        description: "Depolar arası transfer çıkışı",
        sourceTransactionId: transferId,
        sourceTransactionType: "transfer"
      });

      // 2. IN movement to target warehouse, referencing the OUT movement
      await addMovement(tx, {
        date,
        stockId,
        warehouseId: toWarehouseId,
        partyId,
        lotNo,
        movementType: "Transfer",
        direction: "IN",
        quantity,
        description: "Depolar arası transfer girişi",
        sourceTransactionId: transferId,
        sourceTransactionType: "transfer",
        sourceMovementId: outMovId // Linking IN to OUT
      });
    }

    await assertTransactionIntegrity(tx, "transfer", transferId);

    // Recalculate status for any affected orders
    const affectedOrderIds = new Set<string>();
    const typedItems = items as Array<{ partyId?: string }>;
    for (const item of typedItems) {
      if (item.partyId) {
        const pRows = await tx`select order_id from parties where id = ${item.partyId} limit 1`;
        if (pRows[0]?.order_id) affectedOrderIds.add(String(pRows[0].order_id));
      }
    }
    for (const orderId of affectedOrderIds) {
      await recalculateOrderStatus(tx, orderId);
    }

    return { id: transferId };
  });
}

export async function deleteTransfer(recordId: string, user: PermissionUser | null = null, outerTx?: Tx, skipCleanup = false) {
  await assertCanDelete(user, 'transfers');
  const [transferRow] = await sql`select date from transfers where id = ${recordId}`;
  if (transferRow) {
    await assertOperationDateUnlocked({
      operationDate: transferRow.date,
      user,
      operationType: 'delete'
    });
  }
  const run = async (tx: Tx) => {
    // 0. Check for subsequent transactions
    await checkSubsequentTransactions(tx, "transfer", recordId);

    const rows = await tx`select items from transfers where id = ${recordId}`;
    const items = rows[0]?.items || [];

    // 1. Remove all movements and reverse balances
    await removeMovementEffects(tx, [{ referenceType: "transfer", referenceId: recordId }]);

    // 2. Delete the record
    await tx`delete from transfers where id = ${recordId}`;

    await assertNoOrphanOperationalData(tx);

    if (!skipCleanup) {
      const affectedOrderIds = new Set<string>();
      const typedItems = items as Array<{ partyId?: string }>;
      for (const item of typedItems) {
        if (item.partyId) {
          await cleanupOrphanParty(tx, item.partyId);
          const pRows = await tx`select order_id from parties where id = ${item.partyId} limit 1`;
          if (pRows[0]?.order_id) affectedOrderIds.add(String(pRows[0].order_id));
        }
      }
      for (const orderId of affectedOrderIds) {
        await recalculateOrderStatus(tx, orderId);
      }
    }

    return { id: recordId };
  };
  return outerTx ? run(outerTx) : sql.begin(run);
}

export async function updateTransfer(recordId: string, payload: Record<string, unknown>, user: PermissionUser | null = null) {
  await assertCanUpdate(user, 'transfers');
  await assertOperationDateUnlocked({
    operationDate: requireString(payload.date ?? new Date().toISOString().slice(0, 10), "Transfer tarihi"),
    user,
    operationType: 'update'
  });
  return sql.begin(async (tx) => {
    // 0. Check for subsequent transactions
    await checkSubsequentTransactions(tx, "transfer", recordId);

    // 1. Undo old state
    await deleteTransfer(recordId, user, tx, true);

    // 2. Create new state
    const transferId = recordId;
    const date = requireString(payload.date ?? new Date().toISOString().slice(0, 10), "Transfer tarihi");
    const fromWarehouseId = requireString(payload.fromWarehouseId, "Kaynak depo");
    const toWarehouseId = requireString(payload.toWarehouseId, "Hedef depo");
    const items = (payload.items as Array<Record<string, unknown>> | undefined) ?? [];
    if (items.length === 0) throw new Error("Transfer kalemi zorunlu.");
    
    await tx`
      insert into transfers (id, date, from_warehouse_id, to_warehouse_id, items, description, created_at)
      values (${transferId}, ${date}, ${fromWarehouseId}, ${toWarehouseId}, ${JSON.stringify(items)}::jsonb, ${optionalString(payload.description) ?? ""}, now())
    `;

    for (const item of items) {
      const stockId = requireString(item.stockId, "Stok");
      const partyId = optionalString(item.partyId);
      const lotNo = optionalString(item.lotNo);
      const quantity = numberValue(item.quantity, "Miktar");
      
      const outMovId = await addMovement(tx, {
        date,
        stockId,
        warehouseId: fromWarehouseId,
        partyId,
        lotNo,
        movementType: "Transfer",
        direction: "OUT",
        quantity,
        description: "Güncellenmiş transfer çıkışı",
        sourceTransactionId: transferId,
        sourceTransactionType: "transfer"
      });

      await addMovement(tx, {
        date,
        stockId,
        warehouseId: toWarehouseId,
        partyId,
        lotNo,
        movementType: "Transfer",
        direction: "IN",
        quantity,
        description: "Güncellenmiş transfer girişi",
        sourceTransactionId: transferId,
        sourceTransactionType: "transfer",
        sourceMovementId: outMovId
      });
    }
    
    await assertTransactionIntegrity(tx, "transfer", transferId);

    // Recalculate status for any affected orders
    const affectedOrderIds = new Set<string>();
    const typedItems = items as Array<{ partyId?: string }>;
    for (const item of typedItems) {
      if (item.partyId) {
        const pRows = await tx`select order_id from parties where id = ${item.partyId} limit 1`;
        if (pRows[0]?.order_id) affectedOrderIds.add(String(pRows[0].order_id));
      }
    }
    for (const orderId of affectedOrderIds) {
      await recalculateOrderStatus(tx, orderId);
    }

    return { id: transferId };
  });
}
