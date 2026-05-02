import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatCard({
  title,
  value,
  helper,
  icon: Icon,
  tone = "blue",
}: {
  title: string;
  value: string;
  helper: string;
  icon: LucideIcon;
  tone?: "blue" | "green" | "amber" | "red";
}) {
  const toneClass = {
    blue: "bg-blue-600 text-white shadow-blue-200",
    green: "bg-emerald-500 text-white shadow-emerald-200",
    amber: "bg-amber-400 text-slate-950 shadow-amber-100",
    red: "bg-rose-500 text-white shadow-rose-200",
  }[tone];

  return (
    <div className="premium-card rounded-2xl p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{value}</p>
        </div>
        <div className={cn("grid size-11 place-items-center rounded-2xl shadow-lg", toneClass)}>
          <Icon className="size-5" />
        </div>
      </div>
      <p className="mt-4 text-sm text-slate-500">{helper}</p>
    </div>
  );
}
