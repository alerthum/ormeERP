import { boolean, date, integer, jsonb, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const fabricTypes = pgTable("settings_fabric_types", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
});

export const colors = pgTable("settings_colors", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
});

export const yarnCounts = pgTable("settings_yarn_counts", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
});

export const processTypes = pgTable("settings_process_types", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
});

export const warehouses = pgTable("warehouses", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  kind: text("kind").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
});

export const partners = pgTable("partners", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  riskScore: integer("risk_score").default(0),
  isActive: boolean("is_active").default(true).notNull(),
});

export const stockCards = pgTable("stock_cards", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  type: text("type").notNull(),
  name: text("name").notNull(),
  fabricTypeId: uuid("fabric_type_id"),
  colorId: uuid("color_id"),
  yarnCountId: uuid("yarn_count_id"),
  hasPolyester: boolean("has_polyester").default(false).notNull(),
  hasLycra: boolean("has_lycra").default(false).notNull(),
  rawWidth: integer("raw_width"),
  rawGsm: integer("raw_gsm"),
  finishWidth: integer("finish_width"),
  finishGsm: integer("finish_gsm"),
  unit: text("unit").default("kg").notNull(),
  currentStockKg: numeric("current_stock_kg", { precision: 14, scale: 3 }).default("0").notNull(),
  criticalStockKg: numeric("critical_stock_kg", { precision: 14, scale: 3 }).default("0").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  isActive: boolean("is_active").default(true).notNull(),
});

export const orders = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderNo: text("order_no").notNull().unique(),
  customerName: text("customer_name").notNull(),
  orderDate: date("order_date").notNull(),
  dueDate: date("due_date").notNull(),
  fabricTypeId: uuid("fabric_type_id").notNull(),
  colorId: uuid("color_id").notNull(),
  yarnCountId: uuid("yarn_count_id").notNull(),
  hasPolyester: boolean("has_polyester").default(false).notNull(),
  hasLycra: boolean("has_lycra").default(false).notNull(),
  rawWidth: integer("raw_width").notNull(),
  rawGsm: integer("raw_gsm").notNull(),
  finishWidth: integer("finish_width").notNull(),
  finishGsm: integer("finish_gsm").notNull(),
  quantityKg: numeric("quantity_kg", { precision: 14, scale: 3 }).notNull(),
  ymStockId: uuid("ym_stock_id"),
  mmStockId: uuid("mm_stock_id"),
  status: text("status").notNull(),
  processTypeIds: jsonb("process_type_ids").$type<string[]>().default([]).notNull(),
  description: text("description").default("").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const parties = pgTable("parties", {
  id: uuid("id").primaryKey().defaultRandom(),
  partyNo: text("party_no").notNull().unique(),
  orderId: uuid("order_id").notNull(),
  ymStockId: uuid("ym_stock_id").notNull(),
  mmStockId: uuid("mm_stock_id").notNull(),
  status: text("status").notNull(),
  rawProducedKg: numeric("raw_produced_kg", { precision: 14, scale: 3 }).default("0").notNull(),
  rawConsumedKg: numeric("raw_consumed_kg", { precision: 14, scale: 3 }).default("0").notNull(),
  rawWasteKg: numeric("raw_waste_kg", { precision: 14, scale: 3 }).default("0").notNull(),
  rawWastePercent: numeric("raw_waste_percent", { precision: 8, scale: 3 }).default("0").notNull(),
  dyehouseInputKg: numeric("dyehouse_input_kg", { precision: 14, scale: 3 }).default("0").notNull(),
  finishedKg: numeric("finished_kg", { precision: 14, scale: 3 }).default("0").notNull(),
  dyehouseWasteKg: numeric("dyehouse_waste_kg", { precision: 14, scale: 3 }).default("0").notNull(),
  dyehouseWastePercent: numeric("dyehouse_waste_percent", { precision: 8, scale: 3 }).default("0").notNull(),
  currentWarehouseId: uuid("current_warehouse_id"),
  timeline: jsonb("timeline").default([]).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const stockMovements = pgTable("stock_movements", {
  id: uuid("id").primaryKey().defaultRandom(),
  date: date("date").notNull(),
  stockId: uuid("stock_id").notNull(),
  warehouseId: uuid("warehouse_id").notNull(),
  partyId: uuid("party_id"),
  orderId: uuid("order_id"),
  movementType: text("movement_type").notNull(),
  direction: text("direction").notNull(),
  quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull(),
  unit: text("unit").default("kg").notNull(),
  description: text("description").default("").notNull(),
  referenceType: text("reference_type").notNull(),
  referenceId: text("reference_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  createdBy: uuid("created_by"),
});

export const warehouseBalances = pgTable("warehouse_balances", {
  id: uuid("id").primaryKey().defaultRandom(),
  stockId: uuid("stock_id").notNull(),
  warehouseId: uuid("warehouse_id").notNull(),
  partyId: uuid("party_id"),
  quantity: numeric("quantity", { precision: 14, scale: 3 }).default("0").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const productionRaw = pgTable("production_raw", {
  id: uuid("id").primaryKey().defaultRandom(),
  date: date("date").notNull(),
  orderId: uuid("order_id").notNull(),
  partyId: uuid("party_id").notNull(),
  knitterPartnerId: uuid("knitter_partner_id").notNull(),
  warehouseId: uuid("warehouse_id").notNull(),
  ymStockId: uuid("ym_stock_id").notNull(),
  producedRawKg: numeric("produced_raw_kg", { precision: 14, scale: 3 }).notNull(),
  consumedItems: jsonb("consumed_items").default([]).notNull(),
  wasteKg: numeric("waste_kg", { precision: 14, scale: 3 }).notNull(),
  wastePercent: numeric("waste_percent", { precision: 8, scale: 3 }).notNull(),
  description: text("description").default("").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const productionDyehouse = pgTable("production_dyehouse", {
  id: uuid("id").primaryKey().defaultRandom(),
  date: date("date").notNull(),
  orderId: uuid("order_id").notNull(),
  partyId: uuid("party_id").notNull(),
  dyehousePartnerId: uuid("dyehouse_partner_id").notNull(),
  inputWarehouseId: uuid("input_warehouse_id").notNull(),
  outputWarehouseId: uuid("output_warehouse_id").notNull(),
  ymStockId: uuid("ym_stock_id").notNull(),
  mmStockId: uuid("mm_stock_id").notNull(),
  inputRawKg: numeric("input_raw_kg", { precision: 14, scale: 3 }).notNull(),
  finishedKg: numeric("finished_kg", { precision: 14, scale: 3 }).notNull(),
  wasteKg: numeric("waste_kg", { precision: 14, scale: 3 }).notNull(),
  wastePercent: numeric("waste_percent", { precision: 8, scale: 3 }).notNull(),
  processTypeIds: jsonb("process_type_ids").$type<string[]>().default([]).notNull(),
  finishWidth: integer("finish_width").notNull(),
  finishGsm: integer("finish_gsm").notNull(),
  description: text("description").default("").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const transfers = pgTable("transfers", {
  id: uuid("id").primaryKey().defaultRandom(),
  date: date("date").notNull(),
  fromWarehouseId: uuid("from_warehouse_id").notNull(),
  toWarehouseId: uuid("to_warehouse_id").notNull(),
  items: jsonb("items").default([]).notNull(),
  description: text("description").default("").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const purchaseOrders = pgTable("purchase_orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  purchaseOrderNo: text("purchase_order_no").notNull().unique(),
  supplierId: uuid("supplier_id").notNull(),
  orderDate: date("order_date").notNull(),
  dueDate: date("due_date").notNull(),
  status: text("status").notNull(),
  items: jsonb("items").default([]).notNull(),
  totalOrderedKg: numeric("total_ordered_kg", { precision: 14, scale: 3 }).notNull(),
  totalReceivedKg: numeric("total_received_kg", { precision: 14, scale: 3 }).notNull(),
  totalRemainingKg: numeric("total_remaining_kg", { precision: 14, scale: 3 }).notNull(),
  description: text("description").default("").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const purchaseReceipts = pgTable("purchase_receipts", {
  id: uuid("id").primaryKey().defaultRandom(),
  purchaseOrderId: uuid("purchase_order_id").notNull(),
  receiptNo: text("receipt_no").notNull().unique(),
  receiptDate: date("receipt_date").notNull(),
  warehouseId: uuid("warehouse_id").notNull(),
  supplierId: uuid("supplier_id").notNull(),
  items: jsonb("items").default([]).notNull(),
  description: text("description").default("").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  createdBy: uuid("created_by"),
});

export const counters = pgTable("counters", {
  key: text("key").primaryKey(),
  prefix: text("prefix").notNull(),
  currentValue: integer("current_value").default(0).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
