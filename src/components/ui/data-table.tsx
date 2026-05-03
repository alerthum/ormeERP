"use client";

import { Fragment, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useErpData } from "@/components/erp-data-provider";
import { cn } from "@/lib/utils";

export interface Column<T> {
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
}

export interface GroupBy<T> {
  label: string;
  getKey: (row: T) => string;
  summary?: (rows: T[]) => ReactNode;
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

function defaultSearchText<T>(row: T) {
  return JSON.stringify(row).toLocaleLowerCase("tr-TR");
}

export function DataTable<T extends { id: string }>({
  rows,
  columns,
  searchPlaceholder = "Listede ara",
  getSearchText = defaultSearchText,
  groupBy,
  pageSize = 25,
}: {
  rows: T[];
  columns: Column<T>[];
  searchPlaceholder?: string;
  getSearchText?: (row: T) => string;
  groupBy?: GroupBy<T>;
  pageSize?: number;
}) {
  const { loading } = useErpData();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const mobileColumns = columns.length > 4 ? [...columns.slice(0, 3), columns[columns.length - 1]] : columns;
  const normalizedQuery = query.trim().toLocaleLowerCase("tr-TR");
  const filteredRows = useMemo(
    () => (normalizedQuery ? rows.filter((row) => getSearchText(row).toLocaleLowerCase("tr-TR").includes(normalizedQuery)) : rows),
    [getSearchText, normalizedQuery, rows],
  );
  const groups = useMemo(() => {
    if (!groupBy) return [];
    const grouped = new Map<string, T[]>();
    for (const row of filteredRows) {
      const key = groupBy.getKey(row) || "Tanımsız";
      grouped.set(key, [...(grouped.get(key) ?? []), row]);
    }
    return [...grouped.entries()].map(([key, groupRows]) => ({ key, rows: groupRows })).sort((a, b) => a.key.localeCompare(b.key, "tr"));
  }, [filteredRows, groupBy]);
  const totalItems = groupBy ? groups.length : filteredRows.length;
  const pageCount = Math.max(Math.ceil(totalItems / pageSize), 1);
  const currentPage = Math.min(page, pageCount);
  const visibleRows = filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const visibleGroups = groups.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  function toggleGroup(key: string) {
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

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
      <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
        <input
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50 sm:max-w-sm"
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(1);
          }}
          placeholder={searchPlaceholder}
          value={query}
        />
        <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
          {filteredRows.length} kayıt{groupBy ? ` · ${groups.length} grup` : ""}
        </div>
      </div>
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
            {groupBy
              ? visibleGroups.map((group) => (
                  <Fragment key={group.key}>
                    <tr className="bg-blue-50/70">
                      <td colSpan={columns.length} className="px-5 py-3">
                        <button className="flex w-full items-center justify-between gap-4 text-left" onClick={() => toggleGroup(group.key)} type="button">
                          <span className="font-semibold text-slate-950">
                            {groupBy.label}: {group.key}
                          </span>
                          <span className="flex items-center gap-3 text-xs font-semibold text-slate-500">
                            {groupBy.summary?.(group.rows) ?? `${group.rows.length} kayıt`}
                            <span className="rounded-full bg-white px-2 py-1 text-blue-700">{collapsedGroups.has(group.key) ? "Aç" : "Kapat"}</span>
                          </span>
                        </button>
                      </td>
                    </tr>
                    {collapsedGroups.has(group.key)
                      ? null
                      : group.rows.map((row) => (
                          <tr key={row.id} className="bg-white transition hover:bg-blue-50/30">
                            {columns.map((column) => (
                              <td key={column.header} className={cn("px-5 py-4 text-slate-700", column.className)}>
                                {column.cell(row)}
                              </td>
                            ))}
                          </tr>
                        ))}
                  </Fragment>
                ))
              : visibleRows.map((row) => (
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
        {groupBy
          ? visibleGroups.map((group) => (
              <div key={group.key} className="bg-white">
                <button className="flex w-full items-center justify-between gap-4 bg-blue-50/70 p-4 text-left" onClick={() => toggleGroup(group.key)} type="button">
                  <span className="font-semibold text-slate-950">{group.key}</span>
                  <span className="text-xs font-semibold text-blue-700">{groupBy.summary?.(group.rows) ?? `${group.rows.length} kayıt`}</span>
                </button>
                {collapsedGroups.has(group.key)
                  ? null
                  : group.rows.map((row) => (
                      <div key={row.id} className="space-y-3 border-t border-slate-100 p-4">
                        {mobileColumns.map((column) => (
                          <div key={column.header} className="flex items-center justify-between gap-4">
                            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">{column.header}</span>
                            <div className="text-right text-sm font-medium text-slate-800">{column.cell(row)}</div>
                          </div>
                        ))}
                      </div>
                    ))}
              </div>
            ))
          : visibleRows.map((row) => (
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
      {filteredRows.length === 0 ? <div className="border-t border-slate-100 p-6 text-center text-sm text-slate-500">Filtreye uygun kayıt bulunamadı.</div> : null}
      {pageCount > 1 ? (
        <div className="flex items-center justify-between border-t border-slate-100 p-4 text-sm">
          <button className="rounded-xl border border-slate-200 px-3 py-2 font-semibold text-slate-600 disabled:opacity-40" disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(value - 1, 1))} type="button">
            Önceki
          </button>
          <span className="font-semibold text-slate-500">
            {currentPage} / {pageCount}
          </span>
          <button className="rounded-xl border border-slate-200 px-3 py-2 font-semibold text-slate-600 disabled:opacity-40" disabled={currentPage === pageCount} onClick={() => setPage((value) => Math.min(value + 1, pageCount))} type="button">
            Sonraki
          </button>
        </div>
      ) : null}
    </div>
  );
}
