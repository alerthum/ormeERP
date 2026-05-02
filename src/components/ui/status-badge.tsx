import { cn } from "@/lib/utils";

const toneMap = {
  blue: "bg-blue-50 text-blue-700 ring-blue-100",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  amber: "bg-amber-50 text-amber-700 ring-amber-100",
  orange: "bg-orange-50 text-orange-700 ring-orange-100",
  red: "bg-rose-50 text-rose-700 ring-rose-100",
  slate: "bg-slate-50 text-slate-600 ring-slate-100",
};

export function StatusBadge({ children, tone = "slate" }: { children: React.ReactNode; tone?: keyof typeof toneMap }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1", toneMap[tone])}>
      {children}
    </span>
  );
}

export function statusTone(status: string): keyof typeof toneMap {
  if (["Kapandı", "Tamamlandı", "Mamül Hazır"].includes(status)) return "green";
  if (["Boyahanede", "Örmede", "Onaylandı"].includes(status)) return "blue";
  if (["Kısmi Geldi", "İplik Bekliyor", "Taslak"].includes(status)) return "amber";
  if (["İptal"].includes(status)) return "red";
  return "slate";
}
