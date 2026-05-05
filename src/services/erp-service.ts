import { normalizeItems } from "@/lib/utils";
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

export function findMatchingStock(order: Pick<Order, "fabricTypeId" | "colorId" | "yarnCountId" | "hasPolyester" | "hasLycra">, type: "YM" | "MM", cards: StockCard[]) {
  return cards.find((card) => {
    return (
      card.type === type &&
      card.fabricTypeId === order.fabricTypeId &&
      card.colorId === order.colorId &&
      card.yarnCountId === order.yarnCountId &&
      card.hasPolyester === order.hasPolyester &&
      card.hasLycra === order.hasLycra
    );
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
        ? `${fabric} Ham ${yarn} ${color}`.trim()
        : `${fabric} Mamül ${yarn} ${color}`.trim(),
    fabricTypeId: order.fabricTypeId,
    colorId: order.colorId,
    yarnCountId: order.yarnCountId,
    hasPolyester: order.hasPolyester,
    hasLycra: order.hasLycra,
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
  const monthlyRawKg = data.parties.reduce((sum, party) => sum + (party.rawProducedKg || 0), 0);
  const monthlyFinishedKg = data.parties.reduce((sum, party) => sum + (party.finishedKg || 0), 0);
  const monthlyProductionKg = monthlyRawKg + monthlyFinishedKg;
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
    monthlyRawKg,
    monthlyFinishedKg,
    monthlyProductionKg,
    wasteKg: rawWasteKg + dyeWasteKg,
    avgRawWaste,
    avgDyeWaste,
    openPurchaseCount: openPurchaseOrders.length,
    pendingRawMaterialKg: openPurchaseOrders.reduce((sum, order) => sum + order.totalRemainingKg, 0),
    monthlyReceivedKg: data.purchaseReceipts.reduce((sum, receipt) => sum + normalizeItems(receipt.items).reduce((itemSum, item) => itemSum + (item.receivedKg || 0), 0), 0),
    partialPurchaseCount: data.purchaseOrders.filter((order) => order.status === "Kısmi Geldi").length,
    delayedPurchaseCount: data.purchaseOrders.filter((order) => new Date(order.dueDate) < new Date("2026-05-02") && order.totalRemainingKg > 0).length,
  };
}

export function getComputedNotifications(data: ErpData) {
  const today = new Date();
  const dayMs = 24 * 60 * 60 * 1000;
  const notifications = [
    ...data.stockCards
      .filter((stock) => stock.criticalStockKg > 0 && stock.currentStockKg <= stock.criticalStockKg)
      .map((stock) => ({
        id: `critical-stock-${stock.id}`,
        type: "critical_stock",
        title: "Kritik stok",
        message: `${stock.code} - ${stock.name} kritik seviyenin altında.`,
        severity: "danger" as const,
        relatedType: "stock",
        relatedId: stock.id,
        isRead: false,
        createdAt: today.toISOString(),
      })),
    ...data.orders
      .filter((order) => !["Kapandı", "İptal", "Sevk Edildi"].includes(order.status))
      .filter((order) => {
        const days = Math.ceil((new Date(order.dueDate).getTime() - today.getTime()) / dayMs);
        return days <= 5;
      })
      .map((order) => {
        const days = Math.ceil((new Date(order.dueDate).getTime() - today.getTime()) / dayMs);
        return {
          id: `due-order-${order.id}`,
          type: days < 0 ? "late_order" : "near_due_order",
          title: days < 0 ? "Geciken sipariş" : "Termin yaklaşıyor",
          message: `${order.orderNo} için termin ${order.dueDate}.`,
          severity: days < 0 ? ("danger" as const) : ("warning" as const),
          relatedType: "order",
          relatedId: order.id,
          isRead: false,
          createdAt: today.toISOString(),
        };
      }),
    ...data.purchaseOrders
      .filter((order) => order.status === "Kısmi Geldi" || (order.status !== "Tamamlandı" && order.totalRemainingKg > 0))
      .map((order) => ({
        id: `purchase-${order.id}`,
        type: order.status === "Kısmi Geldi" ? "partial_purchase" : "pending_purchase",
        title: order.status === "Kısmi Geldi" ? "Kısmi gelen satıcı siparişi" : "Bekleyen hammadde siparişi",
        message: `${order.purchaseOrderNo} için ${order.totalRemainingKg.toLocaleString("tr-TR")} kg bekliyor.`,
        severity: "warning" as const,
        relatedType: "purchaseOrder",
        relatedId: order.id,
        isRead: false,
        createdAt: today.toISOString(),
      })),
    ...data.productionRaw
      .filter((item) => item.wastePercent >= 8)
      .map((item) => ({
        id: `raw-waste-${item.id}`,
        type: "high_raw_waste",
        title: "Ham üretim fire oranı yüksek",
        message: `${item.wastePercent.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}% fire oluştu.`,
        severity: "danger" as const,
        relatedType: "productionRaw",
        relatedId: item.id,
        isRead: false,
        createdAt: today.toISOString(),
      })),
    ...data.productionDyehouse
      .filter((item) => item.wastePercent >= 8)
      .map((item) => ({
        id: `dye-waste-${item.id}`,
        type: "high_dyehouse_waste",
        title: "Boyahane fire oranı yüksek",
        message: `${item.wastePercent.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}% fire oluştu.`,
        severity: "danger" as const,
        relatedType: "productionDyehouse",
        relatedId: item.id,
        isRead: false,
        createdAt: today.toISOString(),
      })),
    ...data.parties
      .filter((party) => party.status === "Mamül Hazır" && party.finishedKg > 0)
      .map((party) => ({
        id: `ready-party-${party.id}`,
        type: "ready_to_ship",
        title: "Sevkiyata hazır mamül",
        message: `${party.partyNo} partisi sevkiyata hazır.`,
        severity: "success" as const,
        relatedType: "party",
        relatedId: party.id,
        isRead: false,
        createdAt: today.toISOString(),
      })),
  ];

  return [...data.notifications, ...notifications].slice(0, 12);
}
