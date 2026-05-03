"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BarChart3,
  Boxes,
  Factory,
  Home,
  Menu,
  PackageCheck,
  PackagePlus,
  Settings,
  ShoppingCart,
  Store,
  Truck,
  Users,
  Warehouse,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ErpDataProvider } from "@/components/erp-data-provider";

const navigation = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/orders", label: "Müşteri Siparişleri", icon: ShoppingCart },
  { href: "/purchase-orders", label: "Satıcı Siparişleri", icon: PackagePlus },
  { href: "/purchases", label: "Alış İşlemleri", icon: PackageCheck },
  { href: "/stocks", label: "Stok Kartları", icon: Boxes },
  { href: "/warehouses", label: "Depo Yönetimi", icon: Warehouse },
  { href: "/transfers", label: "Transfer", icon: Truck },
  { href: "/production/raw", label: "Ham Üretim", icon: Factory },
  { href: "/production/dyehouse", label: "Boyahane", icon: PackageCheck },
  { href: "/parties", label: "Partiler", icon: Store },
  { href: "/sales", label: "Satış / Sevkiyat", icon: Truck },
  { href: "/waste-analysis", label: "Fire Analizi", icon: BarChart3 },
  { href: "/partners", label: "Cari/Fasoncu", icon: Users },
  { href: "/settings", label: "Ayarlar", icon: Settings },
];

const mobileNavigation = [
  { href: "/dashboard", label: "Panel", icon: Home },
  { href: "/orders", label: "Sipariş", icon: ShoppingCart },
  { href: "/production/raw", label: "Üretim", icon: Factory },
  { href: "/parties", label: "Parti", icon: Store },
  { href: "/stocks", label: "Stok", icon: Boxes },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <ErpDataProvider>
      <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#eff6ff,transparent_32%),#f8fafc]">
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 border-r border-slate-200/80 bg-white/90 p-4 backdrop-blur-xl lg:block">
          <Link href="/dashboard" className="flex items-center gap-3 rounded-2xl bg-blue-600 p-3 text-white shadow-lg shadow-blue-100">
            <div className="grid size-11 place-items-center rounded-2xl bg-white/15">
              <Factory className="size-5" />
            </div>
            <div>
              <p className="text-sm font-semibold">Yokuş Örme</p>
              <p className="text-xs text-blue-100">ERP Command Center</p>
            </div>
          </Link>
          <nav className="mt-5 space-y-1">
            {navigation.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-semibold transition",
                    active ? "bg-blue-50 text-blue-700 shadow-sm" : "text-slate-500 hover:bg-slate-50 hover:text-slate-950",
                  )}
                >
                  <Icon className="size-5" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/85 px-4 py-3 backdrop-blur-xl lg:ml-72 lg:px-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">Fason örme ERP</p>
              <p className="text-sm text-slate-500">Canlı üretim, stok ve satın alma takibi</p>
            </div>
            <div className="hidden flex-1 justify-center md:flex">
              <input className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50" placeholder="Sipariş, parti, stok veya cari ara" />
            </div>
            <div className="flex items-center gap-2">
              <Link href="/login" className="flex items-center gap-3 rounded-2xl px-2 py-1 transition hover:bg-slate-50">
                <div className="hidden text-right sm:block">
                  <p className="text-sm font-semibold text-slate-950">ERP Admin</p>
                  <p className="text-xs text-slate-400">Üretim yöneticisi</p>
                </div>
                <div className="grid size-11 place-items-center rounded-2xl bg-slate-950 text-sm font-bold text-white">YA</div>
              </Link>
              <button
                aria-label="Menüyü aç"
                className="grid size-11 place-items-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm lg:hidden"
                onClick={() => setMobileMenuOpen(true)}
                type="button"
              >
                <Menu className="size-5" />
              </button>
            </div>
          </div>
        </header>

        {mobileMenuOpen ? (
          <div className="fixed inset-0 z-50 bg-slate-950/30 backdrop-blur-sm lg:hidden">
            <div className="ml-auto flex h-full w-[86%] max-w-sm flex-col bg-white p-4 shadow-2xl">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-slate-950">Tüm menüler</p>
                  <p className="text-xs text-slate-500">ERP modülleri</p>
                </div>
                <button aria-label="Menüyü kapat" className="grid size-10 place-items-center rounded-2xl bg-slate-50 text-slate-600" onClick={() => setMobileMenuOpen(false)} type="button">
                  <X className="size-5" />
                </button>
              </div>
              <nav className="mt-5 grid gap-2 overflow-y-auto pb-6">
                {navigation.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={cn(
                        "flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-semibold transition",
                        active ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50",
                      )}
                    >
                      <Icon className="size-5" />
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            </div>
          </div>
        ) : null}

        <main className="mobile-safe px-4 py-5 lg:ml-72 lg:px-8 lg:py-8">{children}</main>

        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-2 pb-[env(safe-area-inset-bottom)] pt-2 shadow-[0_-18px_60px_rgba(15,23,42,0.10)] backdrop-blur-xl lg:hidden">
          <div className="grid grid-cols-5 gap-1">
            {mobileNavigation.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;
              return (
                <Link key={item.href} href={item.href} className={cn("flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl text-[11px] font-semibold", active ? "bg-blue-600 text-white" : "text-slate-500")}>
                  <Icon className="size-5" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </ErpDataProvider>
  );
}
