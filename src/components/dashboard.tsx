"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, Boxes, Factory, PackageCheck, ShoppingCart, Timer, TrendingDown, Truck } from "lucide-react";
import { useSyncExternalStore } from "react";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge, statusTone } from "@/components/ui/status-badge";
import { useErpData } from "@/components/erp-data-provider";
import { getDashboardMetrics, getName, getPurchaseProgress } from "@/services/erp-service";
import { formatKg, formatPercent, wasteTone } from "@/lib/utils";

export function Dashboard() {
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
  const { data } = useErpData();
  const metrics = getDashboardMetrics(data);
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
  const statusData = ["Ä°plik Bekliyor", "Ã–rmede", "Boyahanede", "MamÃ¼l HazÄ±r"].map((status) => ({
    name: status,
    value: data.orders.filter((order) => order.status === status).length,
  }));
  const colors = ["#2563eb", "#10b981", "#f59e0b", "#ef4444"];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Aktif sipariÅŸler" value={String(metrics.activeOrders)} helper="MÃ¼ÅŸteri Ã¼retim talepleri" icon={ShoppingCart} />
        <StatCard title="Bu ay Ã¼retim" value={formatKg(metrics.monthlyProductionKg)} helper="Ham + mamÃ¼l Ã¼retim toplamÄ±" icon={Factory} tone="green" />
        <StatCard title="Toplam fire" value={formatKg(metrics.wasteKg)} helper={`Ham ${formatPercent(metrics.avgRawWaste)} / Boya ${formatPercent(metrics.avgDyeWaste)}`} icon={TrendingDown} tone="red" />
        <StatCard title="Bekleyen hammadde" value={formatKg(metrics.pendingRawMaterialKg)} helper={`${metrics.openPurchaseCount} aÃ§Ä±k satÄ±cÄ± sipariÅŸi`} icon={PackageCheck} tone="amber" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard title="Ã–rmede" value={String(metrics.knittingOrders)} helper="Fason Ã¶rmeci Ã¼zerinde" icon={Factory} />
        <StatCard title="Boyahanede" value={String(metrics.dyehouseOrders)} helper="Proses bekleyen iÅŸler" icon={Truck} />
        <StatCard title="KÄ±smi gelen" value={String(metrics.partialPurchaseCount)} helper="SatÄ±cÄ± sipariÅŸleri" icon={Boxes} tone="amber" />
        <StatCard title="Bu ay gelen" value={formatKg(metrics.monthlyReceivedKg)} helper="Mal kabul toplamÄ±" icon={PackageCheck} tone="green" />
        <StatCard title="Geciken satÄ±n alma" value={String(metrics.delayedPurchaseCount)} helper="Termin riski" icon={AlertTriangle} tone="red" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.4fr_0.8fr]">
        <div className="premium-card rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-slate-950">AylÄ±k Ã¼retim ve fire trendi</h2>
              <p className="text-sm text-slate-500">Ãœretim kg ile gerÃ§ek fire yÃ¼zdesi</p>
            </div>
            <StatusBadge tone="green">CanlÄ±</StatusBadge>
          </div>
          <div className="mt-6 h-72">
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
                  <XAxis dataKey="month" stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" />
                  <Tooltip />
                  <Area dataKey="kg" fill="url(#kg)" stroke="#2563eb" strokeWidth={3} />
                </AreaChart>
              </ResponsiveContainer>
            ) : null}
          </div>
        </div>

        <div className="premium-card rounded-2xl p-5">
          <h2 className="font-semibold text-slate-950">SipariÅŸ durum daÄŸÄ±lÄ±mÄ±</h2>
          <div className="mt-6 h-60">
            {mounted ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statusData} dataKey="value" innerRadius={58} outerRadius={92} paddingAngle={6}>
                    {statusData.map((entry, index) => <Cell key={entry.name} fill={colors[index % colors.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : null}
          </div>
          <div className="grid gap-2">
            {statusData.map((item, index) => (
              <div key={item.name} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-slate-500"><span className="size-2 rounded-full" style={{ background: colors[index] }} />{item.name}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="premium-card rounded-2xl p-5 xl:col-span-2">
          <h2 className="font-semibold text-slate-950">SatÄ±cÄ± bazlÄ± aÃ§Ä±k sipariÅŸ kg</h2>
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
        <div className="premium-card rounded-2xl p-5">
          <h2 className="font-semibold text-slate-950">Fasoncu risk listesi</h2>
          <div className="mt-5 space-y-3">
            {data.partners.filter((partner) => partner.type === "KNITTER").map((partner) => (
              <div key={partner.id} className="flex items-center justify-between rounded-2xl bg-slate-50 p-3">
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

      <div className="grid gap-5 xl:grid-cols-2">
        <div className="premium-card rounded-2xl p-5">
          <h2 className="font-semibold text-slate-950">Termin yaklaÅŸan satÄ±n alma sipariÅŸleri</h2>
          <div className="mt-5 space-y-3">
            {data.purchaseOrders.map((order) => (
              <div key={order.id} className="rounded-2xl border border-slate-100 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-950">{order.purchaseOrderNo} Â· {getName(data.partners, order.supplierId)}</p>
                    <p className="text-sm text-slate-500">{formatKg(order.totalReceivedKg)} geldi, {formatKg(order.totalRemainingKg)} bekliyor</p>
                  </div>
                  <StatusBadge tone={statusTone(order.status)}>{order.status}</StatusBadge>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-blue-600" style={{ width: `${getPurchaseProgress(order)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="premium-card rounded-2xl p-5">
          <h2 className="font-semibold text-slate-950">Son stok hareketleri</h2>
          <div className="mt-5 space-y-3">
            {data.stockMovements.slice(0, 5).map((movement) => (
              <div key={movement.id} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 p-3">
                <div className="flex items-center gap-3">
                  <div className="grid size-10 place-items-center rounded-2xl bg-white text-blue-600 shadow-sm"><Timer className="size-4" /></div>
                  <div>
                    <p className="font-semibold text-slate-900">{movement.description}</p>
                    <p className="text-sm text-slate-500">{getName(data.warehouses, movement.warehouseId)}</p>
                  </div>
                </div>
                <strong className={movement.direction === "IN" ? "text-emerald-600" : "text-rose-600"}>{movement.direction === "IN" ? "+" : "-"}{formatKg(movement.quantity)}</strong>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

