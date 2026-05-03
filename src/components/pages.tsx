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
import { DirectPurchaseForm, DyehouseProductionForm, OrderEditForm, OrderForm, PurchaseOrderEditForm, PurchaseOrderForm, PurchaseReceiptForm, RawProductionForm, RoleForm, SaleForm, SettingForm, StockCardEditForm, StockCardForm, TransferForm, UserProfileForm } from "@/components/forms";
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

type SettingEntity = "fabricTypes" | "colors" | "yarnCounts" | "processTypes" | "warehouses" | "partners";
type EditableSetting = { id: string; name: string; kind?: WarehouseEntity["kind"]; type?: Partner["type"] };
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
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Siparişler" title="Müşteri Siparişleri" description="Kumaş üretim talepleri, otomatik YM/MM stok eşleşmesi ve üretim durum takibi." icon={ShoppingCart} action={<button className={primaryButton} onClick={() => setOpen(true)}><Plus className="size-4" />Yeni sipariş</button>} />
      <div className="premium-card rounded-2xl p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-semibold text-slate-950">Sipariş filtreleri</h2>
            <p className="mt-1 text-sm text-slate-500">Durum, tarih, müşteri, stok ve akıllı ifade ile daralt.</p>
          </div>
          <button className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600" onClick={() => setFilters(emptyOrderFilters)} type="button">
            Filtreleri temizle
          </button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
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
          <input className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none" placeholder="Akıllı filtre: bekleyen boyahanede lacivert" value={filters.smart} onChange={(event) => setOrderFilter("smart", event.target.value)} />
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
        <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold text-slate-500">
          <StatusBadge tone="blue">{filteredOrders.length} sipariş</StatusBadge>
          {groupMode !== "none" ? <StatusBadge tone="blue">Gruplu görünüm aktif</StatusBadge> : null}
          <StatusBadge tone="amber">Akıllı örnek: bekleyen boyahanede lacivert</StatusBadge>
          <StatusBadge tone="green">Çoklu filtre aktif</StatusBadge>
        </div>
      </div>
      <DataTable rows={filteredOrders} columns={columns} groupBy={orderGroupBy} searchPlaceholder="Liste içinde hızlı ara" getSearchText={(row) => [row.orderNo, row.customerName, row.status, getName(data.fabricTypes, row.fabricTypeId), getName(data.colors, row.colorId), getName(data.yarnCounts, row.yarnCountId), getName(data.stockCards, row.ymStockId), getName(data.stockCards, row.mmStockId), row.quantityKg].join(" ")} />
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
    { header: "Sipariş kg", cell: (row) => formatKg(row.totalOrderedKg) },
    { header: "Gelen", cell: (row) => formatKg(row.totalReceivedKg) },
    { header: "Kalan", cell: (row) => formatKg(row.totalRemainingKg) },
    { header: "Durum", cell: (row) => <StatusBadge tone={statusTone(row.status)}>{row.status}</StatusBadge> },
    { header: "İşlem", className: "text-right", cell: (row) => <div className="flex justify-end gap-2"><button className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700" onClick={() => setEditing(row)} type="button">Düzenle</button><button className={dangerButton} onClick={() => setDeleteTarget(row)} type="button">Sil</button></div> },
  ];
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Satın alma" title="Satıcı Siparişleri" description="IP, LYC ve POLY için açık satıcı siparişleri, termin ve bekleyen kg takibi." icon={PackagePlus} action={<button className={primaryButton} onClick={() => setOrderOpen(true)}><Plus className="size-4" />Satıcı siparişi</button>} />
      <div className="grid gap-4 md:grid-cols-3">
        {data.purchaseOrders.map((order) => (
          <div key={order.id} className="premium-card rounded-2xl p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-slate-950">{getName(data.partners, order.supplierId)}</p>
                <p className="text-sm text-slate-500">{order.items[0]?.stockName}</p>
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
      <DataTable rows={data.purchaseOrders} columns={columns} searchPlaceholder="Satıcı siparişi, tedarikçi, durum veya stokta ara" getSearchText={(row) => [row.purchaseOrderNo, getName(data.partners, row.supplierId), row.status, normalizeItems(row.items).map((item) => `${item.stockCode} ${item.stockName}`).join(" ")].join(" ")} />
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
  const openOrders = data.purchaseOrders.filter((order) => order.status !== "Tamamlandı" && order.status !== "İptal");
  const directReceiptIds = new Set(data.stockMovements.filter((movement) => movement.referenceType === "direct_purchase_receipt").map((movement) => movement.referenceId));
  const receiptColumns: Column<PurchaseReceipt>[] = [
    { header: "Fiş", cell: (row) => <span className="font-semibold text-blue-700">{row.receiptNo}</span> },
    { header: "Tarih", cell: (row) => formatDate(row.receiptDate) },
    { header: "Satıcı", cell: (row) => getName(data.partners, row.supplierId) },
    { header: "Depo", cell: (row) => getName(data.warehouses, row.warehouseId) },
    { header: "Stok", cell: (row) => normalizeItems(row.items).map((item) => getName(data.stockCards, item.stockId)).join(", ") },
    { header: "Kg", cell: (row) => formatKg(normalizeItems(row.items).reduce((sum, item) => sum + (item.receivedKg || 0), 0)) },
    { header: "Tür", cell: (row) => <StatusBadge tone={directReceiptIds.has(row.id) ? "blue" : "green"}>{directReceiptIds.has(row.id) ? "Hızlı alış" : "Siparişe bağlı"}</StatusBadge> },
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
      <div className="grid gap-4 md:grid-cols-2">
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
        rows={data.purchaseReceipts}
        columns={receiptColumns}
        searchPlaceholder="Fiş, satıcı, depo veya stokta ara"
        getSearchText={(row) => [row.receiptNo, getName(data.partners, row.supplierId), getName(data.warehouses, row.warehouseId), normalizeItems(row.items).map((item) => getName(data.stockCards, item.stockId)).join(" "), row.description].join(" ")}
      />
      <FormDrawer open={directOpen} title="Hızlı hammadde alışı" onClose={() => setDirectOpen(false)}><DirectPurchaseForm /></FormDrawer>
      <FormDrawer open={receiptOpen} title="Siparişe bağlı mal kabul" onClose={() => setReceiptOpen(false)}><PurchaseReceiptForm /></FormDrawer>
    </div>
  );
}

export function StocksPage() {
  const { data, refresh, mutateData } = useErpData();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<StockCard | null>(null);
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
  const columns: Column<StockCard>[] = [
    { header: "Kod", cell: (row) => <Link className="font-semibold text-blue-700" href={`/stocks/${row.id}`}>{row.code}</Link> },
    { header: "Ad", cell: (row) => row.name },
    { header: "Tip", cell: (row) => <StatusBadge tone={row.type === "MM" ? "green" : row.type === "YM" ? "blue" : "amber"}>{row.type}</StatusBadge> },
    { header: "Ne", cell: (row) => getName(data.yarnCounts, row.yarnCountId) },
    { header: "Stok", cell: (row) => formatKg(row.currentStockKg) },
    { header: "Kritik", cell: (row) => formatKg(row.criticalStockKg) },
    { header: "İşlem", className: "text-right", cell: (row) => <div className="flex justify-end gap-2"><button className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700" onClick={() => setEditing(row)} type="button">Düzenle</button><button className={dangerButton} onClick={() => deactivateStock(row.id)} type="button">Sil/Pasif</button></div> },
  ];
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Stok" title="Stok Kartları" description="YM/MM partili izlenir; IP/LYC/POLY satın alma ve üretim tüketimiyle takip edilir." icon={Boxes} action={<button className={primaryButton} onClick={() => setOpen(true)}><Plus className="size-4" />Stok kartı</button>} />
      <DataTable rows={data.stockCards} columns={columns} searchPlaceholder="Stok kodu, ad, tip veya özellikte ara" getSearchText={(row) => [row.code, row.name, row.type, getName(data.fabricTypes, row.fabricTypeId), getName(data.colors, row.colorId), getName(data.yarnCounts, row.yarnCountId)].join(" ")} />
      <FormDrawer open={open} title="Yeni stok kartı" onClose={() => setOpen(false)}><StockCardForm /></FormDrawer>
      <FormDrawer open={Boolean(editing)} title="Stok kartı düzenle" onClose={() => setEditing(null)}>{editing ? <StockCardEditForm stock={editing} onDone={() => setEditing(null)} /> : null}</FormDrawer>
    </div>
  );
}

export function StockDetailPage({ id }: { id: string }) {
  const { data } = useErpData();
  const stock = data.stockCards.find((item) => item.id === id);
  if (!stock) return <DataTable rows={[]} columns={[]} />;
  const movements = data.stockMovements.filter((item) => item.stockId === stock.id);
  const purchaseItems = data.purchaseOrders.flatMap((order) => normalizeItems(order.items).filter((item) => item.stockId === stock.id).map((item) => ({ ...item, id: `${order.id}-${item.id}`, orderNo: order.purchaseOrderNo, status: order.status })));
  return (
    <div className="space-y-6">
      <PageHeader eyebrow={stock.code} title={stock.name} description="Genel, bakiye, hareketler, satıcı siparişleri ve üretim kullanımı tek kartta." icon={Boxes} action={<StatusBadge tone={stock.type === "MM" ? "green" : "blue"}>{stock.type}</StatusBadge>} />
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard title="Mevcut stok" value={formatKg(stock.currentStockKg)} helper="Kart üstü özet" icon={Boxes} />
        <StatCard title="Satın alınan" value={formatKg(purchaseItems.reduce((sum, item) => sum + item.orderedKg, 0))} helper="IP/LYC/POLY için" icon={PackagePlus} tone="green" />
        <StatCard title="Bekleyen" value={formatKg(purchaseItems.reduce((sum, item) => sum + item.remainingKg, 0))} helper="Satıcı açık kg" icon={Truck} tone="amber" />
        <StatCard title="Üretim tüketimi" value={formatKg(movements.filter((item) => item.movementType === "Üretim tüketim").reduce((sum, item) => sum + item.quantity, 0))} helper="Hareketlerden hesaplanır" icon={Factory} tone="red" />
      </div>
      <DataTable rows={movements} columns={[
        { header: "Tarih", cell: (row: StockMovement) => formatDate(row.date) },
        { header: "Depo", cell: (row: StockMovement) => getName(data.warehouses, row.warehouseId) },
        { header: "Tip", cell: (row: StockMovement) => row.movementType },
        { header: "Yön", cell: (row: StockMovement) => <StatusBadge tone={row.direction === "IN" ? "green" : "red"}>{row.direction}</StatusBadge> },
        { header: "Miktar", cell: (row: StockMovement) => formatKg(row.quantity) },
      ]} />
    </div>
  );
}

export function PartiesPage() {
  const { data } = useErpData();
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
      <PageHeader eyebrow="Parti takibi" title="Partiler" description="İlk ham üretimden satışa kadar parti numarası, fire, depo ve timeline izleme." icon={Factory} />
      <DataTable rows={data.parties} columns={columns} />
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

export function ProductionPage({ type }: { type: "raw" | "dyehouse" }) {
  const { data, refresh } = useErpData();
  const [open, setOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<RawProduction | DyehouseProduction | null>(null);
  const isRaw = type === "raw";
  const cancelledIds = new Set(data.stockMovements.filter((movement) => movement.referenceType === (isRaw ? "production_raw_cancel" : "production_dyehouse_cancel")).map((movement) => movement.referenceId));
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
      <div className="premium-card rounded-2xl p-5">
        {isRaw ? <RawProductionForm /> : <DyehouseProductionForm />}
      </div>
      {isRaw ? (
        <DataTable rows={data.productionRaw} columns={rawColumns} searchPlaceholder="Sipariş, parti, fasoncu veya açıklamada ara" getSearchText={(row) => [data.orders.find((order) => order.id === row.orderId)?.orderNo, data.parties.find((party) => party.id === row.partyId)?.partyNo, getName(data.partners, row.knitterPartnerId), row.description].join(" ")} />
      ) : (
        <DataTable rows={data.productionDyehouse} columns={dyehouseColumns} searchPlaceholder="Sipariş, parti, boyahane veya açıklamada ara" getSearchText={(row) => [data.orders.find((order) => order.id === row.orderId)?.orderNo, data.parties.find((party) => party.id === row.partyId)?.partyNo, getName(data.partners, row.dyehousePartnerId), row.description].join(" ")} />
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
  const [confirm, setConfirm] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<Transfer | null>(null);
  const cancelledTransferIds = new Set(data.stockMovements.filter((movement) => movement.referenceType === "transfer_cancel").map((movement) => movement.referenceId));
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
      <PageHeader eyebrow="Depo" title="Depolar Arası Transfer" description="Her depodan her depoya çift taraflı stok hareketi; negatif stok kontrolüne hazır altyapı." icon={Truck} action={<button className={primaryButton} onClick={() => setConfirm(true)}><Plus className="size-4" />Onaylı transfer</button>} />
      <div className="premium-card rounded-2xl p-5"><TransferForm /></div>
      <DataTable rows={data.transfers} columns={[
        { header: "Tarih", cell: (row) => formatDate(row.date) },
        { header: "Kaynak", cell: (row) => getName(data.warehouses, row.fromWarehouseId) },
        { header: "Hedef", cell: (row) => getName(data.warehouses, row.toWarehouseId) },
        { header: "Miktar", cell: (row) => formatKg(normalizeItems(row.items).reduce((sum, item) => sum + (item.quantity || 0), 0)) },
        { header: "Durum", cell: (row) => <StatusBadge tone={cancelledTransferIds.has(row.id) ? "red" : "green"}>{cancelledTransferIds.has(row.id) ? "İptal" : "Aktif"}</StatusBadge> },
        { header: "İşlem", className: "text-right", cell: (row) => <div className="flex justify-end"><button className={dangerButton} disabled={cancelledTransferIds.has(row.id)} onClick={() => setCancelTarget(row)} type="button">{cancelledTransferIds.has(row.id) ? "İptal edildi" : "İptal et"}</button></div> },
      ]} searchPlaceholder="Kaynak depo, hedef depo veya açıklamada ara" getSearchText={(row) => [getName(data.warehouses, row.fromWarehouseId), getName(data.warehouses, row.toWarehouseId), row.description].join(" ")} />
      <ConfirmModal open={confirm} title="Transfer onayı" description="Bu işlem kaynak depodan çıkış ve hedef depoya giriş hareketi oluşturur." onClose={() => setConfirm(false)} onConfirm={() => setConfirm(false)} />
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
        { header: "Durum", cell: () => <StatusBadge tone="green">Aktif</StatusBadge> },
        ...(manageDefinitions ? [{
          header: "İşlem",
          cell: (row: NamedEntity) => (
            <div className="flex flex-wrap gap-2">
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
];

const pendingRoadmap = [
  {
    priority: "P0",
    title: "Üretim reçetesi ve çok kalemli tüketim",
    description: "Ham üretimde birden fazla IP/LYC/POLY kalemini oran bazlı tüketme, kalan ipleri üretimlere dağıtma ve fasoncu depo kapanış mutabakatını detaylandırma.",
  },
  {
    priority: "P0",
    title: "Parti bazlı gelişmiş stok kullanılabilirlik kontrolü",
    description: "YM/MM için parti zorunluluğunu tüm formlarda daha sert hale getirme, stok seçiminde yalnızca bakiyesi olan depo/parti kombinasyonlarını gösterme.",
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
    description: "Kritik stok, geciken sipariş, termin yaklaşan satın alma ve yüksek fire için kullanıcı bildirimleri eklenmeli.",
  },
  {
    priority: "P2",
    title: "Mobil form deneyimini stepper yapıya taşıma",
    description: "Sipariş, transfer, ham üretim, boyahane ve alış formları mobilde adım adım girişe dönüştürülmeli.",
  },
];

export function RoadmapPage() {
  const completion = 72;
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
        <StatCard title="Son güncelleme" value="03.05.2026" helper="Gün bazında takip edilir" icon={Settings} tone="blue" />
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

export function SettingsGuidePage({ section }: { section?: "fabric-types" | "colors" | "yarn-counts" | "process-types" | "warehouses" }) {
  const { data, refresh, mutateData } = useErpData();
  const [editing, setEditing] = useState<EditableSetting | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EditableSetting | null>(null);
  const activeGroup = section
    ? settingGroups.find((group) => group.href.endsWith(section))
    : undefined;
  const settingConfig = section
    ? ({
        "fabric-types": { entity: "fabricTypes", rows: data.fabricTypes, extra: undefined },
        colors: { entity: "colors", rows: data.colors, extra: undefined },
        "yarn-counts": { entity: "yarnCounts", rows: data.yarnCounts, extra: undefined },
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
        name: String(form.get("name") ?? editing.name),
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
                    {"kind" in row ? <p className="text-xs text-slate-400">{warehouseKindLabels[row.kind as WarehouseEntity["kind"]]}</p> : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700"
                      onClick={() => setEditing({ id: row.id, name: row.name, kind: "kind" in row ? row.kind : undefined })}
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










