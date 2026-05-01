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

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyField: string;
  exportFileName?: string;
  /** テキスト検索対象のフィールド取得関数 */
  getSearchText?: (item: T) => string;
  /** 追加フィルターUI */
  filterSlot?: React.ReactNode;
  /** サマリ行 */
  summarySlot?: React.ReactNode;
}

// ─── ソート方向 ──────────────────────────────
type SortDir = "asc" | "desc" | null;

// ─── コンポーネント ──────────────────────────
export default function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  keyField,
  exportFileName,
  getSearchText,
  filterSlot,
  summarySlot,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [search, setSearch] = useState("");

  // ソート切替
  const toggleSort = useCallback(
    (key: string) => {
      if (sortKey === key) {
        if (sortDir === "asc") setSortDir("desc");
        else if (sortDir === "desc") { setSortKey(null); setSortDir(null); }
        else setSortDir("asc");
      } else {
        setSortKey(key);
        setSortDir("asc");
      }
    },
    [sortKey, sortDir]
  );

  // フィルター＋ソート済みデータ
  const processed = useMemo(() => {
    let items = [...data];

    // テキスト検索
    if (search && getSearchText) {
      const q = search.toLowerCase();
      items = items.filter((item) => getSearchText(item).toLowerCase().includes(q));
    }

    // ソート
    if (sortKey && sortDir) {
      const col = columns.find((c) => c.key === sortKey);
      if (col) {
        items.sort((a, b) => {
          const va = col.getValue(a);
          const vb = col.getValue(b);
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
  }, [data, search, sortKey, sortDir, columns, getSearchText]);

  // CSVエクスポート
  const handleExport = useCallback(() => {
    if (!exportFileName || processed.length === 0) return;
    const header = columns.map((c) => c.label).join(",");
    const rows = processed.map((item) =>
      columns
        .map((c) => {
          const v = c.getValue(item);
          if (v === null) return '""';
          if (v instanceof Date) return `"${formatDate(v)}"`;
          return `"${String(v).replace(/"/g, '""')}"`;
        })
        .join(",")
    );
    const bom = "\uFEFF";
    const blob = new Blob([bom + header + "\n" + rows.join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = exportFileName;
    a.click();
    URL.revokeObjectURL(url);
  }, [processed, columns, exportFileName]);

  return (
    <div>
      {/* ツールバー */}
      <div className="flex items-center gap-3 p-3 border-b border-gray-200 bg-gray-50 flex-wrap">
        {/* 検索 */}
        {getSearchText && (
          <div className="relative flex-1 min-w-[200px] max-w-[300px]">
            <Search size={14} className="absolute left-2.5 top-2.5 text-gray-400" />
            <input
              type="text"
              placeholder="薬品名で検索..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-8 py-2 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-blue-400 focus:border-blue-400 outline-none"
            />
            {search && (
              <button onClick={() => setSearch("")}
                className="absolute right-2 top-2 text-gray-400 hover:text-gray-600">
                <X size={16} />
              </button>
            )}
          </div>
        )}

        {/* 追加フィルター */}
        {filterSlot}

        {/* 件数 */}
        <span className="text-xs text-gray-500 ml-auto">
          {processed.length !== data.length
            ? `${processed.length} / ${data.length}件`
            : `${data.length}件`}
        </span>

        {/* エクスポート */}
        {exportFileName && (
          <button onClick={handleExport}
            className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700">
            <Download size={13} /> CSV出力
          </button>
        )}
      </div>

      {/* サマリ */}
      {summarySlot}

      {/* テーブル */}
      <div className="overflow-x-auto max-h-[65vh] overflow-y-auto">
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`${col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"} ${col.sortable !== false ? "cursor-pointer select-none hover:bg-gray-200" : ""}`}
                  style={col.width ? { width: col.width, minWidth: col.width } : undefined}
                  onClick={() => col.sortable !== false && toggleSort(col.key)}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {col.sortable !== false && (
                      <span className="text-gray-400">
                        {sortKey === col.key ? (
                          sortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />
                        ) : (
                          <ArrowUpDown size={12} />
                        )}
                      </span>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {processed.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="text-center py-8 text-gray-400">
                  該当する品目がありません
                </td>
              </tr>
            ) : (
              processed.map((item, rowIdx) => (
                <tr key={String(item[keyField])}>
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
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
