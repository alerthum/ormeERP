import { Row } from "./read/read-core";

export async function rebuildDailyStockSummary(tx: any) {
  console.log("📊 Rebuilding daily stock summary...");
  
  await tx`truncate table report_daily_stock_summary`;

  await tx`
    insert into report_daily_stock_summary (
      report_date, stock_id, stock_code, stock_name, 
      total_in_kg, total_out_kg, net_kg, warehouse_count
    )
    select 
      date as report_date,
      stock_id,
      max(s.code) as stock_code,
      max(s.name) as stock_name,
      sum(case when direction = 'IN' then quantity::numeric else 0 end)::numeric(15,3) as total_in_kg,
      sum(case when direction = 'OUT' then quantity::numeric else 0 end)::numeric(15,3) as total_out_kg,
      sum(case when direction = 'IN' then quantity::numeric else -quantity::numeric end)::numeric(15,3) as net_kg,
      count(distinct warehouse_id)::integer as warehouse_count
    from stock_movements m
    left join stock_cards s on m.stock_id = s.id::text
    group by date, stock_id
  `;
}

export async function rebuildDailyOrderSummary(tx: any) {
  console.log("📊 Rebuilding daily order summary...");
  
  await tx`truncate table report_daily_order_summary`;

  // 1. Order Creation
  await tx`
    insert into report_daily_order_summary (
      report_date, order_id, customer_name, ordered_kg, status
    )
    select 
      order_date as report_date,
      id as order_id,
      customer_name,
      quantity_kg::numeric(15,3) as ordered_kg,
      status
    from orders
    on conflict (report_date, order_id) do update set
      ordered_kg = excluded.ordered_kg,
      status = excluded.status
  `;

  // 2. Raw Production
  await tx`
    insert into report_daily_order_summary (
      report_date, order_id, raw_produced_kg
    )
    select 
      date as report_date,
      order_id,
      sum(produced_raw_kg::numeric)::numeric(15,3) as raw_produced_kg
    from production_raw
    group by date, order_id
    on conflict (report_date, order_id) do update set
      raw_produced_kg = excluded.raw_produced_kg
  `;

  // 3. Dyehouse Production
  await tx`
    insert into report_daily_order_summary (
      report_date, order_id, dyehouse_kg
    )
    select 
      date as report_date,
      order_id,
      sum(finished_kg::numeric)::numeric(15,3) as dyehouse_kg
    from production_dyehouse
    group by date, order_id
    on conflict (report_date, order_id) do update set
      dyehouse_kg = excluded.dyehouse_kg
  `;

  // 4. Sales
  await tx`
    insert into report_daily_order_summary (
      report_date, order_id, shipped_kg
    )
    select 
      date as report_date,
      order_id,
      sum(quantity_kg::numeric)::numeric(15,3) as shipped_kg
    from sales
    where order_id is not null
    group by date, order_id
    on conflict (report_date, order_id) do update set
      shipped_kg = excluded.shipped_kg
  `;

  // Update remaining_kg and status
  await tx`
    update report_daily_order_summary s
    set 
      customer_name = o.customer_name,
      status = o.status,
      remaining_kg = greatest(s.ordered_kg - s.shipped_kg, 0)
    from orders o
    where s.order_id = o.id
  `;
}

export async function rebuildDailyPurchaseSummary(tx: any) {
  console.log("📊 Rebuilding daily purchase summary...");
  
  await tx`truncate table report_daily_purchase_summary`;

  // 1. PO Creation
  await tx`
    insert into report_daily_purchase_summary (
      report_date, purchase_order_id, supplier_id, ordered_kg, status
    )
    select 
      order_date as report_date,
      id as purchase_order_id,
      supplier_id,
      total_ordered_kg::numeric(15,3) as ordered_kg,
      status
    from purchase_orders
    on conflict (report_date, purchase_order_id) do update set
      ordered_kg = excluded.ordered_kg,
      status = excluded.status
  `;

  // 2. Receipts
  await tx`
    insert into report_daily_purchase_summary (
      report_date, purchase_order_id, received_kg
    )
    select 
      receipt_date as report_date,
      purchase_order_id,
      sum((r_item->>'receivedKg')::numeric)::numeric(15,3) as received_kg
    from purchase_receipts, jsonb_array_elements(items) as r_item
    group by receipt_date, purchase_order_id
    on conflict (report_date, purchase_order_id) do update set
      received_kg = excluded.received_kg
  `;

  // Update remaining_kg
  await tx`
    update report_daily_purchase_summary
    set remaining_kg = greatest(ordered_kg - received_kg, 0)
  `;
}

export async function rebuildDailyWasteSummary(tx: any) {
  console.log("📊 Rebuilding daily waste summary...");
  
  await tx`truncate table report_daily_waste_summary`;

  await tx`
    insert into report_daily_waste_summary (
      report_date, raw_waste_kg, dyehouse_waste_kg, total_waste_kg
    )
    select 
      report_date,
      sum(raw_waste)::numeric(15,3) as raw_waste_kg,
      sum(dye_waste)::numeric(15,3) as dyehouse_waste_kg,
      sum(raw_waste + dye_waste)::numeric(15,3) as total_waste_kg
    from (
      select date as report_date, sum(waste_kg::numeric) as raw_waste, 0 as dye_waste
      from production_raw group by date
      union all
      select date as report_date, 0 as raw_waste, sum(waste_kg::numeric) as dye_waste
      from production_dyehouse group by date
    ) t
    group by report_date
    on conflict (report_date) do update set
      raw_waste_kg = excluded.raw_waste_kg,
      dyehouse_waste_kg = excluded.dyehouse_waste_kg,
      total_waste_kg = excluded.total_waste_kg
  `;
}

export async function rebuildAllReportingAggregates(tx: any) {
  console.log("🔄 Rebuilding all reporting aggregates...");
  await rebuildDailyStockSummary(tx);
  await rebuildDailyOrderSummary(tx);
  await rebuildDailyPurchaseSummary(tx);
  await rebuildDailyWasteSummary(tx);
  console.log("✅ All reporting aggregates rebuilt.");
}
