"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import { emptyErpData } from "@/data/empty";
import { supabase } from "@/lib/supabase";
import type { ErpData } from "@/types/erp";

interface ApiResponse {
  ok: boolean;
  data?: ErpData;
  error?: string;
}

interface ErpDataContextValue {
  data: ErpData;
  loading: boolean;
  refresh: () => Promise<void>;
  mutateData: (updater: (current: ErpData) => ErpData) => void;
}

const ErpDataContext = createContext<ErpDataContextValue>({
  data: emptyErpData,
  loading: true,
  refresh: async () => undefined,
  mutateData: () => undefined,
});

function getRealtimeTablesForPath(pathname: string) {
  if (pathname === "/dashboard" || pathname === "/dashboard2" || pathname === "/") {
    return [
      "orders",
      "purchase_orders",
      "purchase_receipts",
      "stock_movements",
      "warehouse_balances",
      "parties",
      "production_raw",
      "production_dyehouse",
      "sales",
      "notifications",
      "ui_settings",
    ];
  }

  if (pathname === "/orders" || pathname.startsWith("/orders/") || pathname === "/orders/dashboard") {
    return [
      "orders",
      "parties",
      "order_party_allocations",
      "production_raw",
      "production_dyehouse",
      "sales",
      "stock_cards",
      "partners",
      "settings_fabric_types",
      "settings_colors",
      "settings_yarn_counts",
      "ui_settings",
    ];
  }

  if (pathname === "/purchase-orders" || pathname === "/purchases") {
    return [
      "purchase_orders",
      "purchase_receipts",
      "stock_movements",
      "warehouse_balances",
      "stock_cards",
      "partners",
      "warehouses",
      "ui_settings",
    ];
  }

  if (pathname === "/production/raw" || pathname === "/production/dyehouse") {
    return [
      "orders",
      "parties",
      "order_party_allocations",
      "production_raw",
      "production_dyehouse",
      "transfers",
      "stock_movements",
      "warehouse_balances",
      "stock_cards",
      "warehouses",
      "partners",
      "settings_process_types",
      "ui_settings",
    ];
  }

  if (pathname === "/sales") {
    return [
      "sales",
      "orders",
      "parties",
      "stock_movements",
      "warehouse_balances",
      "stock_cards",
      "partners",
      "warehouses",
      "ui_settings",
    ];
  }

  if (pathname === "/transfers") {
    return [
      "transfers",
      "stock_movements",
      "warehouse_balances",
      "stock_cards",
      "warehouses",
      "partners",
      "ui_settings",
    ];
  }

  if (pathname === "/stocks" || pathname.startsWith("/stocks/")) {
    return [
      "stock_cards",
      "warehouse_balances",
      "stock_movements",
      "settings_fabric_types",
      "settings_colors",
      "settings_yarn_counts",
      "settings_yarn_types",
      "ui_settings",
    ];
  }

  if (pathname === "/warehouses") {
    return [
      "warehouses",
      "warehouse_balances",
      "stock_cards",
      "ui_settings",
    ];
  }

  if (pathname === "/parties" || pathname.startsWith("/parties/")) {
    return [
      "parties",
      "orders",
      "order_party_allocations",
      "production_raw",
      "production_dyehouse",
      "transfers",
      "sales",
      "stock_movements",
      "warehouse_balances",
      "stock_cards",
      "warehouses",
      "partners",
      "ui_settings",
    ];
  }

  if (pathname === "/reports" || pathname === "/waste-analysis") {
    return [
      "orders",
      "purchase_orders",
      "purchase_receipts",
      "production_raw",
      "production_dyehouse",
      "sales",
      "stock_movements",
      "warehouse_balances",
      "parties",
      "stock_cards",
      "ui_settings",
    ];
  }

  if (pathname === "/settings" || pathname.startsWith("/settings/") || pathname === "/partners") {
    return [
      "settings_fabric_types",
      "settings_colors",
      "settings_yarn_counts",
      "settings_yarn_types",
      "settings_process_types",
      "warehouses",
      "partners",
      "stock_cards",
      "roles",
      "user_profiles",
      "counters",
      "ui_settings",
    ];
  }

  return [
    "orders",
    "purchase_orders",
    "purchase_receipts",
    "stock_movements",
    "warehouse_balances",
    "parties",
    "production_raw",
    "production_dyehouse",
    "transfers",
    "sales",
    "notifications",
    "ui_settings",
  ];
}

function getReadEndpoint(pathname: string) {
  if (pathname === "/dashboard2") {
    return "/api/executive-dashboard";
  }

  if (pathname === "/dashboard" || pathname === "/") {
    return "/api/dashboard";
  }

  if (pathname === "/orders" || pathname.startsWith("/orders/") || pathname === "/orders/dashboard") {
    return "/api/orders-page";
  }

  if (pathname === "/purchase-orders" || pathname === "/purchases") {
    return "/api/purchase-page";
  }

  if (pathname === "/production/raw" || pathname === "/production/dyehouse") {
    return "/api/production-page";
  }

  if (pathname === "/sales") {
    return "/api/sales-page";
  }

  if (pathname === "/transfers") {
    return "/api/transfer-page";
  }

  if (pathname === "/stocks" || pathname.startsWith("/stocks/")) {
    return "/api/stock-page";
  }

  if (pathname === "/warehouses") {
    return "/api/warehouse-page";
  }

  if (pathname === "/parties" || pathname.startsWith("/parties/") || pathname === "/parties/shift") {
    return "/api/party-page";
  }

  if (pathname === "/reports" || pathname === "/waste-analysis") {
    return "/api/reports-page";
  }

  if (
    pathname === "/settings" ||
    pathname.startsWith("/settings/") ||
    pathname === "/partners"
  ) {
    return "/api/settings-page";
  }

  return "/api/erp";
}

export function ErpDataProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [data, setData] = useState<ErpData>(emptyErpData);
  const [loading, setLoading] = useState(true);

  const abortControllerRef = useRef<AbortController | null>(null);
  const isRefreshingRef = useRef(false);

  const refresh = useCallback(async () => {
    if (isRefreshingRef.current) return;
    
    // Cancel previous request if any
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    abortControllerRef.current = new AbortController();
    isRefreshingRef.current = true;

    try {
      const endpoint = getReadEndpoint(pathname);
      const response = await fetch(endpoint, { 
        cache: "no-store",
        signal: abortControllerRef.current.signal 
      });
      const result = (await response.json()) as ApiResponse;
      if (!response.ok || !result.ok || !result.data) {
        throw new Error(result.error ?? "Veriler alınamadı.");
      }
      setData(result.data);
      setLoading(false);
    } catch (error: any) {
      if (error.name === 'AbortError') {
        // Silent ignore
        return;
      }
      setLoading(false);
      throw error;
    } finally {
      isRefreshingRef.current = false;
      abortControllerRef.current = null;
    }
  }, [pathname]);

  const mutateData = useCallback((updater: (current: ErpData) => ErpData) => {
    setData((current) => updater(current));
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      refresh().catch((error: unknown) => {
        setLoading(false);
        toast.error(error instanceof Error ? error.message : "Veriler alınamadı.");
      });
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [refresh]);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    const tables = getRealtimeTablesForPath(pathname);

    try {
      channel = supabase.channel(`erp-realtime-${pathname}`);
      let refreshTimeout: NodeJS.Timeout | null = null;
      for (const table of tables) {
        channel.on("postgres_changes", { event: "*", schema: "public", table }, () => {
          if (refreshTimeout) clearTimeout(refreshTimeout);
          refreshTimeout = setTimeout(() => {
            refresh().catch(() => undefined);
          }, 300); // 300ms debounce
        });
      }
      channel.subscribe((status, err) => {
        if (err) {
          console.warn("Realtime subscription error:", err);
        }
      });
    } catch (err) {
      console.warn("Realtime channel creation error:", err);
    }

    const interval = window.setInterval(() => {
      refresh().catch(() => undefined);
    }, 12000);

    return () => {
      window.clearInterval(interval);
      if (channel) {
        try {
          void supabase.removeChannel(channel);
        } catch {
          // Ignore cleanup errors
        }
      }
    };
  }, [refresh, pathname]);

  const value = useMemo(() => ({ data, loading, refresh, mutateData }), [data, loading, refresh, mutateData]);

  return <ErpDataContext.Provider value={value}>{children}</ErpDataContext.Provider>;
}

export function useErpData() {
  return useContext(ErpDataContext);
}
