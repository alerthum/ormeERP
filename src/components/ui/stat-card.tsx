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
    <div className={cn("premium-card rounded-2xl", compact ? "p-3 sm:p-4" : "p-3 sm:p-5")}>
      <div className={cn("flex items-start justify-between", compact ? "gap-2" : "gap-2 sm:gap-3")}>
        <div className="min-w-0 flex-1">
          <p className={cn("font-semibold text-slate-500 leading-tight", compact ? "text-[10px] sm:text-xs" : "text-[11px] sm:text-sm")}>{title}</p>
          <p className={cn("font-bold tracking-tight text-slate-950 truncate", compact ? "mt-0.5 text-lg sm:text-xl" : "mt-1 text-xl sm:text-2xl")}>{value}</p>
        </div>
        <div className={cn("grid shrink-0 place-items-center rounded-xl shadow-lg", compact ? "size-8 sm:size-9" : "size-9 sm:size-11", toneClass)}>
          <Icon className={cn(compact ? "size-3.5 sm:size-4" : "size-4 sm:size-5")} />
        </div>
      </div>
      <p className={cn("text-slate-400 line-clamp-1", compact ? "mt-1.5 text-[10px] sm:text-xs" : "mt-2 sm:mt-4 text-[11px] sm:text-sm")}>{helper}</p>
    </div>
  );
}
