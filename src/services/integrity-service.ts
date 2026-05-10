import { sql } from "@/db/client";
import type postgres from "postgres";

type Tx = postgres.TransactionSql;

export interface DiagnosticDetail {
  category: "HEADER" | "MOVEMENT" | "BALANCE" | "STATUS" | "INVALID";
  severity: "CRITICAL" | "WARNING";
  label: string;
  message: string;
  affectedId: string;
  affectedTable?: string;
  recommendation: string;
}

export interface DiagnosticResult {
  success: boolean;
  timestamp: string;
  stats: {
    orphanHeaders: number;
    orphanMovements: number;
    balanceMismatches: number;
    invalidStatuses: number;
    negativeBalances: number;
    brokenLinks: number;
  };
  details: DiagnosticDetail[];
}

/**
 * Runs a comprehensive set of integrity checks across the database.
 */
export async function runIntegrityDiagnostics(): Promise<DiagnosticResult> {
  const details: DiagnosticDetail[] = [];
  const timestamp = new Date().toISOString();

  // 1. Orphan Headers (Header exists, but no movements)
  const headerTables = [
    { table: "production_raw", label: "Ham Üretim", type: "production_raw" },
    { table: "production_dyehouse", label: "Boyahane Üretimi", type: "production_dyehouse" },
    { table: "transfers", label: "Depo Transferi", type: "transfer" },
    { table: "sales", label: "Satış / Sevkiyat", type: "sale" },
    { table: "purchase_receipts", label: "Alış / Mal Kabul", type: "direct_purchase_receipt" },
  ];

  for (const h of headerTables) {
    const orphans = await sql`
      select id, created_at from ${sql(h.table)}
      where id not in (
        select distinct source_transaction_id 
        from stock_movements 
        where source_transaction_type = ${h.type}
      )
    `;
    
    for (const orphan of orphans) {
      details.push({
        category: "HEADER",
        severity: "WARNING",
        label: h.label,
        message: "İşlem başlığı var ancak stok hareketi bulunamadı.",
        affectedId: orphan.id,
        affectedTable: h.table,
        recommendation: "Kaydı silin veya hareketleri yeniden oluşturun."
      });
    }
  }

  // 2. Orphan Movements (Movements exist, but header is missing)
  const orphanMovements = await sql`
    select distinct source_transaction_id, source_transaction_type, movement_type
    from stock_movements
    where source_transaction_type = 'production_raw' and source_transaction_id not in (select id from production_raw)
       or source_transaction_type = 'production_dyehouse' and source_transaction_id not in (select id from production_dyehouse)
       or source_transaction_type = 'transfer' and source_transaction_id not in (select id from transfers)
       or source_transaction_type = 'sale' and source_transaction_id not in (select id from sales)
       or source_transaction_type = 'direct_purchase_receipt' and source_transaction_id not in (select id from purchase_receipts)
  `;

  for (const m of orphanMovements) {
    details.push({
      category: "MOVEMENT",
      severity: "CRITICAL",
      label: "Yetim Stok Hareketi",
      message: `Stok hareketi var ancak bağlı olduğu ${m.source_transaction_type} kaydı bulunamadı.`,
      affectedId: m.source_transaction_id,
      affectedTable: "stock_movements",
      recommendation: "Yetim hareketleri temizleyin."
    });
  }

  // 3. Balance Mismatches
  // Warehouse Balances vs Movements
  const warehouseMismatches = await sql`
    with movement_sums as (
      select 
        stock_id, 
        warehouse_id, 
        coalesce(party_id, '') as party_id, 
        coalesce(lot_no, '') as lot_no,
        sum(case when direction = 'IN' then quantity else -quantity end) as calculated_qty
      from stock_movements
      group by stock_id, warehouse_id, coalesce(party_id, ''), coalesce(lot_no, '')
    ),
    balance_current as (
      select 
        stock_id, 
        warehouse_id, 
        coalesce(party_id, '') as party_id, 
        coalesce(lot_no, '') as lot_no,
        sum(quantity) as balance_qty
      from warehouse_balances
      group by stock_id, warehouse_id, coalesce(party_id, ''), coalesce(lot_no, '')
    )
    select 
      coalesce(m.stock_id, b.stock_id) as stock_id,
      coalesce(m.warehouse_id, b.warehouse_id) as warehouse_id,
      m.calculated_qty,
      b.balance_qty
    from movement_sums m
    full outer join balance_current b 
      on m.stock_id = b.stock_id 
     and m.warehouse_id = b.warehouse_id 
     and m.party_id = b.party_id 
     and m.lot_no = b.lot_no
    where abs(coalesce(m.calculated_qty, 0) - coalesce(b.balance_qty, 0)) > 0.001
  `;

  for (const w of warehouseMismatches) {
    details.push({
      category: "BALANCE",
      severity: "CRITICAL",
      label: "Depo Bakiye Uyuşmazlığı",
      message: `Hesaplanan: ${w.calculated_qty || 0}, Mevcut: ${w.balance_qty || 0}`,
      affectedId: `${w.stock_id}:${w.warehouse_id}`,
      affectedTable: "warehouse_balances",
      recommendation: "Bakiyeleri hareketlerden yeniden oluşturun."
    });
  }

  // 4. Negative Balances (Warehouse, Lot, Party)
  const negativeChecks = [
    { table: "warehouse_balances", label: "Depo Bakiyesi", msg: "Depo miktarı negatif" },
  ];

  for (const n of negativeChecks) {
    const negatives = await sql`select id, quantity from ${sql(n.table)} where quantity < -0.001`;
    for (const neg of negatives) {
      details.push({
        category: "INVALID",
        severity: "CRITICAL",
        label: n.label,
        message: `${n.msg}: ${neg.quantity}`,
        affectedId: neg.id,
        affectedTable: n.table,
        recommendation: "Stok hareketlerini inceleyerek negatif bakiyeyi düzeltin."
      });
    }
  }

  // 5. Broken Movement Links (Parent/Source links that don't exist)
  const brokenLinks = await sql`
    select id, parent_movement_id, source_movement_id, movement_type 
    from stock_movements 
    where (parent_movement_id is not null and parent_movement_id not in (select id from stock_movements))
       or (source_movement_id is not null and source_movement_id not in (select id from stock_movements))
  `;

  for (const bl of brokenLinks) {
    details.push({
      category: "INVALID",
      severity: "CRITICAL",
      label: "Bozuk Hareket İlişkisi",
      message: "Üst hareket (parent/source) kaydı bulunamadı.",
      affectedId: bl.id,
      affectedTable: "stock_movements",
      recommendation: "İlişkili hareketleri kontrol edin veya hareketi yeniden bağlayın."
    });
  }

  // 6. Invalid Lot/Party Usage (Both lot and party in the same movement)
  const invalidLotParty = await sql`
    select id from stock_movements where lot_no is not null and party_id is not null
  `;

  for (const ilp of invalidLotParty) {
    details.push({
      category: "INVALID",
      severity: "WARNING",
      label: "Hatalı Lot/Parti Kullanımı",
      message: "Aynı harekette hem Lot hem Parti numarası kullanılmış. Lot hammadde, Parti kumaş içindir.",
      affectedId: ilp.id,
      affectedTable: "stock_movements",
      recommendation: "Hareketi Lot veya Parti olarak sadeleştirin."
    });
  }

  // 7. Order Status Checks
  // Check if orders have 'Ham Geldi' or 'Boyahanede' statuses but actual movements mismatch
  const statusMismatches = await sql`
    select id, order_no, status 
    from orders 
    where status = 'Ham Geldi' 
      and id not in (select distinct order_id from stock_movements where source_transaction_type = 'production_raw')
       or status = 'Boyahanede'
      and id not in (select distinct order_id from stock_movements where source_transaction_type = 'production_dyehouse')
  `;

  for (const s of statusMismatches) {
    details.push({
      category: "STATUS",
      severity: "WARNING",
      label: "Hatalı Sipariş Durumu",
      message: `Sipariş durumu '${s.status}' ancak ilgili üretim hareketi bulunamadı.`,
      affectedId: s.id,
      affectedTable: "orders",
      recommendation: "Sipariş durumunu manuel olarak 'İplik Bekliyor' veya 'Onaylandı' aşamasına çekin."
    });
  }

  return {
    success: details.length === 0,
    timestamp,
    stats: {
      orphanHeaders: details.filter(d => d.category === "HEADER").length,
      orphanMovements: details.filter(d => d.category === "MOVEMENT").length,
      balanceMismatches: details.filter(d => d.category === "BALANCE").length,
      invalidStatuses: details.filter(d => d.category === "STATUS").length,
      negativeBalances: details.filter(d => d.category === "INVALID" && d.label.includes("Bakiye")).length,
      brokenLinks: details.filter(d => d.label === "Bozuk Hareket İlişkisi").length
    },
    details
  };
}

/**
 * Physical cleaning of orphan records and rebuilding statuses.
 */
export async function repairOperationalIntegrity() {
  return await sql.begin(async (tx) => {
    // 1. Remove movements without headers
    const typesToCleanup = [
      { type: "production_raw", table: "production_raw" },
      { type: "production_dyehouse", table: "production_dyehouse" },
      { type: "transfer", table: "transfers" },
      { type: "sale", table: "sales" },
      { type: "direct_purchase_receipt", table: "purchase_receipts" },
    ];

    for (const t of typesToCleanup) {
      await tx`
        delete from stock_movements 
        where source_transaction_type = ${t.type} 
          and source_transaction_id not in (select id from ${sql(t.table)})
      `;
    }

    // 2. Remove orphan parties and lots (no movements)
    await tx`
      delete from parties 
      where id not in (select distinct party_id from stock_movements where party_id is not null)
    `;
    
    // 3. Rebuild order statuses from movements
    // For now, let's keep it simple: if no movements, reset to 'İplik Bekliyor' if it was 'Ham Geldi'
    await tx`
      update orders 
      set status = 'İplik Bekliyor'
      where status in ('Ham Geldi', 'Boyahanede', 'Mamül Hazır')
        and id not in (select distinct order_id from stock_movements where order_id is not null)
    `;

    // 4. Rebuild balances
    await internalRebuildBalances(tx);

    return { success: true, message: "Operasyonel bütünlük onarıldı." };
  });
}

/**
 * Completely recalculates all balances and summaries from scratch.
 */
export async function fullRebuildFromMovements() {
  return await sql.begin(async (tx) => {
    await internalRebuildBalances(tx);
    // Add more summary rebuilds here (KPIs, etc.)
    return { success: true, message: "Tüm sistem hareketler üzerinden yeniden oluşturuldu." };
  });
}

async function internalRebuildBalances(tx: Tx) {
  // Clear all balances
  await tx`truncate warehouse_balances`;

  // Insert fresh balances from movements
  await tx`
    insert into warehouse_balances (id, stock_id, warehouse_id, party_id, lot_no, quantity, updated_at)
    select 
      'bal-' || md5(stock_id || '|' || warehouse_id || '|' || coalesce(party_id, 'none') || '|' || coalesce(lot_no, 'none')),
      stock_id,
      warehouse_id,
      party_id,
      lot_no,
      sum(case when direction = 'IN' then quantity else -quantity end),
      now()
    from stock_movements
    group by stock_id, warehouse_id, party_id, lot_no
    having abs(sum(case when direction = 'IN' then quantity else -quantity end)) > 0.001
  `;
}

/**
 * Lightweight version of diagnostics for dashboard health status.
 */
export async function getIntegritySummary() {
  const result = await runIntegrityDiagnostics();
  const critical = result.details.filter(d => d.severity === "CRITICAL").length;
  const warning = result.details.filter(d => d.severity === "WARNING").length;
  
  let status: "green" | "yellow" | "red" = "green";
  if (critical > 0) status = "red";
  else if (warning > 0) status = "yellow";

  return {
    status,
    stats: {
      totalIssues: result.details.length,
      criticalIssues: critical,
      warningIssues: warning
    }
  };
}
