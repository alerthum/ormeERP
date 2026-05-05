"use client";

import Link from "next/link";
import { AlertTriangle, BarChart3, Bell, BookOpen, Boxes, CheckCircle2, Download, Factory, KeyRound, Layout, Maximize2, PackageCheck, PackagePlus, Plus, RefreshCcw, Search, Settings, ShieldCheck, ShoppingCart, SlidersHorizontal, Trash2, Truck, Users, Warehouse, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { DataTable, type Column } from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge, statusTone } from "@/components/ui/status-badge";
import { StatCard } from "@/components/ui/stat-card";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { FormDrawer } from "@/components/ui/form-drawer";
import { DirectPurchaseForm, DyehouseProductionForm, OrderEditForm, OrderForm, PartyShiftForm, PurchaseOrderEditForm, PurchaseOrderForm, PurchaseReceiptEditForm, PurchaseReceiptForm, RawProductionForm, RoleForm, SaleForm, SettingForm, StockCardEditForm, StockCardForm, TransferForm, UserProfileForm } from "@/components/forms";
import { PartyTimeline } from "@/components/party-timeline";
import { useErpData } from "@/components/erp-data-provider";
import { getDashboardMetrics, getName, getPurchaseProgress } from "@/services/erp-service";
import type { DyehouseProduction, ErpData, NamedEntity, Order, Partner, Party, PurchaseOrder, PurchaseReceipt, RawProduction, Role, Sale, StockCard, StockMovement, Transfer, UserProfile, Warehouse as WarehouseEntity } from "@/types/erp";
import { cn, formatDate, formatKg, formatPercent, wasteTone, normalizeItems } from "@/lib/utils";
import { supabase } from "@/lib/supabase";

const primaryButton = "inline-flex items-center justify-center gap-2 rounded-none bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-100";
const dangerButton = "rounded-none border border-rose-100 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700";
const tones = {
  blue: "bg-blue-600 ring-blue-100",
  green: "bg-emerald-500 ring-emerald-100",
  amber: "bg-amber-400 ring-amber-100",
  red: "bg-rose-500 ring-rose-100",
};

function requestSignal(ms = 8000) {
  const controller = new AbortController();
  window.setTimeout(() => controller.abort(new DOMException("Sunucu yanıtı gecikti.", "TimeoutError")), ms);
  return controller.signal;
}

function refreshInBackground(refresh: () => Promise<void>) {
  void refresh().catch(() => undefined);
}

type SettingEntity = "fabricTypes" | "colors" | "yarnCounts" | "yarnTypes" | "processTypes" | "warehouses" | "partners";
type EditableSetting = { id: string; name: string; code?: string; isActive?: boolean; kind?: WarehouseEntity["kind"]; type?: Partner["type"] };
type OrderGroupMode = "none" | "ymStock" | "mmStock" | "fabricType" | "color" | "yarnCount" | "customer" | "status";
type OrderFilters = {
  status: string;
  customer: string;
  fabricTypeId: string;
  colorId: string;
  yarnCountId: string;
  ymStockId: string;
  mmStockId: string;
  dateFrom: string;
  dateTo: string;
  dueFrom: string;
  dueTo: string;
  smart: string;
};

const warehouseKindLabels: Record<WarehouseEntity["kind"], string> = {
  YARN: "İplik deposu",
  KNITTER: "Fasoncu deposu",
  RAW: "Ham kumaş deposu",
  DYEHOUSE: "Boyahane deposu",
  FINISHED: "Mamül depo",
  STORE: "Satış mağazası",
  WASTE: "Fire deposu",
};

const partnerTypeLabels: Record<Partner["type"], string> = {
  KNITTER: "Fason örmeci",
  DYEHOUSE: "Boyahane",
  SUPPLIER: "Satıcı",
  CUSTOMER: "Müşteri",
};

function removeSettingFromData(current: ErpData, entity: SettingEntity, recordId: string): ErpData {
  return { ...current, [entity]: current[entity].filter((item) => item.id !== recordId) };
}

function replaceSettingInData(current: ErpData, entity: SettingEntity, row: EditableSetting): ErpData {
  const base: NamedEntity = { id: row.id, name: row.name, isActive: true };
  if (entity === "warehouses") {
    return { ...current, warehouses: current.warehouses.map((item) => (item.id === row.id ? { ...item, ...base, kind: row.kind ?? item.kind } : item)) };
  }
  if (entity === "partners") {
    return { ...current, partners: current.partners.map((item) => (item.id === row.id ? { ...item, ...base, type: row.type ?? item.type } : item)) };
  }
  if (entity === "yarnTypes") {
    return { ...current, yarnTypes: current.yarnTypes.map((item) => (item.id === row.id ? { ...item, ...base, code: row.code ?? item.code, isActive: row.isActive ?? item.isActive } : item)) };
  }
  return { ...current, [entity]: current[entity].map((item) => (item.id === row.id ? base : item)) };
}

const emptyOrderFilters: OrderFilters = {
  status: "ALL",
  customer: "",
  fabricTypeId: "ALL",
  colorId: "ALL",
  yarnCountId: "ALL",
  ymStockId: "ALL",
  mmStockId: "ALL",
  dateFrom: "",
  dateTo: "",
  dueFrom: "",
  dueTo: "",
  smart: "",
};

const inputClass = "w-full rounded-none border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50";

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      <label className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{label}</label>
      {children}
    </div>
  );
}

function includesTr(value: string, query: string) {
  return value.toLocaleLowerCase("tr-TR").includes(query.toLocaleLowerCase("tr-TR"));
}

function applySmartOrderFilter(order: Order, data: ErpData, smart: string) {
  const query = smart.trim();
  if (!query) return true;
  const haystack = [
    order.orderNo,
    order.customerName,
    order.status,
    getName(data.fabricTypes, order.fabricTypeId),
    getName(data.colors, order.colorId),
    getName(data.yarnCounts, order.yarnCountId),
    getName(data.stockCards, order.ymStockId),
    getName(data.stockCards, order.mmStockId),
  ].join(" ");
  const normalized = query.toLocaleLowerCase("tr-TR");
  const tokens = normalized.split(/\s+/).filter(Boolean);
  const keywordMatch = tokens.every((token) => includesTr(haystack, token));
  const overdueMatch = normalized.includes("geciken") ? new Date(order.dueDate) < new Date() && !["Kapandı", "İptal", "Sevk Edildi"].includes(order.status) : true;
  const openMatch = normalized.includes("bekleyen") || normalized.includes("açık") ? !["Kapandı", "İptal", "Sevk Edildi"].includes(order.status) : true;
  const dyehouseMatch = normalized.includes("boyahanede") ? order.status === "Boyahanede" : true;
  const knittingMatch = normalized.includes("örmede") || normalized.includes("ormede") ? order.status === "Örmede" : true;
  return keywordMatch && overdueMatch && openMatch && dyehouseMatch && knittingMatch;
}

async function apiDelete(endpoint: string) {
  const session = await supabase.auth.getSession();
  const token = session.data.session?.access_token;
  const response = await fetch(endpoint, { method: "DELETE", headers: token ? { Authorization: `Bearer ${token}` } : undefined, signal: requestSignal() });
  const result = (await response.json()) as { ok: boolean; error?: string };
  if (!response.ok || !result.ok) throw new Error(result.error ?? "İşlem tamamlanamadı.");
}

async function apiPatch(endpoint: string, payload: Record<string, unknown>) {
  const session = await supabase.auth.getSession();
  const token = session.data.session?.access_token;
  const response = await fetch(endpoint, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) },
    body: JSON.stringify(payload),
    signal: requestSignal(),
  });
  const result = (await response.json()) as { ok: boolean; error?: string };
  if (!response.ok || !result.ok) throw new Error(result.error ?? "İşlem tamamlanamadı.");
}

async function postJson(endpoint: string, payload: Record<string, unknown>) {
  const session = await supabase.auth.getSession();
  const token = session.data.session?.access_token;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) },
    body: JSON.stringify(payload),
    signal: requestSignal(),
  });
  const result = (await response.json()) as { ok: boolean; error?: string };
  if (!response.ok || !result.ok) throw new Error(result.error ?? "İşlem tamamlanamadı.");
  return result;
}

export function OrdersPage() {
  const { data, refresh, mutateData } = useErpData();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Order | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Order | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<OrderFilters>(emptyOrderFilters);
  const [groupMode, setGroupMode] = useState<OrderGroupMode>("none");
  const ymStocks = data.stockCards.filter((stock) => stock.type === "YM");
  const mmStocks = data.stockCards.filter((stock) => stock.type === "MM");
  const customerNames = [...new Set(data.orders.map((order) => order.customerName).filter(Boolean))].sort((a, b) => a.localeCompare(b, "tr"));
  const filteredOrders = useMemo(
    () =>
    data.orders.map(order => {
      const parties = data.parties.filter(p => p.orderId === order.id);
      const sales = data.sales.filter(s => s.orderId === order.id && s.status !== 'İptal');
      const sevkKg = sales.reduce((sum, s) => sum + s.quantityKg, 0);
      const siparisKg = order.quantityKg;
      
      let computedStatus = order.status;
      if (sevkKg > 0) {
        computedStatus = sevkKg >= siparisKg ? 'Sevk Edildi' : 'Kısmi Sevk Edildi';
      }
      
      return { ...order, sevkKg, computedStatus, parties };
    }).filter((order) => {
      if (filters.status !== "ALL" && order.computedStatus !== filters.status) return false;
      if (filters.customer && order.customerName !== filters.customer) return false;
      if (filters.fabricTypeId !== "ALL" && order.fabricTypeId !== filters.fabricTypeId) return false;
      if (filters.colorId !== "ALL" && order.colorId !== filters.colorId) return false;
      if (filters.yarnCountId !== "ALL" && order.yarnCountId !== filters.yarnCountId) return false;
      if (filters.ymStockId !== "ALL" && order.ymStockId !== filters.ymStockId) return false;
      if (filters.mmStockId !== "ALL" && order.mmStockId !== filters.mmStockId) return false;
      if (filters.dateFrom && order.orderDate < filters.dateFrom) return false;
      if (filters.dateTo && order.orderDate > filters.dateTo) return false;
      if (filters.dueFrom && order.dueDate < filters.dueFrom) return false;
      if (filters.dueTo && order.dueDate > filters.dueTo) return false;
      return applySmartOrderFilter(order, data, filters.smart);
    }),
  [data, filters]);
  const setOrderFilter = (key: keyof OrderFilters, value: string) => setFilters((current) => ({ ...current, [key]: value }));
  const groupLabels: Record<OrderGroupMode, string> = {
    none: "Gruplama yok",
    ymStock: "YM stok",
    mmStock: "MM stok",
    fabricType: "Kumaş cinsi",
    color: "Renk",
    yarnCount: "Ne",
    customer: "Müşteri",
    status: "Durum",
  };
  const activeFilterChips = [
    groupMode !== "none" ? `Gruplama: ${groupLabels[groupMode]}` : "",
    filters.status !== "ALL" ? `Durum: ${filters.status}` : "",
    filters.customer ? `Müşteri: ${filters.customer}` : "",
    filters.fabricTypeId !== "ALL" ? `Kumaş: ${getName(data.fabricTypes, filters.fabricTypeId)}` : "",
    filters.colorId !== "ALL" ? `Renk: ${getName(data.colors, filters.colorId)}` : "",
    filters.yarnCountId !== "ALL" ? `Ne: ${getName(data.yarnCounts, filters.yarnCountId)}` : "",
    filters.ymStockId !== "ALL" ? `YM: ${getName(data.stockCards, filters.ymStockId)}` : "",
    filters.mmStockId !== "ALL" ? `MM: ${getName(data.stockCards, filters.mmStockId)}` : "",
    filters.smart ? `Akıllı: ${filters.smart}` : "",
    filters.dateFrom ? `Sipariş başlangıç: ${formatDate(filters.dateFrom)}` : "",
    filters.dateTo ? `Sipariş bitiş: ${formatDate(filters.dateTo)}` : "",
    filters.dueFrom ? `Termin başlangıç: ${formatDate(filters.dueFrom)}` : "",
    filters.dueTo ? `Termin bitiş: ${formatDate(filters.dueTo)}` : "",
  ].filter((item): item is string => Boolean(item));
  const orderGroupBy = groupMode === "none" ? undefined : {
    label: {
      ymStock: "YM stok",
      mmStock: "MM stok",
      fabricType: "Kumaş cinsi",
      color: "Renk",
      yarnCount: "Ne",
      customer: "Müşteri",
      status: "Durum",
    }[groupMode],
    getKey: (order: Order) => {
      if (groupMode === "ymStock") return getName(data.stockCards, order.ymStockId);
      if (groupMode === "mmStock") return getName(data.stockCards, order.mmStockId);
      if (groupMode === "fabricType") return getName(data.fabricTypes, order.fabricTypeId);
      if (groupMode === "color") return getName(data.colors, order.colorId);
      if (groupMode === "yarnCount") return getName(data.yarnCounts, order.yarnCountId);
      if (groupMode === "customer") return order.customerName;
      return order.status;
    },
    summary: (orders: Order[]) => `${orders.length} sipariş · ${formatKg(orders.reduce((sum, order) => sum + order.quantityKg, 0))}`,
  };

  async function deleteOrder() {
    if (!deleteTarget) return;
    try {
      await apiDelete(`/api/orders/${deleteTarget.id}`);
      mutateData((current) => ({ ...current, orders: current.orders.filter((order) => order.id !== deleteTarget.id) }));
      refreshInBackground(refresh);
      setDeleteTarget(null);
      toast.success("Sipariş silindi.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Sipariş silinemedi.");
    }
  }

  const columns: Column<any>[] = [
    { header: "Sipariş No", cell: (row) => <Link className="font-semibold text-blue-700" href={`/orders/${row.id}`}>{row.orderNo}</Link> },
    { header: "Müşteri", cell: (row) => <span className="font-medium text-slate-900">{row.customerName}</span> },
    { header: "Stok Adı", cell: (row) => {
      const mmStock = data.stockCards.find(s => s.id === row.mmStockId);
      const ymStock = data.stockCards.find(s => s.id === row.ymStockId);
      return (
        <div className="max-w-[200px]">
          <p className="truncate font-medium text-slate-700">{mmStock?.name || ymStock?.name || '-'}</p>
          <p className="text-[10px] text-slate-400">{getName(data.yarnCounts, row.yarnCountId)} · {getName(data.fabricTypes, row.fabricTypeId)}</p>
        </div>
      );
    }},
    { header: "Sipariş Kg", className: "text-right", cell: (row) => <span className="font-bold text-slate-900">{formatKg(row.quantityKg)}</span> },
    { header: "Örülen YM", className: "text-right", cell: (row) => {
      const val = row.parties.reduce((sum: number, p: any) => sum + (p.rawProducedKg || 0), 0);
      return <span className="text-blue-600 font-medium">{formatKg(val)}</span>;
    }},
    { header: "Üretilen MM", className: "text-right", cell: (row) => {
      const val = row.parties.reduce((sum: number, p: any) => sum + (p.finishedKg || 0), 0);
      return <span className="text-emerald-600 font-medium">{formatKg(val)}</span>;
    }},
    { header: "Sevk MM", className: "text-right", cell: (row) => <span className="text-amber-600 font-medium">{formatKg(row.sevkKg)}</span> },
    { header: "Kalan Kg", className: "text-right", cell: (row) => <span className="text-rose-600 font-bold">{formatKg(Math.max(row.quantityKg - row.sevkKg, 0))}</span> },
    { header: "Durum", cell: (row) => <StatusBadge tone={statusTone(row.computedStatus)}>{row.computedStatus}</StatusBadge> },
    { header: "Termin", cell: (row) => <span className="text-slate-500">{formatDate(row.dueDate)}</span> },
    { header: "İşlem", className: "text-right", cell: (row) => <div className="flex justify-end gap-2"><button className="rounded-none border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700" onClick={() => setEditing(row)} type="button">Düzenle</button></div> },
  ];
  const filterControls = (
    <div className="grid gap-3 md:grid-cols-2">
      <select className="rounded-none border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700 outline-none" value={groupMode} onChange={(event) => setGroupMode(event.target.value as OrderGroupMode)}>
        <option value="none">Gruplama yok</option>
        <option value="ymStock">YM stok adına göre grupla</option>
        <option value="mmStock">MM stok adına göre grupla</option>
        <option value="fabricType">Kumaş cinsine göre grupla</option>
        <option value="color">Renge göre grupla</option>
        <option value="yarnCount">Ne numarasına göre grupla</option>
        <option value="customer">Müşteriye göre grupla</option>
        <option value="status">Duruma göre grupla</option>
      </select>
      <select className="rounded-none border border-slate-200 bg-white px-4 py-3 text-sm outline-none" value={filters.status} onChange={(event) => setOrderFilter("status", event.target.value)}>
        <option value="ALL">Tüm durumlar</option>
        {["Taslak", "Onaylandı", "İplik Bekliyor", "Örmede", "Ham Geldi", "Boyahanede", "Mamül Hazır", "Sevk Edildi", "Kapandı", "İptal"].map((status) => <option key={status}>{status}</option>)}
      </select>
      <select className="rounded-none border border-slate-200 bg-white px-4 py-3 text-sm outline-none" value={filters.customer} onChange={(event) => setOrderFilter("customer", event.target.value)}>
        <option value="">Tüm müşteriler</option>
        {customerNames.map((customer) => <option key={customer}>{customer}</option>)}
      </select>
      <select className="rounded-none border border-slate-200 bg-white px-4 py-3 text-sm outline-none" value={filters.fabricTypeId} onChange={(event) => setOrderFilter("fabricTypeId", event.target.value)}>
        <option value="ALL">Tüm kumaşlar</option>
        {data.fabricTypes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      <select className="rounded-none border border-slate-200 bg-white px-4 py-3 text-sm outline-none" value={filters.colorId} onChange={(event) => setOrderFilter("colorId", event.target.value)}>
        <option value="ALL">Tüm renkler</option>
        {data.colors.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      <select className="rounded-none border border-slate-200 bg-white px-4 py-3 text-sm outline-none" value={filters.yarnCountId} onChange={(event) => setOrderFilter("yarnCountId", event.target.value)}>
        <option value="ALL">Tüm Ne numaraları</option>
        {data.yarnCounts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      <select className="rounded-none border border-slate-200 bg-white px-4 py-3 text-sm outline-none" value={filters.ymStockId} onChange={(event) => setOrderFilter("ymStockId", event.target.value)}>
        <option value="ALL">Tüm YM stokları</option>
        {ymStocks.map((stock) => <option key={stock.id} value={stock.id}>{stock.code} - {stock.name}</option>)}
      </select>
      <select className="rounded-none border border-slate-200 bg-white px-4 py-3 text-sm outline-none" value={filters.mmStockId} onChange={(event) => setOrderFilter("mmStockId", event.target.value)}>
        <option value="ALL">Tüm MM stokları</option>
        {mmStocks.map((stock) => <option key={stock.id} value={stock.id}>{stock.code} - {stock.name}</option>)}
      </select>
      <input className="rounded-none border border-slate-200 bg-white px-4 py-3 text-sm outline-none md:col-span-2" placeholder="Akıllı filtre: bekleyen boyahanede lacivert" value={filters.smart} onChange={(event) => setOrderFilter("smart", event.target.value)} />
      <label className="space-y-1 text-xs font-semibold text-slate-400">
        Sipariş başlangıç
        <input className="w-full rounded-none border border-slate-200 bg-white px-4 py-3 text-sm font-normal text-slate-700 outline-none" type="date" value={filters.dateFrom} onChange={(event) => setOrderFilter("dateFrom", event.target.value)} />
      </label>
      <label className="space-y-1 text-xs font-semibold text-slate-400">
        Sipariş bitiş
        <input className="w-full rounded-none border border-slate-200 bg-white px-4 py-3 text-sm font-normal text-slate-700 outline-none" type="date" value={filters.dateTo} onChange={(event) => setOrderFilter("dateTo", event.target.value)} />
      </label>
      <label className="space-y-1 text-xs font-semibold text-slate-400">
        Termin başlangıç
        <input className="w-full rounded-none border border-slate-200 bg-white px-4 py-3 text-sm font-normal text-slate-700 outline-none" type="date" value={filters.dueFrom} onChange={(event) => setOrderFilter("dueFrom", event.target.value)} />
      </label>
      <label className="space-y-1 text-xs font-semibold text-slate-400">
        Termin bitiş
        <input className="w-full rounded-none border border-slate-200 bg-white px-4 py-3 text-sm font-normal text-slate-700 outline-none" type="date" value={filters.dueTo} onChange={(event) => setOrderFilter("dueTo", event.target.value)} />
      </label>
    </div>
  );
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Siparişler" title="Müşteri Siparişleri" description="Kumaş üretim talepleri, otomatik YM/MM stok eşleşmesi ve üretim durum takibi." icon={ShoppingCart} action={<button className={primaryButton} onClick={() => setOpen(true)}><Plus className="size-4" />Yeni sipariş</button>} />
      <div className="premium-card rounded-none p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold text-slate-950">Sipariş görünümü</h2>
            <p className="mt-1 text-sm text-slate-500">{filteredOrders.length} sipariş listeleniyor.</p>
          </div>
          <div className="flex gap-2">
            <button className="inline-flex items-center justify-center gap-2 rounded-none bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-100" onClick={() => setFiltersOpen(true)} type="button">
              <SlidersHorizontal className="size-4" />
              Filtrele
            </button>
            {(activeFilterChips.length > 0) ? (
              <button className="rounded-none border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600" onClick={() => { setFilters(emptyOrderFilters); setGroupMode("none"); }} type="button">
                Temizle
              </button>
            ) : null}
          </div>
        </div>
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1 md:flex-wrap md:overflow-visible">
          {activeFilterChips.length === 0 ? (
            <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500">Filtre yok</span>
          ) : activeFilterChips.map((chip) => (
            <span key={chip} className="shrink-0 rounded-full border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700">{chip}</span>
          ))}
        </div>
      </div>
      <div className="hidden md:block">
        <DataTable rows={filteredOrders} columns={columns} groupBy={orderGroupBy} searchPlaceholder="Liste içinde hızlı ara" getSearchText={(row) => [row.orderNo, row.customerName, row.computedStatus, getName(data.fabricTypes, row.fabricTypeId), getName(data.colors, row.colorId), getName(data.yarnCounts, row.yarnCountId), getName(data.stockCards, row.ymStockId), getName(data.stockCards, row.mmStockId), row.quantityKg].join(" ")} />
      </div>

      <div className="grid gap-4 md:hidden">
        {filteredOrders.map(order => {
          const progress = Math.min(100, (order.sevkKg / order.quantityKg) * 100);
          const mmVal = order.parties.reduce((sum: number, p: any) => sum + (p.finishedKg || 0), 0);
          const mmStock = data.stockCards.find(s => s.id === order.mmStockId);
          return (
            <div key={order.id} className="premium-card rounded-none p-4 space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <Link href={`/orders/${order.id}`} className="text-blue-700 font-bold">{order.orderNo}</Link>
                  <p className="text-sm font-semibold text-slate-900 mt-1">{order.customerName}</p>
                </div>
                <StatusBadge tone={statusTone(order.computedStatus)}>{order.computedStatus}</StatusBadge>
              </div>
              <div>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Stok Adı</p>
                <p className="text-sm text-slate-700 font-medium">{mmStock?.name || '-'}</p>
              </div>
              <div className="grid grid-cols-3 gap-2 py-2 border-y border-slate-50">
                <div className="text-center">
                  <p className="text-[10px] text-slate-400 font-bold uppercase">Sipariş</p>
                  <p className="text-xs font-bold text-slate-900">{formatKg(order.quantityKg)}</p>
                </div>
                <div className="text-center border-x border-slate-50">
                  <p className="text-[10px] text-slate-400 font-bold uppercase">Üretilen</p>
                  <p className="text-xs font-bold text-emerald-600">{formatKg(mmVal)}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-slate-400 font-bold uppercase">Sevk</p>
                  <p className="text-xs font-bold text-amber-600">{formatKg(order.sevkKg)}</p>
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between text-[10px] font-bold uppercase text-slate-400">
                  <span>Tamamlanma</span>
                  <span>{formatPercent(progress)}</span>
                </div>
                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-600 rounded-full" style={{ width: `${progress}%` }} />
                </div>
              </div>
              <div className="flex justify-between items-center pt-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Termin: {formatDate(order.dueDate)}</span>
                <button className="text-xs font-bold text-blue-700 bg-blue-50 px-3 py-1.5" onClick={() => setEditing(order)}>Düzenle</button>
              </div>
            </div>
          );
        })}
      </div>
      <FormDrawer open={filtersOpen} title="Sipariş filtreleri" onClose={() => setFiltersOpen(false)}>
        <div className="space-y-4">
          <p className="text-sm leading-6 text-slate-500">Durum, tarih, müşteri, stok ve akıllı ifade ile listeyi daraltın. Seçimler sayfada chip olarak görünür.</p>
          {filterControls}
          <div className="grid gap-3 sm:grid-cols-2">
            <button className="rounded-none border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600" onClick={() => { setFilters(emptyOrderFilters); setGroupMode("none"); }} type="button">Filtreleri temizle</button>
            <button className="rounded-none bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-100" onClick={() => setFiltersOpen(false)} type="button">Sonuçları göster</button>
          </div>
        </div>
      </FormDrawer>
      <FormDrawer open={open} title="Yeni müşteri siparişi" onClose={() => setOpen(false)}><OrderForm /></FormDrawer>
      <FormDrawer open={Boolean(editing)} title="Sipariş düzenle" onClose={() => setEditing(null)}>{editing ? <OrderEditForm order={editing} onDone={() => setEditing(null)} /> : null}</FormDrawer>
      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Sipariş silinsin mi?"
        description={`${deleteTarget?.orderNo ?? "Bu sipariş"} üretim, parti, stok hareketi veya sevkiyat kaydında kullanıldıysa silinmeyecek.`}
        onClose={() => setDeleteTarget(null)}
        onConfirm={deleteOrder}
      />
    </div>
  );
}

export function OrderDetailPage({ id }: { id: string }) {
  const { data } = useErpData();
  const order = data.orders.find((item) => item.id === id);

  const orderParties = order ? data.parties.filter(p => p.orderId === order.id) : [];
  const orderSales = order ? data.sales.filter(s => s.orderId === order.id) : [];
  const shippedKg = orderSales.reduce((sum, s) => sum + s.quantityKg, 0);
  const producedRawKg = orderParties.reduce((sum, p) => sum + p.rawProducedKg, 0);
  const finishedKg = orderParties.reduce((sum, p) => sum + p.finishedKg, 0);
  
  const readyKg = Math.max(finishedKg - shippedKg, 0);
  const progressPercent = (order?.quantityKg ?? 0) > 0 ? (shippedKg / order!.quantityKg) * 100 : 0;

  const allTimelineItems = useMemo(() => {
    if (!order) return [];
    const events: any[] = [];
    
    orderParties.forEach(party => {
      const pId = party.id;
      const pNo = party.partyNo;
      
      // Statik timeline verileri
      (party.timeline || []).forEach((t: any) => events.push({ ...t, partyNo: pNo }));
      
      // Dinamik: Ham Üretim
      data.productionRaw.filter(p => p.partyId === pId).forEach(p => {
        events.push({
          date: p.date,
          title: 'Ham Üretim',
          description: `${formatKg(p.producedRawKg)} ham kumaş üretildi. ( %${p.wastePercent} fire)`,
          tone: 'blue',
          partyNo: pNo
        });
      });

      // Dinamik: Transferler
      data.transfers.forEach(t => {
        const partyItem = normalizeItems(t.items).find((it: any) => it.partyId === pId);
        if (partyItem) {
          events.push({
            date: t.date,
            title: 'Depo Transferi',
            description: `${getName(data.warehouses, t.fromWarehouseId)} -> ${getName(data.warehouses, t.toWarehouseId)} (${formatKg(partyItem.quantity)})`,
            tone: 'amber',
            partyNo: pNo
          });
        }
      });

      // Dinamik: Boyahane
      data.productionDyehouse.filter(p => p.partyId === pId).forEach(p => {
        events.push({
          date: p.date,
          title: 'Boyahane Üretimi',
          description: `${formatKg(p.finishedKg)} mamül kumaş girişi yapıldı. ( %${p.wastePercent} fire)`,
          tone: 'green',
          partyNo: pNo
        });
      });

      // Dinamik: Sevkiyat
      data.sales.filter(s => s.partyId === pId && s.status !== 'İptal').forEach(s => {
        events.push({
          date: s.date,
          title: 'Sevkiyat / Satış',
          description: `${s.customerName} müşterisine ${formatKg(s.quantityKg)} sevk edildi.`,
          tone: 'amber',
          partyNo: pNo
        });
      });
    });

    return events.sort((a, b) => {
      const da = new Date(a.date).getTime();
      const db = new Date(b.date).getTime();
      return (isNaN(db) ? 0 : db) - (isNaN(da) ? 0 : da);
    });
  }, [order, orderParties, data]);

  const orderBalances = data.warehouseBalances.filter(b => 
    order && (b.stockId === order.ymStockId || b.stockId === order.mmStockId) && b.quantity > 0
  ).filter(b => {
    if (b.partyId) return orderParties.some(p => p.id === b.partyId);
    return true;
  });

  const analysis = useMemo(() => {
    if (!order) return { status: "info" as const, text: "", alerts: [] };
    const alerts: string[] = [];
    const today = new Date();
    const dueDate = new Date(order.dueDate);
    const diffDays = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (shippedKg >= order.quantityKg && order.quantityKg > 0) {
      return { status: "success" as const, text: "Sipariş tamamen sevk edildi. Başarıyla tamamlandı.", alerts: [] };
    }

    if (diffDays < 0) {
      alerts.push(`Siparişin termin tarihi ${Math.abs(diffDays)} gün geçti! Acil sevkiyat planlanmalı.`);
    } else if (diffDays <= 3) {
      alerts.push(`Termine sadece ${diffDays} gün kaldı. Kritik aşamadasınız.`);
    }

    orderParties.forEach(p => {
      if (p.status === "Ham Geldi") {
        const lastRawDate = (p.timeline || []).filter(t => t.title.includes("Ham")).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]?.date;
        if (lastRawDate) {
          const delay = Math.ceil((today.getTime() - new Date(lastRawDate).getTime()) / (1000 * 60 * 60 * 24));
          if (delay >= 3) {
            alerts.push(`${p.partyNo} partisi ${delay} gündür ham depoda bekliyor, henüz boyahaneye gönderilmedi.`);
          }
        }
      }
    });

    if (producedRawKg === 0 && diffDays < 7) {
      alerts.push("Üretim henüz başlamamış görünüyor. Termin yetişmeyebilir.");
    }

    let recommendation = "";
    if (readyKg > 0) {
      recommendation = `${formatKg(readyKg)} mamül kumaş depoda hazır bekliyor. Hemen sevkiyat oluşturulabilir.`;
    } else if (producedRawKg > finishedKg) {
      recommendation = "Boyahanedeki işlemlerin hızlandırılması sevkiyat süresini kısaltacaktır.";
    } else {
      recommendation = "Örme planlaması yapılarak ham kumaş girişleri hızlandırılmalı.";
    }

    return {
      status: alerts.length > 0 ? (diffDays < 0 ? "danger" as const : "warning" as const) : "info" as const,
      text: recommendation,
      alerts
    };
  }, [order, orderParties, shippedKg, producedRawKg, finishedKg, readyKg]);

  if (!order) return <div className="p-8 text-center text-slate-500">Sipariş bulunamadı.</div>;
  return (
    <div className="space-y-6">
      <PageHeader 
        eyebrow={order.orderNo} 
        title={order.customerName} 
        description={`${getName(data.fabricTypes, order.fabricTypeId)} · ${getName(data.colors, order.colorId)}`} 
        icon={ShoppingCart} 
        action={<StatusBadge tone={statusTone(order.status)}>{order.status}</StatusBadge>} 
      />
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard title="Sipariş" value={formatKg(order.quantityKg)} helper="Hedef miktar" icon={ShoppingCart} />
        <StatCard title="Sevk Edilen" value={formatKg(shippedKg)} helper={`${formatPercent(progressPercent)} tamamlandı`} icon={Truck} tone="green" />
        <StatCard title="Hazır" value={formatKg(readyKg)} helper="Depoda bekleyen mamül" icon={PackageCheck} tone="blue" />
        <StatCard title="Kalan" value={formatKg(Math.max(order.quantityKg - shippedKg, 0))} helper="Eksik miktar" icon={Boxes} tone={progressPercent < 100 ? "amber" : "green"} />
      </div>
      <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-100 shadow-inner">
        <div 
          className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-all duration-1000" 
          style={{ width: `${progressPercent}%` }} 
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <div className="premium-card rounded-none p-5">
            <h3 className="text-base font-semibold text-slate-950 flex items-center gap-2">
              <BarChart3 className="size-4 text-blue-600" />
              Sipariş Timeline
            </h3>
            <div className="mt-6 space-y-6">
              {allTimelineItems.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500 italic">Henüz bir hareket kaydı bulunmuyor.</p>
              ) : allTimelineItems.map((item, idx) => (
                <div key={`${item.date}-${item.title}-${idx}`} className="relative flex gap-4">
                  {idx < allTimelineItems.length - 1 && <div className="absolute left-[11px] top-7 h-full w-px bg-slate-100" />}
                  <div className={cn("relative z-10 mt-1 size-6 rounded-full ring-8 shadow-sm", tones[item.tone as keyof typeof tones || "blue"])} />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{formatDate(item.date)}</p>
                      <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">{item.partyNo}</span>
                    </div>
                    <h4 className="mt-1 font-semibold text-slate-900">{item.title}</h4>
                    <p className="mt-1 text-sm text-slate-500 leading-relaxed">{item.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="premium-card rounded-none p-5 bg-slate-50/50">
            <h3 className="text-sm font-bold uppercase tracking-widest text-slate-400">Depo Bakiyeleri</h3>
            <div className="mt-4 space-y-3">
              {orderBalances.length === 0 ? (
                <p className="text-sm text-slate-500">Bu sipariş için depoda bakiye bulunmuyor.</p>
              ) : orderBalances.map(b => (
                <div key={b.id} className="flex items-center justify-between p-3 rounded-none bg-white border border-slate-100 shadow-sm">
                  <div>
                    <p className="text-xs font-bold text-slate-900">{getName(data.warehouses, b.warehouseId)}</p>
                    <p className="text-[10px] text-slate-500">{getName(data.stockCards, b.stockId)} {b.lotNo ? `· Lot: ${b.lotNo}` : ""}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-blue-600">{formatKg(b.quantity)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="premium-card rounded-none p-5">
            <h3 className="text-sm font-bold uppercase tracking-widest text-slate-400">Sevkiyat Özeti</h3>
            <div className="mt-4 space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Sipariş Miktarı</span>
                <span className="font-bold text-slate-900">{formatKg(order.quantityKg)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Toplam Sevk Edilen</span>
                <span className="font-bold text-emerald-600">{formatKg(shippedKg)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Kalan Bekleyen</span>
                <span className="font-bold text-amber-600">{formatKg(Math.max(order.quantityKg - shippedKg, 0))}</span>
              </div>
              <div className="pt-4 border-t border-slate-100">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase mb-3">Son Sevkiyatlar</h4>
                {orderSales.slice(0, 3).map(s => (
                  <div key={s.id} className="flex items-center justify-between text-xs py-1">
                    <span className="text-slate-600">{formatDate(s.date)}</span>
                    <span className="font-semibold text-slate-900">{formatKg(s.quantityKg)}</span>
                  </div>
                ))}
                {orderSales.length === 0 && <p className="text-xs text-slate-400 italic">Henüz sevkiyat yapılmadı.</p>}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className={cn(
        "premium-card rounded-none p-6 border-l-4",
        analysis.status === "danger" ? "border-rose-500 bg-rose-50/30" : 
        analysis.status === "warning" ? "border-amber-500 bg-amber-50/30" : "border-blue-500 bg-blue-50/30"
      )}>
        <div className="flex items-start gap-4">
          <div className={cn(
            "p-2 rounded-none",
            analysis.status === "danger" ? "bg-rose-100 text-rose-600" : 
            analysis.status === "warning" ? "bg-amber-100 text-amber-600" : "bg-blue-100 text-blue-600"
          )}>
            <Factory className="size-5" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-slate-900">AI Üretim & Planlama Analizi</h3>
            <p className="mt-1 text-sm text-slate-700 leading-relaxed">{analysis.text}</p>
            
            {analysis.alerts.length > 0 && (
              <div className="mt-4 space-y-2">
                {analysis.alerts.map((alert, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-xs font-semibold text-slate-800 bg-white/50 p-2 rounded-none border border-white/50">
                    <div className={cn("size-1.5 rounded-full", analysis.status === "danger" ? "bg-rose-500" : "bg-amber-500")} />
                    {alert}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function PurchaseOrdersPage() {
  const { data, refresh, mutateData } = useErpData();
  const [orderOpen, setOrderOpen] = useState(false);
  const [editing, setEditing] = useState<PurchaseOrder | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PurchaseOrder | null>(null);
  const [filters, setFilters] = useState({ status: "ALL", supplierId: "ALL" });
  const setFilter = (key: string, value: string) => setFilters((curr) => ({ ...curr, [key]: value }));
  
  const filteredOrders = useMemo(() => data.purchaseOrders.filter((row) => {
    if (filters.status !== "ALL" && row.status !== filters.status) return false;
    if (filters.supplierId !== "ALL" && row.supplierId !== filters.supplierId) return false;
    return true;
  }), [data.purchaseOrders, filters]);
  
  const uniqueSuppliers = Array.from(new Set(data.purchaseOrders.map(o => o.supplierId)));
  const getPurchaseStockSummary = (order: PurchaseOrder) => normalizeItems(order.items).map((item) => item.stockName || getName(data.stockCards, item.stockId)).filter(Boolean).join(", ") || "-";
  async function deletePurchase() {
    if (!deleteTarget) return;
    try {
      await apiDelete(`/api/purchase-orders/${deleteTarget.id}`);
      mutateData((current) => ({ ...current, purchaseOrders: current.purchaseOrders.filter((order) => order.id !== deleteTarget.id) }));
      refreshInBackground(refresh);
      setDeleteTarget(null);
      toast.success("Satıcı siparişi silindi.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Satıcı siparişi silinemedi.");
    }
  }
  const columns: Column<PurchaseOrder>[] = [
    { header: "Sipariş", cell: (row) => <span className="font-semibold text-blue-700">{row.purchaseOrderNo}</span> },
    { header: "Satıcı", cell: (row) => getName(data.partners, row.supplierId) },
    { header: "Stok", cell: (row) => getPurchaseStockSummary(row) },
    { header: "Sipariş kg", cell: (row) => formatKg(row.totalOrderedKg) },
    { header: "Gelen", cell: (row) => formatKg(row.totalReceivedKg) },
    { header: "Kalan", cell: (row) => formatKg(row.totalRemainingKg) },
    { header: "Durum", cell: (row) => <StatusBadge tone={statusTone(row.status)}>{row.status}</StatusBadge> },
    { header: "İşlem", className: "text-right", cell: (row) => <div className="flex justify-end gap-2"><button className="rounded-none border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700" onClick={() => setEditing(row)} type="button">Düzenle</button><button className={dangerButton} onClick={() => setDeleteTarget(row)} type="button">Sil</button></div> },
  ];
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Satın alma" title="Satıcı Siparişleri" description="IP, LYC ve POLY için açık satıcı siparişleri, termin ve bekleyen kg takibi." icon={PackagePlus} action={<button className={primaryButton} onClick={() => setOrderOpen(true)}><Plus className="size-4" />Satıcı siparişi</button>} />
      <div className="premium-card rounded-none p-5 mb-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-semibold text-slate-950">Satıcı Sipariş Filtreleri</h2>
            <p className="mt-1 text-sm text-slate-500">Durum ve tedarikçiye göre daraltın.</p>
          </div>
          <button className="rounded-none border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600" onClick={() => setFilters({ status: "ALL", supplierId: "ALL" })} type="button">Filtreleri temizle</button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <select className="rounded-none border border-slate-200 bg-white px-4 py-3 text-sm outline-none" value={filters.status} onChange={(e) => setFilter("status", e.target.value)}>
            <option value="ALL">Tüm durumlar</option><option value="Taslak">Taslak</option><option value="Açık">Açık</option><option value="Kısmi Geldi">Kısmi Geldi</option><option value="Tamamlandı">Tamamlandı</option><option value="İptal">İptal</option>
          </select>
          <select className="rounded-none border border-slate-200 bg-white px-4 py-3 text-sm outline-none" value={filters.supplierId} onChange={(e) => setFilter("supplierId", e.target.value)}>
            <option value="ALL">Tüm Satıcılar</option>
            {uniqueSuppliers.map(id => <option key={id} value={id}>{getName(data.partners, id)}</option>)}
          </select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {filteredOrders.map((order) => (
          <div key={order.id} className="premium-card rounded-none p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-slate-950">{order.purchaseOrderNo} · {getName(data.partners, order.supplierId)}</p>
                <p className="text-sm text-slate-500">{getPurchaseStockSummary(order)}</p>
              </div>
              <StatusBadge tone={statusTone(order.status)}>{order.status}</StatusBadge>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
              <span><b>{formatKg(order.totalOrderedKg)}</b><br />Sipariş</span>
              <span><b>{formatKg(order.totalReceivedKg)}</b><br />Gelen</span>
              <span><b>{formatKg(order.totalRemainingKg)}</b><br />Kalan</span>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-blue-600" style={{ width: `${getPurchaseProgress(order)}%` }} /></div>
          </div>
        ))}
      </div>
      <DataTable rows={filteredOrders} columns={columns} searchPlaceholder="Satıcı siparişi, tedarikçi, durum veya stokta ara" getSearchText={(row) => [row.purchaseOrderNo, getName(data.partners, row.supplierId), row.status, getPurchaseStockSummary(row), normalizeItems(row.items).map((item) => `${item.stockCode} ${item.stockName}`).join(" ")].join(" ")} />
      <FormDrawer open={orderOpen} title="Yeni satıcı siparişi" onClose={() => setOrderOpen(false)}><PurchaseOrderForm /></FormDrawer>
      <FormDrawer open={Boolean(editing)} title="Satıcı siparişi düzenle" onClose={() => setEditing(null)}>{editing ? <PurchaseOrderEditForm order={editing} onDone={() => setEditing(null)} /> : null}</FormDrawer>
      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Satıcı siparişi silinsin mi?"
        description={`${deleteTarget?.purchaseOrderNo ?? "Bu sipariş"} için mal kabul veya stok hareketi varsa silinmeyecek.`}
        onClose={() => setDeleteTarget(null)}
        onConfirm={deletePurchase}
      />
    </div>
  );
}

export function PurchasesPage() {
  const { data } = useErpData();
  const [directOpen, setDirectOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [editingReceipt, setEditingReceipt] = useState<PurchaseReceipt | null>(null);
  const [deleteReceiptTarget, setDeleteReceiptTarget] = useState<PurchaseReceipt | null>(null);
  const { refresh } = useErpData();

  async function deleteReceipt() {
    if (!deleteReceiptTarget) return;
    try {
      await apiDelete(`/api/purchase-receipts/${deleteReceiptTarget.id}`);
      refreshInBackground(refresh);
      setDeleteReceiptTarget(null);
      toast.success("Alış kaydı silindi; stok ve satıcı siparişi bakiyeleri güncellendi.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Alış kaydı silinemedi.");
    }
  }

  const [filters, setFilters] = useState({ type: "ALL", warehouseId: "ALL" });
  const setFilter = (key: string, value: string) => setFilters((curr) => ({ ...curr, [key]: value }));
  const openOrders = data.purchaseOrders.filter((order) => order.status !== "Tamamlandı" && order.status !== "İptal");
  const directReceiptIds = useMemo(() => new Set(data.stockMovements.filter((movement) => movement.referenceType === "direct_purchase_receipt").map((movement) => movement.referenceId)), [data.stockMovements]);
  const filteredReceipts = useMemo(() => data.purchaseReceipts.filter((row) => {
    const isDirect = directReceiptIds.has(row.id);
    if (filters.type === "Hızlı" && !isDirect) return false;
    if (filters.type === "Siparişe Bağlı" && isDirect) return false;
    if (filters.warehouseId !== "ALL" && row.warehouseId !== filters.warehouseId) return false;
    return true;
  }), [data.purchaseReceipts, filters, directReceiptIds]);
  const receiptColumns: Column<PurchaseReceipt>[] = [
    { header: "Fiş", cell: (row) => <span className="font-semibold text-blue-700">{row.receiptNo}</span> },
    { header: "Tarih", cell: (row) => formatDate(row.receiptDate) },
    { header: "Satıcı", cell: (row) => getName(data.partners, row.supplierId) },
    { header: "Depo", cell: (row) => getName(data.warehouses, row.warehouseId) },
    { header: "Stok", cell: (row) => normalizeItems(row.items).map((item) => getName(data.stockCards, item.stockId)).join(", ") },
    { header: "Kg", cell: (row) => formatKg(normalizeItems(row.items).reduce((sum, item) => sum + (item.receivedKg || 0), 0)) },
    { header: "Tür", cell: (row) => <StatusBadge tone={directReceiptIds.has(row.id) ? "blue" : "green"}>{directReceiptIds.has(row.id) ? "Hızlı alış" : "Siparişe bağlı"}</StatusBadge> },
    {
      header: "İşlem",
      className: "text-right",
      cell: (row) => (
        <div className="flex justify-end gap-2">
          <button className="rounded-none border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700" onClick={() => setEditingReceipt(row)} type="button">Düzenle</button>
          <button className={dangerButton} onClick={() => setDeleteReceiptTarget(row)} type="button">Sil</button>
        </div>
      ),
    },
  ];
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Alış"
        title="Alış İşlemleri"
        description="IP, LYC ve POLY hammaddeleri hızlı alışla veya açık satıcı siparişine bağlı mal kabul ile depoya alınır."
        icon={PackageCheck}
        action={<><button className={primaryButton} onClick={() => setDirectOpen(true)}><Plus className="size-4" />Hızlı alış</button><button className={primaryButton} onClick={() => setReceiptOpen(true)}><Plus className="size-4" />Siparişe bağlı alış</button></>}
      />
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard title="Açık sipariş" value={String(openOrders.length)} helper="Mal kabul bekleyen" icon={PackagePlus} tone="amber" />
        <StatCard title="Bekleyen kg" value={formatKg(openOrders.reduce((sum, order) => sum + order.totalRemainingKg, 0))} helper="Satıcı siparişlerinden" icon={Truck} tone="amber" />
        <StatCard title="Toplam gelen" value={formatKg(data.purchaseReceipts.reduce((sum, receipt) => sum + normalizeItems(receipt.items).reduce((itemSum, item) => itemSum + (item.receivedKg || 0), 0), 0))} helper="Tüm alış fişleri" icon={PackageCheck} tone="green" />
        <StatCard title="Hızlı alış" value={String(data.purchaseReceipts.filter((receipt) => directReceiptIds.has(receipt.id)).length)} helper="Siparişsiz giriş" icon={CheckCircle2} tone="blue" />
      </div>
      <div className="premium-card rounded-none p-5 mb-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-semibold text-slate-950">Alış İşlemleri Filtreleri</h2>
            <p className="mt-1 text-sm text-slate-500">İşlem türü ve depoya göre daraltın.</p>
          </div>
          <button className="rounded-none border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600" onClick={() => setFilters({ type: "ALL", warehouseId: "ALL" })} type="button">Filtreleri temizle</button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <select className="rounded-none border border-slate-200 bg-white px-4 py-3 text-sm outline-none" value={filters.type} onChange={(e) => setFilter("type", e.target.value)}>
            <option value="ALL">Tüm türler</option><option value="Hızlı">Hızlı alış</option><option value="Siparişe Bağlı">Siparişe bağlı</option>
          </select>
          <select className="rounded-none border border-slate-200 bg-white px-4 py-3 text-sm outline-none" value={filters.warehouseId} onChange={(e) => setFilter("warehouseId", e.target.value)}>
            <option value="ALL">Tüm depolar</option>
            {data.warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 mb-6">
        <div className="premium-card rounded-none p-5">
          <h2 className="font-semibold text-slate-950">Hızlı alış</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">Sipariş açmadan IP, LYC veya POLY stoğunu doğrudan seçilen depoya alır. Sistem tamamlanmış satıcı siparişi, mal kabul ve stok girişi kaydını birlikte oluşturur.</p>
          <button className="mt-4 rounded-none bg-blue-600 px-4 py-3 text-sm font-semibold text-white" onClick={() => setDirectOpen(true)} type="button">Hızlı alış başlat</button>
        </div>
        <div className="premium-card rounded-none p-5">
          <h2 className="font-semibold text-slate-950">Siparişe bağlı alış</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">Önceden açılmış satıcı siparişlerine kısmi veya tam mal kabul girer. Gelen ve kalan kg otomatik hesaplanır.</p>
          <button className="mt-4 rounded-none bg-blue-600 px-4 py-3 text-sm font-semibold text-white" onClick={() => setReceiptOpen(true)} type="button">Mal kabul gir</button>
        </div>
      </div>
      <DataTable
        rows={filteredReceipts}
        columns={receiptColumns}
        searchPlaceholder="Fiş, satıcı, depo veya stokta ara"
        getSearchText={(row) => [row.receiptNo, getName(data.partners, row.supplierId), getName(data.warehouses, row.warehouseId), normalizeItems(row.items).map((item) => getName(data.stockCards, item.stockId)).join(" "), row.description].join(" ")}
      />
      <FormDrawer open={directOpen} title="Hızlı hammadde alışı" onClose={() => setDirectOpen(false)}><DirectPurchaseForm /></FormDrawer>
      <FormDrawer open={receiptOpen} title="Siparişe bağlı mal kabul" onClose={() => setReceiptOpen(false)}><PurchaseReceiptForm /></FormDrawer>
      <FormDrawer open={Boolean(editingReceipt)} title="Mal kabul düzenle" onClose={() => setEditingReceipt(null)}>{editingReceipt ? <PurchaseReceiptEditForm receipt={editingReceipt} onDone={() => setEditingReceipt(null)} /> : null}</FormDrawer>
      <ConfirmModal
        open={Boolean(deleteReceiptTarget)}
        title="Alış kaydı silinsin mi?"
        description="Bu işlem fişi kaldırır; ilgili stok hareketleri, depo bakiyeleri ve satıcı siparişi kalan miktarı otomatik güncellenir."
        confirmLabel="Sil"
        onClose={() => setDeleteReceiptTarget(null)}
        onConfirm={deleteReceipt}
      />
    </div>
  );
}

export function StocksPage() {
  const { data, refresh, mutateData } = useErpData();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<StockCard | null>(null);
  const [actionTarget, setActionTarget] = useState<StockCard | null>(null);
  const [detailTarget, setDetailTarget] = useState<StockCard | null>(null);
  async function deactivateStock(id: string) {
    try {
      const response = await fetch(`/api/stocks/${id}`, { method: "DELETE" });
      const result = (await response.json()) as { ok: boolean; data?: { deleted?: boolean }; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error ?? "Stok kartı işlem göremedi.");
      mutateData((current) => ({
        ...current,
        stockCards: result.data?.deleted
          ? current.stockCards.filter((stock) => stock.id !== id)
          : current.stockCards.map((stock) => (stock.id === id ? { ...stock, isActive: false } : stock)),
      }));
      refreshInBackground(refresh);
      toast.success("Stok kartı güncellendi.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Stok kartı pasife alınamadı.");
    }
  }

  const [filters, setFilters] = useState({ type: "ALL", isActive: "Aktif" });
  const setFilter = (key: string, value: string) => setFilters((curr) => ({ ...curr, [key]: value }));

  const filteredStocks = useMemo(() => data.stockCards.filter((row) => {
    if (filters.type !== "ALL" && row.type !== filters.type) return false;
    if (filters.isActive === "Aktif" && row.isActive === false) return false;
    if (filters.isActive === "Pasif" && row.isActive !== false) return false;
    return true;
  }), [data.stockCards, filters]);

  const hasUsage = actionTarget && (
    data.stockMovements.some(m => m.stockId === actionTarget.id) ||
    data.orders.some(o => o.ymStockId === actionTarget.id || o.mmStockId === actionTarget.id) ||
    data.parties.some(p => p.ymStockId === actionTarget.id || p.mmStockId === actionTarget.id) ||
    data.purchaseOrders.some(po => normalizeItems(po.items).some(i => i.stockId === actionTarget.id))
  );

  const handleDelete = () => {
    if (hasUsage) {
       toast.error("Bu stok kartının hareketi var, silinemez! Sadece pasife çekebilirsiniz.");
       return;
    }
    deactivateStock(actionTarget!.id);
    setActionTarget(null);
  };
  const handleDeactivate = () => {
    deactivateStock(actionTarget!.id);
    setActionTarget(null);
  };
  const columns: Column<StockCard>[] = [
    { header: "Kod", cell: (row) => <Link className="font-semibold text-blue-700" href={`/stocks/${row.id}`}>{row.code}</Link> },
    { header: "Ad", cell: (row) => row.name },
    { header: "Tip", cell: (row) => <StatusBadge tone={row.type === "MM" ? "green" : row.type === "YM" ? "blue" : "amber"}>{row.type}</StatusBadge> },
    { header: "Ne", cell: (row) => getName(data.yarnCounts, row.yarnCountId) },
    { header: "Stok", cell: (row) => formatKg(data.stockMovements.filter((movement) => movement.stockId === row.id).reduce((sum, movement) => sum + (movement.direction === "IN" ? movement.quantity : -movement.quantity), 0)) },
    { header: "Kritik", cell: (row) => formatKg(row.criticalStockKg) },
    { header: "İşlem", className: "text-right", cell: (row) => <div className="flex justify-end gap-2"><button className="rounded-none border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700" onClick={() => setDetailTarget(row)} type="button">Detay</button><button className="rounded-none border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700" onClick={() => setEditing(row)} type="button">Düzenle</button><button className={dangerButton} onClick={() => setActionTarget(row)} type="button">Sil/Pasif</button></div> },
  ];
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Stok" title="Stok Kartları" description="YM/MM partili izlenir; IP/LYC/POLY satın alma ve üretim tüketimiyle takip edilir." icon={Boxes} action={<button className={primaryButton} onClick={() => setOpen(true)}><Plus className="size-4" />Stok kartı</button>} />
      <div className="premium-card rounded-none p-5 mb-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-semibold text-slate-950">Stok Kartı Filtreleri</h2>
            <p className="mt-1 text-sm text-slate-500">Stok tipi ve durumuna göre daraltın.</p>
          </div>
          <button className="rounded-none border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600" onClick={() => setFilters({ type: "ALL", isActive: "Aktif" })} type="button">Filtreleri temizle</button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <select className="rounded-none border border-slate-200 bg-white px-4 py-3 text-sm outline-none" value={filters.type} onChange={(e) => setFilter("type", e.target.value)}>
            <option value="ALL">Tüm tipler</option><option value="IP">İplik (IP)</option><option value="YM">Yarımamül (YM)</option><option value="MM">Mamül (MM)</option><option value="LYC">Likra (LYC)</option><option value="POLY">Polyester (POLY)</option>
          </select>
          <select className="rounded-none border border-slate-200 bg-white px-4 py-3 text-sm outline-none" value={filters.isActive} onChange={(e) => setFilter("isActive", e.target.value)}>
            <option value="ALL">Tümü</option><option value="Aktif">Aktif olanlar</option><option value="Pasif">Pasif olanlar</option>
          </select>
        </div>
      </div>
      <DataTable rows={filteredStocks} columns={columns} searchPlaceholder="Stok kodu, ad, tip veya özellikte ara" getSearchText={(row) => [row.code, row.name, row.type, getName(data.fabricTypes, row.fabricTypeId), getName(data.colors, row.colorId), getName(data.yarnCounts, row.yarnCountId)].join(" ")} />
      <FormDrawer open={open} title="Yeni stok kartı" onClose={() => setOpen(false)}><StockCardForm /></FormDrawer>
      <FormDrawer open={Boolean(editing)} title="Stok kartı düzenle" onClose={() => setEditing(null)}>{editing ? <StockCardEditForm stock={editing} onDone={() => setEditing(null)} /> : null}</FormDrawer>
      <FormDrawer open={Boolean(detailTarget)} title={`${detailTarget?.code ?? "Stok"} hareket detayları`} onClose={() => setDetailTarget(null)}>
        {detailTarget ? (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <StatCard title="Hareket bakiyesi" value={formatKg(data.stockMovements.filter((movement) => movement.stockId === detailTarget.id).reduce((sum, movement) => sum + (movement.direction === "IN" ? movement.quantity : -movement.quantity), 0))} helper="Giriş eksi çıkış" icon={Boxes} />
              <StatCard title="Giriş" value={formatKg(data.stockMovements.filter((movement) => movement.stockId === detailTarget.id && movement.direction === "IN").reduce((sum, movement) => sum + movement.quantity, 0))} helper="Tüm girişler" icon={PackagePlus} tone="green" />
              <StatCard title="Çıkış" value={formatKg(data.stockMovements.filter((movement) => movement.stockId === detailTarget.id && movement.direction === "OUT").reduce((sum, movement) => sum + movement.quantity, 0))} helper="Tüm çıkışlar" icon={Truck} tone="red" />
            </div>
            <DataTable
              rows={data.stockMovements.filter((movement) => movement.stockId === detailTarget.id)}
              columns={[
                { header: "Tarih", cell: (row: StockMovement) => formatDate(row.date) },
                { header: "Depo", cell: (row: StockMovement) => getName(data.warehouses, row.warehouseId) },
                { header: "Parti / lot", cell: (row: StockMovement) => data.parties.find((party) => party.id === row.partyId)?.partyNo ?? row.partyId ?? "-" },
                { header: "Tip", cell: (row: StockMovement) => row.movementType },
                { header: "Yön", cell: (row: StockMovement) => <StatusBadge tone={row.direction === "IN" ? "green" : "red"}>{row.direction}</StatusBadge> },
                { header: "Miktar", cell: (row: StockMovement) => formatKg(row.quantity) },
                { header: "Açıklama", cell: (row: StockMovement) => row.description },
              ]}
              searchPlaceholder="Depo, parti, lot, tip veya açıklamada ara"
              getSearchText={(row) => [getName(data.warehouses, row.warehouseId), data.parties.find((party) => party.id === row.partyId)?.partyNo, row.partyId, row.movementType, row.description].join(" ")}
            />
          </div>
        ) : null}
      </FormDrawer>
      <FormDrawer open={Boolean(actionTarget)} title="Stok Kartı Sil / Pasif" onClose={() => setActionTarget(null)}>
        {actionTarget && (
          <div className="space-y-6">
            <div className="rounded-none border border-slate-200 p-5 shadow-sm">
              <h3 className="font-semibold text-slate-900">Bu stok kartına ne yapılsın?</h3>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                <b>Sil:</b> Sadece hiç hareket görmemiş kartlar silinebilir.<br/>
                <b>Pasife Çek:</b> Hareket gören kartlar silinemez, ancak listelerde çıkmaması için pasife çekilebilir.
              </p>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <button className="w-full rounded-none border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 hover:bg-rose-100" onClick={handleDelete}>
                  Tamamen Sil
                </button>
                <button className="w-full rounded-none bg-amber-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-amber-200 hover:bg-amber-700" onClick={handleDeactivate}>
                  Pasife Çek
                </button>
              </div>
            </div>
          </div>
        )}
      </FormDrawer>
    </div>
  );
}

export function StockDetailPage({ id }: { id: string }) {
  const { data } = useErpData();
  const [activeTab, setActiveTab] = useState("Genel");
  const stock = data.stockCards.find((item) => item.id === id);
  if (!stock) return <DataTable rows={[]} columns={[]} />;
  const movements = data.stockMovements.filter((item) => item.stockId === stock.id);
  const incomingKg = movements.filter((item) => item.direction === "IN").reduce((sum, item) => sum + item.quantity, 0);
  const outgoingKg = movements.filter((item) => item.direction === "OUT").reduce((sum, item) => sum + item.quantity, 0);
  const movementBalance = incomingKg - outgoingKg;
  const warehouseRows = data.warehouseBalances
    .filter((item) => item.stockId === stock.id)
    .map((item) => ({
      ...item,
      warehouseName: getName(data.warehouses, item.warehouseId),
      partyNo: data.parties.find((party) => party.id === item.partyId)?.partyNo ?? "-",
      lotNo: item.lotNo ?? "-",
    }));
  const lotPartyRows = warehouseRows.filter((item) => item.partyNo !== "-" || item.lotNo !== "-");
  const purchaseItems = data.purchaseOrders.flatMap((order) => normalizeItems(order.items).filter((item) => item.stockId === stock.id).map((item) => ({ ...item, id: `${order.id}-${item.id}`, orderNo: order.purchaseOrderNo, status: order.status })));
  const orderLinks = [
    ...data.orders
      .filter((order) => order.ymStockId === stock.id || order.mmStockId === stock.id)
      .map((order) => ({
        id: `order-${order.id}`,
        type: "Müşteri siparişi",
        no: order.orderNo,
        partner: order.customerName,
        quantity: order.quantityKg,
        status: order.status,
      })),
    ...purchaseItems.map((item) => {
      const order = data.purchaseOrders.find((purchaseOrder) => purchaseOrder.purchaseOrderNo === item.orderNo);
      return {
        id: `purchase-${item.id}`,
        type: "Satıcı siparişi",
        no: item.orderNo,
        partner: order ? getName(data.partners, order.supplierId) : "-",
        quantity: item.orderedKg,
        status: item.status,
      };
    }),
  ];
  const productionRows = [
    ...data.productionRaw
      .filter((item) => item.ymStockId === stock.id || normalizeItems(item.consumedItems).some((consumed) => consumed.stockId === stock.id))
      .map((item) => ({
        id: `raw-${item.id}`,
        date: item.date,
        type: item.ymStockId === stock.id ? "Ham üretim girişi" : "Hammadde tüketimi",
        partyNo: data.parties.find((party) => party.id === item.partyId)?.partyNo ?? "-",
        warehouse: getName(data.warehouses, item.warehouseId),
        quantity: item.ymStockId === stock.id ? item.producedRawKg : normalizeItems(item.consumedItems).filter((consumed) => consumed.stockId === stock.id).reduce((sum, consumed) => sum + consumed.quantityKg, 0),
      })),
    ...data.productionDyehouse
      .filter((item) => item.ymStockId === stock.id || item.mmStockId === stock.id)
      .map((item) => ({
        id: `dye-${item.id}`,
        date: item.date,
        type: item.mmStockId === stock.id ? "Mamül üretim girişi" : "Boyahane ham tüketimi",
        partyNo: data.parties.find((party) => party.id === item.partyId)?.partyNo ?? "-",
        warehouse: item.mmStockId === stock.id ? getName(data.warehouses, item.outputWarehouseId) : getName(data.warehouses, item.inputWarehouseId),
        quantity: item.mmStockId === stock.id ? item.finishedKg : item.inputRawKg,
      })),
  ];
  const tabs = ["Genel", "Toplam Bakiye", "Depo Bakiyesi", "Lot / Parti Bakiyesi", "Hareketler", "Sipariş Bağlantıları", "Üretim Kullanımı"];
  const movementColumns: Column<StockMovement>[] = [
    { header: "Tarih", cell: (row) => formatDate(row.date) },
    { header: "Depo", cell: (row) => getName(data.warehouses, row.warehouseId) },
    { header: "Parti / lot", cell: (row) => data.parties.find((party) => party.id === row.partyId)?.partyNo ?? row.lotNo ?? "-" },
    { header: "Tip", cell: (row) => row.movementType },
    { header: "Yön", cell: (row) => <StatusBadge tone={row.direction === "IN" ? "green" : "red"}>{row.direction}</StatusBadge> },
    { header: "Miktar", cell: (row) => formatKg(row.quantity) },
  ];
  return (
    <div className="space-y-6">
      <PageHeader eyebrow={stock.code} title={stock.name} description="Genel, bakiye, hareketler, satıcı siparişleri ve üretim kullanımı tek kartta." icon={Boxes} action={<StatusBadge tone={stock.type === "MM" ? "green" : "blue"}>{stock.type}</StatusBadge>} />
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab}
            className={`rounded-none px-4 py-2 text-sm font-semibold transition ${activeTab === tab ? "bg-blue-600 text-white shadow-lg shadow-blue-100" : "border border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:text-blue-700"}`}
            onClick={() => setActiveTab(tab)}
            type="button"
          >
            {tab}
          </button>
        ))}
      </div>
      {activeTab === "Genel" ? (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <StatCard title="Mevcut stok" value={formatKg(stock.currentStockKg)} helper="Kart üstü özet" icon={Boxes} />
            <StatCard title="Hareket bakiyesi" value={formatKg(movementBalance)} helper="Giriş eksi çıkış" icon={Boxes} tone="blue" />
            <StatCard title="Bekleyen alış" value={formatKg(purchaseItems.reduce((sum, item) => sum + item.remainingKg, 0))} helper="Satıcı açık kg" icon={Truck} tone="amber" />
            <StatCard title="Üretim tüketimi" value={formatKg(movements.filter((item) => item.movementType === "Üretim tüketim").reduce((sum, item) => sum + item.quantity, 0))} helper="Hareketlerden hesaplanır" icon={Factory} tone="red" />
          </div>
          <div className="premium-card rounded-none p-5">
            <h2 className="font-semibold text-slate-950">Kart bilgileri</h2>
            <div className="mt-4 grid gap-3 text-sm text-slate-600 md:grid-cols-3">
              <p><span className="font-semibold text-slate-900">Tip:</span> {stock.type}</p>
              <p><span className="font-semibold text-slate-900">Renk:</span> {getName(data.colors, stock.colorId)}</p>
              <p><span className="font-semibold text-slate-900">İplik no:</span> {getName(data.yarnCounts, stock.yarnCountId)}</p>
              <p><span className="font-semibold text-slate-900">Kumaş cinsi:</span> {getName(data.fabricTypes, stock.fabricTypeId)}</p>
              <p><span className="font-semibold text-slate-900">Kritik stok:</span> {formatKg(stock.criticalStockKg)}</p>
              <p><span className="font-semibold text-slate-900">Durum:</span> {stock.isActive === false ? "Pasif" : "Aktif"}</p>
            </div>
          </div>
        </>
      ) : null}
      {activeTab === "Toplam Bakiye" ? (
        <div className="grid gap-4 md:grid-cols-4">
          <StatCard title="Hareket bakiyesi" value={formatKg(movementBalance)} helper="Gerçek hareket hesabı" icon={Boxes} />
          <StatCard title="Kart bakiyesi" value={formatKg(stock.currentStockKg)} helper="Kart alanındaki özet" icon={Boxes} tone="blue" />
          <StatCard title="Toplam giriş" value={formatKg(incomingKg)} helper="IN hareketler" icon={PackagePlus} tone="green" />
          <StatCard title="Toplam çıkış" value={formatKg(outgoingKg)} helper="OUT hareketler" icon={Truck} tone="red" />
        </div>
      ) : null}
      {activeTab === "Depo Bakiyesi" ? (
        <DataTable
          rows={warehouseRows}
          columns={[
            { header: "Depo", cell: (row) => row.warehouseName },
            { header: "Parti", cell: (row) => row.partyNo },
            { header: "En", cell: (row) => {
              const party = data.parties.find(p => p.id === row.partyId);
              return (party?.finishWidth || party?.rawWidth) ?? "-";
            }},
            { header: "Gramaj", cell: (row) => {
              const party = data.parties.find(p => p.id === row.partyId);
              return (party?.finishGsm || party?.rawGsm) ?? "-";
            }},
            { header: "Bakiye", cell: (row) => formatKg(row.quantity) },
            { header: "Güncelleme", cell: (row) => formatDate(row.updatedAt) },
          ]}
          searchPlaceholder="Depo, parti veya lotta ara"
          getSearchText={(row) => [row.warehouseName, row.partyNo, row.lotNo].join(" ")}
        />
      ) : null}
      {activeTab === "Lot / Parti Bakiyesi" ? (
        <DataTable
          rows={lotPartyRows}
          columns={[
            { header: "Depo", cell: (row) => row.warehouseName },
            { header: "Parti", cell: (row) => row.partyNo },
            { header: "En", cell: (row) => {
              const party = data.parties.find(p => p.id === row.partyId);
              return (party?.finishWidth || party?.rawWidth) ?? "-";
            }},
            { header: "Gramaj", cell: (row) => {
              const party = data.parties.find(p => p.id === row.partyId);
              return (party?.finishGsm || party?.rawGsm) ?? "-";
            }},
            { header: "Bakiye", cell: (row) => formatKg(row.quantity) },
          ]}
          searchPlaceholder="Parti veya lotta ara"
          getSearchText={(row) => [row.warehouseName, row.partyNo, row.lotNo].join(" ")}
        />
      ) : null}
      {activeTab === "Hareketler" ? (
        <DataTable
          rows={movements}
          columns={movementColumns}
          searchPlaceholder="Depo, parti, lot, tip veya açıklamada ara"
          getSearchText={(row) => [getName(data.warehouses, row.warehouseId), data.parties.find((party) => party.id === row.partyId)?.partyNo, row.lotNo, row.movementType, row.description].join(" ")}
        />
      ) : null}
      {activeTab === "Sipariş Bağlantıları" ? (
        <DataTable
          rows={orderLinks}
          columns={[
            { header: "Tip", cell: (row) => row.type },
            { header: "No", cell: (row) => row.no },
            { header: "Cari", cell: (row) => row.partner },
            { header: "Kg", cell: (row) => formatKg(row.quantity) },
            { header: "Durum", cell: (row) => <StatusBadge tone={statusTone(row.status)}>{row.status}</StatusBadge> },
          ]}
          searchPlaceholder="Sipariş no, cari veya durumda ara"
          getSearchText={(row) => [row.type, row.no, row.partner, row.status].join(" ")}
        />
      ) : null}
      {activeTab === "Üretim Kullanımı" ? (
        <DataTable
          rows={productionRows}
          columns={[
            { header: "Tarih", cell: (row) => formatDate(row.date) },
            { header: "Tip", cell: (row) => row.type },
            { header: "Parti", cell: (row) => row.partyNo },
            { header: "Depo", cell: (row) => row.warehouse },
            { header: "Kg", cell: (row) => formatKg(row.quantity) },
          ]}
          searchPlaceholder="Parti, depo veya üretim tipinde ara"
          getSearchText={(row) => [row.type, row.partyNo, row.warehouse].join(" ")}
        />
      ) : null}
    </div>
  );
}

export function PartiesPage() {
  const { data } = useErpData();
  const [shiftOpen, setShiftOpen] = useState(false);
  const columns: Column<Party>[] = [
    { header: "Parti", cell: (row) => <Link className="font-semibold text-blue-700" href={`/parties/${row.id}`}>{row.partyNo}</Link> },
    { header: "Sipariş", cell: (row) => data.orders.find((item) => item.id === row.orderId)?.orderNo },
    { header: "Ham kg", cell: (row) => formatKg(row.rawProducedKg) },
    { header: "Mamül kg", cell: (row) => formatKg(row.finishedKg) },
    { header: "Ham fire", cell: (row) => <StatusBadge tone={wasteTone(row.rawWastePercent)}>{formatPercent(row.rawWastePercent)}</StatusBadge> },
    { header: "Durum", cell: (row) => <StatusBadge tone={statusTone(row.status)}>{row.status}</StatusBadge> },
  ];
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Parti takibi" title="Partiler" description="İlk ham üretimden satışa kadar parti numarası, fire, depo ve timeline izleme." icon={Factory} action={<button className={primaryButton} onClick={() => setShiftOpen(true)} type="button"><PackageCheck className="size-4" />Parti kaydır</button>} />
      <DataTable rows={data.parties} columns={columns} />
      <FormDrawer open={shiftOpen} title="Parti kaydırma" onClose={() => setShiftOpen(false)}>
        <PartyShiftForm onDone={() => setShiftOpen(false)} />
      </FormDrawer>
    </div>
  );
}

export function PartyDetailPage({ id }: { id: string }) {
  const { data } = useErpData();
  const party = data.parties.find((item) => item.id === id);
  const order = useMemo(() => party ? data.orders.find((item) => item.id === party.orderId) : undefined, [party, data.orders]);

  const timeline = useMemo(() => {
    if (!party) return [];
    const events: Array<{ date: string; title: string; description: string; tone: 'blue' | 'green' | 'amber' | 'red' }> = [
      ...(party.timeline || [])
    ];

    data.productionRaw.filter(p => p.partyId === id).forEach(p => {
      events.push({
        date: p.date,
        title: 'Ham Üretim',
        description: formatKg(p.producedRawKg) + ' ham kumaş üretildi. ( %' + p.wastePercent + ' fire)',
        tone: 'blue'
      });
    });

    data.transfers.forEach(t => {
      const partyItem = normalizeItems(t.items).find(it => it.partyId === id);
      if (partyItem) {
        events.push({
          date: t.date,
          title: 'Depo Transferi',
          description: getName(data.warehouses, t.fromWarehouseId) + ' -> ' + getName(data.warehouses, t.toWarehouseId) + ' (' + formatKg(partyItem.quantity) + ' kg)',
          tone: 'amber'
        });
      }
    });

    data.productionDyehouse.filter(p => p.partyId === id).forEach(p => {
      events.push({
        date: p.date,
        title: 'Boyahane Üretimi',
        description: formatKg(p.finishedKg) + ' mamül kumaş girişi yapıldı. ( %' + p.wastePercent + ' fire)',
        tone: 'green'
      });
    });

    data.sales.filter(s => s.partyId === id && s.status !== 'İptal').forEach(s => {
      events.push({
        date: s.date,
        title: 'Sevkiyat / Satış',
        description: s.customerName + ' müşterisine ' + formatKg(s.quantityKg) + ' kg sevk edildi.',
        tone: 'amber'
      });
    });

    return events.sort((a, b) => {
      const da = new Date(a.date).getTime();
      const db = new Date(b.date).getTime();
      return (isNaN(db) ? 0 : db) - (isNaN(da) ? 0 : da);
    });
  }, [data, id, party]);

  if (!party) return <div className="p-8 text-center text-slate-500 italic">Parti bulunamadı.</div>;

  return (
    <div className='space-y-6'>
      <PageHeader eyebrow={'Parti ' + party.partyNo} title={order?.customerName ?? 'Parti detayı'} description='Sipariş, iplik tüketimi, fasoncu, boyahane, satış ve kalan kg zinciri.' icon={Factory} action={<StatusBadge tone={statusTone(party.status)}>{party.status}</StatusBadge>} />
      <div className='grid gap-4 md:grid-cols-4'>
        <StatCard title='Ham üretim' value={formatKg(party.rawProducedKg)} helper={formatKg(party.rawConsumedKg) + ' iplik tüketildi'} icon={Factory} />
        <StatCard title='Ham fire' value={formatPercent(party.rawWastePercent)} helper={formatKg(party.rawWasteKg)} icon={BarChart3} tone='red' />
        <StatCard title='Boyahane giriş' value={formatKg(party.dyehouseInputKg)} helper='Ham kumaş sevki' icon={Truck} tone='amber' />
        <StatCard title='Mamül' value={formatKg(party.finishedKg)} helper={formatPercent(party.dyehouseWastePercent) + ' boyahane fire'} icon={Boxes} tone='green' />
      </div>
      <PartyTimeline items={timeline} />
    </div>
  );

}
export function PartyShiftPage() {
  const { data } = useErpData();
  const rows = data.orderPartyAllocations.map((item) => ({
    ...item,
    orderNo: data.orders.find((order) => order.id === item.orderId)?.orderNo ?? "-",
    partyNo: data.parties.find((party) => party.id === item.partyId)?.partyNo ?? "-",
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Parti"
        title="Parti Kaydırma"
        description="Bir partinin tamamını veya belirli kg kısmını başka bir müşteri siparişine bağlayın."
        icon={PackageCheck}
      />
      <div className="premium-card rounded-none p-5">
        <PartyShiftForm />
      </div>
      <DataTable
        rows={rows}
        columns={[
          { header: "Sipariş", cell: (row) => row.orderNo },
          { header: "Parti", cell: (row) => row.partyNo },
          { header: "Bağlı kg", cell: (row) => formatKg(row.allocatedKg) },
          { header: "Ham", cell: (row) => formatKg(row.producedRawKg) },
          { header: "Mamül", cell: (row) => formatKg(row.producedFinishedKg) },
          { header: "Sevk", cell: (row) => formatKg(row.shippedKg) },
          { header: "Durum", cell: (row) => <StatusBadge tone={row.status === "Aktif" ? "green" : "amber"}>{row.status}</StatusBadge> },
        ]}
        searchPlaceholder="Sipariş veya parti ara"
        getSearchText={(row) => [row.orderNo, row.partyNo, row.status].join(" ")}
      />
    </div>
  );
}

export function ProductionPage({ type }: { type: 'raw' | 'dyehouse' }) {
  const { data, refresh } = useErpData();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RawProduction | DyehouseProduction | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RawProduction | DyehouseProduction | null>(null);
  const [filters, setFilters] = useState({ dateFrom: '', dateTo: '' });
  const setFilter = (key: string, value: string) => setFilters((curr) => ({ ...curr, [key]: value }));
  const isRaw = type === 'raw';
  
  const filteredRaw = useMemo(() => data.productionRaw.filter((row) => {
    if (filters.dateFrom && row.date < filters.dateFrom) return false;
    if (filters.dateTo && row.date > filters.dateTo) return false;
    return true;
  }), [data.productionRaw, filters]);
  
  const filteredDyehouse = useMemo(() => data.productionDyehouse.filter((row) => {
    if (filters.dateFrom && row.date < filters.dateFrom) return false;
    if (filters.dateTo && row.date > filters.dateTo) return false;
    return true;
  }), [data.productionDyehouse, filters]);

  async function deleteProductionRecord() {
    if (!deleteTarget) return;
    try {
      await apiDelete('/api/production/' + (isRaw ? 'raw' : 'dyehouse') + '/' + deleteTarget.id);
      refreshInBackground(refresh);
      toast.success(isRaw ? 'Ham üretim kaydı silindi.' : 'Boyahane üretim kaydı silindi.');
      setDeleteTarget(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Üretim silinemedi.');
    }
  }

  const rawColumns: Column<RawProduction>[] = [
    { header: 'Tarih', cell: (row) => formatDate(row.date) },
    { header: 'Sipariş', cell: (row) => data.orders.find((order) => order.id === row.orderId)?.orderNo ?? '-' },
    { header: 'Parti', cell: (row) => data.parties.find((party) => party.id === row.partyId)?.partyNo ?? '-' },
    { header: 'Fasoncu', cell: (row) => getName(data.partners, row.knitterPartnerId) },
    { header: 'Ham kg', cell: (row) => formatKg(row.producedRawKg) },
    { header: 'Fire', cell: (row) => <StatusBadge tone={wasteTone(row.wastePercent)}>{formatPercent(row.wastePercent)}</StatusBadge> },
    { header: 'İşlem', className: 'text-right', cell: (row) => (
      <div className='flex justify-end gap-2'>
        <button className='rounded-none border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-blue-200 hover:text-blue-700 transition-colors' onClick={() => setEditing(row)} type='button'>Düzenle</button>
        <button className='rounded-none border border-rose-100 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-100 transition-colors' onClick={() => setDeleteTarget(row)} type='button'>Sil</button>
      </div>
    ) },
  ];

  const dyehouseColumns: Column<DyehouseProduction>[] = [
    { header: 'Tarih', cell: (row) => formatDate(row.date) },
    { header: 'Sipariş', cell: (row) => data.orders.find((order) => order.id === row.orderId)?.orderNo ?? '-' },
    { header: 'Parti', cell: (row) => data.parties.find((party) => party.id === row.partyId)?.partyNo ?? '-' },
    { header: 'Boyahane', cell: (row) => getName(data.partners, row.dyehousePartnerId) },
    { header: 'Giden', cell: (row) => formatKg(row.inputRawKg) },
    { header: 'Dönen', cell: (row) => formatKg(row.finishedKg) },
    { header: 'Fire', cell: (row) => <StatusBadge tone={wasteTone(row.wastePercent)}>{formatPercent(row.wastePercent)}</StatusBadge> },
    { header: 'İşlem', className: 'text-right', cell: (row) => (
      <div className='flex justify-end gap-2'>
        <button className='rounded-none border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-blue-200 hover:text-blue-700 transition-colors' onClick={() => setEditing(row)} type='button'>Düzenle</button>
        <button className='rounded-none border border-rose-100 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-100 transition-colors' onClick={() => setDeleteTarget(row)} type='button'>Sil</button>
      </div>
    ) },
  ];

  return (
    <div className='space-y-6'>
      <PageHeader eyebrow='Üretim' title={isRaw ? 'Ham Kumaş Üretimi' : 'Boyahane Üretimi'} description={isRaw ? 'İplik tüketimi, ham kumaş girişi, fire ve fasoncu depo kapanış mutabakatı.' : 'Ham çıkışı, mamül girişi, finish özellikleri ve boyahane fire hesaplama.'} icon={Factory} action={<button className={primaryButton} onClick={() => setOpen(true)}><Plus className='size-4' />Yeni kayıt</button>} />
      
      <div className='premium-card rounded-none p-5 mb-6'>
        <div className='flex flex-col gap-3 md:flex-row md:items-center md:justify-between'>
          <div>
            <h2 className='font-semibold text-slate-950'>Üretim Filtreleri</h2>
            <p className='mt-1 text-sm text-slate-500'>Tarihe göre kayıtları daraltın.</p>
          </div>
          <button className='rounded-none border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600' onClick={() => setFilters({ dateFrom: '', dateTo: '' })} type='button'>Filtreleri temizle</button>
        </div>
        <div className='mt-4 grid gap-3 md:grid-cols-2'>
          <label className='space-y-1 text-xs font-semibold text-slate-400'>Başlangıç<input className='w-full rounded-none border border-slate-200 bg-white px-4 py-3 text-sm font-normal text-slate-700 outline-none' type='date' value={filters.dateFrom} onChange={(e) => setFilter('dateFrom', e.target.value)} /></label>
          <label className='space-y-1 text-xs font-semibold text-slate-400'>Bitiş<input className='w-full rounded-none border border-slate-200 bg-white px-4 py-3 text-sm font-normal text-slate-700 outline-none' type='date' value={filters.dateTo} onChange={(e) => setFilter('dateTo', e.target.value)} /></label>
        </div>
      </div>

      {isRaw ? (
        <DataTable rows={filteredRaw} columns={rawColumns} searchPlaceholder='Sipariş, parti, fasoncu veya açıklamada ara' getSearchText={(row) => [data.orders.find((order) => order.id === row.orderId)?.orderNo, data.parties.find((party) => party.id === row.partyId)?.partyNo, getName(data.partners, row.knitterPartnerId), row.description].join(' ')} />
      ) : (
        <DataTable rows={filteredDyehouse} columns={dyehouseColumns} searchPlaceholder='Sipariş, parti, boyahane veya açıklamada ara' getSearchText={(row) => [data.orders.find((order) => order.id === row.orderId)?.orderNo, data.parties.find((party) => party.id === row.partyId)?.partyNo, getName(data.partners, row.dyehousePartnerId), row.description].join(' ')} />
      )}

      <FormDrawer open={open || !!editing} title={editing ? (isRaw ? 'Ham Üretimi Düzenle' : 'Boyahane Üretimini Düzenle') : (isRaw ? 'Yeni Üretim Kaydı' : 'Yeni Boyahane Üretimi')} onClose={() => { setOpen(false); setEditing(null); }}>
        {isRaw ? <RawProductionForm initialData={editing as RawProduction} /> : <DyehouseProductionForm initialData={editing as DyehouseProduction} />}
      </FormDrawer>

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title='Üretim kaydı silinsin mi?'
        description='Bu üretim kaydı; stok hareketleri, depolar arası transferler veya sevkiyat fişleri ile ilişkilendirilmiş olabilir. Eğer bağlı kayıtlar varsa sistem silme işlemini engelleyecektir.'
        onClose={() => setDeleteTarget(null)}
        onConfirm={deleteProductionRecord}
      />
    </div>
  );
}
export function TransfersPage() {
  const { data, refresh } = useErpData();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Transfer | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Transfer | null>(null);
  const [filters, setFilters] = useState({ dateFrom: '', dateTo: '' });
  const setFilter = (key: string, value: string) => setFilters((curr) => ({ ...curr, [key]: value }));

  const filteredTransfers = useMemo(() => data.transfers.filter((row) => {
    if (filters.dateFrom && row.date < filters.dateFrom) return false;
    if (filters.dateTo && row.date > filters.dateTo) return false;
    return true;
  }), [data.transfers, filters]);

  async function deleteTransferRecord() {
    if (!deleteTarget) return;
    try {
      await apiDelete('/api/transfers/' + deleteTarget.id);
      refreshInBackground(refresh);
      toast.success('Transfer kaydı silindi.');
      setDeleteTarget(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Transfer silinemedi.');
    }
  }

  return (
    <div className='space-y-6'>
      <PageHeader eyebrow='Stok' title='Depolar Arası Transfer' description='İplik, ham veya mamül kumaşların depolar arası sevkiyat kaydı.' icon={Truck} action={<button className={primaryButton} onClick={() => setOpen(true)}><Plus className='size-4' />Yeni transfer</button>} />
      
      <div className='premium-card rounded-none p-5 mb-6'>
        <div className='flex flex-col gap-3 md:flex-row md:items-center md:justify-between'>
          <div>
            <h2 className='font-semibold text-slate-950'>Transfer Filtreleri</h2>
            <p className='mt-1 text-sm text-slate-500'>Tarihe göre kayıtları daraltın.</p>
          </div>
          <button className='rounded-none border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600' onClick={() => setFilters({ dateFrom: '', dateTo: '' })} type='button'>Filtreleri temizle</button>
        </div>
        <div className='mt-4 grid gap-3 md:grid-cols-2'>
          <label className='space-y-1 text-xs font-semibold text-slate-400'>Başlangıç<input className='w-full rounded-none border border-slate-200 bg-white px-4 py-3 text-sm font-normal text-slate-700 outline-none' type='date' value={filters.dateFrom} onChange={(e) => setFilter('dateFrom', e.target.value)} /></label>
          <label className='space-y-1 text-xs font-semibold text-slate-400'>Bitiş<input className='w-full rounded-none border border-slate-200 bg-white px-4 py-3 text-sm font-normal text-slate-700 outline-none' type='date' value={filters.dateTo} onChange={(e) => setFilter('dateTo', e.target.value)} /></label>
        </div>
      </div>

      <DataTable rows={filteredTransfers} columns={[
        { header: 'Tarih', cell: (row) => formatDate(row.date) },
        { header: 'Kaynak', cell: (row) => getName(data.warehouses, row.fromWarehouseId) },
        { header: 'Hedef', cell: (row) => getName(data.warehouses, row.toWarehouseId) },
        { header: 'Miktar', cell: (row) => formatKg(normalizeItems(row.items).reduce((sum, item) => sum + (item.quantity || 0), 0)) },
        { header: 'İşlem', className: 'text-right', cell: (row) => (
          <div className='flex justify-end gap-2'>
            <button className='rounded-none border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-blue-200 hover:text-blue-700 transition-colors' onClick={() => setEditing(row)} type='button'>Düzenle</button>
            <button className='rounded-none border border-rose-100 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-100 transition-colors' onClick={() => setDeleteTarget(row)} type='button'>Sil</button>
          </div>
        )},
      ]} searchPlaceholder='Kaynak depo, hedef depo veya açıklamada ara' getSearchText={(row) => [getName(data.warehouses, row.fromWarehouseId), getName(data.warehouses, row.toWarehouseId), row.description].join(' ')} />
      
      <FormDrawer open={open || !!editing} title={editing ? 'Transferi Düzenle' : 'Yeni Transfer'} onClose={() => { setOpen(false); setEditing(null); }}>
        <TransferForm initialData={editing || undefined} />
      </FormDrawer>
      <ConfirmModal
        open={Boolean(deleteTarget)}
        title='Transfer silinsin mi?'
        description='Bu işlem kaydı ve ilgili tüm stok hareketlerini kalıcı olarak siler.'
        confirmLabel='Kalıcı olarak sil'
        tone='danger'
        onClose={() => setDeleteTarget(null)}
        onConfirm={deleteTransferRecord}
      />
    </div>
  );
}

export function WasteAnalysisPage() {
  const { data } = useErpData();
  const [filters, setFilters] = useState({ customer: '', dateFrom: '', dateTo: '' });
  const metrics = getDashboardMetrics(data);

  const groupedRows = useMemo(() => {
    const result: Array<{
      orderId: string;
      orderNo: string;
      customerName: string;
      totalConsumedKg: number;
      totalRawKg: number;
      totalDyeInputKg: number;
      totalFinishedKg: number;
      totalRawWasteKg: number;
      totalDyeWasteKg: number;
      avgRawWastePercent: number;
      avgDyeWastePercent: number;
      parties: any[];
    }> = [];

    data.orders.forEach(order => {
      const orderParties = data.parties.filter(p => p.orderId === order.id);
      if (orderParties.length === 0) return;

      const consumed = orderParties.reduce((s, p) => s + (p.rawConsumedKg || 0), 0);
      const raw = orderParties.reduce((s, p) => s + (p.rawProducedKg || 0), 0);
      const dyeInput = orderParties.reduce((s, p) => s + (p.dyehouseInputKg || 0), 0);
      const finished = orderParties.reduce((s, p) => s + (p.finishedKg || 0), 0);
      const rawWaste = orderParties.reduce((s, p) => s + (p.rawWasteKg || 0), 0);
      const dyeWaste = orderParties.reduce((s, p) => s + (p.dyehouseWasteKg || 0), 0);

      result.push({
        orderId: order.id,
        orderNo: order.orderNo,
        customerName: order.customerName,
        totalConsumedKg: consumed,
        totalRawKg: raw,
        totalDyeInputKg: dyeInput,
        totalFinishedKg: finished,
        totalRawWasteKg: rawWaste,
        totalDyeWasteKg: dyeWaste,
        avgRawWastePercent: consumed > 0 ? (rawWaste / consumed) * 100 : 0,
        avgDyeWastePercent: dyeInput > 0 ? (dyeWaste / dyeInput) * 100 : 0,
        parties: orderParties
      });
    });

    return result.filter(r => {
        if (filters.customer && !r.customerName.toLowerCase().includes(filters.customer.toLowerCase())) return false;
        return true;
    });
  }, [data, filters]);

  return (
    <div className='space-y-6'>
      <PageHeader eyebrow='Fire' title='Fire Analizi Dashboard' description='Sipariş bazlı toplam üretim, tüketim ve fire oranları.' icon={BarChart3} />
      
      <div className='grid gap-4 md:grid-cols-4'>
        <StatCard title='Ham fire ort.' value={formatPercent(metrics.avgRawWaste)} helper='Tüm üretimler toplamı' icon={BarChart3} tone='red' />
        <StatCard title='Boyahane fire ort.' value={formatPercent(metrics.avgDyeWaste)} helper='Tüm boyahaneler toplamı' icon={BarChart3} tone='amber' />
        <StatCard title='Toplam Fire kg' value={formatKg(metrics.wasteKg)} helper='Ham + Boyahane' icon={Factory} tone='red' />
        <StatCard title='Toplam Üretim' value={formatKg(metrics.monthlyProductionKg)} helper='Ham + Mamül' icon={Boxes} tone='blue' />
      </div>

      <div className='premium-card rounded-none p-5 mb-6'>
        <div className='flex flex-col gap-3 md:flex-row md:items-center md:justify-between'>
           <h2 className='font-semibold text-slate-950'>Analiz Filtreleri</h2>
           <button className='text-xs font-bold text-slate-400 uppercase tracking-wider' onClick={() => setFilters({ customer: '', dateFrom: '', dateTo: '' })}>Sıfırla</button>
        </div>
        <div className='mt-4 grid gap-4 md:grid-cols-1'>
            <input className='rounded-none border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-blue-500' placeholder='Müşteri ara...' value={filters.customer} onChange={e => setFilters({...filters, customer: e.target.value})} />
        </div>
      </div>

      <div className='space-y-4'>
        {groupedRows.map(row => (
            <div key={row.orderId} className='premium-card rounded-3xl overflow-hidden border border-slate-100 shadow-sm'>
                <div className='bg-slate-50/50 p-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4'>
                    <div>
                        <h3 className='text-sm font-bold text-slate-400 uppercase tracking-[0.15em] mb-1'>Sipariş: {row.orderNo}</h3>
                        <div className='text-lg font-bold text-slate-950'>{row.customerName}</div>
                    </div>
                    <div className='flex gap-6'>
                        <div className='text-right'>
                            <div className='text-[10px] font-bold text-slate-400 uppercase'>Tüketim</div>
                            <div className='font-bold text-slate-900'>{formatKg(row.totalConsumedKg)}</div>
                        </div>
                        <div className='text-right'>
                            <div className='text-[10px] font-bold text-slate-400 uppercase'>Ham Fire</div>
                            <div className='font-bold text-rose-600'>{formatPercent(row.avgRawWastePercent)}</div>
                        </div>
                        <div className='text-right'>
                            <div className='text-[10px] font-bold text-slate-400 uppercase'>Boya Fire</div>
                            <div className='font-bold text-amber-600'>{formatPercent(row.avgDyeWastePercent)}</div>
                        </div>
                    </div>
                </div>
                <div className='p-2'>
                    <DataTable 
                        rows={row.parties} 
                        columns={[
                            { header: 'Parti No', cell: (p) => <Link className='font-bold text-blue-600' href={'/parties/' + p.id}>{p.partyNo}</Link> },
                            { header: 'Tüketim', cell: (p) => formatKg(p.rawConsumedKg) },
                            { header: 'Ham Üretim', cell: (p) => formatKg(p.rawProducedKg) },
                            { header: 'Ham Fire %', cell: (p) => <StatusBadge tone={wasteTone(p.rawWastePercent)}>{formatPercent(p.rawWastePercent)}</StatusBadge> },
                            { header: 'Boya Giriş', cell: (p) => formatKg(p.dyehouseInputKg) },
                            { header: 'Mamül Giriş', cell: (p) => formatKg(p.finishedKg) },
                            { header: 'Boya Fire %', cell: (p) => <StatusBadge tone={wasteTone(p.dyehouseWastePercent)}>{formatPercent(p.dyehouseWastePercent)}</StatusBadge> },
                        ]} 
                    />
                </div>
            </div>
        ))}
      </div>
    </div>
  );
}

export function ReportsPage() {
  const { data } = useErpData();
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [stockTypeFilter, setStockTypeFilter] = useState("ALL");
  const metrics = getDashboardMetrics(data);
  const totalSalesKg = data.sales.filter((sale) => sale.status !== "İptal").reduce((sum, sale) => sum + sale.quantityKg, 0);
  const openPurchaseKg = data.purchaseOrders.reduce((sum, order) => sum + order.totalRemainingKg, 0);
  const stockValue = data.stockCards.reduce((sum, stock) => sum + stock.currentStockKg, 0);
  const productionRows = data.parties.map((party) => {
    const order = data.orders.find((item) => item.id === party.orderId);
    return {
      id: party.id,
      partyNo: party.partyNo,
      customerName: order?.customerName ?? "-",
      rawKg: party.rawProducedKg,
      finishedKg: party.finishedKg,
      rawWaste: party.rawWastePercent,
      dyeWaste: party.dyehouseWastePercent,
      status: party.status,
    };
  }).filter((row) => statusFilter === "ALL" || row.status === statusFilter);
  const stockRows = data.stockCards
    .filter((stock) => stock.isActive)
    .filter((stock) => stockTypeFilter === "ALL" || stock.type === stockTypeFilter)
    .map((stock) => ({
      id: stock.id,
      code: stock.code,
      name: stock.name,
      type: stock.type,
      currentStockKg: stock.currentStockKg,
      criticalStockKg: stock.criticalStockKg,
      risk: stock.criticalStockKg > 0 && stock.currentStockKg <= stock.criticalStockKg,
    }));
  const statuses = Array.from(new Set(data.parties.map((party) => party.status))).filter(Boolean);

  function exportCsv() {
    const rows = [
      ["Rapor", "Kod", "Ad/Musteri", "Tip/Durum", "Kg1", "Kg2", "Oran1", "Oran2"],
      ...productionRows.map((row) => ["Uretim", row.partyNo, row.customerName, row.status, row.rawKg, row.finishedKg, row.rawWaste, row.dyeWaste]),
      ...stockRows.map((row) => ["Stok", row.code, row.name, row.type, row.currentStockKg, row.criticalStockKg, row.risk ? "Kritik" : "Normal", ""]),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `orme-erp-rapor-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Raporlama" title="Gelişmiş ERP Raporları" description="Üretim, stok, satın alma, satış ve fire metrikleri canlı PostgreSQL verisinden hesaplanır." icon={BarChart3} action={<button className={primaryButton} onClick={exportCsv} type="button"><Download className="size-4" />CSV dışa aktar</button>} />
      <div className="premium-card grid gap-4 rounded-none p-4 md:grid-cols-2">
        <label className="space-y-2">
          <span className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Parti durumu</span>
          <select className="w-full rounded-none border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="ALL">Tüm durumlar</option>
            {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
        </label>
        <label className="space-y-2">
          <span className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Stok tipi</span>
          <select className="w-full rounded-none border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50" value={stockTypeFilter} onChange={(event) => setStockTypeFilter(event.target.value)}>
            <option value="ALL">Tüm stoklar</option>
            <option value="IP">IP</option>
            <option value="LYC">LYC</option>
            <option value="POLY">POLY</option>
            <option value="YM">YM</option>
            <option value="MM">MM</option>
          </select>
        </label>
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard title="Üretim kg" value={formatKg(metrics.monthlyProductionKg)} helper="Ham + mamül zinciri" icon={Factory} />
        <StatCard title="Satış kg" value={formatKg(totalSalesKg)} helper="İptal dışı sevkiyat" icon={Truck} tone="green" />
        <StatCard title="Açık satın alma" value={formatKg(openPurchaseKg)} helper="Bekleyen hammadde" icon={PackagePlus} tone="amber" />
        <StatCard title="Stok toplamı" value={formatKg(stockValue)} helper="Aktif kart bakiyesi" icon={Boxes} tone="blue" />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard title="Ham fire ort." value={formatPercent(metrics.avgRawWaste)} helper={formatKg(data.parties.reduce((sum, item) => sum + item.rawWasteKg, 0))} icon={BarChart3} tone="red" />
        <StatCard title="Boyahane fire ort." value={formatPercent(metrics.avgDyeWaste)} helper={formatKg(data.parties.reduce((sum, item) => sum + item.dyehouseWasteKg, 0))} icon={BarChart3} tone="amber" />
        <StatCard title="Kritik stok" value={String(stockRows.filter((row) => row.risk).length)} helper="Eşik altında kalan kart" icon={Boxes} tone="red" />
      </div>
      <DataTable rows={productionRows} columns={[
        { header: "Parti", cell: (row) => row.partyNo },
        { header: "Müşteri", cell: (row) => row.customerName },
        { header: "Ham kg", cell: (row) => formatKg(row.rawKg) },
        { header: "Mamül kg", cell: (row) => formatKg(row.finishedKg) },
        { header: "Ham fire", cell: (row) => <StatusBadge tone={wasteTone(row.rawWaste)}>{formatPercent(row.rawWaste)}</StatusBadge> },
        { header: "Boya fire", cell: (row) => <StatusBadge tone={wasteTone(row.dyeWaste)}>{formatPercent(row.dyeWaste)}</StatusBadge> },
        { header: "Durum", cell: (row) => <StatusBadge tone={statusTone(row.status)}>{row.status}</StatusBadge> },
      ]} />
      <DataTable rows={stockRows} columns={[
        { header: "Kod", cell: (row) => row.code },
        { header: "Ad", cell: (row) => row.name },
        { header: "Tip", cell: (row) => <StatusBadge tone={row.type === "MM" ? "green" : row.type === "YM" ? "blue" : "amber"}>{row.type}</StatusBadge> },
        { header: "Stok", cell: (row) => formatKg(row.currentStockKg) },
        { header: "Kritik", cell: (row) => formatKg(row.criticalStockKg) },
        { header: "Risk", cell: (row) => <StatusBadge tone={row.risk ? "red" : "green"}>{row.risk ? "Kritik" : "Normal"}</StatusBadge> },
      ]} />
    </div>
  );
}

export function SimpleModulePage({ kind }: { kind: "warehouses" | "partners" | "sales" | "reports" | "settings" }) {
  const { data, refresh, mutateData } = useErpData();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<EditableSetting | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EditableSetting | null>(null);
  const [detailWarehouse, setDetailWarehouse] = useState<NamedEntity | null>(null);
  const map = {
    warehouses: { title: "Depo Yönetimi", desc: "Depo tanımları, bakiye kartları ve partili stok görünümü.", icon: Warehouse },
    partners: { title: "Fasoncu Cari Yönetimi", desc: "Fason örmeci, boyahane, satıcı ve müşteri kartları.", icon: Users },
    sales: { title: "Satış / Sevkiyat", desc: "Mamül kumaşın satış mağazası ve sevkiyat deposu çıkışları.", icon: Truck },
    reports: { title: "Raporlar", desc: "Üretim, stok, satın alma ve fire raporları.", icon: BarChart3 },
    settings: { title: "Ayarlar", desc: "Kumaş cinsi, renk, Ne, proses, depo, rol ve prefix tanımları.", icon: Settings },
  }[kind];
  if (kind === "sales") {
    async function cancelSaleRecord(id: string) {
      try {
        await apiDelete(`/api/sales/${id}`);
        refreshInBackground(refresh);
        toast.success("Sevkiyat iptal edildi ve stok iadesi işlendi.");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Sevkiyat iptal edilemedi.");
      }
    }
    const columns: Column<Sale>[] = [
      { header: "Sevkiyat", cell: (row) => <span className="font-semibold text-blue-700">{row.saleNo}</span> },
      { header: "Müşteri", cell: (row) => row.customerName },
      { header: "Parti", cell: (row) => data.parties.find((item) => item.id === row.partyId)?.partyNo ?? "-" },
      { header: "Depo", cell: (row) => getName(data.warehouses, row.warehouseId) },
      { header: "Kg", cell: (row) => formatKg(row.quantityKg) },
      { header: "Durum", cell: (row) => <StatusBadge tone={statusTone(row.status)}>{row.status}</StatusBadge> },
      { header: "İşlem", cell: (row) => <button className={dangerButton} onClick={() => cancelSaleRecord(row.id)} type="button">İptal/iade</button> },
    ];
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Satış" title={map.title} description={map.desc} icon={map.icon} action={<button className={primaryButton} onClick={() => setOpen(true)}><Plus className="size-4" />Sevkiyat</button>} />
        <DataTable rows={data.sales} columns={columns} />
        <FormDrawer open={open} title="Satış / sevkiyat kaydı" onClose={() => setOpen(false)}><SaleForm /></FormDrawer>
      </div>
    );
  }
  const manageDefinitions = kind === "warehouses" || kind === "partners";
  const rows = kind === "warehouses" ? data.warehouses : kind === "partners" ? data.partners : data.fabricTypes;
  const entity: SettingEntity = kind === "warehouses" ? "warehouses" : kind === "partners" ? "partners" : "fabricTypes";

  async function updateDefinition(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const form = new FormData(event.currentTarget);
    try {
      const nextRow = {
        id: editing.id,
        name: String(form.get("name") ?? editing.name),
        kind: (form.get("kind") ?? editing.kind) as WarehouseEntity["kind"] | undefined,
        type: (form.get("type") ?? editing.type) as Partner["type"] | undefined,
      };
      await apiPatch(`/api/settings/${entity}/${editing.id}`, nextRow);
      mutateData((current) => replaceSettingInData(current, entity, nextRow));
      refreshInBackground(refresh);
      setEditing(null);
      toast.success("Tanım güncellendi.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Tanım güncellenemedi.");
    }
  }

  async function deleteDefinition() {
    if (!deleteTarget) return;
    try {
      await apiDelete(`/api/settings/${entity}/${deleteTarget.id}`);
      mutateData((current) => removeSettingFromData(current, entity, deleteTarget.id));
      refreshInBackground(refresh);
      setDeleteTarget(null);
      toast.success("Tanım silindi.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Tanım silinemedi.");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="ERP" title={map.title} description={map.desc} icon={map.icon} action={kind === "warehouses" || kind === "partners" ? <button className={primaryButton} onClick={() => setOpen(true)}><Plus className="size-4" />Tanım ekle</button> : <Link className={primaryButton} href="/settings"><Plus className="size-4" />Tanım ekle</Link>} />
      <DataTable rows={rows} columns={[
        { header: "Ad", cell: (row) => row.name },
        ...(kind === "warehouses" ? [{ header: "Tip", cell: (row: NamedEntity) => ("kind" in row ? warehouseKindLabels[row.kind as WarehouseEntity["kind"]] : "-") }] : []),
        ...(kind === "partners" ? [{ header: "Tip", cell: (row: NamedEntity) => ("type" in row ? partnerTypeLabels[row.type as Partner["type"]] : "-") }] : []),
        ...(kind === "warehouses" ? [{ header: "Bakiye", cell: (row: NamedEntity) => formatKg(data.warehouseBalances.filter(b => b.warehouseId === row.id).reduce((sum, b) => sum + Number(b.quantity || 0), 0)) }] : []),
        { header: "Durum", cell: () => <StatusBadge tone="green">Aktif</StatusBadge> },
        ...(manageDefinitions ? [{
          header: "İşlem",
          className: "text-right",
          cell: (row: NamedEntity) => (
            <div className="flex flex-wrap justify-end gap-2">
              {kind === "warehouses" ? (
                <button className="rounded-none border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700" onClick={() => setDetailWarehouse(row)} type="button">Detay</button>
              ) : null}
              <button
                className="rounded-none border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700"
                onClick={() =>
                  setEditing({
                    id: row.id,
                    name: row.name,
                    kind: "kind" in row ? (row.kind as WarehouseEntity["kind"]) : undefined,
                    type: "type" in row ? (row.type as Partner["type"]) : undefined,
                  })
                }
                type="button"
              >
                Düzenle
              </button>
              <button className={dangerButton} onClick={() => setDeleteTarget({ id: row.id, name: row.name })} type="button">
                Sil
              </button>
            </div>
          ),
        }] : []),
      ]} />
      <FormDrawer open={open} title="Tanım ekle" onClose={() => setOpen(false)}>
        {kind === "warehouses" ? <SettingForm entity="warehouses" extra="warehouse" onDone={() => setOpen(false)} /> : null}
        {kind === "partners" ? <SettingForm entity="partners" extra="partner" onDone={() => setOpen(false)} /> : null}
      </FormDrawer>
      <FormDrawer open={Boolean(editing)} title="Tanım düzenle" onClose={() => setEditing(null)}>
        <form className="grid gap-4" onSubmit={updateDefinition}>
          <label className="space-y-2">
            <span className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Ad</span>
            <input className="w-full rounded-none border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50" name="name" defaultValue={editing?.name} required />
          </label>
          {kind === "warehouses" ? (
            <label className="space-y-2">
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Tip</span>
              <select className="w-full rounded-none border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50" name="kind" defaultValue={editing?.kind ?? "RAW"}>
                <option value="YARN">İplik deposu</option>
                <option value="KNITTER">Fasoncu deposu</option>
                <option value="RAW">Ham kumaş deposu</option>
                <option value="DYEHOUSE">Boyahane deposu</option>
                <option value="FINISHED">Mamül depo</option>
                <option value="STORE">Satış mağazası</option>
                <option value="WASTE">Fire deposu</option>
              </select>
            </label>
          ) : null}
          {kind === "partners" ? (
            <label className="space-y-2">
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Tip</span>
              <select className="w-full rounded-none border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50" name="type" defaultValue={editing?.type ?? "SUPPLIER"}>
                <option value="KNITTER">Fason örmeci</option>
                <option value="DYEHOUSE">Boyahane</option>
                <option value="SUPPLIER">Satıcı</option>
                <option value="CUSTOMER">Müşteri</option>
              </select>
            </label>
          ) : null}
          <button className={primaryButton} type="submit">Güncelle</button>
        </form>
      </FormDrawer>
      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Tanım silinsin mi?"
        description={`${deleteTarget?.name ?? "Bu tanım"} başka bir sipariş, stok, üretim veya hareket kaydında kullanılıyorsa silinmeyecek.`}
        onClose={() => setDeleteTarget(null)}
        onConfirm={deleteDefinition}
      />
      <FormDrawer open={Boolean(detailWarehouse)} title={`${detailWarehouse?.name} Bakiye Detayları`} onClose={() => setDetailWarehouse(null)}>
        <div className="space-y-4">
          {data.warehouseBalances.filter(b => b.warehouseId === detailWarehouse?.id && Number(b.quantity) > 0).length === 0 ? (
            <p className="rounded-none bg-slate-50 p-4 text-sm text-slate-500">Bu depoda stok bulunmuyor.</p>
          ) : (
            data.warehouseBalances.filter(b => b.warehouseId === detailWarehouse?.id && Number(b.quantity) > 0).map(b => {
              const stock = data.stockCards.find(s => s.id === b.stockId);
              return (
                <div key={b.stockId} className="flex items-center justify-between rounded-none border border-slate-200 bg-white p-4">
                  <div>
                    <p className="font-semibold text-slate-900">{stock?.code}</p>
                    <p className="text-xs text-slate-500">{stock?.name}</p>
                  </div>
                  <p className="font-bold text-emerald-600">{formatKg(b.quantity)}</p>
                </div>
              );
            })
          )}
        </div>
      </FormDrawer>
    </div>
  );
}

export function RolesSecurityPage() {
  const { data, refresh } = useErpData();
  const [roleOpen, setRoleOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);

  async function remove(endpoint: string, success: string) {
    try {
      await apiDelete(endpoint);
      refreshInBackground(refresh);
      toast.success(success);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "İşlem tamamlanamadı.");
    }
  }

  const roleColumns: Column<Role>[] = [
    { header: "Rol", cell: (row) => <span className="font-semibold text-slate-950">{row.name}</span> },
    { header: "Açıklama", cell: (row) => row.description || "-" },
    { header: "Yetki", cell: (row) => `${row.permissions.length} izin` },
    { header: "Durum", cell: (row) => <StatusBadge tone={row.isActive ? "green" : "slate"}>{row.isActive ? "Aktif" : "Pasif"}</StatusBadge> },
    { header: "İşlem", cell: (row) => <button className={dangerButton} onClick={() => remove(`/api/roles/${row.id}`, "Rol silindi.")} type="button">Sil</button> },
  ];

  const userColumns: Column<UserProfile>[] = [
    { header: "Kullanıcı", cell: (row) => <span className="font-semibold text-slate-950">{row.fullName}</span> },
    { header: "E-posta", cell: (row) => row.email },
    { header: "Rol", cell: (row) => data.roles.find((role) => role.id === row.roleId)?.name ?? "-" },
    { header: "Durum", cell: (row) => <StatusBadge tone={row.isActive ? "green" : "slate"}>{row.isActive ? "Aktif" : "Pasif"}</StatusBadge> },
    { header: "İşlem", cell: (row) => <button className={dangerButton} onClick={() => remove(`/api/users/${row.id}`, "Kullanıcı pasife alındı.")} type="button">Pasifleştir</button> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Güvenlik"
        title="Roller ve Kullanıcı Yetkileri"
        description="Rol tanımları, izin setleri ve kullanıcı profil eşleştirmeleri Supabase PostgreSQL üzerinde tutulur."
        icon={Users}
        action={<><button className={primaryButton} onClick={() => setRoleOpen(true)}><Plus className="size-4" />Rol</button><button className={primaryButton} onClick={() => setUserOpen(true)}><Plus className="size-4" />Kullanıcı</button></>}
      />
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard title="Rol sayısı" value={String(data.roles.length)} helper="Aktif yetki grupları" icon={KeyRound} />
        <StatCard title="Kullanıcı profili" value={String(data.userProfiles.length)} helper="Auth ile eşleşecek profil kayıtları" icon={Users} tone="green" />
        <StatCard title="Güvenlik notu" value="Hazır" helper="RLS/Auth enforcement aşamasına temel oluşturur" icon={Settings} tone="amber" />
      </div>
      <DataTable rows={data.roles} columns={roleColumns} />
      <DataTable rows={data.userProfiles} columns={userColumns} />
      <FormDrawer open={roleOpen} title="Rol tanımı" onClose={() => setRoleOpen(false)}><RoleForm /></FormDrawer>
      <FormDrawer open={userOpen} title="Kullanıcı profili" onClose={() => setUserOpen(false)}><UserProfileForm /></FormDrawer>
    </div>
  );
}

const settingGroups = [
  {
    href: "/settings/project",
    title: "Proje Ayarları",
    description: "Menü davranışı, modal pozisyonu ve bildirim tercihleri gibi UI/UX ayarları.",
    items: ["Görünüm", "Modal", "Bildirim"],
  },
  {
    href: "/settings/fabric-types",
    title: "Kumaş cinsleri",
    description: "Süprem, iki iplik, üç iplik, kaşkorse, ribana gibi üretim aileleri.",
    items: ["Süprem", "İki iplik", "Üç iplik", "Kaşkorse", "Ribana"],
  },
  {
    href: "/settings/colors",
    title: "Renkler",
    description: "Sipariş, stok kartı ve boyahane final kartlarında kullanılacak renk kataloğu.",
    items: ["Ekru", "Siyah", "Lacivert", "Gri melanj"],
  },
  {
    href: "/settings/yarn-counts",
    title: "Ne numaraları",
    description: "YM kartından MM karta taşınacak iplik numarası standardı.",
    items: ["20/1", "24/1", "30/1", "36/1", "40/1"],
  },
  {
    href: "/settings/yarn-types",
    title: "İplik cinsleri",
    description: "Open End, Ring, Compact gibi iplik cinsi kodları stok adında kontrollü kullanılır.",
    items: ["OE - Open End", "RING", "COMPACT"],
  },
  {
    href: "/settings/process-types",
    title: "Boyahane işlem türleri",
    description: "Reaktif boya, şardon, sanfor, apre, yıkama gibi proses tanımları.",
    items: ["Reaktif boya", "Şardon", "Sanfor", "Apre"],
  },
  {
    href: "/settings/warehouses",
    title: "Depolar",
    description: "Merkez iplik, fasoncu, ham kumaş, boyahane, mamül, satış ve fire depoları.",
    items: ["Merkez iplik", "Fasoncu", "Ham kumaş", "Mamül"],
  },
  {
    href: "/partners",
    title: "Cari ve üretim ortakları",
    description: "Fason örmeci, boyahane, satıcı/tedarikçi ve müşteri kartları.",
    items: ["Fason örmeci", "Boyahane", "Satıcı", "Müşteri"],
  },
  {
    href: "/settings/prefix-counters",
    title: "Prefix ve sayaçlar",
    description: "YM, MM, IP, LYC, POLY, sipariş no ve parti no otomatik sayaçları.",
    items: ["YM", "MM", "IP", "LYC", "POLY"],
  },
  {
    href: "/settings/roles",
    title: "Roller ve güvenlik",
    description: "Admin, üretim, depo, satın alma, satış ve raporlama yetki altyapısı.",
    items: ["Admin", "Üretim", "Depo", "Satın alma"],
  },
  {
    href: "/settings/data-control",
    title: "Veri Kontrol",
    description: "Veri bütünlüğü kontrolü, yetim kayıt temizliği ve bakiyeleri yeniden oluşturma araçları.",
    items: ["Bütünlük", "Temizlik", "Rebuild"],
  },
  {
    href: "/settings/roadmap",
    title: "Gelişim günlüğü",
    description: "Tamamlanan geliştirmeler, bekleyen işler, önem sırası ve proje ilerleme özeti.",
    items: ["Timeline", "Roadmap", "Öncelik", "İlerleme"],
  },
];

const startSteps = [
  "Kumaş cinsi, renk, Ne numarası ve boyahane işlem türlerini tanımla.",
  "Depoları ve cari kartları aç: fason örmeci, boyahane, satıcı ve müşteri.",
  "IP, LYC ve POLY hammadde stok kartlarını oluştur.",
  "Satıcı siparişi gir ve gelen hammaddeler için mal kabul yap.",
  "Müşteri siparişi oluştur; sistem YM/MM stok eşleşmesini hazırlar.",
  "Ham üretim, boyahane, transfer ve satış akışını parti üzerinden takip et.",
];

const defaultCounterDefinitions = [
  { key: "stock:YM", prefix: "YM", title: "Ham kumaş stok kodu", sample: "YM-000001" },
  { key: "stock:MM", prefix: "MM", title: "Mamül kumaş stok kodu", sample: "MM-000001" },
  { key: "stock:IP", prefix: "IP", title: "İplik stok kodu", sample: "IP-000001" },
  { key: "stock:LYC", prefix: "LYC", title: "Likra stok kodu", sample: "LYC-000001" },
  { key: "stock:POLY", prefix: "POLY", title: "Polyester stok kodu", sample: "POLY-000001" },
  { key: `order:${new Date().getFullYear()}`, prefix: "MS", title: "Müşteri sipariş no", sample: "MS-260001" },
  { key: `purchaseOrder:${new Date().getFullYear()}`, prefix: "SS", title: "Satıcı sipariş no", sample: "SS-260001" },
  { key: `party:${new Date().getFullYear()}`, prefix: String(new Date().getFullYear()).slice(-2), title: "Parti no", sample: "260001" },
];

export function PrefixCountersPage() {
  const { data } = useErpData();
  const counters = defaultCounterDefinitions.map((definition) => {
    const current = data.counters.find((counter) => counter.key === definition.key || counter.prefix === definition.prefix);
    return {
      ...definition,
      currentValue: current?.currentValue ?? 0,
      updatedAt: current?.updatedAt,
    };
  });
  const rawMaterialStocks = data.stockCards.filter((stock) => ["IP", "LYC", "POLY"].includes(stock.type));
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Ayarlar"
        title="Prefix ve Sayaçlar"
        description="Stok kodları, sipariş numaraları ve parti numaraları transaction-safe sayaç sistemiyle otomatik üretilir."
        icon={KeyRound}
        action={<Link className={primaryButton} href="/stocks"><Plus className="size-4" />Hammadde stok kartı aç</Link>}
      />
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard title="Aktif sayaç" value={String(data.counters.length)} helper="Kullanıldıkça oluşur" icon={KeyRound} />
        <StatCard title="Hammadde kartı" value={String(rawMaterialStocks.length)} helper="IP/LYC/POLY alış için gerekli" icon={Boxes} tone="green" />
        <StatCard title="Kod kuralı" value="Otomatik" helper="Manuel kod girişi gerekmez" icon={CheckCircle2} tone="blue" />
        <StatCard title="Alış ekranı" value="Hazır" helper="Hızlı alış veya mal kabul" icon={PackageCheck} tone="amber" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {counters.map((counter) => (
          <div key={counter.key} className="premium-card rounded-none p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{counter.prefix}</p>
                <h2 className="mt-2 font-semibold text-slate-950">{counter.title}</h2>
              </div>
              <StatusBadge tone={counter.currentValue > 0 ? "green" : "slate"}>{counter.currentValue > 0 ? "Aktif" : "Bekliyor"}</StatusBadge>
            </div>
            <div className="mt-5 rounded-none bg-slate-50 p-4">
              <p className="text-xs font-semibold text-slate-400">Son sıra</p>
              <p className="mt-1 text-2xl font-bold text-slate-950">{counter.currentValue}</p>
              <p className="mt-2 text-xs text-slate-500">Örnek: {counter.sample}</p>
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-500">
              {counter.updatedAt ? `Son güncelleme: ${formatDate(counter.updatedAt)}` : "İlk kayıt açıldığında sayaç otomatik oluşur."}
            </p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Link href="/settings/project" className="premium-card group rounded-none p-6 transition-all hover:border-blue-500 hover:shadow-xl">
          <div className="flex items-center gap-4">
            <div className="grid size-12 place-items-center rounded-none bg-blue-50 text-blue-600 transition-colors group-hover:bg-blue-600 group-hover:text-white">
              <BarChart3 className="size-6" />
            </div>
            <div>
              <h2 className="font-bold text-slate-950">Proje Ayarları</h2>
              <p className="text-sm text-slate-500">Menü modu, modal pozisyonu ve renkleri özelleştirin.</p>
            </div>
          </div>
        </Link>
        
        <div className="premium-card rounded-none p-5">
          <h2 className="font-semibold text-slate-950">Hammadde girişi nasıl yapılır?</h2>
          <div className="mt-4 space-y-3">
            {[
              "Önce Stok Kartları ekranında IP, LYC veya POLY tipinde hammadde stok kartı aç.",
              "Stok kodunu sistem otomatik üretir; prefix veya sıra numarası elle yazılmaz.",
              "Sonra Alış İşlemleri ekranında Hızlı alış ile siparişsiz giriş yap veya Satıcı Siparişleri üzerinden açık sipariş oluşturup Mal kabul gir.",
              "Gelen kg seçilen depoya stok hareketi olarak işlenir ve tüm kullanıcılarda realtime yenilenir.",
            ].map((step, index) => (
              <div key={step} className="flex gap-3 rounded-none bg-slate-50 p-4">
                <div className="grid size-8 shrink-0 place-items-center rounded-full bg-white text-sm font-bold text-blue-700 shadow-sm">{index + 1}</div>
                <p className="text-sm leading-6 text-slate-600">{step}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const developmentTimeline = [
  {
    date: "2026-05-05",
    title: "Hareket Bazlı ERP Mimarisi ve Tam İzlenebilirlik",
    summary: "Stok takibi sabit işlem sırası mantığından çıkarılarak hareket bazlı ilişki (parent/source movement) modeline taşındı.",
    items: [
      "Lot ve Parti takibi için stock_movements tablosuna ilişkisel alanlar (parent_movement_id, source_movement_id) eklendi.",
      "Bağımlılık kontrolü tarih/parti eşleşmesinden, gerçek tüketim (movement linking) kontrolüne geçirildi.",
      "Silme işlemlerinde hatalı 'yetersiz stok' uyarısı veren akış, 'Ters Hareket' mantığıyla düzeltildi.",
      "Satın alma -> Transfer -> Ham Üretim -> Boyahane -> Satış akışı boyunca Lot/Parti bazında geriye dönük tam izlenebilirlik sağlandı.",
      "Kullanıcı mesajları teknik SQL hatalarından arındırılarak anlaşılır Türkçe ve dd.MM.yyyy formatına çekildi.",
      "Operasyonel veriler temizlenerek sistem bu yeni sağlam mimari üzerinden sıfırlandı.",
    ],
  },
  {
    date: "2026-05-04",
    title: "Modernizasyon ve Veri Bütünlüğü",
    summary: "UI modernizasyonu, dinamik menü/modal ayarları, stok isimlendirme standartı ve envanter doğrulaması tamamlandı.",
    items: [
      "Tüm formlar 4 sütunlu yüksek yoğunluklu ızgara yapısına geçirildi ve keskin köşeli tasarıma geçildi.",
      "Proje Ayarları ekranı eklendi: Menü modu (static/collapsible) ve Modal pozisyonu kullanıcı tercihine bağlandı.",
      "İplik (IP) ve Kumaş (YM/MM) için yeni isimlendirme şablonu (Ne Renk vb.) devreye alındı.",
      "Üretim fişlerinde depo bakiyesi kontrolü zorunlu hale getirilerek aşım engellendi.",
      "Mevcut stokların yeni isimlendirme şablonuna toplu geçişi (migration) yapıldı.",
    ],
  },
  {
    date: "2026-05-02",
    title: "Premium ERP MVP iskeleti kuruldu",
    summary: "Next.js App Router, TypeScript, Tailwind, Supabase PostgreSQL/Drizzle şeması ve Vercel deploy yapısı hazırlandı.",
    items: [
      "Dashboard, sipariş, stok, depo, transfer, üretim, parti, satış, rapor ve ayarlar sayfa iskeletleri oluşturuldu.",
      "ERP ilişkisel tablo modeli, migration dosyaları ve seed veri akışı kurgulandı.",
      "YM/MM/IP/LYC/POLY stok kod sistemi, parti numarası ve sayaç mantığı temellendirildi.",
      "Mobil bottom nav, desktop sidebar/header ve premium açık tema tasarım dili başlatıldı.",
    ],
  },
  {
    date: "2026-05-03",
    title: "Canlı veritabanı, realtime ve gerçek işlem katmanı bağlandı",
    summary: "Mock akıştan gerçek Supabase PostgreSQL API katmanına geçildi; kayıtlar tüm cihazlarda anlık yenilenecek hale getirildi.",
    items: [
      "Sipariş oluşturma, otomatik YM/MM stok eşleştirme, stok kartı, ayarlar, rol, kullanıcı ve satış kayıtları veritabanına bağlandı.",
      "Supabase pooler için prepared statement hataları giderildi, connection ayarları ve refresh performansı iyileştirildi.",
      "Ayarlar, depo, cari, stok, satıcı siparişi ve müşteri siparişi için kontrollü düzenle/sil akışları eklendi.",
      "Müşteri siparişlerine çoklu filtre, akıllı ifade filtresi ve stok/kumaş/renk/Ne bazlı gruplama görünümü eklendi.",
      "Transfer, ham üretim ve boyahane üretiminde yanlış kayıtlar için ters stok hareketiyle iptal mekanizması eklendi.",
      "Satın alma tarafında hızlı IP/LYC/POLY alışı, siparişe bağlı mal kabul ve ayrı Alış İşlemleri menüsü oluşturuldu.",
    ],
  },
];

const completedMilestones = [
  "Hareket bazlı (parent/source movement) stok ilişkilendirme altyapısı",
  "Lot bazlı hammadde ve Parti bazlı kumaş tam izlenebilirliği",
  "Geriye dönük bağımlılık doğrulama ve engelleme sistemi",
  "Transaction-safe operasyonel veri temizliği ve sıfırlama",
  "Anlaşılır Türkçe hata mesajları ve dd.MM.yyyy tarih formatı",
  "Çalışan Next.js + TypeScript + Tailwind proje iskeleti",
  "Supabase PostgreSQL, Supabase Auth ve Realtime altyapısı",
  "Dashboard KPI, grafik, satın alma ve fire özetleri",
  "Müşteri siparişi, otomatik YM/MM stok açma ve sipariş detayları",
  "Ham üretim, boyahane üretimi, transfer ve sevkiyat kayıtları",
  "Satıcı siparişleri, kısmi mal kabul ve siparişsiz hızlı hammadde alışı",
];

const pendingRoadmap = [
  {
    priority: "P0",
    title: "Üretim reçetesi ve çok kalemli tüketim",
    description: "Ham üretimde birden fazla IP/LYC/POLY kalemini oran bazlı tüketme, kalan ipleri üretimlere dağıtma ve fasoncu depo kapanış mutabakatını detaylandırma.",
  },
  {
    priority: "P1",
    title: "Gelişmiş rapor ve pivot ekranları",
    description: "Stok, parti, fasoncu, boyahane, satış ve satın alma listelerine grup bazlı toplamlar, dönem filtreleri ve kaydedilebilir rapor görünümleri eklenmeli.",
  },
  {
    priority: "P2",
    title: "Tamir Üretimi (Uzun Vadeli)",
    description: "Hatalı çıkan veya boyadan dönen ürünlerin tamir süreçlerinin, fire ve maliyet etkileriyle beraber sistemde takip edilmesi.",
  },
];

export function RoadmapPage() {
  const completion = 85;
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Ayarlar"
        title="Gelişim Günlüğü ve Yol Haritası"
        description="Projede yapılan geliştirmeler gün bazında izlenir; bekleyen işler önem sırasına göre takip edilir."
        icon={BookOpen}
      />

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard title="Proje ilerleme" value={`%${completion}`} helper="Müşteri demosu için güçlü MVP seviyesinde" icon={CheckCircle2} tone="green" />
        <StatCard title="Tamamlanan başlık" value={String(completedMilestones.length)} helper="Ana ERP modülleri ve altyapı" icon={BookOpen} />
        <StatCard title="Bekleyen öncelik" value={String(pendingRoadmap.length)} helper="Üretimleşme ve derinleşme işleri" icon={SlidersHorizontal} tone="amber" />
        <StatCard title="Son güncelleme" value="04.05.2026" helper="Gün bazında takip edilir" icon={Settings} tone="blue" />
      </div>

      <div className="premium-card rounded-none p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold text-slate-950">Tamamlanma özeti</h2>
            <p className="mt-1 text-sm text-slate-500">MVP müşteriye gösterilebilir seviyede; derin üretim reçetesi, yetki/RLS ve dosya yönetimi sıradaki ana işler.</p>
          </div>
          <StatusBadge tone="green">{`%${completion}`}</StatusBadge>
        </div>
        <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-blue-600" style={{ width: `${completion}%` }} />
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-2">
          {completedMilestones.map((item) => (
            <div key={item} className="flex items-center gap-2 rounded-none bg-slate-50 px-4 py-3 text-sm text-slate-600">
              <CheckCircle2 className="size-4 text-green-600" />
              {item}
            </div>
          ))}
        </div>
      </div>

      <div className="premium-card rounded-none p-5">
        <h2 className="font-semibold text-slate-950">Tarih ağacı</h2>
        <p className="mt-1 text-sm text-slate-500">Ana tarih yanında günün en büyük değişikliği koyu başlık olarak görünür; altındaki ince satırlar o günün diğer kayıtlarıdır.</p>
        <div className="mt-6 space-y-8">
          {developmentTimeline.map((entry, index) => (
            <div key={entry.date} className="grid gap-4 md:grid-cols-[160px_1fr]">
              <div className="flex md:justify-end">
                <div className="rounded-none bg-blue-50 px-4 py-3 text-sm font-bold text-blue-700">{formatDate(entry.date)}</div>
              </div>
              <div className="relative border-l-2 border-blue-100 pl-6">
                <div className="absolute -left-[9px] top-2 size-4 rounded-full border-4 border-white bg-blue-600 shadow" />
                <div className="rounded-none border border-slate-100 bg-white p-5 shadow-sm">
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div>
                      <h3 className="text-lg font-bold text-slate-950">{entry.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-slate-500">{entry.summary}</p>
                    </div>
                    <StatusBadge tone={index === developmentTimeline.length - 1 ? "green" : "blue"}>{entry.items.length} geliştirme</StatusBadge>
                  </div>
                  <div className="mt-4 space-y-2">
                    {entry.items.map((item) => (
                      <div key={item} className="rounded-none bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">{item}</div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="premium-card rounded-none p-5">
        <h2 className="font-semibold text-slate-950">Bekleyen geliştirmeler</h2>
        <p className="mt-1 text-sm text-slate-500">Tarihe bağlı değil; önem sırasına göre ele alınacak işler. Yeni geliştirme tamamlandığında bu sayfada ilgili madde işaretlenir.</p>
        <div className="mt-5 space-y-3">
          {pendingRoadmap.map((item) => (
            <div key={item.title} className="flex flex-col gap-3 rounded-none border border-slate-100 bg-white p-4 shadow-sm md:flex-row md:items-start">
              <StatusBadge tone={item.priority === "P0" ? "red" : item.priority === "P1" ? "amber" : "blue"}>{item.priority}</StatusBadge>
              <div>
                <h3 className="font-semibold text-slate-950">{item.title}</h3>
                <p className="mt-1 text-sm leading-6 text-slate-500">{item.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function SettingsGuidePage({ section }: { section?: "fabric-types" | "colors" | "yarn-counts" | "yarn-types" | "process-types" | "warehouses" }) {
  const { data, refresh, mutateData } = useErpData();
  const [editing, setEditing] = useState<EditableSetting | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EditableSetting | null>(null);
  const [detailWarehouse, setDetailWarehouse] = useState<WarehouseEntity | null>(null);
  const activeGroup = section
    ? settingGroups.find((group) => group.href.endsWith(section))
    : undefined;
  const settingConfig = section
    ? ({
        "fabric-types": { entity: "fabricTypes", rows: data.fabricTypes, extra: undefined },
        colors: { entity: "colors", rows: data.colors, extra: undefined },
        "yarn-counts": { entity: "yarnCounts", rows: data.yarnCounts, extra: undefined },
        "yarn-types": { entity: "yarnTypes", rows: data.yarnTypes, extra: undefined },
        "process-types": { entity: "processTypes", rows: data.processTypes, extra: undefined },
        warehouses: { entity: "warehouses", rows: data.warehouses, extra: "warehouse" },
      } as const)[section]
    : undefined;

  async function deleteDefinition() {
    if (!settingConfig || !deleteTarget) return;
    try {
      await apiDelete(`/api/settings/${settingConfig.entity}/${deleteTarget.id}`);
      mutateData((current) => removeSettingFromData(current, settingConfig.entity, deleteTarget.id));
      refreshInBackground(refresh);
      setDeleteTarget(null);
      toast.success("Tanım silindi.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Tanım silinemedi.");
    }
  }

  async function updateDefinition(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!settingConfig || !editing) return;
    const form = new FormData(event.currentTarget);
    try {
      const nextRow = {
        id: editing.id,
        code: String(form.get("code") ?? editing.code ?? ""),
        name: String(form.get("name") ?? editing.name),
        isActive: form.get("isActive") === "on",
        kind: (form.get("kind") ?? editing.kind) as WarehouseEntity["kind"] | undefined,
      };
      await apiPatch(`/api/settings/${settingConfig.entity}/${editing.id}`, nextRow);
      mutateData((current) => replaceSettingInData(current, settingConfig.entity, nextRow));
      setEditing(null);
      refreshInBackground(refresh);
      toast.success("Tanım güncellendi.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Tanım güncellenemedi.");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Ayarlar"
        title={activeGroup?.title ?? "Kurulum ve Tanım Merkezi"}
        description={activeGroup?.description ?? "Boş ERP kurulumunda önce temel tanımları tamamlayın; sipariş, stok, üretim ve rapor ekranları bu sözlükleri kullanır."}
        icon={Settings}
        action={<Link className={primaryButton} href="/orders/new"><Plus className="size-4" />İlk siparişi aç</Link>}
      />

      {!activeGroup ? (
        <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="premium-card rounded-none p-5">
            <div className="flex items-center gap-3">
              <div className="grid size-11 place-items-center rounded-none bg-blue-600 text-white">
                <BookOpen className="size-5" />
              </div>
              <div>
                <h2 className="font-semibold text-slate-950">Projeye nereden başlamalı?</h2>
                <p className="text-sm text-slate-500">Önerilen canlıya geçiş sırası</p>
              </div>
            </div>
            <div className="mt-5 space-y-3">
              {startSteps.map((step, index) => (
                <div key={step} className="flex gap-3 rounded-none bg-slate-50 p-4">
                  <div className="grid size-8 shrink-0 place-items-center rounded-full bg-white text-sm font-bold text-blue-700 shadow-sm">{index + 1}</div>
                  <p className="text-sm leading-6 text-slate-600">{step}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <StatCard title="Zorunlu tanımlar" value="8 grup" helper="Siparişten önce tamamlanmalı" icon={SlidersHorizontal} />
            <StatCard title="Kod sistemi" value="YM/MM/IP" helper="Sayaçlar transaction mantığıyla tasarlandı" icon={KeyRound} tone="green" />
            <StatCard title="Boş veri" value="Hazır" helper="Demo kayıtlar temizlendi" icon={CheckCircle2} tone="green" />
            <StatCard title="Yetki altyapısı" value="Planlandı" helper="Supabase Auth ile genişletilecek" icon={Users} tone="amber" />
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {(activeGroup ? [activeGroup] : settingGroups).map((group) => (
          <Link key={group.title} href={group.href} className="premium-card rounded-none p-5 transition hover:-translate-y-0.5 hover:shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-slate-950">{group.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">{group.description}</p>
              </div>
              <div className="grid size-10 shrink-0 place-items-center rounded-none bg-blue-50 text-blue-600">
                <Settings className="size-4" />
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {group.items.map((item) => (
                <StatusBadge key={item} tone="blue">{item}</StatusBadge>
              ))}
            </div>
          </Link>
        ))}
      </div>

      {settingConfig ? (
        <div className="premium-card rounded-none p-5">
          <h2 className="font-semibold text-slate-950">Veritabanı tanımları</h2>
          <p className="mt-2 text-sm text-slate-500">Bu alandaki kayıtlar doğrudan Supabase PostgreSQL tablolarına yazılır ve tüm cihazlarda anlık yenilenir.</p>
          <div className="mt-5">
            <SettingForm entity={settingConfig.entity} extra={settingConfig.extra} />
          </div>
          <div className="mt-5 divide-y divide-slate-100">
            {settingConfig.rows.length === 0 ? (
              <p className="rounded-none bg-slate-50 p-4 text-sm text-slate-500">Henüz tanım yok.</p>
            ) : (
              settingConfig.rows.map((row) => (
                <div key={row.id} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-semibold text-slate-950">{row.name}</p>
                    {"code" in row ? <p className="text-xs text-slate-400">{String(row.code)}</p> : null}
                    {"kind" in row ? <p className="text-xs text-slate-400">{warehouseKindLabels[row.kind as WarehouseEntity["kind"]]}</p> : null}
                    {section === "warehouses" ? (
                      <p className="mt-1 text-xs font-semibold text-emerald-600">Bakiye: {formatKg(data.warehouseBalances.filter(b => b.warehouseId === row.id).reduce((sum, b) => sum + Number(b.quantity || 0), 0))}</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {section === "warehouses" ? (
                      <button className="rounded-none border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700" onClick={() => setDetailWarehouse(row as WarehouseEntity)} type="button">Detay</button>
                    ) : null}
                    <button
                      className="rounded-none border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700"
                      onClick={() => setEditing({ id: row.id, name: row.name, code: "code" in row ? String(row.code) : undefined, isActive: row.isActive, kind: "kind" in row ? row.kind : undefined })}
                      type="button"
                    >
                      Düzenle
                    </button>
                    <button className="rounded-none border border-rose-100 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700" onClick={() => setDeleteTarget({ id: row.id, name: row.name })} type="button">
                      Sil
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
          <FormDrawer open={Boolean(editing)} title="Tanım düzenle" onClose={() => setEditing(null)}>
            <form className="grid gap-4" onSubmit={updateDefinition}>
              <label className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Ad</span>
                <input className="w-full rounded-none border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50" name="name" defaultValue={editing?.name} required />
              </label>
              {section === "yarn-types" ? (
                <>
                  <label className="space-y-2">
                    <span className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Kod</span>
                    <input className="w-full rounded-none border border-slate-200 bg-white px-4 py-3 text-sm uppercase outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50" name="code" defaultValue={editing?.code} required />
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-600">
                    <input defaultChecked={editing?.isActive !== false} name="isActive" type="checkbox" />
                    Aktif
                  </label>
                </>
              ) : null}
              {section === "warehouses" ? (
                <label className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Tip</span>
                  <select className="w-full rounded-none border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50" name="kind" defaultValue={editing?.kind ?? "RAW"}>
                    <option value="YARN">İplik deposu</option>
                    <option value="KNITTER">Fasoncu deposu</option>
                    <option value="RAW">Ham kumaş deposu</option>
                    <option value="DYEHOUSE">Boyahane deposu</option>
                    <option value="FINISHED">Mamül depo</option>
                    <option value="STORE">Satış mağazası</option>
                    <option value="WASTE">Fire deposu</option>
                  </select>
                </label>
              ) : null}
              <button className={primaryButton} type="submit">Güncelle</button>
            </form>
          </FormDrawer>
          <ConfirmModal
            open={Boolean(deleteTarget)}
            title="Tanım silinsin mi?"
            description={`${deleteTarget?.name ?? "Bu tanım"} stok, sipariş, üretim, transfer veya hareket kayıtlarında kullanılıyorsa silinmeyecek.`}
            onClose={() => setDeleteTarget(null)}
            onConfirm={deleteDefinition}
          />
          <FormDrawer open={Boolean(detailWarehouse)} title={`${detailWarehouse?.name} Bakiye Detayları`} onClose={() => setDetailWarehouse(null)}>
            <div className="space-y-4">
              {data.warehouseBalances.filter(b => b.warehouseId === detailWarehouse?.id && Number(b.quantity) > 0).length === 0 ? (
                <p className="rounded-none bg-slate-50 p-4 text-sm text-slate-500">Bu depoda stok bulunmuyor.</p>
              ) : (
                data.warehouseBalances.filter(b => b.warehouseId === detailWarehouse?.id && Number(b.quantity) > 0).map(b => {
                  const stock = data.stockCards.find(s => s.id === b.stockId);
                  const party = data.parties.find(p => p.id === b.partyId);
                  return (
                    <div key={`${b.stockId}-${b.partyId || 'noparty'}`} className="flex items-center justify-between rounded-none border border-slate-100 p-4 shadow-sm">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{stock?.code} - {stock?.name}</p>
                        {party && <p className="mt-1 text-xs text-slate-500">Parti: {party.partyNo}</p>}
                      </div>
                      <p className="text-sm font-bold text-slate-700">{formatKg(Number(b.quantity))}</p>
                    </div>
                  );
                })
              )}
            </div>
          </FormDrawer>
        </div>
      ) : null}

      <div className="premium-card rounded-none p-5">
        <h2 className="font-semibold text-slate-950">Kullanım notu</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Önce ayar sözlüklerini girin. Sonra hammadde stok kartlarını ve satıcı siparişlerini açın. Müşteri siparişinde aynı özelliklerde YM/MM stok yoksa sistem yeni kod üretim mantığıyla kart açacak şekilde kurgulandı. Ham üretim ilk parti numarasını oluşturur; boyahane, transfer ve satış hareketleri bu parti üzerinden izlenir.
        </p>
      </div>
    </div>
  );
}










export function ProjectSettingsPage() {
  const { data, refresh, mutateData } = useErpData();
  const settings = data.uiSettings;
  const [loading, setLoading] = useState(false);

  async function updateSettings(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const payload = {
      menuMode: formData.get("menuMode"),
      submenuDefaultState: formData.get("submenuDefaultState"),
      modalPosition: formData.get("modalPosition"),
      modalPositionMobile: formData.get("modalPositionMobile"),
      notificationsEnabled: formData.get("notificationsEnabled") === "on",
      maxNotificationCount: Number(formData.get("maxNotificationCount")),
      showCriticalStock: formData.get("showCriticalStock") === "on",
      showDelayedOrders: formData.get("showDelayedOrders") === "on",
      showProductionAlerts: formData.get("showProductionAlerts") === "on",
      sidebarGroupBg: formData.get("sidebarGroupBg"),
      sidebarGroupText: formData.get("sidebarGroupText"),
      notificationModules: settings.notificationModules,
    };

    try {
      await apiPatch("/api/settings/ui", payload as any);
      mutateData((prev) => ({ ...prev, uiSettings: { ...prev.uiSettings, ...payload } as any }));
      await refresh();
      toast.success("Ayarlar başarıyla kaydedildi ve uygulandı.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ayarlar güncellenemedi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6" key={JSON.stringify(settings)}>
      <PageHeader
        eyebrow="Ayarlar"
        title="Proje Ayarları"
        description="Sistemin görsel davranışı ve kullanıcı deneyimi tercihlerini buradan yönetebilirsiniz."
        icon={SlidersHorizontal}
      />

      <form onSubmit={updateSettings} className="grid gap-6 lg:grid-cols-2">
        <div className="premium-card rounded-3xl p-6 space-y-6">
          <div className="flex items-center gap-3 border-b border-slate-50 pb-4">
            <div className="grid size-10 place-items-center rounded-none bg-blue-50 text-blue-600">
              <Layout className="size-5" />
            </div>
            <h2 className="font-bold text-slate-950">Menü ve Görünüm</h2>
          </div>
          
          <div className="grid gap-4">
            <Field label="Menü Modu">
              <select name="menuMode" defaultValue={settings.menuMode} className={inputClass}>
                <option value="static">Sabit Liste (Klasik)</option>
                <option value="collapsible">Gruplanmış / Açılır-Kapanır</option>
              </select>
            </Field>
            
            <Field label="Alt Menü Varsayılan Durumu">
              <select name="submenuDefaultState" defaultValue={settings.submenuDefaultState} className={inputClass}>
                <option value="open">Açık</option>
                <option value="closed">Kapalı</option>
              </select>
            </Field>
          </div>
        </div>

        <div className="premium-card rounded-3xl p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-50 pb-4">
            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-none bg-orange-50 text-orange-600">
                <Layout className="size-5" />
              </div>
              <h2 className="font-bold text-slate-950">Menü Grupları Tasarımı</h2>
            </div>
            <button 
              type="button" 
              onClick={() => {
                const bgInput = document.getElementsByName("sidebarGroupBg")[0] as HTMLInputElement;
                const textInput = document.getElementsByName("sidebarGroupText")[0] as HTMLInputElement;
                if (bgInput) bgInput.value = "#f8fafc";
                if (textInput) textInput.value = "#64748b";
              }}
              className="text-xs font-bold text-blue-600 hover:underline"
            >
              Varsayılana Dön
            </button>
          </div>
          
          <div className="grid gap-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Grup Arkaplan Rengi">
                <div className="flex gap-2">
                  <input type="color" name="sidebarGroupBg" defaultValue={settings.sidebarGroupBg || "#f8fafc"} className="size-11 rounded-none border-none p-1 shadow-sm" />
                  <input type="text" value={settings.sidebarGroupBg || "#f8fafc"} readOnly className={cn(inputClass, "flex-1 font-mono text-xs")} />
                </div>
              </Field>
              <Field label="Grup Yazı Rengi">
                <div className="flex gap-2">
                  <input type="color" name="sidebarGroupText" defaultValue={settings.sidebarGroupText || "#64748b"} className="size-11 rounded-none border-none p-1 shadow-sm" />
                  <input type="text" value={settings.sidebarGroupText || "#64748b"} readOnly className={cn(inputClass, "flex-1 font-mono text-xs")} />
                </div>
              </Field>
            </div>

            <div className="space-y-3">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Premium Renk Paletleri</p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {[
                  { name: "Varsayılan", bg: "#f8fafc", text: "#64748b" },
                  { name: "Orange", bg: "#fff7ed", text: "#ea580c" },
                  { name: "Ocean", bg: "#eff6ff", text: "#2563eb" },
                  { name: "Forest", bg: "#f0fdf4", text: "#16a34a" },
                  { name: "Rose", bg: "#fff1f2", text: "#e11d48" },
                  { name: "Indigo", bg: "#eef2ff", text: "#4f46e5" },
                ].map((palette) => (
                  <button
                    key={palette.name}
                    type="button"
                    onClick={() => {
                      const bgInput = document.getElementsByName("sidebarGroupBg")[0] as HTMLInputElement;
                      const textInput = document.getElementsByName("sidebarGroupText")[0] as HTMLInputElement;
                      if (bgInput) bgInput.value = palette.bg;
                      if (textInput) textInput.value = palette.text;
                    }}
                    className="flex flex-col items-center gap-1.5 p-2 rounded-none border border-slate-100 hover:border-blue-200 hover:shadow-sm transition-all group"
                  >
                    <div className="size-8 rounded-full border border-slate-100 shadow-inner" style={{ backgroundColor: palette.bg }} />
                    <span className="text-[10px] font-bold text-slate-500 group-hover:text-slate-900">{palette.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="premium-card rounded-3xl p-6 space-y-6">
          <div className="flex items-center gap-3 border-b border-slate-50 pb-4">
            <div className="grid size-10 place-items-center rounded-none bg-amber-50 text-amber-600">
              <Maximize2 className="size-5" />
            </div>
            <h2 className="font-bold text-slate-950">Modal Pozisyonu</h2>
          </div>
          
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Masaüstü Pozisyonu">
              <select name="modalPosition" defaultValue={settings.modalPosition} className={inputClass}>
                <option value="right">Sağ (Slide)</option>
                <option value="left">Sol (Slide)</option>
                <option value="center">Orta (Geniş)</option>
                <option value="top">Üst (Drop)</option>
                <option value="bottom">Alt (Rise)</option>
              </select>
            </Field>
            
            <Field label="Mobil Pozisyonu">
              <select name="modalPositionMobile" defaultValue={settings.modalPositionMobile} className={inputClass}>
                <option value="bottom">Alt (Drawer)</option>
                <option value="top">Üst</option>
                <option value="right">Sağ</option>
                <option value="left">Sol</option>
              </select>
            </Field>
          </div>
        </div>

        <div className="premium-card rounded-3xl p-6 space-y-6 lg:col-span-2">
          <div className="flex items-center gap-3 border-b border-slate-50 pb-4">
            <div className="grid size-10 place-items-center rounded-none bg-rose-50 text-rose-600">
              <Bell className="size-5" />
            </div>
            <h2 className="font-bold text-slate-950">Bildirim Sistemi</h2>
          </div>
          
          <div className="grid gap-6 md:grid-cols-3">
            <div className="space-y-4">
              <label className="flex items-center gap-3 p-3 rounded-none bg-slate-50 transition-all hover:bg-white hover:ring-1 hover:ring-slate-200">
                <input type="checkbox" name="notificationsEnabled" defaultChecked={settings.notificationsEnabled} className="size-5 rounded-none border-slate-300 text-blue-600 focus:ring-blue-500" />
                <span className="text-sm font-semibold text-slate-700">Bildirimler Aktif</span>
              </label>
              <Field label="Maksimum Bildirim Sayısı">
                <input type="number" name="maxNotificationCount" defaultValue={settings.maxNotificationCount} className={inputClass} />
              </Field>
            </div>
            
            <div className="md:col-span-2 grid gap-3 sm:grid-cols-3">
              {[
                { name: "showCriticalStock", label: "Kritik Stok Uyarısı" },
                { name: "showDelayedOrders", label: "Geciken Siparişler" },
                { name: "showProductionAlerts", label: "Üretim Sinyalleri" },
              ].map((opt) => (
                <label key={opt.name} className="flex flex-col gap-3 p-4 rounded-none border border-slate-100 bg-white transition-all hover:border-blue-200 hover:shadow-md group">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400 group-hover:text-blue-600">{opt.label}</span>
                    <input type="checkbox" name={opt.name} defaultChecked={(settings as any)[opt.name]} className="size-5 rounded-none border-slate-300 text-blue-600 focus:ring-blue-500" />
                  </div>
                  <p className="text-[10px] text-slate-400 leading-relaxed">Gerçek zamanlı hesaplama ile panele yansıtılır.</p>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 flex justify-end">
          <button disabled={loading} className={cn(primaryButton, "px-12 py-4 text-base shadow-xl shadow-blue-100")} type="submit">
            {loading ? "Kaydediliyor..." : "Ayarları Uygula"}
          </button>
        </div>
      </form>
    </div>
  );
}

export function DataControlPage() {
  const [loading, setLoading] = useState<string | null>(null);
  const [checkResult, setCheckResult] = useState<{ success: boolean; message?: string; error?: string; details?: any[] } | null>(null);

  async function runAction(action: "rebuild" | "clean" | "check") {
    setLoading(action);
    setCheckResult(null);
    try {
      const res = await fetch("/api/integrity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const result = await res.json();
      if (action === "check") {
        setCheckResult(result.data);
      } else {
        if (result.success) {
          toast.success(result.data.message);
        } else {
          toast.error(result.error || "İşlem başarısız.");
        }
      }
    } catch (error) {
      toast.error("Sunucu hatası oluştu.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Sistem"
        title="Veri Kontrol ve Bütünlük"
        description="Veritabanı tutarsızlıklarını tespit edin, yetim kayıtları temizleyin ve hareketlerden bakiyeleri yeniden oluşturun."
        icon={ShieldCheck}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="premium-card rounded-none p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-none bg-blue-50 text-blue-600">
              <Search className="size-5" />
            </div>
            <h2 className="font-bold text-slate-950">Bütünlük Kontrolü</h2>
          </div>
          <p className="text-sm leading-6 text-slate-500">
            Tüm operasyonel tabloları tarayarak başlığı olmayan hareketleri veya hareketi olmayan başlık kayıtlarını bulur.
          </p>
          <button
            onClick={() => runAction("check")}
            disabled={!!loading}
            className="w-full rounded-none border border-blue-200 bg-white py-3 text-sm font-bold text-blue-600 hover:bg-blue-50 transition-colors"
          >
            {loading === "check" ? "Kontrol ediliyor..." : "Hemen Kontrol Et"}
          </button>
        </div>

        <div className="premium-card rounded-none p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-none bg-amber-50 text-amber-600">
              <RefreshCcw className="size-5" />
            </div>
            <h2 className="font-bold text-slate-950">Bakiyeleri Yenile</h2>
          </div>
          <p className="text-sm leading-6 text-slate-500">
            Tüm depo ve stok bakiyelerini, gerçek stok hareketleri (stock_movements) üzerinden sıfırdan hesaplayarak günceller.
          </p>
          <button
            onClick={() => {
              if (confirm("Tüm bakiyeler hareketlerden yeniden hesaplanacak. Emin misiniz?")) {
                runAction("rebuild");
              }
            }}
            disabled={!!loading}
            className="w-full rounded-none border border-amber-200 bg-white py-3 text-sm font-bold text-amber-600 hover:bg-amber-50 transition-colors"
          >
            {loading === "rebuild" ? "Yenileniyor..." : "Bakiyeleri Yeniden Oluştur"}
          </button>
        </div>

        <div className="premium-card rounded-none p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-none bg-rose-50 text-rose-600">
              <Trash2 className="size-5" />
            </div>
            <h2 className="font-bold text-slate-950">Yetim Veri Temizliği</h2>
          </div>
          <p className="text-sm leading-6 text-slate-500">
            Hareketi olmayan siparişsiz üretimleri, sevkiyatları ve mal kabulleri kalıcı olarak siler. Bu işlem geri alınamaz.
          </p>
          <button
            onClick={() => {
              if (confirm("Tüm yetim kayıtlar ve bunlara bağlı hatalı özetler temizlenecek. Emin misiniz?")) {
                runAction("clean");
              }
            }}
            disabled={!!loading}
            className="w-full rounded-none border border-rose-200 bg-white py-3 text-sm font-bold text-rose-600 hover:bg-rose-50 transition-colors"
          >
            {loading === "clean" ? "Temizleniyor..." : "Sistemi Temizle"}
          </button>
        </div>
      </div>

      {checkResult && (
        <div className={cn("premium-card rounded-none p-6", checkResult.success ? "bg-emerald-50 border-emerald-200" : "bg-rose-50 border-rose-200")}>
          <div className="flex items-start gap-4">
            {checkResult.success ? (
              <CheckCircle2 className="size-6 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="size-6 text-rose-600 shrink-0" />
            )}
            <div>
              <h3 className={cn("font-bold", checkResult.success ? "text-emerald-900" : "text-rose-900")}>
                {checkResult.success ? "Sorun Bulunmadı" : "Tutarsızlık Tespit Edildi"}
              </h3>
              {!checkResult.success && checkResult.details && checkResult.details.length > 0 && (
                <div className="mt-4 space-y-4">
                  {checkResult.details.map((d, idx) => (
                    <div key={idx} className="space-y-2">
                      <p className="text-xs font-bold text-rose-900 uppercase tracking-wider">{d.label} ({d.count} adet):</p>
                      <div className="overflow-hidden border border-rose-200 bg-white shadow-sm">
                        <table className="w-full text-left text-[10px] border-collapse">
                          <thead className="bg-rose-100 text-rose-900 font-bold">
                            <tr>
                              <th className="p-2 border-b border-rose-200">Tarih</th>
                              <th className="p-2 border-b border-rose-200">ID / Referans</th>
                              <th className="p-2 border-b border-rose-200">Açıklama</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-rose-50">
                            {d.items.slice(0, 10).map((item: any, i: number) => (
                              <tr key={i} className="hover:bg-rose-50 transition-colors text-rose-800">
                                <td className="p-2 whitespace-nowrap">{item.date ? new Date(item.date).toLocaleDateString('tr-TR') : '-'}</td>
                                <td className="p-2 font-mono font-bold">{item.id}</td>
                                <td className="p-2 italic">{item.info || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {d.items.length > 10 && (
                          <div className="p-2 text-center bg-rose-50 text-[10px] text-rose-600 font-bold border-t border-rose-200">
                            ...ve {d.items.length - 10} kayıt daha
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {!checkResult.success && (
                <button
                  onClick={() => runAction("clean")}
                  className="mt-4 rounded-none bg-rose-600 px-6 py-2 text-sm font-bold text-white hover:bg-rose-700"
                >
                  Otomatik Onar
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="premium-card rounded-none p-6">
        <h2 className="font-bold text-slate-950">Neden Veri Kontrolü?</h2>
        <div className="mt-4 grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-slate-700">1. Silme İşlemleri</h3>
            <p className="text-xs leading-5 text-slate-500">
              Eski mimaride bazı silme işlemleri özet tabloları (parti özeti, sipariş bakiye vb.) güncellemiyor olabilir. Bu araç özetleri hareketlere göre senkronize eder.
            </p>
          </div>
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-slate-700">2. Transaction Hataları</h3>
            <p className="text-xs leading-5 text-slate-500">
              İnternet kesintisi veya sunucu zaman aşımı nedeniyle yarıda kalan işlemler "yetim veri" oluşturabilir. Temizlik aracı bunları güvenle ayıklar.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
