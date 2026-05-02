import { cn } from "@/lib/utils";

export interface Column<T> {
  header: string;
  cell: (row: T) => React.ReactNode;
  className?: string;
}

export function DataTable<T extends { id: string }>({ rows, columns }: { rows: T[]; columns: Column<T>[] }) {
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
            {columns.slice(0, 4).map((column) => (
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
