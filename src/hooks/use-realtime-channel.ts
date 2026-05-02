"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase";

export function useRealtimeChannel(table: string, onChange?: () => void) {
  useEffect(() => {
    const channel = supabase
      .channel(`erp-${table}`)
      .on("postgres_changes", { event: "*", schema: "public", table }, () => {
        onChange?.();
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [onChange, table]);
}
