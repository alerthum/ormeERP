"use client";

import { cn } from "@/lib/utils";
import { useErpData } from "@/components/erp-data-provider";

export interface Column<T> {
  header: string;
  cell: (row: T) => React.ReactNode;
  className?: string;
}

function TableSkeleton() {
  return (
    <div className="premium-card overflow-hidden rounded-2xl">
      <div className="space-y-3 p-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="grid gap-3 md:grid-cols-4">
            <div className="h-4 rounded-full bg-slate-100" />
            <div className="h-4 rounded-full bg-slate-100" />
            <div className="h-4 rounded-full bg-slate-100" />
            <div className="h-4 rounded-full bg-slate-100" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function DataTable<T extends { id: string }>({ rows, columns }: { rows: T[]; columns: Column<T>[] }) {
  const { loading } = useErpData();
  const mobileColumns = columns.length > 4 ? [...columns.slice(0, 3), columns[columns.length - 1]] : columns;

  if (rows.length === 0 && loading) {
    return <TableSkeleton />;
  }

  if (rows.length === 0) {
    return (
      <div className="premium-card rounded-2xl p-8 text-center">
        <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-blue-50 text-blue-600">
          <span className="text-2xl font-semibold">+</span>
        </div>
        <h3 className="mt-4 text-lg font-semibold text-slate-950">Henüz kayıt yok</h3>
        <p className="mt-2 text-sm text-slate-500">Başlamak için önce Ayarlar bölümünden temel tanımları girin, ardından ilgili modülde ilk kaydı oluşturun.</p>
      </div>
    );
  }

  return (
    <div className="premium-card overflow-hidden rounded-2xl">
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[760px] border-collapse text-left text-sm">
          <thead className="bg-slate-50/80 text-xs uppercase tracking-[0.12em] text-slate-400">
            <tr>
              {columns.map((column) => (
                <th key={column.header} className={cn("px-5 py-4 font-bold", column.className)}>
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.id} className="bg-white transition hover:bg-blue-50/30">
                {columns.map((column) => (
                  <td key={column.header} className={cn("px-5 py-4 text-slate-700", column.className)}>
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="divide-y divide-slate-100 md:hidden">
        {rows.map((row) => (
          <div key={row.id} className="space-y-3 bg-white p-4">
            {mobileColumns.map((column) => (
              <div key={column.header} className="flex items-center justify-between gap-4">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">{column.header}</span>
                <div className="text-right text-sm font-medium text-slate-800">{column.cell(row)}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
