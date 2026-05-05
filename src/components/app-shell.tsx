"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
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
  Bell,
  ChevronDown,
  ChevronRight,
  Plus,
  Minus,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ErpDataProvider, useErpData } from "@/components/erp-data-provider";
import { getComputedNotifications } from "@/services/erp-service";

const navigationGroups = [
  {
    title: "Dashboard",
    items: [
      { href: "/dashboard", label: "Operasyon Paneli", icon: Home },
      { href: "/dashboard2", label: "Patron Özeti", icon: TrendingUp },
    ]
  },
  {
    title: "Siparişler",
    items: [
      { href: "/orders", label: "Müşteri Siparişleri", icon: ShoppingCart },
      { href: "/purchase-orders", label: "Satıcı Siparişleri", icon: PackagePlus },
    ]
  },
  {
    title: "İşlemler",
    items: [
      { href: "/purchases", label: "Alış İşlemleri", icon: PackageCheck },
      { href: "/production/raw", label: "Ham Üretim", icon: Factory },
      { href: "/transfers", label: "Depo Transferi", icon: Truck },
      { href: "/production/dyehouse", label: "Boyahane", icon: PackageCheck },
      { href: "/sales", label: "Satış Sevkiyat", icon: Truck },
    ]
  },
  {
    title: "Raporlar",
    items: [
      { href: "/parties", label: "Parti Raporu", icon: Store },
      { href: "/waste-analysis", label: "Fire Analizi", icon: BarChart3 },
    ]
  },
  {
    title: "Tanımlar",
    items: [
      { href: "/stocks", label: "Stok Kartları", icon: Boxes },
      { href: "/warehouses", label: "Depo Yönetimi", icon: Warehouse },
      { href: "/partners", label: "Cari / Fasoncu", icon: Users },
    ]
  },
  {
    title: "Ayarlar",
    items: [
      { href: "/settings", label: "Genel Ayarlar", icon: Settings },
      { href: "/settings/project", label: "Proje Ayarları", icon: BarChart3 },
    ]
  }
];

const navigation = navigationGroups.flatMap(g => g.items);

const mobileNavigation = [
  { href: "/dashboard", label: "Panel", icon: Home },
  { href: "/orders", label: "Sipariş", icon: ShoppingCart },
  { href: "/production/raw", label: "Üretim", icon: Factory },
  { href: "/parties", label: "Parti", icon: Store },
  { href: "/stocks", label: "Stok", icon: Boxes },
];

export function AppShellContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const { data } = useErpData();
  const settings = data.uiSettings;
  const notifications = getComputedNotifications(data).slice(0, settings.maxNotificationCount);
  
  const [mounted, setMounted] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setMounted(true);
    const initialState: Record<string, boolean> = {};
    navigationGroups.forEach(g => {
      initialState[g.title] = settings.submenuDefaultState === "open";
    });

    const saved = localStorage.getItem("sidebar_expanded_groups");
    if (saved) {
      try {
        setExpandedGroups({ ...initialState, ...JSON.parse(saved) });
      } catch {
        setExpandedGroups(initialState);
      }
    } else {
      setExpandedGroups(initialState);
    }
  }, [settings.submenuDefaultState]);

  const toggleGroup = (title: string) => {
    setExpandedGroups(prev => {
      const next = { ...prev, [title]: !prev[title] };
      if (typeof window !== "undefined") {
        localStorage.setItem("sidebar_expanded_groups", JSON.stringify(next));
      }
      return next;
    });
  };

  const expandAll = () => {
    const next: Record<string, boolean> = {};
    navigationGroups.forEach(g => next[g.title] = true);
    setExpandedGroups(next);
    if (typeof window !== "undefined") {
      localStorage.setItem("sidebar_expanded_groups", JSON.stringify(next));
    }
  };

  const collapseAll = () => {
    const next: Record<string, boolean> = {};
    navigationGroups.forEach(g => next[g.title] = false);
    setExpandedGroups(next);
    if (typeof window !== "undefined") {
      localStorage.setItem("sidebar_expanded_groups", JSON.stringify(next));
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#eff6ff,transparent_32%),#f8fafc]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 flex-col border-r border-slate-200/80 bg-white/90 p-4 backdrop-blur-xl lg:flex">
        <Link href="/dashboard" className="flex items-center gap-3 rounded-none bg-blue-600 p-3 text-white shadow-lg shadow-blue-100">
          <div className="grid size-11 place-items-center rounded-none bg-white/15">
            <Factory className="size-5" />
          </div>
          <div>
            <p className="text-sm font-semibold">Yokuş Örme</p>
            <p className="text-xs text-blue-100">ERP Command Center</p>
          </div>
        </Link>
        
        {settings.menuMode === "collapsible" && (
          <div className="mt-4 flex items-center justify-end gap-1 px-1">
            <button onClick={expandAll} className="grid size-7 place-items-center rounded-none bg-slate-50 text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition-colors" title="Tümünü Aç"><Plus className="size-3.5" /></button>
            <button onClick={collapseAll} className="grid size-7 place-items-center rounded-none bg-slate-50 text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition-colors" title="Tümünü Kapat"><Minus className="size-3.5" /></button>
          </div>
        )}

        <nav className="mt-5 flex-1 space-y-1 overflow-y-auto pr-1 custom-scrollbar">
          {navigationGroups.map((group) => {
            const isCollapsible = settings.menuMode === "collapsible";
            const isExpanded = mounted 
              ? expandedGroups[group.title] !== false 
              : settings.submenuDefaultState === "open";
            
            return (
              <div key={group.title} className="space-y-1">
                {isCollapsible ? (
                  <button
                    onClick={() => toggleGroup(group.title)}
                    className="flex w-full items-center justify-between rounded-none px-3 py-2 text-[11px] font-bold uppercase tracking-wider transition-all"
                    style={{ 
                      backgroundColor: settings.sidebarGroupBg || "#f8fafc",
                      color: settings.sidebarGroupText || "#64748b"
                    }}
                  >
                    {group.title}
                    {isExpanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                  </button>
                ) : (
                  <div 
                    className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider rounded-none"
                    style={{ 
                      backgroundColor: settings.sidebarGroupBg || "#f8fafc",
                      color: settings.sidebarGroupText || "#64748b"
                    }}
                  >
                    {group.title}
                  </div>
                )}
                
                <div 
                  key={group.title + "_content"}
                  className={cn(
                    "overflow-hidden transition-all duration-300 ease-in-out",
                    isCollapsible && !isExpanded ? "max-h-0 opacity-0" : "max-h-[500px] opacity-100"
                  )}
                >
                  {group.items.map((item) => {
                    const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          "flex items-center gap-3 rounded-none px-3 py-2.5 text-sm font-semibold transition-all duration-200",
                          active 
                            ? "bg-blue-50 text-blue-700 shadow-sm ring-1 ring-blue-100" 
                            : "text-slate-500 hover:bg-slate-50/80 hover:text-slate-950 hover:translate-x-1",
                        )}
                      >
                        <Icon className="size-5" />
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>
      </aside>

      <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/85 px-4 py-3 backdrop-blur-xl lg:ml-72 lg:px-8">
        <div className="flex items-center justify-between gap-4">
          <div className="hidden sm:block">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">Fason örme ERP</p>
            <p className="text-sm text-slate-500">Canlı üretim ve stok takibi</p>
          </div>
          <div className="flex flex-1 justify-center">
            <input className="w-full max-w-xl rounded-none border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50" placeholder="Hızlı arama..." />
          </div>
          <div className="flex items-center gap-3">
            {settings.notificationsEnabled && (
              <div className="relative">
                <button 
                  onClick={() => setNotifOpen(!notifOpen)}
                  className={cn(
                    "relative grid size-11 place-items-center rounded-none border border-slate-200 bg-white text-slate-600 transition-all hover:bg-slate-50",
                    notifOpen && "border-blue-200 bg-blue-50 text-blue-600 ring-4 ring-blue-50"
                  )}
                >
                  <Bell className="size-5" />
                  {notifications.length > 0 && (
                    <span className="absolute right-2.5 top-2.5 flex size-2.5 items-center justify-center rounded-full bg-rose-500 ring-2 ring-white" />
                  )}
                </button>
                
                {notifOpen && (
                  <>
                    <div className="fixed inset-0 z-[-1]" onClick={() => setNotifOpen(false)} />
                    <div className="absolute right-0 mt-3 w-80 origin-top-right animate-in fade-in slide-in-from-top-2 duration-200 rounded-3xl border border-slate-200 bg-white p-2 shadow-2xl shadow-slate-200/50">
                      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-50 mb-1">
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Bildirimler</p>
                        <span className="rounded-none bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-600">{notifications.length} Yeni</span>
                      </div>
                      <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
                        {notifications.length === 0 ? (
                          <div className="p-8 text-center">
                            <div className="mx-auto mb-3 grid size-12 place-items-center rounded-none bg-slate-50 text-slate-400">
                              <Bell className="size-6" />
                            </div>
                            <p className="text-sm font-medium text-slate-500">Bildirim bulunmuyor</p>
                          </div>
                        ) : (
                          notifications.map((n) => (
                            <div key={n.id} className="group relative rounded-none p-3 transition hover:bg-slate-50">
                              <div className="flex gap-3">
                                <div className={cn(
                                  "mt-1 size-2 shrink-0 rounded-full",
                                  n.severity === "danger" ? "bg-rose-500" : n.severity === "warning" ? "bg-amber-500" : "bg-blue-500"
                                )} />
                                <div>
                                  <p className="text-sm font-bold text-slate-900 line-clamp-1">{n.title}</p>
                                  <p className="mt-0.5 text-xs text-slate-500 line-clamp-2 leading-relaxed">{n.message}</p>
                                  <p className="mt-1.5 text-[10px] font-medium text-slate-400 uppercase tracking-tight">Yeni bildirildi</p>
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            <Link href="/login" className="flex items-center gap-3 rounded-none border border-transparent p-1 transition hover:bg-slate-50">
              <div className="hidden text-right lg:block">
                <p className="text-sm font-bold text-slate-950">ERP Admin</p>
                <p className="text-[11px] font-medium text-slate-400">Yönetici</p>
              </div>
              <div className="grid size-11 place-items-center rounded-none bg-slate-950 text-sm font-bold text-white shadow-lg shadow-slate-200">YA</div>
            </Link>
            
            <button
              aria-label="Menüyü aç"
              className="grid size-11 place-items-center rounded-none border border-slate-200 bg-white text-slate-700 shadow-sm lg:hidden"
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
              <button aria-label="Menüyü kapat" className="grid size-10 place-items-center rounded-none bg-slate-50 text-slate-600" onClick={() => setMobileMenuOpen(false)} type="button">
                <X className="size-5" />
              </button>
            </div>
            <nav className="mt-5 grid gap-2 overflow-y-auto pb-6 custom-scrollbar">
              {navigationGroups.map(group => (
                <div key={group.title} className="space-y-1">
                  <div 
                    className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider rounded-none"
                    style={{ 
                      backgroundColor: settings.sidebarGroupBg || "#f8fafc",
                      color: settings.sidebarGroupText || "#64748b"
                     }}
                  >
                    {group.title}
                  </div>
                  {group.items.map((item) => {
                    const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMobileMenuOpen(false)}
                        className={cn(
                          "flex items-center gap-3 rounded-none px-3 py-3 text-sm font-semibold transition",
                          active ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50",
                        )}
                      >
                        <Icon className="size-5" />
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              ))}
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
              <Link key={item.href} href={item.href} className={cn("flex min-h-16 flex-col items-center justify-center gap-1 rounded-none text-[11px] font-semibold", active ? "bg-blue-600 text-white" : "text-slate-500")}>
                <Icon className="size-5" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <ErpDataProvider>
      <AppShellContent>{children}</AppShellContent>
    </ErpDataProvider>
  );
}
