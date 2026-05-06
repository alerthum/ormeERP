"use client";

import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { useErpData } from "@/components/erp-data-provider";
import { formatKg, formatPercent, formatDate } from "@/lib/utils";
import { LayoutDashboard, Users, Truck, TrendingUp, Calendar, Search, Filter, ChevronDown, ChevronUp } from "lucide-react";
import { useState, useMemo } from "react";
import { getName } from "@/services/erp-service";
import { StatusBadge, statusTone } from "@/components/ui/status-badge";
import { SystemHealthWidget } from "@/components/ui/system-health";

function Dashboard2Content() {
  const { data, loading } = useErpData();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const filteredData = useMemo(() => {
    const safeOrders = Array.isArray(data.orders) ? data.orders : [];
    const safePurchaseOrders = Array.isArray(data.purchaseOrders) ? data.purchaseOrders : [];
    const safeSales = Array.isArray(data.sales) ? data.sales : [];

    let orders = safeOrders;
    if (dateFrom) orders = orders.filter(o => o.orderDate >= dateFrom);
    if (dateTo) orders = orders.filter(o => o.orderDate <= dateTo);
    
    let purchaseOrders = safePurchaseOrders;
    if (dateFrom) purchaseOrders = purchaseOrders.filter(p => p.createdAt >= dateFrom);
    if (dateTo) purchaseOrders = purchaseOrders.filter(p => p.createdAt <= dateTo);
    
    let sales = safeSales;
    if (dateFrom) sales = sales.filter(s => s.date >= dateFrom);
    if (dateTo) sales = sales.filter(s => s.date <= dateTo);
    
    return { orders, purchaseOrders, sales };
  }, [data, dateFrom, dateTo]);

  // Dynamic calculations for Orders
  const orderMetrics = useMemo(() => {
    const metricsMap = new Map<string, { knitted: number, dyed: number, shipped: number }>();
    
    // Initializing with zero for all filtered orders
    filteredData.orders.forEach(o => {
      metricsMap.set(o.id, { knitted: 0, dyed: 0, shipped: 0 });
    });

    // Knitting (Raw Production)
    data.productionRaw.forEach(p => {
      if (metricsMap.has(p.orderId)) {
        const m = metricsMap.get(p.orderId)!;
        m.knitted += (p.producedRawKg || 0);
      }
    });

    // Dyehouse (Finished Production)
    data.productionDyehouse.forEach(p => {
      if (metricsMap.has(p.orderId)) {
        const m = metricsMap.get(p.orderId)!;
        m.dyed += (p.finishedKg || 0);
      }
    });

    // Shipped (Sales)
    data.sales.forEach(s => {
      if (s.orderId && metricsMap.has(s.orderId)) {
        const m = metricsMap.get(s.orderId)!;
        m.shipped += (s.quantityKg || 0);
      }
    });

    return metricsMap;
  }, [data.productionRaw, data.productionDyehouse, data.sales, filteredData.orders]);

  // Search filter both lists
  const filteredOrders = useMemo(() => {
    if (!searchTerm) return filteredData.orders;
    const s = searchTerm.toLowerCase();
    return filteredData.orders.filter(o => 
      o.customerName?.toLowerCase().includes(s) || 
      o.orderNo?.toLowerCase().includes(s) ||
      getName(data.fabricTypes, o.fabricTypeId).toLowerCase().includes(s) ||
      getName(data.colors, o.colorId).toLowerCase().includes(s)
    );
  }, [filteredData.orders, searchTerm, data]);

  const filteredPurchaseOrders = useMemo(() => {
    if (!searchTerm) return filteredData.purchaseOrders;
    const s = searchTerm.toLowerCase();
    return filteredData.purchaseOrders.filter(p => 
      getName(data.partners, p.supplierId).toLowerCase().includes(s) ||
      p.purchaseOrderNo?.toLowerCase().includes(s) ||
      p.items.some(item => item.stockName?.toLowerCase().includes(s))
    );
  }, [filteredData.purchaseOrders, searchTerm, data]);

  const totalOrderKg = filteredOrders.reduce((s, o) => s + (o.quantityKg || 0), 0);
  const totalPurchaseKg = filteredPurchaseOrders.reduce((s, o) => s + (o.totalOrderedKg || 0), 0);

  return (
    <div className="space-y-6 relative min-h-[400px]">
      
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader 
          eyebrow="Analitik Rapor" 
          title="Patron Özeti" 
          description="Sipariş ve satın alma süreçlerinin anlık takibi." 
          icon={LayoutDashboard} 
        />
        <div className="flex items-center gap-2">
          <div className="relative w-64">
            <input 
              type="text" 
              placeholder="Tüm tablolarda ara..."
              className="w-full rounded-none border border-slate-200 bg-white pl-9 pr-3 py-2 text-sm outline-none focus:border-blue-400" 
              value={searchTerm} 
              onChange={e => setSearchTerm(e.target.value)} 
            />
            <Search className="absolute left-3 top-2.5 size-4 text-slate-400" />
          </div>
          <button 
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 rounded-none bg-slate-900 px-4 py-2 text-xs font-bold text-white transition hover:bg-slate-800"
          >
            <Filter className="size-3" />
            {showFilters ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
          </button>
        </div>
      </div>

      {/* Collapsible Filters */}
      {showFilters && (
        <div className="premium-card rounded-none p-4 grid gap-4 md:grid-cols-2 animate-in fade-in slide-in-from-top-2">
          <div className="space-y-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <Calendar className="size-3" /> Başlangıç
            </span>
            <input 
              type="date" 
              className="w-full rounded-none border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400" 
              value={dateFrom} 
              onChange={e => setDateFrom(e.target.value)} 
            />
          </div>
          <div className="space-y-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <Calendar className="size-3" /> Bitiş
            </span>
            <input 
              type="date" 
              className="w-full rounded-none border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400" 
              value={dateTo} 
              onChange={e => setDateTo(e.target.value)} 
            />
          </div>
        </div>
      )}

      <SystemHealthWidget status={data.integrityStatus} stats={data.integrityStats} />

      {/* Top KPIs */}
      <div className="grid gap-4 md:grid-cols-2">
        <StatCard title="Filtrelenmiş Müşteri Sipariş" value={formatKg(totalOrderKg)} helper="Seçili kapsamdaki toplam talep" icon={Users} tone="blue" compact />
        <StatCard title="Filtrelenmiş Satın Alma" value={formatKg(totalPurchaseKg)} helper="Seçili kapsamdaki toplam tedarik" icon={Truck} tone="amber" compact />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        {/* Customer Table */}
        <div className="premium-card rounded-none p-5">
          <div className="flex items-center justify-between mb-6 border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-none bg-blue-50 text-blue-600">
                <Users className="size-5" />
              </div>
              <div>
                <h2 className="font-bold text-slate-900">Müşteri Sipariş Durumları</h2>
                <p className="text-xs text-slate-500">Örülen, Üretilen ve Sevkiyat Takibi</p>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[11px] border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider">
                  <th className="pb-3 pl-2">Müşteri / No</th>
                  <th className="pb-3">Kumaş / Renk</th>
                  <th className="pb-3">Sipariş</th>
                  <th className="pb-3">Örülen</th>
                  <th className="pb-3">Boyahane</th>
                  <th className="pb-3">Sevk</th>
                  <th className="pb-3 pr-2 text-right">Durum</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredOrders.slice(0, 15).map((order) => {
                  const m = orderMetrics.get(order.id) || { knitted: 0, dyed: 0, shipped: 0 };
                  return (
                    <tr key={order.id} className="group hover:bg-slate-50 transition-colors">
                      <td className="py-3 pl-2">
                        <p className="font-bold text-slate-900">{order.customerName}</p>
                        <p className="text-[10px] text-slate-400">{order.orderNo}</p>
                      </td>
                      <td className="py-3">
                        <p className="font-medium text-slate-700">{getName(data.fabricTypes, order.fabricTypeId)}</p>
                        <p className="text-[10px] text-slate-400">{getName(data.colors, order.colorId)}</p>
                      </td>
                      <td className="py-3 font-semibold text-slate-600">{formatKg(order.quantityKg)}</td>
                      <td className="py-3 font-semibold text-indigo-600">{formatKg(m.knitted)}</td>
                      <td className="py-3 font-semibold text-blue-600">{formatKg(m.dyed)}</td>
                      <td className="py-3 font-semibold text-emerald-600">{formatKg(m.shipped)}</td>
                      <td className="py-3 pr-2 text-right">
                        <StatusBadge tone={statusTone(order.status)}>{order.status}</StatusBadge>
                      </td>
                    </tr>
                  );
                })}
                {filteredOrders.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-slate-400 italic">Kayıt bulunamadı.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {/* Supplier Table */}
        <div className="premium-card rounded-none p-5">
          <div className="flex items-center justify-between mb-6 border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-none bg-amber-50 text-amber-600">
                <Truck className="size-5" />
              </div>
              <div>
                <h2 className="font-bold text-slate-900">Hammadde Sipariş Durumları</h2>
                <p className="text-xs text-slate-500">Termin Yaklaşan Satın Almalar</p>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[11px] border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider">
                  <th className="pb-3 pl-2">Satıcı / No</th>
                  <th className="pb-3">Stok Adı</th>
                  <th className="pb-3">Sipariş</th>
                  <th className="pb-3">Gelen</th>
                  <th className="pb-3">Kalan</th>
                  <th className="pb-3 pr-2 text-right">Durum</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredPurchaseOrders.slice(0, 15).map((order) => {
                  const item = order.items[0];
                  return (
                    <tr key={order.id} className="group hover:bg-slate-50 transition-colors">
                      <td className="py-3 pl-2">
                        <p className="font-bold text-slate-900">{getName(data.partners, order.supplierId)}</p>
                        <p className="text-[10px] text-slate-400">{order.purchaseOrderNo}</p>
                      </td>
                      <td className="py-3">
                        <p className="font-medium text-slate-700 truncate max-w-[120px]">{item?.stockName || '-'}</p>
                        <p className="text-[10px] text-slate-400">Termin: {formatDate(order.dueDate)}</p>
                      </td>
                      <td className="py-3 font-semibold text-slate-600">{formatKg(order.totalOrderedKg)}</td>
                      <td className="py-3 font-semibold text-emerald-600">{formatKg(order.totalReceivedKg)}</td>
                      <td className="py-3 font-semibold text-rose-600">{formatKg(order.totalRemainingKg)}</td>
                      <td className="py-3 pr-2 text-right">
                        <StatusBadge tone={statusTone(order.status)}>{order.status}</StatusBadge>
                      </td>
                    </tr>
                  );
                })}
                {filteredPurchaseOrders.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-slate-400 italic">Kayıt bulunamadı.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard2Page() {
  return (
    <AppShell>
      <Dashboard2Content />
    </AppShell>
  );
}
