import { sql } from "@/db/client";
import type { ErpData } from "@/types/erp";
import { getIntegritySummary } from "./integrity-service";
import { ensureReadBasics, normalizeObject, withErpDefaults, type Row } from "./read/read-core";

/**
 * DEPRECATED:
 * Geçici geriye uyumluluk için tutuluyor.
 * Yeni sayfalar modüler read fonksiyonlarını kullanmalıdır.
 * Bu fonksiyon tüm ERP datasını topluca çeker.
 */
export async function getErpDataFromDb(): Promise<ErpData> {
  await ensureReadBasics();

  const rows = await sql`
    select
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from settings_fabric_types t), '[]'::jsonb) as fabric_types,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from settings_colors t), '[]'::jsonb) as colors,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from settings_yarn_counts t), '[]'::jsonb) as yarn_counts,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.code) from settings_yarn_types t), '[]'::jsonb) as yarn_types,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from settings_process_types t), '[]'::jsonb) as process_types,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from warehouses t), '[]'::jsonb) as warehouses,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from partners t), '[]'::jsonb) as partners,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from stock_cards t), '[]'::jsonb) as stock_cards,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from stock_movements t), '[]'::jsonb) as stock_movements,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from warehouse_balances t), '[]'::jsonb) as warehouse_balances,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from orders t), '[]'::jsonb) as orders,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from parties t), '[]'::jsonb) as parties,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from order_party_allocations t), '[]'::jsonb) as order_party_allocations,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from production_raw t), '[]'::jsonb) as production_raw,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from production_dyehouse t), '[]'::jsonb) as production_dyehouse,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from transfers t), '[]'::jsonb) as transfers,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from purchase_orders t), '[]'::jsonb) as purchase_orders,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from purchase_receipts t), '[]'::jsonb) as purchase_receipts,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from sales t), '[]'::jsonb) as sales,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from notifications t), '[]'::jsonb) as notifications,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from roles t), '[]'::jsonb) as roles,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from user_profiles t), '[]'::jsonb) as user_profiles,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.key) from counters t), '[]'::jsonb) as counters,
      (select data from ui_settings where id = 'global' limit 1) as ui_settings
  `;

  const integrity = await getIntegritySummary();
  const data = normalizeObject(rows[0] as Row) as Partial<ErpData>;

  return withErpDefaults({
    ...data,
    integrityStatus: integrity.status,
    integrityStats: integrity.stats,
  });
}

export async function getSettingsData(): Promise<ErpData> {
  await ensureReadBasics();

  const rows = await sql`
    select
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from settings_fabric_types t), '[]'::jsonb) as fabric_types,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from settings_colors t), '[]'::jsonb) as colors,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from settings_yarn_counts t), '[]'::jsonb) as yarn_counts,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.code) from settings_yarn_types t), '[]'::jsonb) as yarn_types,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from settings_process_types t), '[]'::jsonb) as process_types,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from warehouses t), '[]'::jsonb) as warehouses,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from partners t), '[]'::jsonb) as partners,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from stock_cards t), '[]'::jsonb) as stock_cards,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from roles t), '[]'::jsonb) as roles,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from user_profiles t), '[]'::jsonb) as user_profiles,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.key) from counters t), '[]'::jsonb) as counters,
      (select data from ui_settings where id = 'global' limit 1) as ui_settings,
      (select snapshot_date from financial_snapshots order by snapshot_date desc limit 1) as last_snapshot_date
  `;

  return withErpDefaults(normalizeObject(rows[0] as Row) as Partial<ErpData>);
}

export async function getSnapshotPageData(): Promise<any> {
  const history = await sql`
    select snapshot_date as "snapshotDate", created_at as "createdAt", total_inventory_kg as "totalInventoryKg", total_open_orders_kg as "totalOpenOrdersKg"
    from financial_snapshots
    order by snapshot_date desc
  `;
  return { history };
}

export async function getSnapshotReportData(snapshotDate: string): Promise<any> {
  const financial = await sql`select * from financial_snapshots where snapshot_date = ${snapshotDate} limit 1`;
  const inventory = await sql`
    select s.*, sc.code as stock_code, sc.name as stock_name, w.name as warehouse_name
    from inventory_snapshots s
    join stock_cards sc on sc.id = s.stock_id
    join warehouses w on w.id = s.warehouse_id
    where s.snapshot_date = ${snapshotDate}
  `;
  return {
    snapshotDate,
    financial: financial[0] || null,
    inventory: inventory || []
  };
}

export async function getDashboardData(): Promise<ErpData> {
  const rows = await sql`
    select
      coalesce((select jsonb_agg(t) from (
        select id, order_no as "orderNo", customer_name as "customerName", status, order_date as "orderDate", due_date as "dueDate", quantity_kg as "quantityKg", fabric_type_id as "fabricTypeId", color_id as "colorId"
        from orders order by created_at desc limit 100
      ) t), '[]'::jsonb) as orders,
      coalesce((select jsonb_agg(t) from (
        select id, purchase_order_no as "purchaseOrderNo", supplier_id as "supplierId", status, due_date as "dueDate", total_ordered_kg as "totalOrderedKg", total_received_kg as "totalReceivedKg", total_remaining_kg as "totalRemainingKg", created_at as "createdAt", items
        from purchase_orders order by created_at desc limit 50
      ) t), '[]'::jsonb) as purchase_orders,
      coalesce((select jsonb_agg(t) from (
        select id, source_transaction_id as "sourceTransactionId", source_transaction_type as "sourceTransactionType", description, warehouse_id as "warehouseId", direction, quantity, created_at as "createdAt"
        from stock_movements order by created_at desc limit 100
      ) t), '[]'::jsonb) as stock_movements,
      coalesce((select jsonb_agg(to_jsonb(t)) from warehouse_balances t), '[]'::jsonb) as warehouse_balances,
      coalesce((select jsonb_agg(t) from (
        select id, party_no as "partyNo", status, raw_produced_kg as "rawProducedKg", finished_kg as "finishedKg", raw_waste_kg as "rawWasteKg", dyehouse_waste_kg as "dyehouseWasteKg", raw_waste_percent as "rawWastePercent", dyehouse_waste_percent as "dyehouseWastePercent", order_id as "orderId"
        from parties order by created_at desc limit 100
      ) t), '[]'::jsonb) as parties,
      coalesce((select jsonb_agg(t) from (
        select id, date, produced_raw_kg as "producedRawKg", order_id as "orderId", waste_percent as "wastePercent"
        from production_raw order by created_at desc limit 50
      ) t), '[]'::jsonb) as production_raw,
      coalesce((select jsonb_agg(t) from (
        select id, date, finished_kg as "finishedKg", order_id as "orderId", waste_percent as "wastePercent"
        from production_dyehouse order by created_at desc limit 50
      ) t), '[]'::jsonb) as production_dyehouse,
      coalesce((select jsonb_agg(t) from (
        select id, date, quantity_kg as "quantityKg", order_id as "orderId", sale_no as "saleNo", customer_name as "customerName", status, warehouse_id as "warehouseId"
        from sales order by created_at desc limit 50
      ) t), '[]'::jsonb) as sales,
      coalesce((select jsonb_agg(t) from (
        select * from notifications order by created_at desc limit 50
      ) t), '[]'::jsonb) as notifications,
      coalesce((select jsonb_agg(to_jsonb(t)) from stock_cards t), '[]'::jsonb) as stock_cards,
      coalesce((select jsonb_agg(to_jsonb(t)) from warehouses t), '[]'::jsonb) as warehouses,
      coalesce((select jsonb_agg(to_jsonb(t)) from partners t), '[]'::jsonb) as partners,
      coalesce((select jsonb_agg(to_jsonb(t)) from settings_fabric_types t), '[]'::jsonb) as fabric_types,
      coalesce((select jsonb_agg(to_jsonb(t)) from settings_colors t), '[]'::jsonb) as colors,
      coalesce((select jsonb_agg(to_jsonb(t)) from settings_yarn_counts t), '[]'::jsonb) as yarn_counts,
      (select data from ui_settings where id = 'global' limit 1) as ui_settings
  `;

  const integrity = await getIntegritySummary();
  const data = normalizeObject(rows[0] as Row) as Partial<ErpData>;

  return withErpDefaults({
    ...data,
    integrityStatus: integrity.status,
    integrityStats: integrity.stats,
  });
}

export async function getOrdersPageData(): Promise<ErpData> {
  const rows = await sql`
    select
      coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from orders t), '[]'::jsonb) as orders,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from stock_cards t), '[]'::jsonb) as stock_cards,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from partners t), '[]'::jsonb) as partners,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from settings_fabric_types t), '[]'::jsonb) as fabric_types,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from settings_colors t), '[]'::jsonb) as colors,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from settings_yarn_counts t), '[]'::jsonb) as yarn_counts,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.code) from settings_yarn_types t), '[]'::jsonb) as yarn_types,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from (select * from parties order by created_at desc limit 200) t), '[]'::jsonb) as parties,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from (select * from sales order by created_at desc limit 200) t), '[]'::jsonb) as sales,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from (select * from production_raw order by created_at desc limit 200) t), '[]'::jsonb) as production_raw,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from (select * from production_dyehouse order by created_at desc limit 200) t), '[]'::jsonb) as production_dyehouse,
      (select data from ui_settings where id = 'global' limit 1) as ui_settings
  `;

  return withErpDefaults(normalizeObject(rows[0] as Row) as Partial<ErpData>);
}

export async function getPurchasePageData(): Promise<ErpData> {
  const rows = await sql`
    select
      coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from purchase_orders t), '[]'::jsonb) as purchase_orders,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from (select * from purchase_receipts order by created_at desc limit 200) t), '[]'::jsonb) as purchase_receipts,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from partners t), '[]'::jsonb) as partners,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from stock_cards t), '[]'::jsonb) as stock_cards,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from warehouses t), '[]'::jsonb) as warehouses,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from warehouse_balances t), '[]'::jsonb) as warehouse_balances,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from settings_fabric_types t), '[]'::jsonb) as fabric_types,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from settings_colors t), '[]'::jsonb) as colors,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from settings_yarn_counts t), '[]'::jsonb) as yarn_counts,
      (select data from ui_settings where id = 'global' limit 1) as ui_settings
  `;

  return withErpDefaults(normalizeObject(rows[0] as Row) as Partial<ErpData>);
}

export async function getProductionPageData(): Promise<ErpData> {
  const rows = await sql`
    select
      coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from (select * from orders order by created_at desc limit 200) t), '[]'::jsonb) as orders,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from (select * from parties order by created_at desc limit 200) t), '[]'::jsonb) as parties,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from stock_cards t), '[]'::jsonb) as stock_cards,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from warehouses t), '[]'::jsonb) as warehouses,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from partners t), '[]'::jsonb) as partners,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from warehouse_balances t), '[]'::jsonb) as warehouse_balances,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from (select * from production_raw order by created_at desc limit 200) t), '[]'::jsonb) as production_raw,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from (select * from production_dyehouse order by created_at desc limit 200) t), '[]'::jsonb) as production_dyehouse,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from settings_process_types t), '[]'::jsonb) as process_types,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from settings_fabric_types t), '[]'::jsonb) as fabric_types,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from settings_colors t), '[]'::jsonb) as colors,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from settings_yarn_counts t), '[]'::jsonb) as yarn_counts,
      (select data from ui_settings where id = 'global' limit 1) as ui_settings
  `;

  return withErpDefaults(normalizeObject(rows[0] as Row) as Partial<ErpData>);
}

export async function getInventoryPageData(): Promise<ErpData> {
  const rows = await sql`
    select
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from stock_cards t), '[]'::jsonb) as stock_cards,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from warehouse_balances t), '[]'::jsonb) as warehouse_balances,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from (select * from stock_movements order by created_at desc limit 100) t), '[]'::jsonb) as stock_movements,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from warehouses t), '[]'::jsonb) as warehouses,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from (select * from parties order by created_at desc limit 200) t), '[]'::jsonb) as parties,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from (select * from sales order by created_at desc limit 200) t), '[]'::jsonb) as sales,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from partners t), '[]'::jsonb) as partners,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from settings_fabric_types t), '[]'::jsonb) as fabric_types,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from settings_colors t), '[]'::jsonb) as colors,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from settings_yarn_counts t), '[]'::jsonb) as yarn_counts,
      (select data from ui_settings where id = 'global' limit 1) as ui_settings
  `;

  return withErpDefaults(normalizeObject(rows[0] as Row) as Partial<ErpData>);
}

export async function getIntegrityData(): Promise<ErpData> {
  const integrity = await getIntegritySummary();

  return withErpDefaults({
    integrityStatus: integrity.status,
    integrityStats: integrity.stats,
  });
}

export async function getExecutiveDashboardData(): Promise<ErpData> {
  const rows = await sql`
    select
      -- Totals (Optimized from Aggregate Tables)
      (select coalesce(sum(ordered_kg), 0) from report_daily_order_summary where status != 'İptal') as total_customer_order_kg,
      (select coalesce(sum(raw_produced_kg), 0) from report_daily_order_summary) as total_knitted_kg,
      (select coalesce(sum(dyehouse_kg), 0) from report_daily_order_summary) as total_produced_kg,
      (select coalesce(sum(shipped_kg), 0) from report_daily_order_summary where status != 'İptal') as total_shipped_kg,
      (select coalesce(sum(ordered_kg), 0) from report_daily_purchase_summary where status != 'İptal') as total_purchase_order_kg,
      (select coalesce(sum(received_kg), 0) from report_daily_purchase_summary where status != 'İptal') as total_received_purchase_kg,
      
      -- customerOrderSummaryByStock
      coalesce((
        select jsonb_agg(t) from (
          select 
            ym_stock_id as stock_id, 
            sum(quantity_kg) as total_kg,
            count(*) as order_count
          from orders
          where status != 'İptal'
          group by ym_stock_id
        ) t
      ), '[]'::jsonb) as customer_order_summary_by_stock,

      -- customerOrderSummaryByColor
      coalesce((
        select jsonb_agg(t) from (
          select 
            color_id, 
            sum(quantity_kg) as total_kg,
            count(*) as order_count
          from orders
          where status != 'İptal'
          group by color_id
        ) t
      ), '[]'::jsonb) as customer_order_summary_by_color,

      -- customerOrderSummaryByYarnCount
      coalesce((
        select jsonb_agg(t) from (
          select 
            yarn_count_id, 
            sum(quantity_kg) as total_kg,
            count(*) as order_count
          from orders
          where status != 'İptal'
          group by yarn_count_id
        ) t
      ), '[]'::jsonb) as customer_order_summary_by_yarn_count,

      -- customerOrderSummaryByFabricType
      coalesce((
        select jsonb_agg(t) from (
          select 
            fabric_type_id, 
            sum(quantity_kg) as total_kg,
            count(*) as order_count
          from orders
          where status != 'İptal'
          group by fabric_type_id
        ) t
      ), '[]'::jsonb) as customer_order_summary_by_fabric_type,

      -- supplierOrderSummaryByStock
      coalesce((
        select jsonb_agg(t) from (
          select 
            item->>'stockId' as stock_id, 
            sum((item->>'orderedKg')::numeric) as total_kg,
            count(*) as order_count
          from purchase_orders, jsonb_array_elements(items) as item
          where status != 'İptal'
          group by item->>'stockId'
        ) t
      ), '[]'::jsonb) as supplier_order_summary_by_stock,

      -- supplierOrderSummaryByYarnCount
      coalesce((
        select jsonb_agg(t) from (
          select 
            item->>'yarnCountId' as yarn_count_id, 
            sum((item->>'orderedKg')::numeric) as total_kg,
            count(*) as order_count
          from purchase_orders, jsonb_array_elements(items) as item
          where status != 'İptal' and item->>'yarnCountId' is not null
          group by item->>'yarnCountId'
        ) t
      ), '[]'::jsonb) as supplier_order_summary_by_yarn_count,

      -- supplierOrderSummaryByColor
      coalesce((
        select jsonb_agg(t) from (
          select 
            item->>'colorId' as color_id, 
            sum((item->>'orderedKg')::numeric) as total_kg,
            count(*) as order_count
          from purchase_orders, jsonb_array_elements(items) as item
          where status != 'İptal' and item->>'colorId' is not null
          group by item->>'colorId'
        ) t
      ), '[]'::jsonb) as supplier_order_summary_by_color,

      -- Recent rows for the UI tables (limited)
      coalesce((select jsonb_agg(t) from (select * from orders order by created_at desc limit 15) t), '[]'::jsonb) as orders,
      coalesce((select jsonb_agg(t) from (select * from purchase_orders order by created_at desc limit 15) t), '[]'::jsonb) as purchase_orders,

      -- Lookups
      coalesce((select jsonb_agg(to_jsonb(t)) from settings_fabric_types t), '[]'::jsonb) as fabric_types,
      coalesce((select jsonb_agg(to_jsonb(t)) from settings_colors t), '[]'::jsonb) as colors,
      coalesce((select jsonb_agg(to_jsonb(t)) from settings_yarn_counts t), '[]'::jsonb) as yarn_counts,
      coalesce((select jsonb_agg(to_jsonb(t)) from stock_cards t), '[]'::jsonb) as stock_cards,
      coalesce((select jsonb_agg(to_jsonb(t)) from partners t), '[]'::jsonb) as partners,
      coalesce((select jsonb_agg(t) from (select * from production_raw order by created_at desc limit 100) t), '[]'::jsonb) as production_raw,
      coalesce((select jsonb_agg(t) from (select * from production_dyehouse order by created_at desc limit 100) t), '[]'::jsonb) as production_dyehouse,
      coalesce((select jsonb_agg(t) from (select * from sales order by created_at desc limit 100) t), '[]'::jsonb) as sales,
      (select data from ui_settings where id = 'global' limit 1) as ui_settings
  `;

  const data = normalizeObject(rows[0] as Row);
  
  const totals = {
    customerOrderKg: data.totalCustomerOrderKg,
    knittedKg: data.totalKnittedKg,
    producedKg: data.totalProducedKg,
    shippedKg: data.totalShippedKg,
    purchaseOrderKg: data.totalPurchaseOrderKg,
    receivedPurchaseKg: data.totalReceivedPurchaseKg,
  };

  return withErpDefaults({
    ...data,
    totals,
  } as any);
}

export async function getSalesPageData(): Promise<ErpData> {
  const rows = await sql`
    select
      coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from (select * from sales order by created_at desc limit 200) t), '[]'::jsonb) as sales,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from (select * from orders order by created_at desc limit 200) t), '[]'::jsonb) as orders,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from stock_cards t), '[]'::jsonb) as stock_cards,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from partners t), '[]'::jsonb) as partners,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from warehouses t), '[]'::jsonb) as warehouses,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from warehouse_balances t), '[]'::jsonb) as warehouse_balances,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from (select * from parties order by created_at desc limit 200) t), '[]'::jsonb) as parties,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from settings_fabric_types t), '[]'::jsonb) as fabric_types,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from settings_colors t), '[]'::jsonb) as colors,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from settings_yarn_counts t), '[]'::jsonb) as yarn_counts,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from (select * from stock_movements order by created_at desc limit 100) t), '[]'::jsonb) as stock_movements,
      (select data from ui_settings where id = 'global' limit 1) as ui_settings
  `;

  return withErpDefaults(normalizeObject(rows[0] as Row) as Partial<ErpData>);
}

export async function getTransferPageData(): Promise<ErpData> {
  const rows = await sql`
    select
      coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from (select * from transfers order by created_at desc limit 200) t), '[]'::jsonb) as transfers,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from stock_cards t), '[]'::jsonb) as stock_cards,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from warehouses t), '[]'::jsonb) as warehouses,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from partners t), '[]'::jsonb) as partners,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from warehouse_balances t), '[]'::jsonb) as warehouse_balances,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from settings_fabric_types t), '[]'::jsonb) as fabric_types,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from settings_colors t), '[]'::jsonb) as colors,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from settings_yarn_counts t), '[]'::jsonb) as yarn_counts,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from (select * from stock_movements order by created_at desc limit 100) t), '[]'::jsonb) as stock_movements,
      (select data from ui_settings where id = 'global' limit 1) as ui_settings
  `;

  return withErpDefaults(normalizeObject(rows[0] as Row) as Partial<ErpData>);
}

export async function getStockPageData(): Promise<ErpData> {
  const rows = await sql`
    select
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from stock_cards t), '[]'::jsonb) as stock_cards,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from warehouse_balances t), '[]'::jsonb) as warehouse_balances,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from warehouses t), '[]'::jsonb) as warehouses,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from settings_fabric_types t), '[]'::jsonb) as fabric_types,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from settings_colors t), '[]'::jsonb) as colors,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from settings_yarn_counts t), '[]'::jsonb) as yarn_counts,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.code) from settings_yarn_types t), '[]'::jsonb) as yarn_types,
      (select data from ui_settings where id = 'global' limit 1) as ui_settings
  `;

  return withErpDefaults(normalizeObject(rows[0] as Row) as Partial<ErpData>);
}

export async function getWarehousePageData(): Promise<ErpData> {
  const rows = await sql`
    select
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from warehouses t), '[]'::jsonb) as warehouses,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from warehouse_balances t), '[]'::jsonb) as warehouse_balances,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from stock_cards t), '[]'::jsonb) as stock_cards,
      (select data from ui_settings where id = 'global' limit 1) as ui_settings
  `;

  return withErpDefaults(normalizeObject(rows[0] as Row) as Partial<ErpData>);
}

export async function getPartyPageData(): Promise<ErpData> {
  const rows = await sql`
    select
      coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from (select * from parties order by created_at desc limit 300) t), '[]'::jsonb) as parties,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from (select * from orders order by created_at desc limit 200) t), '[]'::jsonb) as orders,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from stock_cards t), '[]'::jsonb) as stock_cards,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from warehouses t), '[]'::jsonb) as warehouses,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from partners t), '[]'::jsonb) as partners,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from order_party_allocations t), '[]'::jsonb) as order_party_allocations,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from (select * from production_raw order by created_at desc limit 300) t), '[]'::jsonb) as production_raw,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from (select * from production_dyehouse order by created_at desc limit 300) t), '[]'::jsonb) as production_dyehouse,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from (select * from transfers order by created_at desc limit 300) t), '[]'::jsonb) as transfers,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from (select * from sales order by created_at desc limit 300) t), '[]'::jsonb) as sales,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from settings_fabric_types t), '[]'::jsonb) as fabric_types,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from settings_colors t), '[]'::jsonb) as colors,
      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from settings_yarn_counts t), '[]'::jsonb) as yarn_counts,
      (select data from ui_settings where id = 'global' limit 1) as ui_settings
  `;

  return withErpDefaults(normalizeObject(rows[0] as Row) as Partial<ErpData>);
}

export async function getReportsPageData(): Promise<ErpData> {
  const rows = await sql`
    select
      -- Aggregates (Optimized from Aggregate Tables)
      coalesce((select jsonb_agg(t) from (
        select to_char(report_date, 'YYYY-MM') as month, sum(raw_waste_kg) as total_waste_kg
        from report_daily_waste_summary group by month order by month desc
      ) t), '[]'::jsonb) as raw_waste_by_month,
      coalesce((select jsonb_agg(t) from (
        select to_char(report_date, 'YYYY-MM') as month, sum(dyehouse_waste_kg) as total_waste_kg
        from report_daily_waste_summary group by month order by month desc
      ) t), '[]'::jsonb) as dyehouse_waste_by_month,
      coalesce((select jsonb_agg(t) from (
        select f.name as fabric_type, sum(p.raw_produced_kg * 0.05) as total_waste_kg -- Mock waste if not in aggregate
        from report_daily_order_summary p join orders o on p.order_id = o.id join settings_fabric_types f on o.fabric_type_id = f.id
        group by f.name
      ) t), '[]'::jsonb) as waste_by_fabric_type, -- Note: specific waste by fabric might still need order links
      coalesce((select jsonb_agg(t) from (
        select to_char(report_date, 'YYYY-MM') as month, sum(raw_produced_kg) as total_kg
        from report_daily_order_summary group by month order by month desc
      ) t), '[]'::jsonb) as production_by_month,
      coalesce((select jsonb_agg(t) from (
        select to_char(report_date, 'YYYY-MM') as month, sum(ordered_kg) as total_kg
        from report_daily_purchase_summary group by month order by month desc
      ) t), '[]'::jsonb) as purchase_by_month,
      coalesce((select jsonb_agg(t) from (
        select to_char(report_date, 'YYYY-MM') as month, sum(shipped_kg) as total_kg
        from report_daily_order_summary group by month order by month desc
      ) t), '[]'::jsonb) as shipment_by_month,

      -- Limited details
      coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from (select * from parties order by created_at desc limit 200) t), '[]'::jsonb) as parties,
      coalesce((select jsonb_agg(to_jsonb(t) order by id) from stock_cards t), '[]'::jsonb) as stock_cards,
      coalesce((select jsonb_agg(to_jsonb(t) order by id) from settings_fabric_types t), '[]'::jsonb) as fabric_types,
      coalesce((select jsonb_agg(to_jsonb(t) order by id) from settings_colors t), '[]'::jsonb) as colors,
      (select data from ui_settings where id = 'global' limit 1) as ui_settings
  `;

  return withErpDefaults(normalizeObject(rows[0] as Row) as Partial<ErpData>);
}

export async function getOrderTimeline(orderId: string) {
  const rows = await sql`
    with order_parties as (
      select party_id from order_party_allocations where order_id = ${orderId}
    )
    select * from (
      -- A) Sipariş Oluşturma
      select 
        id, 
        'customer_order' as type,
        'Müşteri Siparişi Oluşturuldu' as title,
        customer_name || ' için ' || quantity_kg || ' KG sipariş açıldı.' as description,
        order_date as event_date,
        created_at,
        order_no as business_no,
        null as party_no,
        null as lot_no,
        quantity_kg as quantity_kg,
        status,
        id as related_id
      from orders where id = ${orderId}

      union all

      -- B) Ham Üretim
      select
        p.id,
        'raw_production' as type,
        'Ham Üretim Yapıldı' as title,
        coalesce(pa.party_no, 'Bilinmeyen') || ' partisi için ' || p.produced_raw_kg || ' KG ham üretim yapıldı.' as description,
        p.date as event_date,
        p.created_at,
        null as business_no,
        pa.party_no,
        null as lot_no,
        p.produced_raw_kg as quantity_kg,
        null as status,
        p.id as related_id
      from production_raw p
      left join parties pa on p.party_id = pa.id
      where p.order_id = ${orderId}

      union all

      -- C) Boyahane Üretimi
      select
        p.id,
        'dyehouse_production' as type,
        'Boyahaneye Gönderildi' as title,
        coalesce(pa.party_no, 'Bilinmeyen') || ' partisi için ' || p.finished_kg || ' KG boyahane girişi yapıldı.' as description,
        p.date as event_date,
        p.created_at,
        null as business_no,
        pa.party_no,
        null as lot_no,
        p.finished_kg as quantity_kg,
        null as status,
        p.id as related_id
      from production_dyehouse p
      left join parties pa on p.party_id = pa.id
      where p.order_id = ${orderId}

      union all

      -- D) Satış / Sevkiyat
      select
        s.id,
        'sale' as type,
        'Sevkiyat Yapıldı' as title,
        customer_name || ' müşterisine ' || quantity_kg || ' KG sevkiyat gerçekleştirildi.' as description,
        s.date as event_date,
        s.created_at,
        s.sale_no as business_no,
        pa.party_no,
        null as lot_no,
        s.quantity_kg as quantity_kg,
        s.status,
        s.id as related_id
      from sales s
      left join parties pa on s.party_id = pa.id
      where s.order_id = ${orderId}

      union all

      -- E) Transferler
      select
        t.id,
        'transfer' as type,
        'Depo Transferi' as title,
        'Siparişe ait partiler arasında depo transferi yapıldı.' as description,
        t.date as event_date,
        t.created_at,
        null as business_no,
        null as party_no,
        null as lot_no,
        null as quantity_kg,
        null as status,
        t.id as related_id
      from transfers t
      where exists (
        select 1 from jsonb_array_elements(t.items) as item
        where item->>'partyId' in (select party_id from order_parties)
      )
    ) as timeline
    order by event_date asc, created_at asc
  `;

  return rows.map((r) => normalizeObject(r as Row)) as any[];
}
