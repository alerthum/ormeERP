"use client";

import { X } from "lucide-react";

export function ConfirmModal({
  open,
  title,
  description,
  confirmLabel = "Onayla",
  tone = "default",
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  tone?: "default" | "danger";
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-none bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
          </div>
          <button className="grid size-9 place-items-center bg-slate-50 text-slate-500" onClick={onClose} type="button">
            <X className="size-4" />
          </button>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button className="border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700" onClick={onClose} type="button">
            Vazgeç
          </button>
          <button
            className={`px-4 py-2 text-sm font-semibold text-white shadow-lg ${tone === "danger" ? "bg-rose-600 shadow-rose-100" : "bg-blue-600 shadow-blue-100"}`}
            onClick={onConfirm}
            type="button"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
