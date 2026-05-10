import { id } from "@/services/write/write-utils";
import type { Tx } from "@/services/write/write-types";

export async function addBalance(tx: Tx, stockId: string, warehouseId: string, partyId: string | null, lotNo: string | null, delta: number) {
  // Kolon bazlı arama yaparak ID formatından bağımsız çalışıyoruz
  const rows = await tx`
    select id from warehouse_balances 
    where stock_id = ${stockId}::text 
      and warehouse_id = ${warehouseId}::text 
      and (party_id = ${partyId}::text or (party_id is null and ${partyId}::text is null))
      and (lot_no = ${lotNo}::text or (lot_no is null and ${lotNo}::text is null))
    limit 1
  `;

  if (rows.length > 0) {
    await tx`
      update warehouse_balances 
      set quantity = quantity + ${delta}::numeric, updated_at = now() 
      where id = ${rows[0].id}
    `;
  } else {
    const balanceId = `bal-${stockId}-${warehouseId}-${partyId ?? "none"}-${lotNo ?? "none"}`;
    await tx`
      insert into warehouse_balances (id, stock_id, warehouse_id, party_id, lot_no, quantity, updated_at)
      values (${balanceId}, ${stockId}, ${warehouseId}, ${partyId}::text, ${lotNo}::text, ${delta}::numeric, now())
    `;
  }
}

export async function removeMovementEffects(
  tx: Tx,
  references: Array<{ referenceType: string; referenceId: string }>,
) {
  if (references.length === 0) return;
  const rows = await tx`
    select id, stock_id, warehouse_id, party_id, lot_no, direction, quantity
    from stock_movements
    where ${references.map((ref) => tx`((source_transaction_type = ${ref.referenceType} and source_transaction_id = ${ref.referenceId}) or (reference_type = ${ref.referenceType} and reference_id = ${ref.referenceId}))`).reduce((prev, curr) => tx`${prev} or ${curr}`)}
    order by case when direction = 'OUT' then 0 else 1 end, created_at desc
  `;

  for (const movement of rows) {
    const stockId = String(movement.stock_id);
    const warehouseId = String(movement.warehouse_id);
    const partyId = movement.party_id ? String(movement.party_id) : null;
    const lotNo = movement.lot_no ? String(movement.lot_no) : null;
    const quantity = Number(movement.quantity);
    
    // Reverse logic: IN becomes OUT, OUT becomes IN
    // When reversing, we DON'T check for available balance in a way that blocks deletion 
    // because this is a reverse operation, not a new consumption.
    if (String(movement.direction) === "IN") {
      // Reversing an IN movement means removing stock.
      await addBalance(tx, stockId, warehouseId, partyId, lotNo, -quantity);
      await tx`update stock_cards set current_stock_kg = current_stock_kg - ${quantity}::numeric, updated_at = now() where id = ${stockId}`;
    } else {
      // Reversing an OUT movement means bringing stock back.
      await addBalance(tx, stockId, warehouseId, partyId, lotNo, quantity);
      await tx`update stock_cards set current_stock_kg = current_stock_kg + ${quantity}::numeric, updated_at = now() where id = ${stockId}`;
    }
  }

  await tx`
    delete from stock_movements
    where ${references.map((ref) => tx`((source_transaction_type = ${ref.referenceType} and source_transaction_id = ${ref.referenceId}) or (reference_type = ${ref.referenceType} and reference_id = ${ref.referenceId}))`).reduce((prev, curr) => tx`${prev} or ${curr}`)}
  `;
}

export async function assertAvailableBalance(tx: Tx, stockId: string, warehouseId: string, partyId: string | null, lotNo: string | null, quantity: number) {
  // ID'ye güvenmek yerine kolonlar üzerinden gerçek bakiyeyi sorguluyoruz
  const rows = await tx`
    select quantity from warehouse_balances 
    where stock_id = ${stockId}::text 
      and warehouse_id = ${warehouseId}::text 
      and (party_id = ${partyId}::text or (party_id is null and ${partyId}::text is null))
      and (lot_no = ${lotNo}::text or (lot_no is null and ${lotNo}::text is null))
    limit 1
  `;
  const available = Number(rows[0]?.quantity ?? 0);
  
  if (available < quantity) {
    throw new Error(`Yetersiz stok. Mevcut bakiye ${available.toFixed(3)} kg, istenen ${quantity.toFixed(3)} kg.`);
  }
}

export async function addMovement(
  tx: Tx,
  input: {
    date: string;
    stockId: string;
    warehouseId: string;
    partyId?: string | null;
    partyNo?: string | null;
    lotNo?: string | null;
    orderId?: string | null;
    supplierOrderId?: string | null;
    movementType: string;
    direction: "IN" | "OUT";
    quantity: number;
    description: string;
    sourceTransactionId: string;
    sourceTransactionType: string;
    parentMovementId?: string | null;
    sourceMovementId?: string | null;
    skipBalanceCheck?: boolean;
  },
) {
  const movementId = id("mov");
  const signedQuantity = input.direction === "IN" ? input.quantity : -input.quantity;

  if (input.direction === "OUT" && !input.skipBalanceCheck) {
    await assertAvailableBalance(tx, input.stockId, input.warehouseId, input.partyId ?? null, input.lotNo ?? null, input.quantity);
  }

  await tx`
    insert into stock_movements (
      id, date, stock_id, warehouse_id, party_id, party_no, lot_no, order_id, supplier_order_id,
      movement_type, direction, quantity, unit, description, 
      source_transaction_id, source_transaction_type, parent_movement_id, source_movement_id,
      reference_id, reference_type, created_at, created_by
    )
    values (
      ${movementId}, ${input.date}, ${input.stockId}, ${input.warehouseId}, 
      ${input.partyId ?? null}::text, ${input.partyNo ?? null}::text, ${input.lotNo ?? null}::text, 
      ${input.orderId ?? null}::text, ${input.supplierOrderId ?? null}::text,
      ${input.movementType}, ${input.direction}, ${input.quantity}::numeric, 'kg', ${input.description},
      ${input.sourceTransactionId}, ${input.sourceTransactionType}, ${input.parentMovementId ?? null}::text, ${input.sourceMovementId ?? null}::text,
      ${input.sourceTransactionId}, ${input.sourceTransactionType}, now(), 'system'
    )
  `;

  await addBalance(tx, input.stockId, input.warehouseId, input.partyId ?? null, input.lotNo ?? null, signedQuantity);
  
  await tx`
    update stock_cards
    set current_stock_kg = current_stock_kg + ${signedQuantity}, updated_at = now()
    where id = ${input.stockId}
  `;

  return movementId;
}
