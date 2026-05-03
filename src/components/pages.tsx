"use client";

import Link from "next/link";
import { BarChart3, BookOpen, Boxes, CheckCircle2, Download, Factory, KeyRound, PackagePlus, Plus, Settings, ShoppingCart, SlidersHorizontal, Truck, Users, Warehouse } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { DataTable, type Column } from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge, statusTone } from "@/components/ui/status-badge";
import { StatCard } from "@/components/ui/stat-card";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { FormDrawer } from "@/components/ui/form-drawer";
import { DyehouseProductionForm, OrderEditForm, OrderForm, PurchaseOrderEditForm, PurchaseOrderForm, PurchaseReceiptForm, RawProductionForm, RoleForm, SaleForm, SettingForm, StockCardEditForm, StockCardForm, TransferForm, UserProfileForm } from "@/components/forms";
import { PartyTimeline } from "@/components/party-timeline";
import { useErpData } from "@/components/erp-data-provider";
import { getDashboardMetrics, getName, getPurchaseProgress } from "@/services/erp-service";
import type { ErpData, NamedEntity, Order, Partner, Party, PurchaseOrder, Role, Sale, StockCard, StockMovement, UserProfile, Warehouse as WarehouseEntity } from "@/types/erp";
import { formatDate, formatKg, formatPercent, wasteTone } from "@/lib/utils";
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
  const { data, refresh } = useErpData();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Order | null>(null);
  async function cancelOrder(id: string) {
    try {
      await apiDelete(`/api/orders/${id}`);
      refreshInBackground(refresh);
      toast.success("Sipariş iptal edildi.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Sipariş iptal edilemedi.");
    }
  }
  const columns: Column<Order>[] = [
    { header: "Sipariş", cell: (row) => <Link className="font-semibold text-blue-700" href={`/orders/${row.id}`}>{row.orderNo}</Link> },
    { header: "Müşteri", cell: (row) => row.customerName },
    { header: "Kumaş", cell: (row) => getName(data.fabricTypes, row.fabricTypeId) },
    { header: "Renk", cell: (row) => getName(data.colors, row.colorId) },
    { header: "Kg", cell: (row) => formatKg(row.quantityKg) },
    { header: "Durum", cell: (row) => <StatusBadge tone={statusTone(row.status)}>{row.status}</StatusBadge> },
    { header: "İşlem", cell: (row) => <div className="flex gap-2"><button className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700" onClick={() => setEditing(row)} type="button">Düzenle</button><button className={dangerButton} onClick={() => cancelOrder(row.id)} type="button">İptal</button></div> },
  ];
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Siparişler" title="Müşteri Siparişleri" description="Kumaş üretim talepleri, otomatik YM/MM stok eşleşmesi ve üretim durum takibi." icon={ShoppingCart} action={<button className={primaryButton} onClick={() => setOpen(true)}><Plus className="size-4" />Yeni sipariş</button>} />
      <DataTable rows={data.orders} columns={columns} />
      <FormDrawer open={open} title="Yeni müşteri siparişi" onClose={() => setOpen(false)}><OrderForm /></FormDrawer>
      <FormDrawer open={Boolean(editing)} title="Sipariş düzenle" onClose={() => setEditing(null)}>{editing ? <OrderEditForm order={editing} onDone={() => setEditing(null)} /> : null}</FormDrawer>
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
  const { data, refresh } = useErpData();
  const [orderOpen, setOrderOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [editing, setEditing] = useState<PurchaseOrder | null>(null);
  async function cancelPurchase(id: string) {
    try {
      await apiDelete(`/api/purchase-orders/${id}`);
      refreshInBackground(refresh);
      toast.success("Satıcı siparişi iptal edildi.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Satıcı siparişi iptal edilemedi.");
    }
  }
  const columns: Column<PurchaseOrder>[] = [
    { header: "Sipariş", cell: (row) => <span className="font-semibold text-blue-700">{row.purchaseOrderNo}</span> },
    { header: "Satıcı", cell: (row) => getName(data.partners, row.supplierId) },
    { header: "Sipariş kg", cell: (row) => formatKg(row.totalOrderedKg) },
    { header: "Gelen", cell: (row) => formatKg(row.totalReceivedKg) },
    { header: "Kalan", cell: (row) => formatKg(row.totalRemainingKg) },
    { header: "Durum", cell: (row) => <StatusBadge tone={statusTone(row.status)}>{row.status}</StatusBadge> },
    { header: "İşlem", cell: (row) => <div className="flex gap-2"><button className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700" onClick={() => setEditing(row)} type="button">Düzenle</button><button className={dangerButton} onClick={() => cancelPurchase(row.id)} type="button">İptal</button></div> },
  ];
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Satın alma" title="Satıcı Siparişleri" description="IP, LYC ve POLY hammadde siparişleri; kısmi mal kabul ve açık kg takibi." icon={PackagePlus} action={<><button className={primaryButton} onClick={() => setOrderOpen(true)}><Plus className="size-4" />Satıcı siparişi</button><button className={primaryButton} onClick={() => setReceiptOpen(true)}><Plus className="size-4" />Mal kabul</button></>} />
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
      <DataTable rows={data.purchaseOrders} columns={columns} />
      <FormDrawer open={orderOpen} title="Yeni satıcı siparişi" onClose={() => setOrderOpen(false)}><PurchaseOrderForm /></FormDrawer>
      <FormDrawer open={receiptOpen} title="Mal kabul" onClose={() => setReceiptOpen(false)}><PurchaseReceiptForm /></FormDrawer>
      <FormDrawer open={Boolean(editing)} title="Satıcı siparişi düzenle" onClose={() => setEditing(null)}>{editing ? <PurchaseOrderEditForm order={editing} onDone={() => setEditing(null)} /> : null}</FormDrawer>
    </div>
  );
}

export function StocksPage() {
  const { data, refresh } = useErpData();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<StockCard | null>(null);
  async function deactivateStock(id: string) {
    try {
      await apiDelete(`/api/stocks/${id}`);
      refreshInBackground(refresh);
      toast.success("Stok kartı pasife alındı.");
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
    { header: "İşlem", cell: (row) => <div className="flex gap-2"><button className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700" onClick={() => setEditing(row)} type="button">Düzenle</button><button className={dangerButton} onClick={() => deactivateStock(row.id)} type="button">Pasifleştir</button></div> },
  ];
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Stok" title="Stok Kartları" description="YM/MM partili izlenir; IP/LYC/POLY satın alma ve üretim tüketimiyle takip edilir." icon={Boxes} action={<button className={primaryButton} onClick={() => setOpen(true)}><Plus className="size-4" />Stok kartı</button>} />
      <DataTable rows={data.stockCards} columns={columns} />
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
  const purchaseItems = data.purchaseOrders.flatMap((order) => order.items.filter((item) => item.stockId === stock.id).map((item) => ({ ...item, id: `${order.id}-${item.id}`, orderNo: order.purchaseOrderNo, status: order.status })));
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
  const [open, setOpen] = useState(false);
  const isRaw = type === "raw";
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Üretim" title={isRaw ? "Ham Kumaş Üretimi" : "Boyahane Üretimi"} description={isRaw ? "İplik tüketimi, ham kumaş girişi, fire ve fasoncu depo kapanış mutabakatı." : "Ham çıkışı, mamül girişi, finish özellikleri ve boyahane fire hesaplama."} icon={Factory} action={<button className={primaryButton} onClick={() => setOpen(true)}><Plus className="size-4" />Yeni kayıt</button>} />
      <div className="premium-card rounded-2xl p-5">
        {isRaw ? <RawProductionForm /> : <DyehouseProductionForm />}
      </div>
      <FormDrawer open={open} title={isRaw ? "Ham üretim kaydı" : "Boyahane üretim kaydı"} onClose={() => setOpen(false)}>{isRaw ? <RawProductionForm /> : <DyehouseProductionForm />}</FormDrawer>
    </div>
  );
}

export function TransfersPage() {
  const { data } = useErpData();
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Depo" title="Depolar Arası Transfer" description="Her depodan her depoya çift taraflı stok hareketi; negatif stok kontrolüne hazır altyapı." icon={Truck} action={<button className={primaryButton} onClick={() => setConfirm(true)}><Plus className="size-4" />Onaylı transfer</button>} />
      <div className="premium-card rounded-2xl p-5"><TransferForm /></div>
      <DataTable rows={data.transfers} columns={[
        { header: "Tarih", cell: (row) => formatDate(row.date) },
        { header: "Kaynak", cell: (row) => getName(data.warehouses, row.fromWarehouseId) },
        { header: "Hedef", cell: (row) => getName(data.warehouses, row.toWarehouseId) },
        { header: "Miktar", cell: (row) => formatKg(row.items.reduce((sum, item) => sum + item.quantity, 0)) },
      ]} />
      <ConfirmModal open={confirm} title="Transfer onayı" description="Bu işlem kaynak depodan çıkış ve hedef depoya giriş hareketi oluşturur." onClose={() => setConfirm(false)} onConfirm={() => setConfirm(false)} />
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
    href: "/settings",
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
];

const startSteps = [
  "Kumaş cinsi, renk, Ne numarası ve boyahane işlem türlerini tanımla.",
  "Depoları ve cari kartları aç: fason örmeci, boyahane, satıcı ve müşteri.",
  "IP, LYC ve POLY hammadde stok kartlarını oluştur.",
  "Satıcı siparişi gir ve gelen hammaddeler için mal kabul yap.",
  "Müşteri siparişi oluştur; sistem YM/MM stok eşleşmesini hazırlar.",
  "Ham üretim, boyahane, transfer ve satış akışını parti üzerinden takip et.",
];

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
                  <button
                    className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700"
                    onClick={() => setEditing({ id: row.id, name: row.name, kind: "kind" in row ? row.kind : undefined })}
                    type="button"
                  >
                    Düzenle
                  </button>
                  <button className="ml-2 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700" onClick={() => setDeleteTarget({ id: row.id, name: row.name })} type="button">
                    Sil
                  </button>
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










