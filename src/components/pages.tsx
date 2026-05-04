"use client";

import Link from "next/link";
import { BarChart3, BookOpen, Boxes, CheckCircle2, Download, Factory, KeyRound, PackageCheck, PackagePlus, Plus, Settings, ShoppingCart, SlidersHorizontal, Truck, Users, Warehouse } from "lucide-react";
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
import { formatDate, formatKg, formatPercent, wasteTone, normalizeItems } from "@/lib/utils";
import { supabase } from "@/lib/supabase";

const primaryButton = "inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-100";
const dangerButton = "rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700";

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
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(payload),
    signal: requestSignal(),
  });
  const result = (await response.json()) as { ok: boolean; error?: string };
  if (!response.ok || !result.ok) throw new Error(result.error ?? "İşlem tamamlanamadı.");
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
      data.orders.filter((order) => {
        if (filters.status !== "ALL" && order.status !== filters.status) return false;
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
    [data, filters],
  );
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
  const columns: Column<Order>[] = [
    { header: "Sipariş", cell: (row) => <Link className="font-semibold text-blue-700" href={`/orders/${row.id}`}>{row.orderNo}</Link> },
    { header: "Müşteri", cell: (row) => row.customerName },
    { header: "Kumaş", cell: (row) => getName(data.fabricTypes, row.fabricTypeId) },
    { header: "Renk", cell: (row) => getName(data.colors, row.colorId) },
    { header: "Kg", cell: (row) => formatKg(row.quantityKg) },
    { header: "Durum", cell: (row) => <StatusBadge tone={statusTone(row.status)}>{row.status}</StatusBadge> },
    { header: "İşlem", className: "text-right", cell: (row) => <div className="flex justify-end gap-2"><button className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700" onClick={() => setEditing(row)} type="button">Düzenle</button><button className={dangerButton} onClick={() => setDeleteTarget(row)} type="button">Sil</button></div> },
  ];
  const filterControls = (
    <div className="grid gap-3 md:grid-cols-2">
      <select className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700 outline-none" value={groupMode} onChange={(event) => setGroupMode(event.target.value as OrderGroupMode)}>
        <option value="none">Gruplama yok</option>
        <option value="ymStock">YM stok adına göre grupla</option>
        <option value="mmStock">MM stok adına göre grupla</option>
        <option value="fabricType">Kumaş cinsine göre grupla</option>
        <option value="color">Renge göre grupla</option>
        <option value="yarnCount">Ne numarasına göre grupla</option>
        <option value="customer">Müşteriye göre grupla</option>
        <option value="status">Duruma göre grupla</option>
      </select>
      <select className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none" value={filters.status} onChange={(event) => setOrderFilter("status", event.target.value)}>
        <option value="ALL">Tüm durumlar</option>
        {["Taslak", "Onaylandı", "İplik Bekliyor", "Örmede", "Ham Geldi", "Boyahanede", "Mamül Hazır", "Sevk Edildi", "Kapandı", "İptal"].map((status) => <option key={status}>{status}</option>)}
      </select>
      <select className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none" value={filters.customer} onChange={(event) => setOrderFilter("customer", event.target.value)}>
        <option value="">Tüm müşteriler</option>
        {customerNames.map((customer) => <option key={customer}>{customer}</option>)}
      </select>
      <select className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none" value={filters.fabricTypeId} onChange={(event) => setOrderFilter("fabricTypeId", event.target.value)}>
        <option value="ALL">Tüm kumaşlar</option>
        {data.fabricTypes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      <select className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none" value={filters.colorId} onChange={(event) => setOrderFilter("colorId", event.target.value)}>
        <option value="ALL">Tüm renkler</option>
        {data.colors.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      <select className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none" value={filters.yarnCountId} onChange={(event) => setOrderFilter("yarnCountId", event.target.value)}>
        <option value="ALL">Tüm Ne numaraları</option>
        {data.yarnCounts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      <select className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none" value={filters.ymStockId} onChange={(event) => setOrderFilter("ymStockId", event.target.value)}>
        <option value="ALL">Tüm YM stokları</option>
        {ymStocks.map((stock) => <option key={stock.id} value={stock.id}>{stock.code} - {stock.name}</option>)}
      </select>
      <select className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none" value={filters.mmStockId} onChange={(event) => setOrderFilter("mmStockId", event.target.value)}>
        <option value="ALL">Tüm MM stokları</option>
        {mmStocks.map((stock) => <option key={stock.id} value={stock.id}>{stock.code} - {stock.name}</option>)}
      </select>
      <input className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none md:col-span-2" placeholder="Akıllı filtre: bekleyen boyahanede lacivert" value={filters.smart} onChange={(event) => setOrderFilter("smart", event.target.value)} />
      <label className="space-y-1 text-xs font-semibold text-slate-400">
        Sipariş başlangıç
        <input className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-normal text-slate-700 outline-none" type="date" value={filters.dateFrom} onChange={(event) => setOrderFilter("dateFrom", event.target.value)} />
      </label>
      <label className="space-y-1 text-xs font-semibold text-slate-400">
        Sipariş bitiş
        <input className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-normal text-slate-700 outline-none" type="date" value={filters.dateTo} onChange={(event) => setOrderFilter("dateTo", event.target.value)} />
      </label>
      <label className="space-y-1 text-xs font-semibold text-slate-400">
        Termin başlangıç
        <input className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-normal text-slate-700 outline-none" type="date" value={filters.dueFrom} onChange={(event) => setOrderFilter("dueFrom", event.target.value)} />
      </label>
      <label className="space-y-1 text-xs font-semibold text-slate-400">
        Termin bitiş
        <input className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-normal text-slate-700 outline-none" type="date" value={filters.dueTo} onChange={(event) => setOrderFilter("dueTo", event.target.value)} />
      </label>
    </div>
  );
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Siparişler" title="Müşteri Siparişleri" description="Kumaş üretim talepleri, otomatik YM/MM stok eşleşmesi ve üretim durum takibi." icon={ShoppingCart} action={<button className={primaryButton} onClick={() => setOpen(true)}><Plus className="size-4" />Yeni sipariş</button>} />
      <div className="premium-card rounded-2xl p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold text-slate-950">Sipariş görünümü</h2>
            <p className="mt-1 text-sm text-slate-500">{filteredOrders.length} sipariş listeleniyor.</p>
          </div>
          <div className="flex gap-2">
            <button className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-100" onClick={() => setFiltersOpen(true)} type="button">
              <SlidersHorizontal className="size-4" />
              Filtrele
            </button>
            {(activeFilterChips.length > 0) ? (
              <button className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600" onClick={() => { setFilters(emptyOrderFilters); setGroupMode("none"); }} type="button">
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
      <DataTable rows={filteredOrders} columns={columns} groupBy={orderGroupBy} searchPlaceholder="Liste içinde hızlı ara" getSearchText={(row) => [row.orderNo, row.customerName, row.status, getName(data.fabricTypes, row.fabricTypeId), getName(data.colors, row.colorId), getName(data.yarnCounts, row.yarnCountId), getName(data.stockCards, row.ymStockId), getName(data.stockCards, row.mmStockId), row.quantityKg].join(" ")} />
      <FormDrawer open={filtersOpen} title="Sipariş filtreleri" onClose={() => setFiltersOpen(false)}>
        <div className="space-y-4">
          <p className="text-sm leading-6 text-slate-500">Durum, tarih, müşteri, stok ve akıllı ifade ile listeyi daraltın. Seçimler sayfada chip olarak görünür.</p>
          {filterControls}
          <div className="grid gap-3 sm:grid-cols-2">
            <button className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600" onClick={() => { setFilters(emptyOrderFilters); setGroupMode("none"); }} type="button">Filtreleri temizle</button>
            <button className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-100" onClick={() => setFiltersOpen(false)} type="button">Sonuçları göster</button>
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
  if (!order) return <DataTable rows={[]} columns={[]} />;
  const party = data.parties.find((item) => item.orderId === order.id);
  return (
    <div className="space-y-6">
      <PageHeader eyebrow={order.orderNo} title={order.customerName} description={`${getName(data.fabricTypes, order.fabricTypeId)} · ${getName(data.colors, order.colorId)} · ${formatKg(order.quantityKg)}`} icon={ShoppingCart} action={<StatusBadge tone={statusTone(order.status)}>{order.status}</StatusBadge>} />
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard title="Termin" value={formatDate(order.dueDate)} helper="Planlanan teslim" icon={ShoppingCart} />
        <StatCard title="YM stok" value={getName(data.stockCards, order.ymStockId)} helper="Ham kumaş referansı" icon={Boxes} tone="green" />
        <StatCard title="MM stok" value={getName(data.stockCards, order.mmStockId)} helper="Mamül kumaş referansı" icon={Boxes} tone="green" />
        <StatCard title="Parti" value={party?.partyNo ?? "-"} helper="Satışa kadar izlenir" icon={Factory} tone="amber" />
      </div>
      <PartyTimeline items={party?.timeline ?? []} />
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
    { header: "İşlem", className: "text-right", cell: (row) => <div className="flex justify-end gap-2"><button className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700" onClick={() => setEditing(row)} type="button">Düzenle</button><button className={dangerButton} onClick={() => setDeleteTarget(row)} type="button">Sil</button></div> },
  ];
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Satın alma" title="Satıcı Siparişleri" description="IP, LYC ve POLY için açık satıcı siparişleri, termin ve bekleyen kg takibi." icon={PackagePlus} action={<button className={primaryButton} onClick={() => setOrderOpen(true)}><Plus className="size-4" />Satıcı siparişi</button>} />
      <div className="premium-card rounded-2xl p-5 mb-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-semibold text-slate-950">Satıcı Sipariş Filtreleri</h2>
            <p className="mt-1 text-sm text-slate-500">Durum ve tedarikçiye göre daraltın.</p>
          </div>
          <button className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600" onClick={() => setFilters({ status: "ALL", supplierId: "ALL" })} type="button">Filtreleri temizle</button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <select className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none" value={filters.status} onChange={(e) => setFilter("status", e.target.value)}>
            <option value="ALL">Tüm durumlar</option><option value="Taslak">Taslak</option><option value="Açık">Açık</option><option value="Kısmi Geldi">Kısmi Geldi</option><option value="Tamamlandı">Tamamlandı</option><option value="İptal">İptal</option>
          </select>
          <select className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none" value={filters.supplierId} onChange={(e) => setFilter("supplierId", e.target.value)}>
            <option value="ALL">Tüm Satıcılar</option>
            {uniqueSuppliers.map(id => <option key={id} value={id}>{getName(data.partners, id)}</option>)}
          </select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {filteredOrders.map((order) => (
          <div key={order.id} className="premium-card rounded-2xl p-5">
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
          <button className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700" onClick={() => setEditingReceipt(row)} type="button">Düzenle</button>
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
      <div className="premium-card rounded-2xl p-5 mb-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-semibold text-slate-950">Alış İşlemleri Filtreleri</h2>
            <p className="mt-1 text-sm text-slate-500">İşlem türü ve depoya göre daraltın.</p>
          </div>
          <button className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600" onClick={() => setFilters({ type: "ALL", warehouseId: "ALL" })} type="button">Filtreleri temizle</button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <select className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none" value={filters.type} onChange={(e) => setFilter("type", e.target.value)}>
            <option value="ALL">Tüm türler</option><option value="Hızlı">Hızlı alış</option><option value="Siparişe Bağlı">Siparişe bağlı</option>
          </select>
          <select className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none" value={filters.warehouseId} onChange={(e) => setFilter("warehouseId", e.target.value)}>
            <option value="ALL">Tüm depolar</option>
            {data.warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 mb-6">
        <div className="premium-card rounded-2xl p-5">
          <h2 className="font-semibold text-slate-950">Hızlı alış</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">Sipariş açmadan IP, LYC veya POLY stoğunu doğrudan seçilen depoya alır. Sistem tamamlanmış satıcı siparişi, mal kabul ve stok girişi kaydını birlikte oluşturur.</p>
          <button className="mt-4 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white" onClick={() => setDirectOpen(true)} type="button">Hızlı alış başlat</button>
        </div>
        <div className="premium-card rounded-2xl p-5">
          <h2 className="font-semibold text-slate-950">Siparişe bağlı alış</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">Önceden açılmış satıcı siparişlerine kısmi veya tam mal kabul girer. Gelen ve kalan kg otomatik hesaplanır.</p>
          <button className="mt-4 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white" onClick={() => setReceiptOpen(true)} type="button">Mal kabul gir</button>
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
    { header: "İşlem", className: "text-right", cell: (row) => <div className="flex justify-end gap-2"><button className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700" onClick={() => setDetailTarget(row)} type="button">Detay</button><button className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700" onClick={() => setEditing(row)} type="button">Düzenle</button><button className={dangerButton} onClick={() => setActionTarget(row)} type="button">Sil/Pasif</button></div> },
  ];
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Stok" title="Stok Kartları" description="YM/MM partili izlenir; IP/LYC/POLY satın alma ve üretim tüketimiyle takip edilir." icon={Boxes} action={<button className={primaryButton} onClick={() => setOpen(true)}><Plus className="size-4" />Stok kartı</button>} />
      <div className="premium-card rounded-2xl p-5 mb-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-semibold text-slate-950">Stok Kartı Filtreleri</h2>
            <p className="mt-1 text-sm text-slate-500">Stok tipi ve durumuna göre daraltın.</p>
          </div>
          <button className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600" onClick={() => setFilters({ type: "ALL", isActive: "Aktif" })} type="button">Filtreleri temizle</button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <select className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none" value={filters.type} onChange={(e) => setFilter("type", e.target.value)}>
            <option value="ALL">Tüm tipler</option><option value="IP">İplik (IP)</option><option value="YM">Yarımamül (YM)</option><option value="MM">Mamül (MM)</option><option value="LYC">Likra (LYC)</option><option value="POLY">Polyester (POLY)</option>
          </select>
          <select className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none" value={filters.isActive} onChange={(e) => setFilter("isActive", e.target.value)}>
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
            <div className="rounded-2xl border border-slate-200 p-5 shadow-sm">
              <h3 className="font-semibold text-slate-900">Bu stok kartına ne yapılsın?</h3>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                <b>Sil:</b> Sadece hiç hareket görmemiş kartlar silinebilir.<br/>
                <b>Pasife Çek:</b> Hareket gören kartlar silinemez, ancak listelerde çıkmaması için pasife çekilebilir.
              </p>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <button className="w-full rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 hover:bg-rose-100" onClick={handleDelete}>
                  Tamamen Sil
                </button>
                <button className="w-full rounded-2xl bg-amber-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-amber-200 hover:bg-amber-700" onClick={handleDeactivate}>
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
            className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${activeTab === tab ? "bg-blue-600 text-white shadow-lg shadow-blue-100" : "border border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:text-blue-700"}`}
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
          <div className="premium-card rounded-2xl p-5">
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
            { header: "Lot", cell: (row) => row.lotNo },
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
            { header: "Lot", cell: (row) => row.lotNo },
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
  if (!party) return <DataTable rows={[]} columns={[]} />;
  const order = data.orders.find((item) => item.id === party.orderId);
  return (
    <div className="space-y-6">
      <PageHeader eyebrow={`Parti ${party.partyNo}`} title={order?.customerName ?? "Parti detayı"} description="Sipariş, iplik tüketimi, fasoncu, boyahane, satış ve kalan kg zinciri." icon={Factory} action={<StatusBadge tone={statusTone(party.status)}>{party.status}</StatusBadge>} />
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard title="Ham üretim" value={formatKg(party.rawProducedKg)} helper={`${formatKg(party.rawConsumedKg)} iplik tüketildi`} icon={Factory} />
        <StatCard title="Ham fire" value={formatPercent(party.rawWastePercent)} helper={formatKg(party.rawWasteKg)} icon={BarChart3} tone="red" />
        <StatCard title="Boyahane giriş" value={formatKg(party.dyehouseInputKg)} helper="Ham kumaş sevki" icon={Truck} tone="amber" />
        <StatCard title="Mamül" value={formatKg(party.finishedKg)} helper={`${formatPercent(party.dyehouseWastePercent)} boyahane fire`} icon={Boxes} tone="green" />
      </div>
      <PartyTimeline items={party?.timeline ?? []} />
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
      <div className="premium-card rounded-2xl p-5">
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

export function ProductionPage({ type }: { type: "raw" | "dyehouse" }) {
  const { data, refresh } = useErpData();
  const [open, setOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<RawProduction | DyehouseProduction | null>(null);
  const [filters, setFilters] = useState({ status: "ALL", dateFrom: "", dateTo: "" });
  const setFilter = (key: string, value: string) => setFilters((curr) => ({ ...curr, [key]: value }));
  const isRaw = type === "raw";
  const cancelledIds = useMemo(() => new Set(data.stockMovements.filter((movement) => movement.referenceType === (isRaw ? "production_raw_cancel" : "production_dyehouse_cancel")).map((movement) => movement.referenceId)), [data.stockMovements, isRaw]);
  const filteredRaw = useMemo(() => data.productionRaw.filter((row) => {
    if (filters.status !== "ALL") {
      const isCancelled = cancelledIds.has(row.id);
      if (filters.status === "İptal" && !isCancelled) return false;
      if (filters.status === "Aktif" && isCancelled) return false;
    }
    if (filters.dateFrom && row.date < filters.dateFrom) return false;
    if (filters.dateTo && row.date > filters.dateTo) return false;
    return true;
  }), [data.productionRaw, filters, cancelledIds]);
  const filteredDyehouse = useMemo(() => data.productionDyehouse.filter((row) => {
    if (filters.status !== "ALL") {
      const isCancelled = cancelledIds.has(row.id);
      if (filters.status === "İptal" && !isCancelled) return false;
      if (filters.status === "Aktif" && isCancelled) return false;
    }
    if (filters.dateFrom && row.date < filters.dateFrom) return false;
    if (filters.dateTo && row.date > filters.dateTo) return false;
    return true;
  }), [data.productionDyehouse, filters, cancelledIds]);
  async function cancelProduction() {
    if (!cancelTarget) return;
    try {
      await apiDelete(`/api/production/${isRaw ? "raw" : "dyehouse"}/${cancelTarget.id}`);
      refreshInBackground(refresh);
      toast.success(isRaw ? "Ham üretim iptal edildi ve stoklar geri alındı." : "Boyahane üretimi iptal edildi ve stoklar geri alındı.");
      setCancelTarget(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Üretim kaydı iptal edilemedi.");
    }
  }
  const rawColumns: Column<RawProduction>[] = [
    { header: "Tarih", cell: (row) => formatDate(row.date) },
    { header: "Sipariş", cell: (row) => data.orders.find((order) => order.id === row.orderId)?.orderNo ?? "-" },
    { header: "Parti", cell: (row) => data.parties.find((party) => party.id === row.partyId)?.partyNo ?? "-" },
    { header: "Fasoncu", cell: (row) => getName(data.partners, row.knitterPartnerId) },
    { header: "Ham kg", cell: (row) => formatKg(row.producedRawKg) },
    { header: "Fire", cell: (row) => <StatusBadge tone={wasteTone(row.wastePercent)}>{formatPercent(row.wastePercent)}</StatusBadge> },
    { header: "Durum", cell: (row) => <StatusBadge tone={cancelledIds.has(row.id) ? "red" : "green"}>{cancelledIds.has(row.id) ? "İptal" : "Aktif"}</StatusBadge> },
    { header: "İşlem", className: "text-right", cell: (row) => <div className="flex justify-end"><button className={dangerButton} disabled={cancelledIds.has(row.id)} onClick={() => setCancelTarget(row)} type="button">{cancelledIds.has(row.id) ? "İptal edildi" : "İptal et"}</button></div> },
  ];
  const dyehouseColumns: Column<DyehouseProduction>[] = [
    { header: "Tarih", cell: (row) => formatDate(row.date) },
    { header: "Sipariş", cell: (row) => data.orders.find((order) => order.id === row.orderId)?.orderNo ?? "-" },
    { header: "Parti", cell: (row) => data.parties.find((party) => party.id === row.partyId)?.partyNo ?? "-" },
    { header: "Boyahane", cell: (row) => getName(data.partners, row.dyehousePartnerId) },
    { header: "Giden", cell: (row) => formatKg(row.inputRawKg) },
    { header: "Dönen", cell: (row) => formatKg(row.finishedKg) },
    { header: "Fire", cell: (row) => <StatusBadge tone={wasteTone(row.wastePercent)}>{formatPercent(row.wastePercent)}</StatusBadge> },
    { header: "Durum", cell: (row) => <StatusBadge tone={cancelledIds.has(row.id) ? "red" : "green"}>{cancelledIds.has(row.id) ? "İptal" : "Aktif"}</StatusBadge> },
    { header: "İşlem", className: "text-right", cell: (row) => <div className="flex justify-end"><button className={dangerButton} disabled={cancelledIds.has(row.id)} onClick={() => setCancelTarget(row)} type="button">{cancelledIds.has(row.id) ? "İptal edildi" : "İptal et"}</button></div> },
  ];
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Üretim" title={isRaw ? "Ham Kumaş Üretimi" : "Boyahane Üretimi"} description={isRaw ? "İplik tüketimi, ham kumaş girişi, fire ve fasoncu depo kapanış mutabakatı." : "Ham çıkışı, mamül girişi, finish özellikleri ve boyahane fire hesaplama."} icon={Factory} action={<button className={primaryButton} onClick={() => setOpen(true)}><Plus className="size-4" />Yeni kayıt</button>} />
      
      <div className="premium-card rounded-2xl p-5 mb-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-semibold text-slate-950">Üretim Filtreleri</h2>
            <p className="mt-1 text-sm text-slate-500">Durum ve tarihe göre kayıtları daraltın.</p>
          </div>
          <button className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600" onClick={() => setFilters({ status: "ALL", dateFrom: "", dateTo: "" })} type="button">Filtreleri temizle</button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <select className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none" value={filters.status} onChange={(e) => setFilter("status", e.target.value)}>
            <option value="ALL">Tüm durumlar</option><option value="Aktif">Aktif</option><option value="İptal">İptal</option>
          </select>
          <label className="space-y-1 text-xs font-semibold text-slate-400">Başlangıç<input className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-normal text-slate-700 outline-none" type="date" value={filters.dateFrom} onChange={(e) => setFilter("dateFrom", e.target.value)} /></label>
          <label className="space-y-1 text-xs font-semibold text-slate-400">Bitiş<input className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-normal text-slate-700 outline-none" type="date" value={filters.dateTo} onChange={(e) => setFilter("dateTo", e.target.value)} /></label>
        </div>
      </div>

      {isRaw ? (
        <DataTable rows={filteredRaw} columns={rawColumns} searchPlaceholder="Sipariş, parti, fasoncu veya açıklamada ara" getSearchText={(row) => [data.orders.find((order) => order.id === row.orderId)?.orderNo, data.parties.find((party) => party.id === row.partyId)?.partyNo, getName(data.partners, row.knitterPartnerId), row.description].join(" ")} />
      ) : (
        <DataTable rows={filteredDyehouse} columns={dyehouseColumns} searchPlaceholder="Sipariş, parti, boyahane veya açıklamada ara" getSearchText={(row) => [data.orders.find((order) => order.id === row.orderId)?.orderNo, data.parties.find((party) => party.id === row.partyId)?.partyNo, getName(data.partners, row.dyehousePartnerId), row.description].join(" ")} />
      )}
      <FormDrawer open={open} title={isRaw ? "Ham üretim kaydı" : "Boyahane üretim kaydı"} onClose={() => setOpen(false)}>{isRaw ? <RawProductionForm /> : <DyehouseProductionForm />}</FormDrawer>
      <ConfirmModal
        open={Boolean(cancelTarget)}
        title={isRaw ? "Ham üretim iptal edilsin mi?" : "Boyahane üretimi iptal edilsin mi?"}
        description="Bu işlem stok hareketlerini ters kayıtla geri alır. İlgili stok başka işlemle tüketildiyse iptal engellenir."
        confirmLabel="İptal et"
        tone="danger"
        onClose={() => setCancelTarget(null)}
        onConfirm={cancelProduction}
      />
    </div>
  );
}

export function TransfersPage() {
  const { data, refresh } = useErpData();
  const [open, setOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<Transfer | null>(null);
  const [filters, setFilters] = useState({ status: "ALL", dateFrom: "", dateTo: "" });
  const setFilter = (key: string, value: string) => setFilters((curr) => ({ ...curr, [key]: value }));
  const cancelledTransferIds = useMemo(() => new Set(data.stockMovements.filter((movement) => movement.referenceType === "transfer_cancel").map((movement) => movement.referenceId)), [data.stockMovements]);
  const filteredTransfers = useMemo(() => data.transfers.filter((row) => {
    if (filters.status !== "ALL") {
      const isCancelled = cancelledTransferIds.has(row.id);
      if (filters.status === "İptal" && !isCancelled) return false;
      if (filters.status === "Aktif" && isCancelled) return false;
    }
    if (filters.dateFrom && row.date < filters.dateFrom) return false;
    if (filters.dateTo && row.date > filters.dateTo) return false;
    return true;
  }), [data.transfers, filters, cancelledTransferIds]);
  async function cancelTransferRecord() {
    if (!cancelTarget) return;
    try {
      await apiDelete(`/api/transfers/${cancelTarget.id}`);
      refreshInBackground(refresh);
      toast.success("Transfer iptal edildi ve stoklar kaynak depoya iade edildi.");
      setCancelTarget(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Transfer iptal edilemedi.");
    }
  }
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Depo" title="Depolar Arası Transfer" description="Her depodan her depoya çift taraflı stok hareketi; negatif stok kontrolüne hazır altyapı." icon={Truck} action={<button className={primaryButton} onClick={() => setOpen(true)}><Plus className="size-4" />Onaylı transfer</button>} />

      <div className="premium-card rounded-2xl p-5 mb-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-semibold text-slate-950">Transfer Filtreleri</h2>
            <p className="mt-1 text-sm text-slate-500">Durum ve tarihe göre kayıtları daraltın.</p>
          </div>
          <button className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600" onClick={() => setFilters({ status: "ALL", dateFrom: "", dateTo: "" })} type="button">Filtreleri temizle</button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <select className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none" value={filters.status} onChange={(e) => setFilter("status", e.target.value)}>
            <option value="ALL">Tüm durumlar</option><option value="Aktif">Aktif</option><option value="İptal">İptal</option>
          </select>
          <label className="space-y-1 text-xs font-semibold text-slate-400">Başlangıç<input className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-normal text-slate-700 outline-none" type="date" value={filters.dateFrom} onChange={(e) => setFilter("dateFrom", e.target.value)} /></label>
          <label className="space-y-1 text-xs font-semibold text-slate-400">Bitiş<input className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-normal text-slate-700 outline-none" type="date" value={filters.dateTo} onChange={(e) => setFilter("dateTo", e.target.value)} /></label>
        </div>
      </div>

      <DataTable rows={filteredTransfers} columns={[
        { header: "Tarih", cell: (row) => formatDate(row.date) },
        { header: "Kaynak", cell: (row) => getName(data.warehouses, row.fromWarehouseId) },
        { header: "Hedef", cell: (row) => getName(data.warehouses, row.toWarehouseId) },
        { header: "Miktar", cell: (row) => formatKg(normalizeItems(row.items).reduce((sum, item) => sum + (item.quantity || 0), 0)) },
        { header: "Durum", cell: (row) => <StatusBadge tone={cancelledTransferIds.has(row.id) ? "red" : "green"}>{cancelledTransferIds.has(row.id) ? "İptal" : "Aktif"}</StatusBadge> },
        { header: "İşlem", className: "text-right", cell: (row) => <div className="flex justify-end"><button className={dangerButton} disabled={cancelledTransferIds.has(row.id)} onClick={() => setCancelTarget(row)} type="button">{cancelledTransferIds.has(row.id) ? "İptal edildi" : "İptal et"}</button></div> },
      ]} searchPlaceholder="Kaynak depo, hedef depo veya açıklamada ara" getSearchText={(row) => [getName(data.warehouses, row.fromWarehouseId), getName(data.warehouses, row.toWarehouseId), row.description].join(" ")} />
      <FormDrawer open={open} title="Yeni Transfer" onClose={() => setOpen(false)}><TransferForm /></FormDrawer>
      <ConfirmModal
        open={Boolean(cancelTarget)}
        title="Transfer iptal edilsin mi?"
        description="Bu işlem hedef depodan çıkış, kaynak depoya giriş ters hareketi oluşturur. Hedef depoda yeterli stok yoksa işlem yapılmaz."
        confirmLabel="İptal et"
        tone="danger"
        onClose={() => setCancelTarget(null)}
        onConfirm={cancelTransferRecord}
      />
    </div>
  );
}

export function WasteAnalysisPage() {
  const { data } = useErpData();
  const metrics = getDashboardMetrics(data);
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Fire" title="Fire Analizi Dashboard" description="Sipariş, parti, fasoncu, kumaş cinsi ve dönem bazlı beklenen/gerçek fire takibi." icon={BarChart3} />
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard title="Ham fire ort." value={formatPercent(metrics.avgRawWaste)} helper="0-3 yeşil, 12+ kritik" icon={BarChart3} tone="red" />
        <StatCard title="Boyahane fire ort." value={formatPercent(metrics.avgDyeWaste)} helper="Gönderilen ham kg bazlı" icon={BarChart3} tone="amber" />
        <StatCard title="Fire kg" value={formatKg(metrics.wasteKg)} helper="Ham + boyahane" icon={Factory} tone="red" />
        <StatCard title="Riskli fasoncu" value="2" helper="Eşik üstü üretim ortağı" icon={Users} tone="amber" />
      </div>
      <DataTable rows={data.parties} columns={[
        { header: "Parti", cell: (row) => row.partyNo },
        { header: "Ham fire kg", cell: (row) => formatKg(row.rawWasteKg) },
        { header: "Ham fire %", cell: (row) => <StatusBadge tone={wasteTone(row.rawWastePercent)}>{formatPercent(row.rawWastePercent)}</StatusBadge> },
        { header: "Boya fire kg", cell: (row) => formatKg(row.dyehouseWasteKg) },
        { header: "Boya fire %", cell: (row) => <StatusBadge tone={wasteTone(row.dyehouseWastePercent)}>{formatPercent(row.dyehouseWastePercent)}</StatusBadge> },
      ]} />
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
      <div className="premium-card grid gap-4 rounded-2xl p-4 md:grid-cols-2">
        <label className="space-y-2">
          <span className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Parti durumu</span>
          <select className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="ALL">Tüm durumlar</option>
            {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
        </label>
        <label className="space-y-2">
          <span className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Stok tipi</span>
          <select className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50" value={stockTypeFilter} onChange={(event) => setStockTypeFilter(event.target.value)}>
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
                <button className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700" onClick={() => setDetailWarehouse(row)} type="button">Detay</button>
              ) : null}
              <button
                className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700"
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
            <input className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50" name="name" defaultValue={editing?.name} required />
          </label>
          {kind === "warehouses" ? (
            <label className="space-y-2">
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Tip</span>
              <select className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50" name="kind" defaultValue={editing?.kind ?? "RAW"}>
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
              <select className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50" name="type" defaultValue={editing?.type ?? "SUPPLIER"}>
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
            <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">Bu depoda stok bulunmuyor.</p>
          ) : (
            data.warehouseBalances.filter(b => b.warehouseId === detailWarehouse?.id && Number(b.quantity) > 0).map(b => {
              const stock = data.stockCards.find(s => s.id === b.stockId);
              return (
                <div key={b.stockId} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4">
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
          <div key={counter.key} className="premium-card rounded-2xl p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{counter.prefix}</p>
                <h2 className="mt-2 font-semibold text-slate-950">{counter.title}</h2>
              </div>
              <StatusBadge tone={counter.currentValue > 0 ? "green" : "slate"}>{counter.currentValue > 0 ? "Aktif" : "Bekliyor"}</StatusBadge>
            </div>
            <div className="mt-5 rounded-2xl bg-slate-50 p-4">
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

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="premium-card rounded-2xl p-5">
          <h2 className="font-semibold text-slate-950">Hammadde girişi nasıl yapılır?</h2>
          <div className="mt-4 space-y-3">
            {[
              "Önce Stok Kartları ekranında IP, LYC veya POLY tipinde hammadde stok kartı aç.",
              "Stok kodunu sistem otomatik üretir; prefix veya sıra numarası elle yazılmaz.",
              "Sonra Alış İşlemleri ekranında Hızlı alış ile siparişsiz giriş yap veya Satıcı Siparişleri üzerinden açık sipariş oluşturup Mal kabul gir.",
              "Gelen kg seçilen depoya stok hareketi olarak işlenir ve tüm kullanıcılarda realtime yenilenir.",
            ].map((step, index) => (
              <div key={step} className="flex gap-3 rounded-2xl bg-slate-50 p-4">
                <div className="grid size-8 shrink-0 place-items-center rounded-full bg-white text-sm font-bold text-blue-700 shadow-sm">{index + 1}</div>
                <p className="text-sm leading-6 text-slate-600">{step}</p>
              </div>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link className={primaryButton} href="/stocks"><Plus className="size-4" />Stok kartı aç</Link>
            <Link className={primaryButton} href="/purchases"><PackageCheck className="size-4" />Alış işlemlerine git</Link>
          </div>
        </div>

        <div className="premium-card rounded-2xl p-5">
          <h2 className="font-semibold text-slate-950">Mevcut hammadde stok kartları</h2>
          <div className="mt-4 divide-y divide-slate-100">
            {rawMaterialStocks.length === 0 ? (
              <div className="rounded-2xl bg-amber-50 p-4 text-sm leading-6 text-amber-800">
                Henüz IP/LYC/POLY stok kartı yok. Hammadde alışı yapabilmek için önce stok kartı açılmalı.
              </div>
            ) : (
              rawMaterialStocks.map((stock) => (
                <div key={stock.id} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-semibold text-slate-950">{stock.code}</p>
                    <p className="text-sm text-slate-500">{stock.name}</p>
                  </div>
                  <StatusBadge tone="blue">{stock.type}</StatusBadge>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const developmentTimeline = [
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
  {
    date: "2026-05-04",
    title: "Kullanıcı Deneyimi, Filtreleme ve Esneklik Geliştirmeleri",
    summary: "Sistem geneline gelişmiş filtre mekanizmaları dahil edildi, stok durum yönetimleri iyileştirildi ve alış formlarına esneklik kazandırıldı.",
    items: [
      "Alış İşlemleri, Satıcı Siparişleri, Stok Kartları, Üretim ve Transfer sayfalarına detaylı filtreleme (durum, depo, tip bazlı) kartları eklendi.",
      "Stok kartları için 'Tamamen Sil' ve 'Pasife Çek' işlemleri ayrıldı; hareket gören kartların silinmesi UI ve servis katmanında engellendi.",
      "Mal kabul düzenleme ekranında, Hızlı Alış (Siparişsiz) kayıtları için tedarikçi, stok kartı ve birim fiyat düzenleme yeteneği açıldı.",
      "Ayarlar altındaki Depo Yönetimi sekmesine Depo Bakiye izleme sütunu ve Detaylı Stok Görüntüleme modalı entegre edildi.",
    ],
  },
  {
    date: "2026-05-04",
    title: "Stok ve Üretim Mantığı Revizyonu",
    summary: "En/Gramaj değerleri stok kartlarından arındırılarak sipariş ve üretim bazlı hale getirildi. İkili stok (YM/MM) açma süreci otomatize edildi.",
    items: [
      "Stok kartlarından En/Gramaj alanları kaldırılarak master data sadeleştirildi.",
      "Kumaş stoğu açılırken sistemin otomatik olarak Ham (YM) ve Mamül (MM) kartlarını oluşturması sağlandı.",
      "Üretim (Ham ve Boyahane) süreçlerine En/Gramaj takibi eklendi, bu değerlerin Parti (Lot) bazında saklanması sağlandı.",
      "Sistem genelindeki Türkçe karakter bozulmaları için kalıcı düzeltme scripti uygulandı ve AGENTS.md kuralları güncellendi.",
    ],
  },
  {
    date: "2026-05-04",
    title: "İzlenebilir MVP omurgası derinleştirildi",
    summary: "Sipariş, parti, lot, depo ve stok hareketi ilişkileri kullanıcı ekranlarında daha görünür hale getirildi; hızlı arama ve otomatik doldurma deneyimi güçlendirildi.",
    items: [
      "Transfer, ham üretim, boyahane ve satış formlarında sipariş/parti/lot hızlı arama ile otomatik stok, depo ve parti doldurma akışı genişletildi.",
      "Partide YM ve MM birlikte bulunduğunda kullanıcıya ham kumaş veya mamül kumaş seçeneği sunan seçim davranışı eklendi.",
      "Transfer, üretim ve sevkiyat formlarında seçilen depo + lot + parti kırılımı için anlık kullanılabilir bakiye ve negatif stok uyarısı gösterildi.",
      "Stok detay ekranı Genel, Toplam Bakiye, Depo Bakiyesi, Lot / Parti Bakiyesi, Hareketler, Sipariş Bağlantıları ve Üretim Kullanımı sekmelerine ayrıldı.",
      "Hammadde isimlendirme kuralı kumaş stoklarına da taşındı; YM/MM adları Ne + kumaş cinsi + renk + YM/MM + HAM/MAMÜL + LYC/POLY formatında otomatik oluşur.",
      "Müşteri siparişi ve satış/sevkiyat formlarında müşteri alanı elle yazım yerine Cari/Fasoncu tanımlarındaki müşteri carilerinden seçilecek hale getirildi.",
      "Parti Kaydırma ayrı menü olmaktan çıkarıldı; Partiler ekranındaki butondan açılan modal akışına taşındı.",
      "Mobil müşteri siparişlerinde filtre kartı modal/drawer akışına taşındı; sayfada aktif filtreler chip olarak gösterildi.",
      "Mobil dashboard KPI kartları kompakt iki kolon düzene alındı; sayfayı aşağı iten tek kolon kart yoğunluğu azaltıldı.",
      "Kaynak dosyalardaki kalan mojibake Türkçe karakterler temizlendi; PowerShell kaynaklı encoding riskine karşı Unicode escape tabanlı kontrollü düzeltme uygulandı.",
      "Satıcı siparişi ve mal kabul seçimlerinde sipariş numarası yanında satıcı, stok adı, renk ve kalan kg bilgisi gösterildi.",
      "Satıcı siparişi düzeltme formuna stok seçimi eklendi; stok adı zaten renk/Ne bilgisini taşıdığı için liste ve mal kabul seçimleri stok adına sadeleştirildi.",
    ],
  },
];

const completedMilestones = [
  "Çalışan Next.js + TypeScript + Tailwind proje iskeleti",
  "Supabase PostgreSQL, Supabase Auth ve Realtime altyapısı",
  "Drizzle migration ve ilişkisel ERP tablo modeli",
  "Dashboard KPI, grafik, satın alma ve fire özetleri",
  "Müşteri siparişi, otomatik YM/MM stok açma ve sipariş detayları",
  "Stok kartları, depo tanımları, stok hareketleri ve warehouse balance mantığı",
  "Ham üretim, boyahane üretimi, transfer ve sevkiyat kayıtları",
  "Satıcı siparişleri, kısmi mal kabul ve siparişsiz hızlı hammadde alışı",
  "Ayar tanımları, rol/kullanıcı profili ve kontrollü silme/düzenleme",
  "Gelişmiş raporlar, CSV dışa aktarım, mobil menü ve responsive PWA hissi",
  "Sipariş/parti/lot hızlı arama, stok detay sekmeleri ve anlık bakiye uyarıları",
];

const pendingRoadmap = [
  {
    priority: "P0",
    title: "Üretim reçetesi ve çok kalemli tüketim",
    description: "Ham üretimde birden fazla IP/LYC/POLY kalemini oran bazlı tüketme, kalan ipleri üretimlere dağıtma ve fasoncu depo kapanış mutabakatını detaylandırma.",
  },
  {
    priority: "P0",
    title: "Stok seçim listelerini yalnızca bakiyesi olan kırılımlara daraltma",
    description: "Anlık bakiye uyarısı eklendi; sıradaki adım stok, depo, parti ve lot seçimlerini yalnızca pozitif bakiyesi olan kombinasyonlarla filtrelemek.",
  },
  {
    priority: "P1",
    title: "Alış, üretim, transfer ve satış kayıtlarında düzenleme/iptal ekranlarının derinleştirilmesi",
    description: "Bugün iptal ters hareketle güvenli çalışıyor; düzenleme tarafında audit, revizyon geçmişi ve kullanıcı açıklaması eklenmeli.",
  },
  {
    priority: "P1",
    title: "Gelişmiş rapor ve pivot ekranları",
    description: "Stok, parti, fasoncu, boyahane, satış ve satın alma listelerine grup bazlı toplamlar, dönem filtreleri ve kaydedilebilir rapor görünümleri eklenmeli.",
  },
  {
    priority: "P1",
    title: "Supabase Auth girişinin üretim seviyesine taşınması",
    description: "Kullanıcı daveti, rol atama, RLS politikaları ve ekran bazlı yetki görünürlüğü tamamlanmalı.",
  },
  {
    priority: "P2",
    title: "Dosya, fotoğraf ve doküman yükleme",
    description: "Supabase Storage ile sipariş, parti, stok kartı ve sevkiyat belgeleri bağlanmalı.",
  },
  {
    priority: "P2",
    title: "Bildirimler ve işlem merkezi",
    description: "Kritik stok, geciken sipariş, termin yaklaşan satın alma ve yüksek fire bildirimleri hesaplanıyor; okundu/aksiyon akışı ve detay yönlendirmeleri derinleşmeli.",
  },
  {
    priority: "P2",
    title: "Canlıya alma sonrası smoke test ve veri denetimi",
    description: "Push/deploy sonrası dashboard, stok, sipariş, üretim, transfer, satış ve ayarlar ekranları canlı ortamda hızlı senaryo ile doğrulanmalı.",
  },
  {
    priority: "P2",
    title: "Mobil form deneyimini stepper yapıya taşıma",
    description: "Sipariş, transfer, ham üretim, boyahane ve alış formları mobilde adım adım girişe dönüştürülmeli.",
  },
];

export function RoadmapPage() {
  const completion = 78;
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

      <div className="premium-card rounded-2xl p-5">
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
            <div key={item} className="flex items-center gap-2 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
              <CheckCircle2 className="size-4 text-green-600" />
              {item}
            </div>
          ))}
        </div>
      </div>

      <div className="premium-card rounded-2xl p-5">
        <h2 className="font-semibold text-slate-950">Tarih ağacı</h2>
        <p className="mt-1 text-sm text-slate-500">Ana tarih yanında günün en büyük değişikliği koyu başlık olarak görünür; altındaki ince satırlar o günün diğer kayıtlarıdır.</p>
        <div className="mt-6 space-y-8">
          {developmentTimeline.map((entry, index) => (
            <div key={entry.date} className="grid gap-4 md:grid-cols-[160px_1fr]">
              <div className="flex md:justify-end">
                <div className="rounded-2xl bg-blue-50 px-4 py-3 text-sm font-bold text-blue-700">{formatDate(entry.date)}</div>
              </div>
              <div className="relative border-l-2 border-blue-100 pl-6">
                <div className="absolute -left-[9px] top-2 size-4 rounded-full border-4 border-white bg-blue-600 shadow" />
                <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div>
                      <h3 className="text-lg font-bold text-slate-950">{entry.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-slate-500">{entry.summary}</p>
                    </div>
                    <StatusBadge tone={index === developmentTimeline.length - 1 ? "green" : "blue"}>{entry.items.length} geliştirme</StatusBadge>
                  </div>
                  <div className="mt-4 space-y-2">
                    {entry.items.map((item) => (
                      <div key={item} className="rounded-2xl bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">{item}</div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="premium-card rounded-2xl p-5">
        <h2 className="font-semibold text-slate-950">Bekleyen geliştirmeler</h2>
        <p className="mt-1 text-sm text-slate-500">Tarihe bağlı değil; önem sırasına göre ele alınacak işler. Yeni geliştirme tamamlandığında bu sayfada ilgili madde işaretlenir.</p>
        <div className="mt-5 space-y-3">
          {pendingRoadmap.map((item) => (
            <div key={item.title} className="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm md:flex-row md:items-start">
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
          <div className="premium-card rounded-2xl p-5">
            <div className="flex items-center gap-3">
              <div className="grid size-11 place-items-center rounded-2xl bg-blue-600 text-white">
                <BookOpen className="size-5" />
              </div>
              <div>
                <h2 className="font-semibold text-slate-950">Projeye nereden başlamalı?</h2>
                <p className="text-sm text-slate-500">Önerilen canlıya geçiş sırası</p>
              </div>
            </div>
            <div className="mt-5 space-y-3">
              {startSteps.map((step, index) => (
                <div key={step} className="flex gap-3 rounded-2xl bg-slate-50 p-4">
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
          <Link key={group.title} href={group.href} className="premium-card rounded-2xl p-5 transition hover:-translate-y-0.5 hover:shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-slate-950">{group.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">{group.description}</p>
              </div>
              <div className="grid size-10 shrink-0 place-items-center rounded-2xl bg-blue-50 text-blue-600">
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
        <div className="premium-card rounded-2xl p-5">
          <h2 className="font-semibold text-slate-950">Veritabanı tanımları</h2>
          <p className="mt-2 text-sm text-slate-500">Bu alandaki kayıtlar doğrudan Supabase PostgreSQL tablolarına yazılır ve tüm cihazlarda anlık yenilenir.</p>
          <div className="mt-5">
            <SettingForm entity={settingConfig.entity} extra={settingConfig.extra} />
          </div>
          <div className="mt-5 divide-y divide-slate-100">
            {settingConfig.rows.length === 0 ? (
              <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">Henüz tanım yok.</p>
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
                      <button className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700" onClick={() => setDetailWarehouse(row as WarehouseEntity)} type="button">Detay</button>
                    ) : null}
                    <button
                      className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700"
                      onClick={() => setEditing({ id: row.id, name: row.name, code: "code" in row ? String(row.code) : undefined, isActive: row.isActive, kind: "kind" in row ? row.kind : undefined })}
                      type="button"
                    >
                      Düzenle
                    </button>
                    <button className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700" onClick={() => setDeleteTarget({ id: row.id, name: row.name })} type="button">
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
                <input className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50" name="name" defaultValue={editing?.name} required />
              </label>
              {section === "yarn-types" ? (
                <>
                  <label className="space-y-2">
                    <span className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Kod</span>
                    <input className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm uppercase outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50" name="code" defaultValue={editing?.code} required />
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
                  <select className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50" name="kind" defaultValue={editing?.kind ?? "RAW"}>
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
                <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">Bu depoda stok bulunmuyor.</p>
              ) : (
                data.warehouseBalances.filter(b => b.warehouseId === detailWarehouse?.id && Number(b.quantity) > 0).map(b => {
                  const stock = data.stockCards.find(s => s.id === b.stockId);
                  const party = data.parties.find(p => p.id === b.partyId);
                  return (
                    <div key={`${b.stockId}-${b.partyId || 'noparty'}`} className="flex items-center justify-between rounded-2xl border border-slate-100 p-4 shadow-sm">
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

      <div className="premium-card rounded-2xl p-5">
        <h2 className="font-semibold text-slate-950">Kullanım notu</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Önce ayar sözlüklerini girin. Sonra hammadde stok kartlarını ve satıcı siparişlerini açın. Müşteri siparişinde aynı özelliklerde YM/MM stok yoksa sistem yeni kod üretim mantığıyla kart açacak şekilde kurgulandı. Ham üretim ilk parti numarasını oluşturur; boyahane, transfer ve satış hareketleri bu parti üzerinden izlenir.
        </p>
      </div>
    </div>
  );
}










