import type { TimelineItem } from "@/types/erp";
import { cn, formatDate } from "@/lib/utils";

const tones = {
  blue: "bg-blue-600 ring-blue-100",
  green: "bg-emerald-500 ring-emerald-100",
  amber: "bg-amber-400 ring-amber-100",
  red: "bg-rose-500 ring-rose-100",
};

export function PartyTimeline({ items }: { items: TimelineItem[] }) {
  return (
    <div className="premium-card rounded-2xl p-5">
      <h3 className="text-base font-semibold text-slate-950">Parti timeline</h3>
      <div className="mt-5 space-y-5">
        {items.map((item, index) => (
          <div key={`${item.date}-${item.title}`} className="relative flex gap-4">
            {index < items.length - 1 ? <div className="absolute left-[11px] top-7 h-full w-px bg-slate-200" /> : null}
            <div className={cn("relative z-10 mt-1 size-6 rounded-full ring-8", tones[item.tone])} />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">{formatDate(item.date)}</p>
              <h4 className="mt-1 font-semibold text-slate-950">{item.title}</h4>
              <p className="mt-1 text-sm leading-6 text-slate-500">{item.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
