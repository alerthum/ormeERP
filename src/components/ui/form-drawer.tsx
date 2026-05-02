"use client";

import { X } from "lucide-react";

export function FormDrawer({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/25 backdrop-blur-sm">
      <aside className="h-full w-full max-w-xl overflow-y-auto bg-white p-5 shadow-2xl">
        <div className="sticky top-0 z-10 -mx-5 -mt-5 mb-6 flex items-center justify-between border-b border-slate-100 bg-white/95 px-5 py-4 backdrop-blur">
          <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
          <button className="grid size-10 place-items-center rounded-xl bg-slate-50 text-slate-500" onClick={onClose} type="button">
            <X className="size-5" />
          </button>
        </div>
        {children}
      </aside>
    </div>
  );
}
