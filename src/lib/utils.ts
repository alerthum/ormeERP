import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

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
