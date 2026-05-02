import { emptyErpData } from "@/data/empty";
import type { ErpData, Order, PurchaseOrder, StockCard, StockType } from "@/types/erp";

export function getErpData(): ErpData {
  return emptyErpData;
}

export function getById<T extends { id: string }>(items: T[], id: string): T | undefined {
  return items.find((item) => item.id === id);
}

export function getName<T extends { id: string; name: string }>(items: T[], id?: string): string {
  if (!id) return "-";
  return items.find((item) => item.id === id)?.name ?? "-";
}

export function nextCode(prefix: StockType, cards: StockCard[]): string {
  const last = cards
    .filter((card) => card.type === prefix)
    .map((card) => Number(card.code.split("-")[1] ?? "0"))
    .sort((a, b) => b - a)[0] ?? 0;
  return `${prefix}-${String(last + 1).padStart(6, "0")}`;
}

export function findMatchingStock(order: Pick<Order, "fabricTypeId" | "colorId" | "yarnCountId" | "hasPolyester" | "hasLycra" | "rawWidth" | "rawGsm" | "finishWidth" | "finishGsm">, type: "YM" | "MM", cards: StockCard[]) {
  return cards.find((card) => {
    const base =
      card.type === type &&
      card.fabricTypeId === order.fabricTypeId &&
      card.colorId === order.colorId &&
      card.yarnCountId === order.yarnCountId &&
      card.hasPolyester === order.hasPolyester &&
      card.hasLycra === order.hasLycra &&
      card.rawWidth === order.rawWidth &&
      card.rawGsm === order.rawGsm;
    if (type === "YM") return base;
    return base && card.finishWidth === order.finishWidth && card.finishGsm === order.finishGsm;
  });
}

export function buildAutoStock(order: Order, type: "YM" | "MM", data: ErpData): StockCard {
  const fabric = getName(data.fabricTypes, order.fabricTypeId);
  const color = getName(data.colors, order.colorId);
  const yarn = getName(data.yarnCounts, order.yarnCountId);
  return {
    id: `st-${type.toLowerCase()}-${Date.now()}`,
    code: nextCode(type, data.stockCards),
    type,
    name:
      type === "YM"
        ? `${fabric} Ham ${yarn} ${color} ${order.rawWidth}cm ${order.rawGsm}gsm`
        : `${fabric} Mamül ${yarn} ${color} ${order.finishWidth}cm ${order.finishGsm}gsm`,
    fabricTypeId: order.fabricTypeId,
    colorId: order.colorId,
    yarnCountId: order.yarnCountId,
    hasPolyester: order.hasPolyester,
    hasLycra: order.hasLycra,
    rawWidth: order.rawWidth,
    rawGsm: order.rawGsm,
    finishWidth: type === "MM" ? order.finishWidth : undefined,
    finishGsm: type === "MM" ? order.finishGsm : undefined,
    unit: "kg",
    currentStockKg: 0,
    criticalStockKg: 500,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isActive: true,
  };
}

export function calculateRawWaste(consumedKg: number, producedKg: number) {
  const wasteKg = Math.max(consumedKg - producedKg, 0);
  return {
    wasteKg,
    wastePercent: consumedKg > 0 ? (wasteKg / consumedKg) * 100 : 0,
  };
}

export function calculateDyehouseWaste(inputKg: number, finishedKg: number) {
  const wasteKg = Math.max(inputKg - finishedKg, 0);
  return {
    wasteKg,
    wastePercent: inputKg > 0 ? (wasteKg / inputKg) * 100 : 0,
  };
}

export function getPurchaseProgress(order: PurchaseOrder) {
  return order.totalOrderedKg > 0 ? Math.min(100, (order.totalReceivedKg / order.totalOrderedKg) * 100) : 0;
}

export function getDashboardMetrics(data: ErpData) {
  const activeOrders = data.orders.filter((order) => order.status !== "Kapandı").length;
  const monthlyProductionKg = data.parties.reduce((sum, party) => sum + party.rawProducedKg + party.finishedKg, 0);
  const rawWasteKg = data.parties.reduce((sum, party) => sum + party.rawWasteKg, 0);
  const dyeWasteKg = data.parties.reduce((sum, party) => sum + party.dyehouseWasteKg, 0);
  const avgRawWaste = data.parties.length > 0 ? data.parties.reduce((sum, party) => sum + party.rawWastePercent, 0) / data.parties.length : 0;
  const avgDyeWaste = data.parties.length > 0 ? data.parties.reduce((sum, party) => sum + party.dyehouseWastePercent, 0) / data.parties.length : 0;
  const openPurchaseOrders = data.purchaseOrders.filter((order) => order.status !== "Tamamlandı" && order.status !== "İptal");
  return {
    activeOrders,
    knittingOrders: data.orders.filter((order) => order.status === "Örmede").length,
    dyehouseOrders: data.orders.filter((order) => order.status === "Boyahanede").length,
    readyOrders: data.orders.filter((order) => order.status === "Mamül Hazır").length,
    monthlyProductionKg,
    wasteKg: rawWasteKg + dyeWasteKg,
    avgRawWaste,
    avgDyeWaste,
    openPurchaseCount: openPurchaseOrders.length,
    pendingRawMaterialKg: openPurchaseOrders.reduce((sum, order) => sum + order.totalRemainingKg, 0),
    monthlyReceivedKg: data.purchaseReceipts.reduce((sum, receipt) => sum + receipt.items.reduce((itemSum, item) => itemSum + item.receivedKg, 0), 0),
    partialPurchaseCount: data.purchaseOrders.filter((order) => order.status === "Kısmi Geldi").length,
    delayedPurchaseCount: data.purchaseOrders.filter((order) => new Date(order.dueDate) < new Date("2026-05-02") && order.totalRemainingKg > 0).length,
  };
}
