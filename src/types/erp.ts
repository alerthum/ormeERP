export type StockType = "YM" | "MM" | "IP" | "LYC" | "POLY";
export type Direction = "IN" | "OUT";
export type PartnerType = "KNITTER" | "DYEHOUSE" | "SUPPLIER" | "CUSTOMER";
export type OrderStatus = string;
export type PurchaseStatus = string;
export type SaleStatus = string;
export type MovementType = string;

export interface NamedEntity {
  id: string;
  name: string;
  isActive?: boolean;
}

export interface YarnType extends NamedEntity {
  code: string;
}

export interface Partner extends NamedEntity {
  type: PartnerType;
  riskScore?: number;
}

export interface Warehouse extends NamedEntity {
  kind: "YARN" | "KNITTER" | "RAW" | "DYEHOUSE" | "FINISHED" | "STORE" | "WASTE";
}

export interface StockCard {
  id: string;
  code: string;
  type: StockType;
  name: string;
  fabricTypeId?: string;
  colorId?: string;
  yarnCountId?: string;
  yarnTypeId?: string;
  hasPolyester: boolean;
  hasLycra: boolean;
  rawWidth?: number;
  rawGsm?: number;
  finishWidth?: number;
  finishGsm?: number;
  unit: "kg" | "adet" | "mt";
  currentStockKg: number;
  criticalStockKg: number;
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
}

export interface Order {
  id: string;
  orderNo: string;
  customerName: string;
  orderDate: string;
  dueDate: string;
  fabricTypeId: string;
  colorId: string;
  yarnCountId: string;
  hasPolyester: boolean;
  hasLycra: boolean;
  rawWidth: number;
  rawGsm: number;
  finishWidth: number;
  finishGsm: number;
  quantityKg: number;
  ymStockId: string;
  mmStockId: string;
  status: OrderStatus;
  processTypeIds: string[];
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface TimelineItem {
  date: string;
  title: string;
  description: string;
  tone: "blue" | "green" | "amber" | "red";
}

export interface Party {
  id: string;
  partyNo: string;
  orderId: string;
  ymStockId: string;
  mmStockId: string;
  status: string;
  rawProducedKg: number;
  rawConsumedKg: number;
  rawWasteKg: number;
  rawWastePercent: number;
  dyehouseInputKg: number;
  finishedKg: number;
  dyehouseWasteKg: number;
  dyehouseWastePercent: number;
  rawWidth?: number;
  rawGsm?: number;
  finishWidth?: number;
  finishGsm?: number;
  currentWarehouseId: string;
  timeline: TimelineItem[];
  createdAt: string;
  updatedAt: string;
}

export interface StockMovement {
  id: string;
  date: string;
  stockId: string;
  warehouseId: string;
  partyId?: string;
  lotNo?: string;
  orderId?: string;
  movementType: MovementType;
  direction: Direction;
  quantity: number;
  unit: "kg";
  description: string;
  referenceType: string;
  referenceId: string;
  createdAt: string;
  createdBy: string;
}

export interface WarehouseBalance {
  id: string;
  stockId: string;
  warehouseId: string;
  partyId?: string;
  lotNo?: string;
  quantity: number;
  updatedAt: string;
}

export interface ConsumedItem {
  stockId: string;
  warehouseId: string;
  quantityKg: number;
  lotNo?: string;
  description?: string;
}

export interface RawProduction {
  id: string;
  date: string;
  orderId: string;
  partyId: string;
  knitterPartnerId: string;
  warehouseId: string;
  ymStockId: string;
  producedRawKg: number;
  consumedItems: ConsumedItem[];
  wasteKg: number;
  wastePercent: number;
  rawWidth?: number;
  rawGsm?: number;
  description: string;
  createdAt: string;
}

export interface DyehouseProduction {
  id: string;
  date: string;
  orderId: string;
  partyId: string;
  dyehousePartnerId: string;
  inputWarehouseId: string;
  outputWarehouseId: string;
  ymStockId: string;
  mmStockId: string;
  inputRawKg: number;
  finishedKg: number;
  wasteKg: number;
  wastePercent: number;
  processTypeIds: string[];
  finishWidth: number;
  finishGsm: number;
  description: string;
  createdAt: string;
}

export interface Transfer {
  id: string;
  date: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  items: { stockId: string; partyId?: string; quantity: number }[];
  description: string;
  createdAt: string;
}

export interface PurchaseOrderItem {
  id: string;
  stockId: string;
  stockCode: string;
  stockName: string;
  stockType: StockType;
  yarnCountId?: string;
  yarnTypeId?: string;
  colorId?: string;
  orderedKg: number;
  receivedKg: number;
  remainingKg: number;
  unitPrice?: number;
  currency?: "TRY" | "USD" | "EUR";
  description?: string;
}

export interface PurchaseOrder {
  id: string;
  purchaseOrderNo: string;
  supplierId: string;
  orderDate: string;
  dueDate: string;
  status: PurchaseStatus;
  items: PurchaseOrderItem[];
  totalOrderedKg: number;
  totalReceivedKg: number;
  totalRemainingKg: number;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseReceipt {
  id: string;
  purchaseOrderId: string;
  receiptNo: string;
  receiptDate: string;
  warehouseId: string;
  supplierId: string;
  items: { purchaseOrderItemId: string; stockId: string; receivedKg: number; unitPrice?: number; lotNo?: string; description?: string }[];
  description: string;
  createdAt: string;
  createdBy: string;
}

export interface OrderPartyAllocation {
  id: string;
  orderId: string;
  partyId: string;
  allocatedKg: number;
  producedRawKg: number;
  producedFinishedKg: number;
  shippedKg: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  severity: "info" | "warning" | "danger" | "success";
  relatedType?: string;
  relatedId?: string;
  isRead: boolean;
  createdAt: string;
}

export interface Sale {
  id: string;
  saleNo: string;
  date: string;
  customerName: string;
  warehouseId: string;
  stockId: string;
  partyId: string;
  orderId?: string;
  quantityKg: number;
  unitPrice?: number;
  currency: "TRY" | "USD" | "EUR";
  status: SaleStatus;
  description: string;
  createdAt: string;
  createdBy?: string;
}

export interface Role {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  roleId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UISettings {
  menuMode: "static" | "collapsible";
  submenuDefaultState: "open" | "closed";
  modalPosition: "right" | "left" | "center" | "top" | "bottom";
  modalPositionMobile: "right" | "left" | "center" | "top" | "bottom";
  notificationsEnabled: boolean;
  notificationModules: string[];
  maxNotificationCount: number;
  showCriticalStock: boolean;
  showDelayedOrders: boolean;
  showProductionAlerts: boolean;
  sidebarGroupBg?: string;
  sidebarGroupText?: string;
}

export interface Counter {
  key: string;
  prefix: string;
  currentValue: number;
  updatedAt: string;
}

export interface ErpData {
  fabricTypes: NamedEntity[];
  colors: NamedEntity[];
  yarnCounts: NamedEntity[];
  yarnTypes: YarnType[];
  processTypes: NamedEntity[];
  warehouses: Warehouse[];
  partners: Partner[];
  stockCards: StockCard[];
  stockMovements: StockMovement[];
  warehouseBalances: WarehouseBalance[];
  orders: Order[];
  parties: Party[];
  orderPartyAllocations: OrderPartyAllocation[];
  productionRaw: RawProduction[];
  productionDyehouse: DyehouseProduction[];
  transfers: Transfer[];
  purchaseOrders: PurchaseOrder[];
  purchaseReceipts: PurchaseReceipt[];
  sales: Sale[];
  notifications: NotificationItem[];
  roles: Role[];
  userProfiles: UserProfile[];
  counters: Counter[];
  uiSettings: UISettings;
}
