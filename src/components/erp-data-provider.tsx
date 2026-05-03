"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
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
}

const ErpDataContext = createContext<ErpDataContextValue>({
  data: emptyErpData,
  loading: true,
  refresh: async () => undefined,
});

const realtimeTables = [
  "settings_fabric_types",
  "settings_colors",
  "settings_yarn_counts",
  "settings_process_types",
  "warehouses",
  "partners",
  "stock_cards",
  "stock_movements",
  "warehouse_balances",
  "orders",
  "parties",
  "production_raw",
  "production_dyehouse",
  "transfers",
  "purchase_orders",
  "purchase_receipts",
  "sales",
  "roles",
  "user_profiles",
];

export function ErpDataProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<ErpData>(emptyErpData);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/erp", { cache: "no-store" });
    const result = (await response.json()) as ApiResponse;
    if (!response.ok || !result.ok || !result.data) {
      throw new Error(result.error ?? "Veriler alınamadı.");
    }
    setData(result.data);
    setLoading(false);
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
    const channel = supabase.channel("erp-realtime");
    for (const table of realtimeTables) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, () => {
        refresh().catch(() => undefined);
      });
    }
    channel.subscribe();

    const interval = window.setInterval(() => {
      refresh().catch(() => undefined);
    }, 12000);

    return () => {
      window.clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [refresh]);

  const value = useMemo(() => ({ data, loading, refresh }), [data, loading, refresh]);

  return <ErpDataContext.Provider value={value}>{children}</ErpDataContext.Provider>;
}

export function useErpData() {
  return useContext(ErpDataContext);
}
