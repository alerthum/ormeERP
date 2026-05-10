"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, ArrowRight, Boxes, Factory, PackageCheck, ShieldAlert, ShieldCheck, ShoppingCart, Timer, TrendingDown, Truck } from "lucide-react";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge, statusTone } from "@/components/ui/status-badge";
import { useErpData } from "@/components/erp-data-provider";
import { getComputedNotifications, getDashboardMetrics, getName, getPurchaseProgress } from "@/services/erp-service";
import { formatKg, formatPercent, formatDate, wasteTone, cn } from "@/lib/utils";
import { SystemHealthWidget } from "@/components/ui/system-health";
import { MobilePageSkeleton } from "@/components/ui/mobile-skeleton";

export function Dashboard() {
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
  const { data, loading } = useErpData();
  const metrics = getDashboardMetrics(data);
  const notifications = getComputedNotifications(data);

  if (loading && data.orders.length === 0) {
    return <MobilePageSkeleton kpiCount={5} />;
  }
  const productionByMonth = new Map<string, { month: string; kg: number }>();
  for (const item of data.productionRaw) {
    const month = new Intl.DateTimeFormat("tr-TR", { month: "short" }).format(new Date(item.date));
    const current = productionByMonth.get(month) ?? { month, kg: 0 };
    productionByMonth.set(month, { month, kg: current.kg + item.producedRawKg });
  }
  for (const item of data.productionDyehouse) {
    const month = new Intl.DateTimeFormat("tr-TR", { month: "short" }).format(new Date(item.date));
    const current = productionByMonth.get(month) ?? { month, kg: 0 };
    productionByMonth.set(month, { month, kg: current.kg + item.finishedKg });
  }
  const productionTrend = Array.from(productionByMonth.values());
  const statusData = ["İplik Bekliyor", "Örmede", "Boyahanede", "Mamül Hazır"].map((status) => ({
    name: status,
    value: data.orders.filter((order) => order.status === status).length,
  }));
  const colors = ["#2563eb", "#10b981", "#f59e0b", "#ef4444"];

  return (
    <div className="space-y-6">
      <SystemHealthWidget status={data.integrityStatus} stats={data.integrityStats} />
      <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
        <StatCard title="Bu Ay Ham Üretim" value={formatKg(metrics.monthlyRawKg)} helper="Örülen ham kumaş toplamı" icon={Factory} tone="blue" compact />
        <StatCard title="Bu Ay Mamül Üretim" value={formatKg(metrics.monthlyFinishedKg)} helper="Boyadan dönen mamül toplamı" icon={PackageCheck} tone="green" compact />
        <StatCard title="Toplam fire" value={formatKg(metrics.wasteKg)} helper={`Ham ${formatPercent(metrics.avgRawWaste)} / Boya ${formatPercent(metrics.avgDyeWaste)}`} icon={TrendingDown} tone="red" compact />
        <StatCard title="Bekleyen hammadde" value={formatKg(metrics.pendingRawMaterialKg)} helper={`${metrics.openPurchaseCount} açık satıcı siparişi`} icon={PackageCheck} tone="amber" compact />
      </div>

      <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-5">
        <StatCard title="Örmede" value={String(metrics.knittingOrders)} helper="Fason örmeci üzerinde" icon={Factory} compact />
        <StatCard title="Boyahanede" value={String(metrics.dyehouseOrders)} helper="Proses bekleyen işler" icon={Truck} compact />
        <StatCard title="Kısmi gelen" value={String(metrics.partialPurchaseCount)} helper="Hammadde siparişleri" icon={Boxes} tone="amber" compact />
        <StatCard title="Bu ay gelen" value={formatKg(metrics.monthlyReceivedKg)} helper="Mal kabul toplamı" icon={PackageCheck} tone="green" compact />
        <StatCard title="Geciken satın alma" value={String(metrics.delayedPurchaseCount)} helper="Termin riski" icon={AlertTriangle} tone="red" compact />
      </div>

      <div className="grid gap-4 sm:gap-5 xl:grid-cols-[1.4fr_0.8fr]">
        <div className="premium-card rounded-none p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm sm:text-base font-semibold text-slate-950">Aylık üretim trendi</h2>
              <p className="text-xs sm:text-sm text-slate-500 hidden sm:block">Üretim kg ile gerçek fire yüzdesi</p>
            </div>
            <StatusBadge tone="green">Canlı</StatusBadge>
          </div>
          <div className="mt-4 sm:mt-6 h-48 sm:h-72">
            {mounted ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={productionTrend}>
                  <defs>
                    <linearGradient id="kg" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#2563eb" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#2563eb" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                  <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} width={40} />
                  <Tooltip />
                  <Area dataKey="kg" fill="url(#kg)" stroke="#2563eb" strokeWidth={3} />
                </AreaChart>
              </ResponsiveContainer>
            ) : null}
          </div>
        </div>

        <div className="premium-card rounded-none p-4 sm:p-5">
          <h2 className="text-sm sm:text-base font-semibold text-slate-950">Sipariş durum dağılımı</h2>
          <div className="mt-4 sm:mt-6 h-44 sm:h-60">
            {mounted ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statusData} dataKey="value" innerRadius={40} outerRadius={68} paddingAngle={6}>
                    {statusData.map((entry, index) => <Cell key={entry.name} fill={colors[index % colors.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : null}
          </div>
          <div className="grid gap-1.5 sm:gap-2">
            {statusData.map((item, index) => (
              <div key={item.name} className="flex items-center justify-between text-xs sm:text-sm">
                <span className="flex items-center gap-2 text-slate-500"><span className="size-2 rounded-full" style={{ background: colors[index] }} />{item.name}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="premium-card rounded-none p-5 xl:col-span-2">
          <h2 className="font-semibold text-slate-950">Satıcı bazlı açık sipariş kg</h2>
          <div className="mt-5 h-64">
            {mounted ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.purchaseOrders.map((order) => ({ supplier: getName(data.partners, order.supplierId), kg: order.totalRemainingKg }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="supplier" stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" />
                  <Tooltip />
                  <Bar dataKey="kg" fill="#2563eb" radius={[12, 12, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : null}
          </div>
        </div>
        <div className="premium-card rounded-none p-5">
          <h2 className="font-semibold text-slate-950">Fasoncu risk listesi</h2>
          <div className="mt-5 space-y-3">
            {data.partners.filter((partner) => partner.type === "KNITTER").map((partner) => (
              <div key={partner.id} className="flex items-center justify-between rounded-none bg-slate-50 p-3">
                <div>
                  <p className="font-semibold text-slate-900">{partner.name}</p>
                  <p className="text-sm text-slate-500">Son fire riski</p>
                </div>
                <StatusBadge tone={wasteTone(partner.riskScore ?? 0)}>{formatPercent(partner.riskScore ?? 0)}</StatusBadge>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:gap-5 xl:grid-cols-2">
        <div className="premium-card rounded-none p-4 sm:p-5">
          <h2 className="text-sm sm:text-base font-semibold text-slate-950">Termin yaklaşan satın alma</h2>
          {/* Desktop table */}
          <div className="mt-5 overflow-x-auto hidden md:block">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider">
                  <th className="pb-3 pl-2">Satıcı / No</th>
                  <th className="pb-3">Stok Adı / Özellik</th>
                  <th className="pb-3">Sipariş</th>
                  <th className="pb-3">Gelen</th>
                  <th className="pb-3">Kalan</th>
                  <th className="pb-3">Termin</th>
                  <th className="pb-3 pr-2 text-right">Durum</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {data.purchaseOrders.slice(0, 8).map((order) => {
                  const item = order.items[0]; // Genelde tek kalem bazlı çalışıyor
                  return (
                    <tr key={order.id} className="group hover:bg-slate-50 transition-colors">
                      <td className="py-3 pl-2">
                        <p className="font-bold text-slate-900">{getName(data.partners, order.supplierId)}</p>
                        <p className="text-[10px] text-slate-400">{order.purchaseOrderNo}</p>
                      </td>
                      <td className="py-3">
                        <p className="font-medium text-slate-700">{item?.stockName || '-'}</p>
                        <p className="text-[10px] text-slate-400">
                          {getName(data.yarnCounts, item?.yarnCountId)} · {getName(data.colors, item?.colorId)}
                        </p>
                      </td>
                      <td className="py-3 font-semibold text-slate-600">{formatKg(order.totalOrderedKg)}</td>
                      <td className="py-3 font-semibold text-emerald-600">{formatKg(order.totalReceivedKg)}</td>
                      <td className="py-3 font-semibold text-rose-600">{formatKg(order.totalRemainingKg)}</td>
                      <td className="py-3 text-slate-500">{formatDate(order.dueDate)}</td>
                      <td className="py-3 pr-2 text-right">
                        <StatusBadge tone={statusTone(order.status)}>{order.status}</StatusBadge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* Mobile card list */}
          <div className="mt-4 space-y-2.5 md:hidden">
            {data.purchaseOrders.slice(0, 6).map((order) => {
              const item = order.items[0];
              return (
                <div key={order.id} className="rounded-none border border-slate-100 bg-white p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-900 truncate">{getName(data.partners, order.supplierId)}</p>
                      <p className="text-[10px] text-slate-400">{order.purchaseOrderNo}</p>
                    </div>
                    <StatusBadge tone={statusTone(order.status)}>{order.status}</StatusBadge>
                  </div>
                  <p className="text-[11px] text-slate-600 truncate">{item?.stockName || '-'}</p>
                  <div className="grid grid-cols-3 gap-1 text-center border-t border-slate-50 pt-2">
                    <div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase">Sipariş</p>
                      <p className="text-[11px] font-bold text-slate-800">{formatKg(order.totalOrderedKg)}</p>
                    </div>
                    <div className="border-x border-slate-50">
                      <p className="text-[9px] font-bold text-slate-400 uppercase">Gelen</p>
                      <p className="text-[11px] font-bold text-emerald-600">{formatKg(order.totalReceivedKg)}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase">Kalan</p>
                      <p className="text-[11px] font-bold text-rose-600">{formatKg(order.totalRemainingKg)}</p>
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-400">Termin: {formatDate(order.dueDate)}</p>
                </div>
              );
            })}
          </div>
        </div>
        <div className="premium-card rounded-none p-4 sm:p-5">
          <h2 className="text-sm sm:text-base font-semibold text-slate-950">Son stok hareketleri</h2>
          <div className="mt-4 sm:mt-5 space-y-2 sm:space-y-3">
            {data.stockMovements.slice(0, 5).map((movement) => (
              <div key={movement.id} className="flex items-center justify-between gap-2 sm:gap-3 rounded-none bg-slate-50 p-2.5 sm:p-3">
                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                  <div className="grid size-8 sm:size-10 shrink-0 place-items-center rounded-none bg-white text-blue-600 shadow-sm"><Timer className="size-3.5 sm:size-4" /></div>
                  <div className="min-w-0">
                    <p className="text-xs sm:text-sm font-semibold text-slate-900 truncate">{movement.description}</p>
                    <p className="text-[10px] sm:text-sm text-slate-500 truncate">{getName(data.warehouses, movement.warehouseId)}</p>
                  </div>
                </div>
                <strong className={cn("shrink-0 text-xs sm:text-sm", movement.direction === "IN" ? "text-emerald-600" : "text-rose-600")}>{movement.direction === "IN" ? "+" : "-"}{formatKg(movement.quantity)}</strong>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}


