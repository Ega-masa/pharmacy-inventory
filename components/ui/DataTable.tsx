"use client";

import { useState, useMemo, useCallback } from "react";
import { ArrowUpDown, ArrowUp, ArrowDown, Search, X, Download } from "lucide-react";
import { formatYen, formatDate, formatNumber } from "@/lib/utils";

// ─── 型定義 ──────────────────────────────────
export interface Column<T> {
  key: string;
  label: string;
  align?: "left" | "right" | "center";
  width?: string;
  sortable?: boolean;
  getValue: (item: T, index?: number) => string | number | Date | null | boolean;
  render?: (item: T, index?: number) => React.ReactNode;
}

interface DataTableProps<T extends object> {
  columns: Column<T>[];
  data: T[];
  keyField: string;
  exportFileName?: string;
  getSearchText?: (item: T) => string;
  /** 追加フィルター関数（trueなら表示） */
  extraFilter?: (item: T) => boolean;
  /** ツールバーに追加するフィルターUI */
  filterSlot?: React.ReactNode;
  summarySlot?: React.ReactNode;
}

type SortDir = "asc" | "desc" | null;

export default function DataTable<T extends object>({
  columns, data, keyField, exportFileName,
  getSearchText, extraFilter, filterSlot, summarySlot,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [search, setSearch] = useState("");

  const toggleSort = useCallback((key: string) => {
    if (sortKey === key) {
      if (sortDir === "asc") setSortDir("desc");
      else if (sortDir === "desc") { setSortKey(null); setSortDir(null); }
      else setSortDir("asc");
    } else { setSortKey(key); setSortDir("asc"); }
  }, [sortKey, sortDir]);

  const processed = useMemo(() => {
    let items = [...data];
    if (search && getSearchText) {
      const q = search.toLowerCase();
      items = items.filter((item) => getSearchText(item).toLowerCase().includes(q));
    }
    if (extraFilter) items = items.filter(extraFilter);
    if (sortKey && sortDir) {
      const col = columns.find((c) => c.key === sortKey);
      if (col) {
        items.sort((a, b) => {
          const va = col.getValue(a); const vb = col.getValue(b);
          let cmp = 0;
          if (va === null && vb === null) cmp = 0;
          else if (va === null) cmp = 1;
          else if (vb === null) cmp = -1;
          else if (va instanceof Date && vb instanceof Date) cmp = va.getTime() - vb.getTime();
          else if (typeof va === "number" && typeof vb === "number") cmp = va - vb;
          else if (typeof va === "boolean" && typeof vb === "boolean") cmp = (va ? 1 : 0) - (vb ? 1 : 0);
          else cmp = String(va).localeCompare(String(vb), "ja");
          return sortDir === "asc" ? cmp : -cmp;
        });
      }
    }
    return items;
  }, [data, search, sortKey, sortDir, columns, getSearchText, extraFilter]);

  const handleExport = useCallback(() => {
    if (!exportFileName || processed.length === 0) return;
    const header = columns.map((c) => c.label).join(",");
    const rows = processed.map((item) =>
      columns.map((c) => {
        const v = c.getValue(item);
        if (v === null) return '""';
        if (v instanceof Date) return `"${formatDate(v)}"`;
        return `"${String(v).replace(/"/g, '""')}"`;
      }).join(",")
    );
    const blob = new Blob(["\uFEFF" + header + "\n" + rows.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = exportFileName; a.click();
    URL.revokeObjectURL(url);
  }, [processed, columns, exportFileName]);

  return (
    <div>
      <div className="flex items-center gap-2 p-3 border-b border-gray-200 bg-gray-50 flex-wrap">
        {getSearchText && (
          <div className="relative min-w-[180px] max-w-[260px]">
            <Search size={13} className="absolute left-2.5 top-2.5 text-gray-400" />
            <input type="text" placeholder="薬品名で検索..." value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-7 py-1.5 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-blue-400 outline-none" />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2 top-2 text-gray-400 hover:text-gray-600"><X size={14} /></button>
            )}
          </div>
        )}
        {filterSlot}
        <span className="text-xs text-gray-500 ml-auto">
          {processed.length !== data.length ? `${processed.length} / ${data.length}件` : `${data.length}件`}
        </span>
        {exportFileName && (
          <button onClick={handleExport}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700">
            <Download size={12} /> CSV出力
          </button>
        )}
      </div>
      {summarySlot}
      <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col.key}
                  className={`${col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : ""} ${col.sortable !== false ? "cursor-pointer select-none hover:bg-gray-200" : ""}`}
                  style={col.width ? { width: col.width, minWidth: col.width } : undefined}
                  onClick={() => col.sortable !== false && toggleSort(col.key)}>
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {col.sortable !== false && (
                      <span className="text-gray-400">
                        {sortKey === col.key
                          ? sortDir === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />
                          : <ArrowUpDown size={11} />}
                      </span>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {processed.length === 0
              ? <tr><td colSpan={columns.length} className="text-center py-8 text-gray-400">該当する品目がありません</td></tr>
              : processed.map((item, rowIdx) => (
                <tr key={String((item as Record<string, unknown>)[keyField])}>
                  {columns.map((col) => (
                    <td key={col.key}
                      className={col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : ""}>
                      {col.render ? col.render(item, rowIdx) : (() => {
                        const v = col.getValue(item, rowIdx);
                        if (v === null) return "-";
                        if (v instanceof Date) return formatDate(v);
                        if (typeof v === "number" && col.key.includes("金額")) return formatYen(v);
                        if (typeof v === "number") return formatNumber(v, 1);
                        return String(v);
                      })()}
                    </td>
                  ))}
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── 汎用ABCフィルター ─────────────────────
export function AbcFilter({
  selected, onChange,
}: {
  selected: Set<string>;
  onChange: (v: Set<string>) => void;
}) {
  const ranks = ["A", "B", "C", "D", "E"] as const;
  const toggle = (r: string) => {
    const next = new Set(selected);
    next.has(r) ? next.delete(r) : next.add(r);
    if (next.size === 0) onChange(new Set(ranks)); // 全解除 → 全選択
    else onChange(next);
  };
  const allSelected = selected.size === ranks.length;
  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-gray-500 mr-0.5">ABC:</span>
      {ranks.map((r) => (
        <button key={r} onClick={() => toggle(r)}
          className={`w-7 h-6 text-xs font-bold rounded border transition
            ${selected.has(r) ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-400 border-gray-300 hover:border-blue-400"}`}>
          {r}
        </button>
      ))}
      {!allSelected && (
        <button onClick={() => onChange(new Set(ranks))}
          className="ml-1 text-xs text-orange-500 hover:underline">全て</button>
      )}
    </div>
  );
}

// ─── 汎用金額フィルター ─────────────────────
export function AmountFilter({
  min, max, onChange,
}: {
  min: number; max: number;
  onChange: (min: number, max: number) => void;
}) {
  return (
    <div className="flex items-center gap-1 text-xs">
      <span className="text-gray-500">金額:</span>
      <input type="number" value={min || ""} placeholder="下限" min={0}
        onChange={(e) => onChange(Number(e.target.value) || 0, max)}
        className="w-20 px-1.5 py-1 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-blue-400 outline-none" />
      <span className="text-gray-400">〜</span>
      <input type="number" value={max || ""} placeholder="上限" min={0}
        onChange={(e) => onChange(min, Number(e.target.value) || Infinity)}
        className="w-20 px-1.5 py-1 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-blue-400 outline-none" />
      <span className="text-gray-400">円</span>
    </div>
  );
}
