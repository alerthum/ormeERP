"use client";

import Link from "next/link";
import { BarChart3, BookOpen, Boxes, CheckCircle2, Factory, KeyRound, PackagePlus, Plus, Settings, ShoppingCart, SlidersHorizontal, Truck, Users, Warehouse } from "lucide-react";
import { useState } from "react";
import { DataTable, type Column } from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge, statusTone } from "@/components/ui/status-badge";
import { StatCard } from "@/components/ui/stat-card";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { FormDrawer } from "@/components/ui/form-drawer";
import { DyehouseProductionForm, OrderForm, RawProductionForm, TransferForm } from "@/components/forms";
import { PartyTimeline } from "@/components/party-timeline";
import { getDashboardMetrics, getErpData, getName, getPurchaseProgress } from "@/services/erp-service";
import type { Order, Party, PurchaseOrder, StockCard, StockMovement } from "@/types/erp";
import { formatDate, formatKg, formatPercent, wasteTone } from "@/lib/utils";

const primaryButton = "inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-100";

export function OrdersPage() {
  const data = getErpData();
  const [open, setOpen] = useState(false);
  const columns: Column<Order>[] = [
    { header: "Sipariş", cell: (row) => <Link className="font-semibold text-blue-700" href={`/orders/${row.id}`}>{row.orderNo}</Link> },
    { header: "Müşteri", cell: (row) => row.customerName },
    { header: "Kumaş", cell: (row) => getName(data.fabricTypes, row.fabricTypeId) },
    { header: "Renk", cell: (row) => getName(data.colors, row.colorId) },
    { header: "Kg", cell: (row) => formatKg(row.quantityKg) },
    { header: "Durum", cell: (row) => <StatusBadge tone={statusTone(row.status)}>{row.status}</StatusBadge> },
  ];
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Siparişler" title="Müşteri Siparişleri" description="Kumaş üretim talepleri, otomatik YM/MM stok eşleşmesi ve üretim durum takibi." icon={ShoppingCart} action={<button className={primaryButton} onClick={() => setOpen(true)}><Plus className="size-4" />Yeni sipariş</button>} />
      <DataTable rows={data.orders} columns={columns} />
      <FormDrawer open={open} title="Yeni müşteri siparişi" onClose={() => setOpen(false)}><OrderForm /></FormDrawer>
    </div>
  );
}

export function OrderDetailPage({ id }: { id: string }) {
  const data = getErpData();
  const order = data.orders.find((item) => item.id === id) ?? data.orders[0];
  const party = data.parties.find((item) => item.orderId === order.id) ?? data.parties[0];
  return (
    <div className="space-y-6">
      <PageHeader eyebrow={order.orderNo} title={order.customerName} description={`${getName(data.fabricTypes, order.fabricTypeId)} · ${getName(data.colors, order.colorId)} · ${formatKg(order.quantityKg)}`} icon={ShoppingCart} action={<StatusBadge tone={statusTone(order.status)}>{order.status}</StatusBadge>} />
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard title="Termin" value={formatDate(order.dueDate)} helper="Planlanan teslim" icon={ShoppingCart} />
        <StatCard title="YM stok" value={getName(data.stockCards, order.ymStockId)} helper="Ham kumaş referansı" icon={Boxes} tone="green" />
        <StatCard title="MM stok" value={getName(data.stockCards, order.mmStockId)} helper="Mamül kumaş referansı" icon={Boxes} tone="green" />
        <StatCard title="Parti" value={party.partyNo} helper="Satışa kadar izlenir" icon={Factory} tone="amber" />
      </div>
      <PartyTimeline items={party.timeline} />
    </div>
  );
}

export function PurchaseOrdersPage() {
  const data = getErpData();
  const columns: Column<PurchaseOrder>[] = [
    { header: "Sipariş", cell: (row) => <span className="font-semibold text-blue-700">{row.purchaseOrderNo}</span> },
    { header: "Satıcı", cell: (row) => getName(data.partners, row.supplierId) },
    { header: "Sipariş kg", cell: (row) => formatKg(row.totalOrderedKg) },
    { header: "Gelen", cell: (row) => formatKg(row.totalReceivedKg) },
    { header: "Kalan", cell: (row) => formatKg(row.totalRemainingKg) },
    { header: "Durum", cell: (row) => <StatusBadge tone={statusTone(row.status)}>{row.status}</StatusBadge> },
  ];
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Satın alma" title="Satıcı Siparişleri" description="IP, LYC ve POLY hammadde siparişleri; kısmi mal kabul ve açık kg takibi." icon={PackagePlus} action={<button className={primaryButton}><Plus className="size-4" />Mal kabul</button>} />
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
    </div>
  );
}

export function StocksPage() {
  const data = getErpData();
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
      <PageHeader eyebrow="Stok" title="Stok Kartları" description="YM/MM partili izlenir; IP/LYC/POLY satın alma ve üretim tüketimiyle takip edilir." icon={Boxes} />
      <DataTable rows={data.stockCards} columns={columns} />
    </div>
  );
}

export function StockDetailPage({ id }: { id: string }) {
  const data = getErpData();
  const stock = data.stockCards.find((item) => item.id === id) ?? data.stockCards[0];
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
  const data = getErpData();
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
  const data = getErpData();
  const party = data.parties.find((item) => item.id === id) ?? data.parties[0];
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
      <PartyTimeline items={party.timeline} />
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
  const data = getErpData();
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
  const data = getErpData();
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

export function SimpleModulePage({ kind }: { kind: "warehouses" | "partners" | "sales" | "reports" | "settings" }) {
  const data = getErpData();
  const map = {
    warehouses: { title: "Depo Yönetimi", desc: "Depo tanımları, bakiye kartları ve partili stok görünümü.", icon: Warehouse },
    partners: { title: "Fasoncu Cari Yönetimi", desc: "Fason örmeci, boyahane, satıcı ve müşteri kartları.", icon: Users },
    sales: { title: "Satış / Sevkiyat", desc: "Mamül kumaşın satış mağazası ve sevkiyat deposu çıkışları.", icon: Truck },
    reports: { title: "Raporlar", desc: "Üretim, stok, satın alma ve fire raporları.", icon: BarChart3 },
    settings: { title: "Ayarlar", desc: "Kumaş cinsi, renk, Ne, proses, depo, rol ve prefix tanımları.", icon: Settings },
  }[kind];
  const rows = kind === "warehouses" ? data.warehouses : kind === "partners" ? data.partners : data.fabricTypes;
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="ERP" title={map.title} description={map.desc} icon={map.icon} action={<Link className={primaryButton} href="/settings"><Plus className="size-4" />Tanım ekle</Link>} />
      <DataTable rows={rows} columns={[
        { header: "Ad", cell: (row) => row.name },
        { header: "Durum", cell: () => <StatusBadge tone="green">Aktif</StatusBadge> },
      ]} />
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
    href: "/settings",
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
  const activeGroup = section
    ? settingGroups.find((group) => group.href.endsWith(section))
    : undefined;

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

      <div className="premium-card rounded-2xl p-5">
        <h2 className="font-semibold text-slate-950">Kullanım notu</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Önce ayar sözlüklerini girin. Sonra hammadde stok kartlarını ve satıcı siparişlerini açın. Müşteri siparişinde aynı özelliklerde YM/MM stok yoksa sistem yeni kod üretim mantığıyla kart açacak şekilde kurgulandı. Ham üretim ilk parti numarasını oluşturur; boyahane, transfer ve satış hareketleri bu parti üzerinden izlenir.
        </p>
      </div>
    </div>
  );
}
