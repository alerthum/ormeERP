import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatCard({
  title,
  value,
  helper,
  icon: Icon,
  tone = "blue",
  compact = false,
}: {
  title: string;
  value: string;
  helper: string;
  icon: LucideIcon;
  tone?: "blue" | "green" | "amber" | "red";
  compact?: boolean;
}) {
  const toneClass = {
    blue: "bg-blue-600 text-white shadow-blue-200",
    green: "bg-emerald-500 text-white shadow-emerald-200",
    amber: "bg-amber-400 text-slate-950 shadow-amber-100",
    red: "bg-rose-500 text-white shadow-rose-200",
  }[tone];

  return (
    <div className={cn("premium-card rounded-2xl", compact ? "p-3 sm:p-4" : "p-4 sm:p-5")}>
      <div className={cn("flex items-start justify-between", compact ? "gap-2" : "gap-3")}>
        <div className="min-w-0">
          <p className={cn("font-medium text-slate-500", compact ? "text-[11px] leading-4 sm:text-xs" : "text-sm")}>{title}</p>
          <p className={cn("font-semibold tracking-tight text-slate-950", compact ? "mt-1 truncate text-lg sm:text-xl" : "mt-2 text-2xl")}>{value}</p>
        </div>
        <div className={cn("grid shrink-0 place-items-center rounded-2xl shadow-lg", compact ? "size-9" : "size-11", toneClass)}>
          <Icon className={cn(compact ? "size-4" : "size-5")} />
        </div>
      </div>
      <p className={cn("text-slate-500", compact ? "mt-2 line-clamp-2 text-[11px] leading-4 sm:text-xs" : "mt-4 text-sm")}>{helper}</p>
    </div>
  );
}
