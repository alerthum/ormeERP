import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { supabase } from "./supabase";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatKg(value: number) {
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(value) + " kg";
}

export function formatPercent(value: number) {
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1 }).format(value) + "%";
}

export function formatDate(value: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (isNaN(date.getTime())) return value || "-";
  return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

export function wasteTone(percent: number) {
  if (percent <= 3) return "green";
  if (percent <= 7) return "amber";
  if (percent <= 12) return "orange";
  return "red";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeItems<T = any>(items: unknown): T[] {
  if (!items) return [];
  if (Array.isArray(items)) return items as T[];
  if (typeof items === "string") {
    try {
      const parsed = JSON.parse(items);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function requestSignal(ms = 8000) {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

export async function postJson(endpoint: string, payload: any) {
  const session = await supabase.auth.getSession();
  const token = session.data.session?.access_token;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) },
    body: JSON.stringify(payload),
    signal: requestSignal(),
  });
  const result = (await response.json()) as { ok: boolean; error?: string };
  if (!response.ok || !result.ok) throw new Error(result.error ?? "İşlem tamamlanamadı.");
  return result;
}

export async function patchJson(endpoint: string, payload: any) {
  const session = await supabase.auth.getSession();
  const token = session.data.session?.access_token;
  const response = await fetch(endpoint, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) },
    body: JSON.stringify(payload),
    signal: requestSignal(),
  });
  const result = (await response.json()) as { ok: boolean; error?: string };
  if (!response.ok || !result.ok) throw new Error(result.error ?? "İşlem tamamlanamadı.");
  return result;
}

export async function apiDelete(endpoint: string) {
  const session = await supabase.auth.getSession();
  const token = session.data.session?.access_token;
  const response = await fetch(endpoint, { 
    method: "DELETE", 
    headers: token ? { Authorization: `Bearer ${token}` } : undefined, 
    signal: requestSignal() 
  });
  const result = (await response.json()) as { ok: boolean; error?: string };
  if (!response.ok || !result.ok) throw new Error(result.error ?? "İşlem tamamlanamadı.");
  return result;
}

export async function apiPatch(endpoint: string, payload: any) {
  return patchJson(endpoint, payload);
}
