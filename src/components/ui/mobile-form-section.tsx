import type { LucideIcon } from "lucide-react";

const sectionTones = {
  blue: { bg: "bg-blue-50", text: "text-blue-600" },
  purple: { bg: "bg-purple-50", text: "text-purple-600" },
  amber: { bg: "bg-amber-50", text: "text-amber-600" },
  green: { bg: "bg-emerald-50", text: "text-emerald-600" },
  rose: { bg: "bg-rose-50", text: "text-rose-600" },
  slate: { bg: "bg-slate-50", text: "text-slate-500" },
};

type SectionTone = keyof typeof sectionTones;

/**
 * Mobile-friendly form section divider.
 * Renders an icon + title header that visually groups form fields.
 * Works on both mobile and desktop — no layout breaking.
 */
export function MobileFormSection({
  title,
  description,
  icon: Icon,
  children,
  tone = "blue",
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  children: React.ReactNode;
  tone?: SectionTone;
}) {
  const t = sectionTones[tone];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 border-b border-slate-50 pb-3">
        {Icon ? (
          <div className={`grid size-8 place-items-center rounded-none ${t.bg} ${t.text}`}>
            <Icon className="size-4" />
          </div>
        ) : null}
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-slate-900">{title}</h3>
          {description ? (
            <p className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">{description}</p>
          ) : null}
        </div>
      </div>
      <div className="grid gap-4">
        {children}
      </div>
    </div>
  );
}
