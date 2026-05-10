import type { Tx } from "./write-types";
import type { StockType } from "@/types/erp";

export async function nextCounter(tx: Tx, key: string, prefix: string) {
  const rows = await tx`
    insert into counters (key, prefix, current_value, updated_at)
    values (${key}, ${prefix}, 1, now())
    on conflict (key) do update
      set current_value = counters.current_value + 1,
          updated_at = now()
    returning current_value
  `;
  return Number(rows[0].current_value);
}

export async function nextCode(tx: Tx, type: StockType) {
  const sequence = await nextCounter(tx, `stock:${type}`, type);
  return `${type}-${String(sequence).padStart(6, "0")}`;
}

export async function nextBusinessNo(tx: Tx, key: "order" | "purchaseOrder" | "receipt" | "sale") {
  const year = new Date().getFullYear();
  const yy = String(year).slice(-2);
  const prefix = key === "order" ? "MS" : key === "purchaseOrder" ? "SS" : key === "receipt" ? "MK" : "SV";
  const sequence = await nextCounter(tx, `${key}:${year}`, prefix);
  return `${prefix}-${yy}${String(sequence).padStart(4, "0")}`;
}

export async function nextPartyNo(tx: Tx) {
  const year = new Date().getFullYear();
  const yy = String(year).slice(-2);
  const sequence = await nextCounter(tx, `party:${year}`, yy);
  return `${yy}${String(sequence).padStart(4, "0")}`;
}
