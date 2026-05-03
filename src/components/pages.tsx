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
import type { Order, Party, PurchaseOrder, Role, Sale, StockCard, StockMovement, UserProfile } from "@/types/erp";
import { formatDate, formatKg, formatPercent, wasteTone } from "@/lib/utils";
import { supabase } from "@/lib/supabase";

const primaryButton = "inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-100";
const dangerButton = "rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700";

async function apiDelete(endpoint: string) {
  const session = await supabase.auth.getSession();
  const token = session.data.session?.access_token;
  const response = await fetch(endpoint, { method: "DELETE", headers: token ? { Authorization: `Bearer ${token}` } : undefined });
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
      await refresh();
      toast.success("Sipariş iptal edildi.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Sipariş iptal edilemedi.");
    }
  }
  const columns: Column<Order>[] = [
    { header: "SipariÅŸ", cell: (row) => <Link className="font-semibold text-blue-700" href={`/orders/${row.id}`}>{row.orderNo}</Link> },
    { header: "MÃ¼ÅŸteri", cell: (row) => row.customerName },
    { header: "KumaÅŸ", cell: (row) => getName(data.fabricTypes, row.fabricTypeId) },
    { header: "Renk", cell: (row) => getName(data.colors, row.colorId) },
    { header: "Kg", cell: (row) => formatKg(row.quantityKg) },
    { header: "Durum", cell: (row) => <StatusBadge tone={statusTone(row.status)}>{row.status}</StatusBadge> },
    { header: "İşlem", cell: (row) => <div className="flex gap-2"><button className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700" onClick={() => setEditing(row)} type="button">Düzenle</button><button className={dangerButton} onClick={() => cancelOrder(row.id)} type="button">İptal</button></div> },
  ];
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="SipariÅŸler" title="MÃ¼ÅŸteri SipariÅŸleri" description="KumaÅŸ Ã¼retim talepleri, otomatik YM/MM stok eÅŸleÅŸmesi ve Ã¼retim durum takibi." icon={ShoppingCart} action={<button className={primaryButton} onClick={() => setOpen(true)}><Plus className="size-4" />Yeni sipariÅŸ</button>} />
      <DataTable rows={data.orders} columns={columns} />
      <FormDrawer open={open} title="Yeni mÃ¼ÅŸteri sipariÅŸi" onClose={() => setOpen(false)}><OrderForm /></FormDrawer>
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
      <PageHeader eyebrow={order.orderNo} title={order.customerName} description={`${getName(data.fabricTypes, order.fabricTypeId)} Â· ${getName(data.colors, order.colorId)} Â· ${formatKg(order.quantityKg)}`} icon={ShoppingCart} action={<StatusBadge tone={statusTone(order.status)}>{order.status}</StatusBadge>} />
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard title="Termin" value={formatDate(order.dueDate)} helper="Planlanan teslim" icon={ShoppingCart} />
        <StatCard title="YM stok" value={getName(data.stockCards, order.ymStockId)} helper="Ham kumaÅŸ referansÄ±" icon={Boxes} tone="green" />
        <StatCard title="MM stok" value={getName(data.stockCards, order.mmStockId)} helper="MamÃ¼l kumaÅŸ referansÄ±" icon={Boxes} tone="green" />
        <StatCard title="Parti" value={party?.partyNo ?? "-"} helper="SatÄ±ÅŸa kadar izlenir" icon={Factory} tone="amber" />
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
      await refresh();
      toast.success("Satıcı siparişi iptal edildi.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Satıcı siparişi iptal edilemedi.");
    }
  }
  const columns: Column<PurchaseOrder>[] = [
    { header: "SipariÅŸ", cell: (row) => <span className="font-semibold text-blue-700">{row.purchaseOrderNo}</span> },
    { header: "SatÄ±cÄ±", cell: (row) => getName(data.partners, row.supplierId) },
    { header: "SipariÅŸ kg", cell: (row) => formatKg(row.totalOrderedKg) },
    { header: "Gelen", cell: (row) => formatKg(row.totalReceivedKg) },
    { header: "Kalan", cell: (row) => formatKg(row.totalRemainingKg) },
    { header: "Durum", cell: (row) => <StatusBadge tone={statusTone(row.status)}>{row.status}</StatusBadge> },
    { header: "İşlem", cell: (row) => <div className="flex gap-2"><button className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700" onClick={() => setEditing(row)} type="button">Düzenle</button><button className={dangerButton} onClick={() => cancelPurchase(row.id)} type="button">İptal</button></div> },
  ];
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="SatÄ±n alma" title="SatÄ±cÄ± SipariÅŸleri" description="IP, LYC ve POLY hammadde sipariÅŸleri; kÄ±smi mal kabul ve aÃ§Ä±k kg takibi." icon={PackagePlus} action={<><button className={primaryButton} onClick={() => setOrderOpen(true)}><Plus className="size-4" />SatÄ±cÄ± sipariÅŸi</button><button className={primaryButton} onClick={() => setReceiptOpen(true)}><Plus className="size-4" />Mal kabul</button></>} />
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
              <span><b>{formatKg(order.totalOrderedKg)}</b><br />SipariÅŸ</span>
              <span><b>{formatKg(order.totalReceivedKg)}</b><br />Gelen</span>
              <span><b>{formatKg(order.totalRemainingKg)}</b><br />Kalan</span>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-blue-600" style={{ width: `${getPurchaseProgress(order)}%` }} /></div>
          </div>
        ))}
      </div>
      <DataTable rows={data.purchaseOrders} columns={columns} />
      <FormDrawer open={orderOpen} title="Yeni satÄ±cÄ± sipariÅŸi" onClose={() => setOrderOpen(false)}><PurchaseOrderForm /></FormDrawer>
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
      await refresh();
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
      <PageHeader eyebrow="Stok" title="Stok KartlarÄ±" description="YM/MM partili izlenir; IP/LYC/POLY satÄ±n alma ve Ã¼retim tÃ¼ketimiyle takip edilir." icon={Boxes} action={<button className={primaryButton} onClick={() => setOpen(true)}><Plus className="size-4" />Stok kartÄ±</button>} />
      <DataTable rows={data.stockCards} columns={columns} />
      <FormDrawer open={open} title="Yeni stok kartÄ±" onClose={() => setOpen(false)}><StockCardForm /></FormDrawer>
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
      <PageHeader eyebrow={stock.code} title={stock.name} description="Genel, bakiye, hareketler, satÄ±cÄ± sipariÅŸleri ve Ã¼retim kullanÄ±mÄ± tek kartta." icon={Boxes} action={<StatusBadge tone={stock.type === "MM" ? "green" : "blue"}>{stock.type}</StatusBadge>} />
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard title="Mevcut stok" value={formatKg(stock.currentStockKg)} helper="Kart Ã¼stÃ¼ Ã¶zet" icon={Boxes} />
        <StatCard title="SatÄ±n alÄ±nan" value={formatKg(purchaseItems.reduce((sum, item) => sum + item.orderedKg, 0))} helper="IP/LYC/POLY iÃ§in" icon={PackagePlus} tone="green" />
        <StatCard title="Bekleyen" value={formatKg(purchaseItems.reduce((sum, item) => sum + item.remainingKg, 0))} helper="SatÄ±cÄ± aÃ§Ä±k kg" icon={Truck} tone="amber" />
        <StatCard title="Üretim tüketimi" value={formatKg(movements.filter((item) => item.movementType === "Üretim tüketim").reduce((sum, item) => sum + item.quantity, 0))} helper="Hareketlerden hesaplanÄ±r" icon={Factory} tone="red" />
      </div>
      <DataTable rows={movements} columns={[
        { header: "Tarih", cell: (row: StockMovement) => formatDate(row.date) },
        { header: "Depo", cell: (row: StockMovement) => getName(data.warehouses, row.warehouseId) },
        { header: "Tip", cell: (row: StockMovement) => row.movementType },
        { header: "YÃ¶n", cell: (row: StockMovement) => <StatusBadge tone={row.direction === "IN" ? "green" : "red"}>{row.direction}</StatusBadge> },
        { header: "Miktar", cell: (row: StockMovement) => formatKg(row.quantity) },
      ]} />
    </div>
  );
}

export function PartiesPage() {
  const { data } = useErpData();
  const columns: Column<Party>[] = [
    { header: "Parti", cell: (row) => <Link className="font-semibold text-blue-700" href={`/parties/${row.id}`}>{row.partyNo}</Link> },
    { header: "SipariÅŸ", cell: (row) => data.orders.find((item) => item.id === row.orderId)?.orderNo },
    { header: "Ham kg", cell: (row) => formatKg(row.rawProducedKg) },
    { header: "MamÃ¼l kg", cell: (row) => formatKg(row.finishedKg) },
    { header: "Ham fire", cell: (row) => <StatusBadge tone={wasteTone(row.rawWastePercent)}>{formatPercent(row.rawWastePercent)}</StatusBadge> },
    { header: "Durum", cell: (row) => <StatusBadge tone={statusTone(row.status)}>{row.status}</StatusBadge> },
  ];
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Parti takibi" title="Partiler" description="Ä°lk ham Ã¼retimden satÄ±ÅŸa kadar parti numarasÄ±, fire, depo ve timeline izleme." icon={Factory} />
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
      <PageHeader eyebrow={`Parti ${party.partyNo}`} title={order?.customerName ?? "Parti detayÄ±"} description="SipariÅŸ, iplik tÃ¼ketimi, fasoncu, boyahane, satÄ±ÅŸ ve kalan kg zinciri." icon={Factory} action={<StatusBadge tone={statusTone(party.status)}>{party.status}</StatusBadge>} />
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard title="Ham Ã¼retim" value={formatKg(party.rawProducedKg)} helper={`${formatKg(party.rawConsumedKg)} iplik tÃ¼ketildi`} icon={Factory} />
        <StatCard title="Ham fire" value={formatPercent(party.rawWastePercent)} helper={formatKg(party.rawWasteKg)} icon={BarChart3} tone="red" />
        <StatCard title="Boyahane giriÅŸ" value={formatKg(party.dyehouseInputKg)} helper="Ham kumaÅŸ sevki" icon={Truck} tone="amber" />
        <StatCard title="MamÃ¼l" value={formatKg(party.finishedKg)} helper={`${formatPercent(party.dyehouseWastePercent)} boyahane fire`} icon={Boxes} tone="green" />
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
      <PageHeader eyebrow="Ãœretim" title={isRaw ? "Ham KumaÅŸ Ãœretimi" : "Boyahane Ãœretimi"} description={isRaw ? "Ä°plik tÃ¼ketimi, ham kumaÅŸ giriÅŸi, fire ve fasoncu depo kapanÄ±ÅŸ mutabakatÄ±." : "Ham Ã§Ä±kÄ±ÅŸÄ±, mamÃ¼l giriÅŸi, finish Ã¶zellikleri ve boyahane fire hesaplama."} icon={Factory} action={<button className={primaryButton} onClick={() => setOpen(true)}><Plus className="size-4" />Yeni kayÄ±t</button>} />
      <div className="premium-card rounded-2xl p-5">
        {isRaw ? <RawProductionForm /> : <DyehouseProductionForm />}
      </div>
      <FormDrawer open={open} title={isRaw ? "Ham Ã¼retim kaydÄ±" : "Boyahane Ã¼retim kaydÄ±"} onClose={() => setOpen(false)}>{isRaw ? <RawProductionForm /> : <DyehouseProductionForm />}</FormDrawer>
    </div>
  );
}

export function TransfersPage() {
  const { data } = useErpData();
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Depo" title="Depolar ArasÄ± Transfer" description="Her depodan her depoya Ã§ift taraflÄ± stok hareketi; negatif stok kontrolÃ¼ne hazÄ±r altyapÄ±." icon={Truck} action={<button className={primaryButton} onClick={() => setConfirm(true)}><Plus className="size-4" />OnaylÄ± transfer</button>} />
      <div className="premium-card rounded-2xl p-5"><TransferForm /></div>
      <DataTable rows={data.transfers} columns={[
        { header: "Tarih", cell: (row) => formatDate(row.date) },
        { header: "Kaynak", cell: (row) => getName(data.warehouses, row.fromWarehouseId) },
        { header: "Hedef", cell: (row) => getName(data.warehouses, row.toWarehouseId) },
        { header: "Miktar", cell: (row) => formatKg(row.items.reduce((sum, item) => sum + item.quantity, 0)) },
      ]} />
      <ConfirmModal open={confirm} title="Transfer onayÄ±" description="Bu iÅŸlem kaynak depodan Ã§Ä±kÄ±ÅŸ ve hedef depoya giriÅŸ hareketi oluÅŸturur." onClose={() => setConfirm(false)} onConfirm={() => setConfirm(false)} />
    </div>
  );
}

export function WasteAnalysisPage() {
  const { data } = useErpData();
  const metrics = getDashboardMetrics(data);
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Fire" title="Fire Analizi Dashboard" description="SipariÅŸ, parti, fasoncu, kumaÅŸ cinsi ve dÃ¶nem bazlÄ± beklenen/gerÃ§ek fire takibi." icon={BarChart3} />
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard title="Ham fire ort." value={formatPercent(metrics.avgRawWaste)} helper="0-3 yeÅŸil, 12+ kritik" icon={BarChart3} tone="red" />
        <StatCard title="Boyahane fire ort." value={formatPercent(metrics.avgDyeWaste)} helper="GÃ¶nderilen ham kg bazlÄ±" icon={BarChart3} tone="amber" />
        <StatCard title="Fire kg" value={formatKg(metrics.wasteKg)} helper="Ham + boyahane" icon={Factory} tone="red" />
        <StatCard title="Riskli fasoncu" value="2" helper="EÅŸik Ã¼stÃ¼ Ã¼retim ortaÄŸÄ±" icon={Users} tone="amber" />
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
  const { data, refresh } = useErpData();
  const [open, setOpen] = useState(false);
  const map = {
    warehouses: { title: "Depo YÃ¶netimi", desc: "Depo tanÄ±mlarÄ±, bakiye kartlarÄ± ve partili stok gÃ¶rÃ¼nÃ¼mÃ¼.", icon: Warehouse },
    partners: { title: "Fasoncu Cari YÃ¶netimi", desc: "Fason Ã¶rmeci, boyahane, satÄ±cÄ± ve mÃ¼ÅŸteri kartlarÄ±.", icon: Users },
    sales: { title: "SatÄ±ÅŸ / Sevkiyat", desc: "MamÃ¼l kumaÅŸÄ±n satÄ±ÅŸ maÄŸazasÄ± ve sevkiyat deposu Ã§Ä±kÄ±ÅŸlarÄ±.", icon: Truck },
    reports: { title: "Raporlar", desc: "Ãœretim, stok, satÄ±n alma ve fire raporlarÄ±.", icon: BarChart3 },
    settings: { title: "Ayarlar", desc: "KumaÅŸ cinsi, renk, Ne, proses, depo, rol ve prefix tanÄ±mlarÄ±.", icon: Settings },
  }[kind];
  if (kind === "sales") {
    async function cancelSaleRecord(id: string) {
      try {
        await apiDelete(`/api/sales/${id}`);
        await refresh();
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
  const rows = kind === "warehouses" ? data.warehouses : kind === "partners" ? data.partners : data.fabricTypes;
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="ERP" title={map.title} description={map.desc} icon={map.icon} action={kind === "warehouses" || kind === "partners" ? <button className={primaryButton} onClick={() => setOpen(true)}><Plus className="size-4" />Tanım ekle</button> : <Link className={primaryButton} href="/settings"><Plus className="size-4" />Tanım ekle</Link>} />
      <DataTable rows={rows} columns={[
        { header: "Ad", cell: (row) => row.name },
        { header: "Durum", cell: () => <StatusBadge tone="green">Aktif</StatusBadge> },
      ]} />
      <FormDrawer open={open} title="Tanım ekle" onClose={() => setOpen(false)}>
        {kind === "warehouses" ? <SettingForm entity="warehouses" extra="warehouse" /> : null}
        {kind === "partners" ? <SettingForm entity="partners" extra="partner" /> : null}
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
      await refresh();
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
    title: "KumaÅŸ cinsleri",
    description: "SÃ¼prem, iki iplik, Ã¼Ã§ iplik, kaÅŸkorse, ribana gibi Ã¼retim aileleri.",
    items: ["SÃ¼prem", "Ä°ki iplik", "ÃœÃ§ iplik", "KaÅŸkorse", "Ribana"],
  },
  {
    href: "/settings/colors",
    title: "Renkler",
    description: "SipariÅŸ, stok kartÄ± ve boyahane final kartlarÄ±nda kullanÄ±lacak renk kataloÄŸu.",
    items: ["Ekru", "Siyah", "Lacivert", "Gri melanj"],
  },
  {
    href: "/settings/yarn-counts",
    title: "Ne numaralarÄ±",
    description: "YM kartÄ±ndan MM karta taÅŸÄ±nacak iplik numarasÄ± standardÄ±.",
    items: ["20/1", "24/1", "30/1", "36/1", "40/1"],
  },
  {
    href: "/settings/process-types",
    title: "Boyahane iÅŸlem tÃ¼rleri",
    description: "Reaktif boya, ÅŸardon, sanfor, apre, yÄ±kama gibi proses tanÄ±mlarÄ±.",
    items: ["Reaktif boya", "Åardon", "Sanfor", "Apre"],
  },
  {
    href: "/settings/warehouses",
    title: "Depolar",
    description: "Merkez iplik, fasoncu, ham kumaÅŸ, boyahane, mamÃ¼l, satÄ±ÅŸ ve fire depolarÄ±.",
    items: ["Merkez iplik", "Fasoncu", "Ham kumaÅŸ", "MamÃ¼l"],
  },
  {
    href: "/partners",
    title: "Cari ve Ã¼retim ortaklarÄ±",
    description: "Fason Ã¶rmeci, boyahane, satÄ±cÄ±/tedarikÃ§i ve mÃ¼ÅŸteri kartlarÄ±.",
    items: ["Fason Ã¶rmeci", "Boyahane", "SatÄ±cÄ±", "MÃ¼ÅŸteri"],
  },
  {
    href: "/settings",
    title: "Prefix ve sayaÃ§lar",
    description: "YM, MM, IP, LYC, POLY, sipariÅŸ no ve parti no otomatik sayaÃ§larÄ±.",
    items: ["YM", "MM", "IP", "LYC", "POLY"],
  },
  {
    href: "/settings/roles",
    title: "Roller ve gÃ¼venlik",
    description: "Admin, Ã¼retim, depo, satÄ±n alma, satÄ±ÅŸ ve raporlama yetki altyapÄ±sÄ±.",
    items: ["Admin", "Ãœretim", "Depo", "SatÄ±n alma"],
  },
];

const startSteps = [
  "KumaÅŸ cinsi, renk, Ne numarasÄ± ve boyahane iÅŸlem tÃ¼rlerini tanÄ±mla.",
  "DepolarÄ± ve cari kartlarÄ± aÃ§: fason Ã¶rmeci, boyahane, satÄ±cÄ± ve mÃ¼ÅŸteri.",
  "IP, LYC ve POLY hammadde stok kartlarÄ±nÄ± oluÅŸtur.",
  "SatÄ±cÄ± sipariÅŸi gir ve gelen hammaddeler iÃ§in mal kabul yap.",
  "MÃ¼ÅŸteri sipariÅŸi oluÅŸtur; sistem YM/MM stok eÅŸleÅŸmesini hazÄ±rlar.",
  "Ham Ã¼retim, boyahane, transfer ve satÄ±ÅŸ akÄ±ÅŸÄ±nÄ± parti Ã¼zerinden takip et.",
];

export function SettingsGuidePage({ section }: { section?: "fabric-types" | "colors" | "yarn-counts" | "process-types" | "warehouses" }) {
  const { data, refresh } = useErpData();
  const [editing, setEditing] = useState<{ id: string; name: string; kind?: string } | null>(null);
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

  async function deleteDefinition(entity: string, recordId: string) {
    const response = await fetch(`/api/settings/${entity}/${recordId}`, { method: "DELETE" });
    const result = (await response.json()) as { ok: boolean; error?: string };
    if (!response.ok || !result.ok) throw new Error(result.error ?? "TanÄ±m silinemedi.");
    await refresh();
    toast.success("TanÄ±m silindi.");
  }

  async function updateDefinition(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!settingConfig || !editing) return;
    const form = new FormData(event.currentTarget);
    try {
      await apiPatch(`/api/settings/${settingConfig.entity}/${editing.id}`, {
        name: form.get("name"),
        kind: form.get("kind") ?? editing.kind,
      });
      setEditing(null);
      await refresh();
      toast.success("Tanım güncellendi.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Tanım güncellenemedi.");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Ayarlar"
        title={activeGroup?.title ?? "Kurulum ve TanÄ±m Merkezi"}
        description={activeGroup?.description ?? "BoÅŸ ERP kurulumunda Ã¶nce temel tanÄ±mlarÄ± tamamlayÄ±n; sipariÅŸ, stok, Ã¼retim ve rapor ekranlarÄ± bu sÃ¶zlÃ¼kleri kullanÄ±r."}
        icon={Settings}
        action={<Link className={primaryButton} href="/orders/new"><Plus className="size-4" />Ä°lk sipariÅŸi aÃ§</Link>}
      />

      {!activeGroup ? (
        <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="premium-card rounded-2xl p-5">
            <div className="flex items-center gap-3">
              <div className="grid size-11 place-items-center rounded-2xl bg-blue-600 text-white">
                <BookOpen className="size-5" />
              </div>
              <div>
                <h2 className="font-semibold text-slate-950">Projeye nereden baÅŸlamalÄ±?</h2>
                <p className="text-sm text-slate-500">Ã–nerilen canlÄ±ya geÃ§iÅŸ sÄ±rasÄ±</p>
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
            <StatCard title="Zorunlu tanÄ±mlar" value="8 grup" helper="SipariÅŸten Ã¶nce tamamlanmalÄ±" icon={SlidersHorizontal} />
            <StatCard title="Kod sistemi" value="YM/MM/IP" helper="SayaÃ§lar transaction mantÄ±ÄŸÄ±yla tasarlandÄ±" icon={KeyRound} tone="green" />
            <StatCard title="BoÅŸ veri" value="HazÄ±r" helper="Demo kayÄ±tlar temizlendi" icon={CheckCircle2} tone="green" />
            <StatCard title="Yetki altyapÄ±sÄ±" value="PlanlandÄ±" helper="Supabase Auth ile geniÅŸletilecek" icon={Users} tone="amber" />
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
          <h2 className="font-semibold text-slate-950">VeritabanÄ± tanÄ±mlarÄ±</h2>
          <p className="mt-2 text-sm text-slate-500">Bu alandaki kayÄ±tlar doÄŸrudan Supabase PostgreSQL tablolarÄ±na yazÄ±lÄ±r ve tÃ¼m cihazlarda anlÄ±k yenilenir.</p>
          <div className="mt-5">
            <SettingForm entity={settingConfig.entity} extra={settingConfig.extra} />
          </div>
          <div className="mt-5 divide-y divide-slate-100">
            {settingConfig.rows.length === 0 ? (
              <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">HenÃ¼z tanÄ±m yok.</p>
            ) : (
              settingConfig.rows.map((row) => (
                <div key={row.id} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-semibold text-slate-950">{row.name}</p>
                    {"kind" in row ? <p className="text-xs text-slate-400">{row.kind}</p> : null}
                  </div>
                  <button
                    className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700"
                    onClick={() => setEditing({ id: row.id, name: row.name, kind: "kind" in row ? row.kind : undefined })}
                    type="button"
                  >
                    Düzenle
                  </button>
                  <button
                    className="ml-2 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700"
                    onClick={() => deleteDefinition(settingConfig.entity, row.id).catch((error: unknown) => toast.error(error instanceof Error ? error.message : "TanÄ±m silinemedi."))}
                    type="button"
                  >
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
        </div>
      ) : null}

      <div className="premium-card rounded-2xl p-5">
        <h2 className="font-semibold text-slate-950">KullanÄ±m notu</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Ã–nce ayar sÃ¶zlÃ¼klerini girin. Sonra hammadde stok kartlarÄ±nÄ± ve satÄ±cÄ± sipariÅŸlerini aÃ§Ä±n. MÃ¼ÅŸteri sipariÅŸinde aynÄ± Ã¶zelliklerde YM/MM stok yoksa sistem yeni kod Ã¼retim mantÄ±ÄŸÄ±yla kart aÃ§acak ÅŸekilde kurgulandÄ±. Ham Ã¼retim ilk parti numarasÄ±nÄ± oluÅŸturur; boyahane, transfer ve satÄ±ÅŸ hareketleri bu parti Ã¼zerinden izlenir.
        </p>
      </div>
    </div>
  );
}










