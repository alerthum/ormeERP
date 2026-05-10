import { Inbox, Plus } from "lucide-react";

export function EmptyState({ 
  title, 
  description,
  actionLabel,
  onAction, 
}: { 
  title: string; 
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="premium-card grid min-h-64 place-items-center rounded-2xl p-8 text-center">
      <div>
        <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-blue-50 text-blue-600">
          <Inbox className="size-6" />
        </div>
        <h3 className="mt-4 text-lg font-semibold text-slate-950">{title}</h3>
        <p className="mt-2 text-sm text-slate-500">{description}</p>
        {actionLabel && onAction ? (
          <button 
            className="mt-5 inline-flex items-center gap-2 rounded-none bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-100 min-h-[44px]"
            onClick={onAction}
            type="button"
          >
            <Plus className="size-4" />
            {actionLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}
