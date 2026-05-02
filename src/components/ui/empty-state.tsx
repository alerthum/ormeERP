import { Inbox } from "lucide-react";

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="premium-card grid min-h-64 place-items-center rounded-2xl p-8 text-center">
      <div>
        <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-blue-50 text-blue-600">
          <Inbox className="size-6" />
        </div>
        <h3 className="mt-4 text-lg font-semibold text-slate-950">{title}</h3>
        <p className="mt-2 text-sm text-slate-500">{description}</p>
      </div>
    </div>
  );
}
