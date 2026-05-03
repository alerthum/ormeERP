"use client";

import Link from "next/link";
import { BarChart3, BookOpen, Boxes, CheckCircle2, Factory, KeyRound, PackagePlus, Plus, Settings, ShoppingCart, SlidersHorizontal, Truck, Users, Warehouse } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { DataTable, type Column } from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge, statusTone } from "@/components/ui/status-badge";
import { StatCard } from "@/components/ui/stat-card";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { FormDrawer } from "@/components/ui/form-drawer";
import { DyehouseProductionForm, OrderForm, PurchaseOrderForm, PurchaseReceiptForm, RawProductionForm, SettingForm, StockCardForm, TransferForm } from "@/components/forms";
import { PartyTimeline } from "@/components/party-timeline";
import { useErpData } from "@/components/erp-data-provider";
import { getDashboardMetrics, getName, getPurchaseProgress } from "@/services/erp-service";
import type { Order, Party, PurchaseOrder, StockCard, StockMovement } from "@/types/erp";
import { formatDate, formatKg, formatPercent, wasteTone } from "@/lib/utils";

const primaryButton = "inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-100";

export function OrdersPage() {
  const { data } = useErpData();
  const [open, setOpen] = useState(false);
  const columns: Column<Order>[] = [
    { header: "SipariÅŸ", cell: (row) => <Link className="font-semibold text-blue-700" href={`/orders/${row.id}`}>{row.orderNo}</Link> },
    { header: "MÃ¼ÅŸteri", cell: (row) => row.customerName },
    { header: "KumaÅŸ", cell: (row) => getName(data.fabricTypes, row.fabricTypeId) },
    { header: "Renk", cell: (row) => getName(data.colors, row.colorId) },
    { header: "Kg", cell: (row) => formatKg(row.quantityKg) },
    { header: "Durum", cell: (row) => <StatusBadge tone={statusTone(row.status)}>{row.status}</StatusBadge> },
  ];
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="SipariÅŸler" title="MÃ¼ÅŸteri SipariÅŸleri" description="KumaÅŸ Ã¼retim talepleri, otomatik YM/MM stok eÅŸleÅŸmesi ve Ã¼retim durum takibi." icon={ShoppingCart} action={<button className={primaryButton} onClick={() => setOpen(true)}><Plus className="size-4" />Yeni sipariÅŸ</button>} />
      <DataTable rows={data.orders} columns={columns} />
      <FormDrawer open={open} title="Yeni mÃ¼ÅŸteri sipariÅŸi" onClose={() => setOpen(false)}><OrderForm /></FormDrawer>
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
  const { data } = useErpData();
  const [orderOpen, setOrderOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const columns: Column<PurchaseOrder>[] = [
    { header: "SipariÅŸ", cell: (row) => <span className="font-semibold text-blue-700">{row.purchaseOrderNo}</span> },
    { header: "SatÄ±cÄ±", cell: (row) => getName(data.partners, row.supplierId) },
    { header: "SipariÅŸ kg", cell: (row) => formatKg(row.totalOrderedKg) },
    { header: "Gelen", cell: (row) => formatKg(row.totalReceivedKg) },
    { header: "Kalan", cell: (row) => formatKg(row.totalRemainingKg) },
    { header: "Durum", cell: (row) => <StatusBadge tone={statusTone(row.status)}>{row.status}</StatusBadge> },
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
    </div>
  );
}

export function StocksPage() {
  const { data } = useErpData();
  const [open, setOpen] = useState(false);
  const columns: Column<StockCard>[] = [
    { header: "Kod", cell: (row) => <Link className="font-semibold text-blue-700" href={`/stocks/${row.id}`}>{row.code}</Link> },
    { header: "Ad", cell: (row) => row.name },
    { header: "Tip", cell: (row) => <StatusBadge tone={row.type === "MM" ? "green" : row.type === "YM" ? "blue" : "amber"}>{row.type}</StatusBadge> },
    { header: "Ne", cell: (row) => getName(data.yarnCounts, row.yarnCountId) },
    { header: "Stok", cell: (row) => formatKg(row.currentStockKg) },
    { header: "Kritik", cell: (row) => formatKg(row.criticalStockKg) },
  ];
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Stok" title="Stok KartlarÄ±" description="YM/MM partili izlenir; IP/LYC/POLY satÄ±n alma ve Ã¼retim tÃ¼ketimiyle takip edilir." icon={Boxes} action={<button className={primaryButton} onClick={() => setOpen(true)}><Plus className="size-4" />Stok kartÄ±</button>} />
      <DataTable rows={data.stockCards} columns={columns} />
      <FormDrawer open={open} title="Yeni stok kartÄ±" onClose={() => setOpen(false)}><StockCardForm /></FormDrawer>
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

export function SimpleModulePage({ kind }: { kind: "warehouses" | "partners" | "sales" | "reports" | "settings" }) {
  const { data } = useErpData();
  const [open, setOpen] = useState(false);
  const map = {
    warehouses: { title: "Depo YÃ¶netimi", desc: "Depo tanÄ±mlarÄ±, bakiye kartlarÄ± ve partili stok gÃ¶rÃ¼nÃ¼mÃ¼.", icon: Warehouse },
    partners: { title: "Fasoncu Cari YÃ¶netimi", desc: "Fason Ã¶rmeci, boyahane, satÄ±cÄ± ve mÃ¼ÅŸteri kartlarÄ±.", icon: Users },
    sales: { title: "SatÄ±ÅŸ / Sevkiyat", desc: "MamÃ¼l kumaÅŸÄ±n satÄ±ÅŸ maÄŸazasÄ± ve sevkiyat deposu Ã§Ä±kÄ±ÅŸlarÄ±.", icon: Truck },
    reports: { title: "Raporlar", desc: "Ãœretim, stok, satÄ±n alma ve fire raporlarÄ±.", icon: BarChart3 },
    settings: { title: "Ayarlar", desc: "KumaÅŸ cinsi, renk, Ne, proses, depo, rol ve prefix tanÄ±mlarÄ±.", icon: Settings },
  }[kind];
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
    href: "/settings",
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
                    className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700"
                    onClick={() => deleteDefinition(settingConfig.entity, row.id).catch((error: unknown) => toast.error(error instanceof Error ? error.message : "TanÄ±m silinemedi."))}
                    type="button"
                  >
                    Sil
                  </button>
                </div>
              ))
            )}
          </div>
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










