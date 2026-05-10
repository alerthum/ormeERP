import type { LucideIcon } from "lucide-react";

const toneMap = {
  blue: { bg: "bg-blue-50", text: "text-blue-600", accent: "text-blue-900", badge: "bg-blue-100 text-blue-700" },
  green: { bg: "bg-emerald-50", text: "text-emerald-600", accent: "text-emerald-900", badge: "bg-emerald-100 text-emerald-700" },
  amber: { bg: "bg-amber-50", text: "text-amber-600", accent: "text-amber-900", badge: "bg-amber-100 text-amber-700" },
  rose: { bg: "bg-rose-50", text: "text-rose-600", accent: "text-rose-900", badge: "bg-rose-100 text-rose-700" },
  purple: { bg: "bg-purple-50", text: "text-purple-600", accent: "text-purple-900", badge: "bg-purple-100 text-purple-700" },
  slate: { bg: "bg-slate-50", text: "text-slate-500", accent: "text-slate-900", badge: "bg-slate-100 text-slate-700" },
};

type Tone = keyof typeof toneMap;

export function MobileHeroCard({
  eyebrow,
  title,
  description,
  metricLabel,
  metricValue,
  helperText,
  icon: Icon,
  actionLabel,
  onAction,
  tone = "blue",
}: {
  eyebrow?: string;
  title?: string;
  description?: string;
  metricLabel: string;
  metricValue: string;
  helperText?: string;
  icon?: LucideIcon;
  actionLabel?: string;
  onAction?: () => void;
  tone?: Tone;
}) {
  const t = toneMap[tone];

  return (
    <div className="md:hidden premium-card rounded-2xl overflow-hidden">
      <div className={`${t.bg} px-4 py-5`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            {eyebrow ? (
              <p className={`text-[10px] font-bold uppercase tracking-[0.18em] ${t.text}`}>{eyebrow}</p>
            ) : null}
            <p className="mt-1 text-xs font-semibold text-slate-500 line-clamp-1">{metricLabel}</p>
            <p className={`mt-1 text-2xl font-bold tracking-tight ${t.accent}`}>{metricValue}</p>
            {helperText ? (
              <p className="mt-1 text-xs text-slate-500 line-clamp-1">{helperText}</p>
            ) : null}
          </div>
          {Icon ? (
            <div className={`grid size-10 shrink-0 place-items-center rounded-xl ${t.badge}`}>
              <Icon className="size-5" />
            </div>
          ) : null}
        </div>
        {title || description ? (
          <div className="mt-3 border-t border-white/60 pt-3">
            {title ? <p className="text-sm font-bold text-slate-900 line-clamp-1">{title}</p> : null}
            {description ? <p className="text-xs text-slate-500 line-clamp-2 mt-0.5">{description}</p> : null}
          </div>
        ) : null}
      </div>
      {actionLabel && onAction ? (
        <div className="px-4 py-3 bg-white border-t border-slate-100">
          <button
            className="w-full inline-flex items-center justify-center gap-2 rounded-none bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-100 min-h-[44px] active:scale-[0.98] transition-transform"
            onClick={onAction}
            type="button"
          >
            {actionLabel}
          </button>
        </div>
      ) : null}
    </div>
  );
}
