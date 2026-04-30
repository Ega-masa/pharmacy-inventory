import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** className結合ヘルパー */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** 安全な数値変換（空文字・null・NaNを0扱い） */
export function toNumber(v: string | number | null | undefined, fallback = 0): number {
  if (v === null || v === undefined || v === "") return fallback;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/,/g, ""));
  return isNaN(n) ? fallback : n;
}

/** 金額をカンマ区切り＋円表示 */
export function formatYen(n: number): string {
  return `¥${Math.round(n).toLocaleString()}`;
}

/** 数値を小数点以下指定桁でフォーマット */
export function formatNumber(n: number, digits = 1): string {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** 日付フォーマット (YYYY-MM-DD) */
export function formatDate(d: Date | null): string {
  if (!d) return "-";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 経過日数 (today - target) */
export function daysSince(target: Date | null, today: Date = new Date()): number | null {
  if (!target) return null;
  const ms = today.getTime() - target.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

/** 残日数 (target - today) */
export function daysUntil(target: Date | null, today: Date = new Date()): number | null {
  if (!target) return null;
  const ms = target.getTime() - today.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

/** 文字列を日付に変換 ("YYYY-MM-DD" 形式想定、無効値はnull) */
export function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const trimmed = String(s).trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  return isNaN(d.getTime()) ? null : d;
}

/** 品名から規格を抽出 (例: "アムロジピン錠5mg" → "5mg") */
export function extractSpec(productName: string): string {
  if (!productName) return "";
  // mg, μg, g, mL, %, 単位 のパターン
  const patterns = [
    /(\d+(?:\.\d+)?)\s*(mg|μg|g|mL|ml|％|%|単位)/i,
    /(\d+(?:\.\d+)?)\s*(W\/V%|w\/v%)/i,
  ];
  for (const p of patterns) {
    const m = productName.match(p);
    if (m) return `${m[1]}${m[2]}`;
  }
  return "";
}

/** 表示名生成 "成分名（メーカー）容量" */
export function buildDisplayName(opts: {
  一般名: string;
  メーカー: string;
  容量: string;
  品名: string;
}): string {
  const { 一般名, メーカー, 容量, 品名 } = opts;
  const seibun = (一般名 || "").trim();
  const maker = (メーカー || "").trim();
  const cap = (容量 || "").trim();

  if (!seibun) {
    // 一般名がなければ品名フォールバック
    return [品名 || "(無名)", maker ? `（${maker}）` : "", cap ? ` ${cap}` : ""]
      .join("")
      .trim();
  }
  return `${seibun}${maker ? `（${maker}）` : ""}${cap ? ` ${cap}` : ""}`;
}
