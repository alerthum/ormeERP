import type { Tx } from "@/services/write/write-types";
import { formatDate } from "@/services/write/write-utils";

/**
 * Checks for subsequent transactions that depend on the given transaction.
 * Returns a list of dependent records that must be handled first.
 * Now uses movement-based relationship tracking AND Lot/Party fallback tracking.
 */
export async function checkSubsequentTransactions(tx: Tx, referenceType: string, referenceId: string) {
  // 1. Find all movements created by this transaction
  const originalMovements = await tx`
    select id, date, created_at, lot_no, party_no, party_id, stock_id
    from stock_movements 
    where (source_transaction_type = ${referenceType} and source_transaction_id = ${referenceId})
       or (reference_type = ${referenceType} and reference_id = ${referenceId})
  `;

  if (originalMovements.length === 0) return;

  const movementIds = originalMovements.map(m => m.id);
  const subsequentTransactions = new Map<string, { date: string, typeLabel: string }>();

  // 2. Explicit Dependencies (Parent/Source links)
  const explicitDependents = await tx`
    select distinct 
           m.date, 
           m.source_transaction_type, 
           m.source_transaction_id, 
           case 
             when m.source_transaction_type = 'production_dyehouse' then 'Boyahane Üretimi'
             when m.source_transaction_type = 'production_raw' then 'Ham Üretim'
             when m.source_transaction_type = 'transfer' then 'Depo Transferi'
             when m.source_transaction_type = 'sale' then 'Satış / Sevkiyat'
             when m.source_transaction_type = 'direct_purchase_receipt' then 'Alış / Mal Kabul'
             else m.source_transaction_type
           end as type_label
    from stock_movements m
    where (m.parent_movement_id = any(${movementIds}) or m.source_movement_id = any(${movementIds}))
      and m.source_transaction_id != ${referenceId}
  `;

  for (const row of explicitDependents) {
    const key = `${row.source_transaction_type}:${row.source_transaction_id}`;
    subsequentTransactions.set(key, { 
      date: row.date, 
      typeLabel: row.type_label
    });
  }

  // 3. Fallback Dependencies (Lot/Party matching)
  for (const orig of originalMovements) {
    const lot = orig.lot_no;
    const pNo = orig.party_no;
    const pId = orig.party_id;

    if (!lot && !pNo && !pId) continue;

    // Search for movements with same lot/party but different transaction that are "later"
    const fallbackRows = await tx`
      select distinct 
             m.date, 
             m.source_transaction_type, 
             m.source_transaction_id, 
             case 
               when m.source_transaction_type = 'production_dyehouse' then 'Boyahane Üretimi'
               when m.source_transaction_type = 'production_raw' then 'Ham Üretim'
               when m.source_transaction_type = 'transfer' then 'Depo Transferi'
               when m.source_transaction_type = 'sale' then 'Satış / Sevkiyat'
               when m.source_transaction_type = 'direct_purchase_receipt' then 'Alış / Mal Kabul'
               else m.source_transaction_type
             end as type_label
      from stock_movements m
      where m.source_transaction_id != ${referenceId}
        and (
          (${lot}::text is not null and m.lot_no = ${lot}) or
          (${pNo}::text is not null and m.party_no = ${pNo}) or
          (${pId}::text is not null and m.party_id = ${pId})
        )
        and (
          m.date > ${orig.date} or
          (m.created_at > ${orig.created_at}) or
          (m.created_at = ${orig.created_at} and m.id > ${orig.id})
        )
    `;

    for (const row of fallbackRows) {
      const key = `${row.source_transaction_type}:${row.source_transaction_id}`;
      if (!subsequentTransactions.has(key)) {
        subsequentTransactions.set(key, { 
          date: row.date, 
          typeLabel: row.type_label
        });
      }
    }
  }

  if (subsequentTransactions.size > 0) {
    const blockers = originalMovements
      .map(m => m.lot_no || m.party_no)
      .filter(Boolean);
    
    const uniqueBlockers = Array.from(new Set(blockers));
    let blockerMsg = "";
    if (uniqueBlockers.length > 0) {
      blockerMsg = `Çünkü bu kayda ait ${uniqueBlockers.join(', ')} lot/parti bilgisi daha sonra şu işlemlerde kullanılmıştır:`;
    } else {
      blockerMsg = `Çünkü bu işlemden sonra başka operasyonel hareketler yapılmıştır:`;
    }

    const dependents = Array.from(subsequentTransactions.values())
      .sort((a: any, b: any) => {
        const dateA = a.date instanceof Date ? a.date.toISOString() : String(a.date);
        const dateB = b.date instanceof Date ? b.date.toISOString() : String(b.date);
        return dateB.localeCompare(dateA);
      })
      .map(row => `${formatDate(row.date)} ${row.typeLabel}`);

    throw new Error(
      `Bu kayıt silinemez veya güncellenemez.\n\n` +
      `${blockerMsg}\n\n` +
      `- ${dependents.join('\n- ')}\n\n` +
      `Lütfen önce sonraki işlemleri silin veya düzeltin.`
    );
  }
}

export async function getUsageReport(tx: Tx, stockId: string, warehouseId: string, partyId: string | null, lotNo: string | null) {
  // We'll keep a minimal version of this for backward compatibility if needed, 
  // but it will use the new logic.
  // Actually, we can just point to the same logic or return null if we prefer.
  return null; 
}

/**
 * Assert that a transaction has all its required stock movements.
 * This is called at the end of create/update operations.
 */
export async function assertTransactionIntegrity(tx: Tx, referenceType: string, referenceId: string) {
  // 1. Check if header exists
  const headerTables: Record<string, string> = {
    production_raw: "production_raw",
    production_dyehouse: "production_dyehouse",
    transfer: "transfers",
    sale: "sales",
    direct_purchase_receipt: "purchase_receipts",
  };

  const tableName = headerTables[referenceType];
  if (tableName) {
    const header = await tx`select id from ${tx(tableName)} where id = ${referenceId} limit 1`;
    if (header.length === 0) {
      throw new Error(`Veri bütünlüğü hatası: ${referenceType} başlık kaydı (${referenceId}) bulunamadı.`);
    }
  }

  // 2. Check if stock movements exist for this transaction
  const movements = await tx`
    select id, quantity, direction, stock_id, lot_no, party_id 
    from stock_movements 
    where (source_transaction_type = ${referenceType} and source_transaction_id = ${referenceId})
       or (reference_type = ${referenceType} and reference_id = ${referenceId})
  `;

  if (movements.length === 0) {
    throw new Error(`Veri bütünlüğü hatası: ${referenceType} işlemi için stok hareketi oluşmamış.`);
  }

  // 3. Basic lot/party rule check
  for (const m of movements) {
    const stockRows = await tx`select type from stock_cards where id = ${m.stock_id} limit 1`;
    const stockType = stockRows[0]?.type;
    
    if (["IP", "LYC", "POLY"].includes(stockType)) {
      if (!m.lot_no) throw new Error(`Veri bütünlüğü hatası: Hammadde hareketi (${m.id}) için LotNo zorunludur.`);
    } else if (["YM", "MM"].includes(stockType)) {
      if (!m.party_id) throw new Error(`Veri bütünlüğü hatası: Kumaş hareketi (${m.id}) için PartiNo zorunludur.`);
    }
  }
}

/**
 * Global check for orphan operational data.
 */
export async function assertNoOrphanOperationalData(tx: Tx) {
  const orphans: { label: string; count: number; items: { id: string; date?: string; info?: string }[] }[] = [];

  // Check headers without movements
  const modules = [
    { type: 'production_raw', table: 'production_raw', label: 'Ham Üretim', dateCol: 'date', descCol: 'description' },
    { type: 'production_dyehouse', table: 'production_dyehouse', label: 'Boyahane Üretimi', dateCol: 'date', descCol: 'description' },
    { type: 'transfer', table: 'transfers', label: 'Stok Transferi', dateCol: 'date', descCol: 'description' },
    { type: 'sale', table: 'sales', label: 'Satış', dateCol: 'date', descCol: 'description' },
    { type: 'direct_purchase_receipt', table: 'purchase_receipts', label: 'Alış / Mal Kabul', dateCol: 'receipt_date', descCol: 'description' }
  ];

  for (const mod of modules) {
    const rows = await tx`
      select h.id, h.${tx(mod.dateCol)} as date, h.${tx(mod.descCol)} as info
      from ${tx(mod.table)} h
      where not exists (
        select 1 from stock_movements m 
        where (m.source_transaction_type = ${mod.type} and m.source_transaction_id = h.id)
           or (m.reference_type = ${mod.type} and m.reference_id = h.id)
      )
    `;
    if (rows.length > 0) {
      orphans.push({ 
        label: `${mod.label} başlık kaydı var ama stok hareketi yok`, 
        count: rows.length, 
        items: rows.map(r => ({ id: r.id, date: r.date, info: r.info })) 
      });
    }
  }

  // Check movements without headers
  const orphanMovements = await tx`
    select m.id, m.source_transaction_type as type, m.source_transaction_id as ref_id, m.date, m.description as info
    from stock_movements m
    where m.source_transaction_type in ('production_raw', 'production_dyehouse', 'transfer', 'sale', 'direct_purchase_receipt')
      and not exists (
        select 1 from (
          select id, 'production_raw' as type from production_raw
          union all
          select id, 'production_dyehouse' from production_dyehouse
          union all
          select id, 'transfer' from transfers
          union all
          select id, 'sale' from sales
          union all
          select id, 'direct_purchase_receipt' from purchase_receipts
        ) h where h.id = m.source_transaction_id and h.type = m.source_transaction_type
      )
  `;
  
  if (orphanMovements.length > 0) {
    orphans.push({ 
      label: `Stok hareketi var ama başlık kaydı yok`, 
      count: orphanMovements.length, 
      items: orphanMovements.map(r => ({ id: r.id, date: r.date, info: `[${r.type}] ${r.info} (Ref: ${r.ref_id})` })) 
    });
  }

  if (orphans.length > 0) {
    const message = orphans.map(o => `- ${o.label} (${o.count} adet)`).join('\n');
    const error = new Error(`Kritik Veri Bütünlüğü Hatası:\n${message}`);
    (error as any).details = orphans;
    throw error;
  }
}
