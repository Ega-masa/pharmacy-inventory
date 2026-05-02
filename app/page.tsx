"use client";

import React, { useState, useCallback, useMemo } from "react";
import {
  Upload, AlertCircle, CheckCircle2, Loader2, ArrowLeft,
  ChevronDown, ChevronUp, Settings, RotateCcw, RefreshCw,
  HelpCircle, X as XIcon, Info
} from "lucide-react";
import { HELP } from "@/lib/helpContent";
import { calcPriorities, type PriorityItem } from "@/lib/priorityEngine";
import type { InventoryItem, ExtractParams } from "@/types";
import { DEFAULT_PARAMS } from "@/types";
import { parseZaikoCSV, parseTenshohinCSV, mergeAndNormalize } from "@/lib/csvParser";
import {
  runAllExtractions, type AllExtractResults, type RiskBadge,
  extractReturnCandidates, extractExcessInventory, extractExpiryRisk,
  extractLongUnmoved, extractUnmovedAfterArrival, extractDiscontinued,
  extractHighValueInactive, extractHighValueActive, extractDeadStockRanking,
} from "@/lib/extractors";
import { formatYen, formatDate, formatNumber } from "@/lib/utils";
import DataTable, { type Column, AbcFilter, AmountFilter } from "@/components/ui/DataTable";

type PageState = "upload" | "loading" | "dashboard" | "detail";
type DetailView = keyof AllExtractResults;
const ALL_ABC = new Set(["A","B","C","D","E"]);

const BADGE_COLORS: Record<string, string> = {
  red: "badge badge-red", orange: "badge badge-orange",
  yellow: "badge badge-yellow", green: "badge badge-green", gray: "badge badge-gray",
};
const RISK_BADGE_COLOR: Record<RiskBadge, string> = {
  返品: "badge badge-orange", 過剰: "badge badge-yellow", 廃棄: "badge badge-red",
  長期不動: "badge badge-gray", 入荷不動: "badge badge-gray",
  製造中止: "badge badge-red", 高額不動: "badge badge-orange",
};

/* ─── ヘルプモーダル ─────────────────────── */
function HelpModal({ viewKey, onClose }: { viewKey: string; onClose: () => void }) {
  const h = HELP[viewKey];
  if (!h) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end p-4 pt-16 pr-6 pointer-events-none">
      <div className="bg-white rounded-xl shadow-2xl border border-gray-200 w-96 max-h-[80vh] overflow-y-auto pointer-events-auto">
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 sticky top-0 bg-white rounded-t-xl">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
            <HelpCircle size={15} className="text-blue-500" /> ヘルプ
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100">
            <XIcon size={15} />
          </button>
        </div>
        <div className="px-4 py-3 space-y-4 text-xs">
          {/* 数字の意味 */}
          <div>
            <div className="font-semibold text-gray-700 mb-2 flex items-center gap-1">
              <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-700 text-center text-xs font-bold leading-4 inline-block">1</span>
              各列の数字が表す意味
            </div>
            <div className="space-y-1.5">
              {h.columns.map((c) => (
                <div key={c.name} className="bg-gray-50 rounded p-2">
                  <span className="font-medium text-gray-700">{c.name}：</span>
                  <span className="text-gray-600">{c.meaning}</span>
                </div>
              ))}
            </div>
          </div>
          {/* 見方 */}
          <div>
            <div className="font-semibold text-gray-700 mb-2 flex items-center gap-1">
              <span className="w-4 h-4 rounded-full bg-green-100 text-green-700 text-center text-xs font-bold leading-4 inline-block">2</span>
              数字の見方・ポイント
            </div>
            <div className="bg-green-50 rounded p-2 text-gray-600 leading-relaxed">{h.focus}</div>
          </div>
          {/* 作業手順 */}
          <div>
            <div className="font-semibold text-gray-700 mb-2 flex items-center gap-1">
              <span className="w-4 h-4 rounded-full bg-orange-100 text-orange-700 text-center text-xs font-bold leading-4 inline-block">3</span>
              具体的な作業手順
            </div>
            <ol className="space-y-1.5">
              {h.steps.map((step, i) => (
                <li key={i} className="flex gap-2">
                  <span className="shrink-0 w-4 h-4 rounded-full bg-orange-100 text-orange-700 text-center text-xs font-bold leading-4 mt-0.5">{i + 1}</span>
                  <span className="text-gray-600 leading-relaxed">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── ページ説明バナー ───────────────────── */
function PageDescription({ viewKey }: { viewKey: string }) {
  const h = HELP[viewKey];
  if (!h) return null;
  return (
    <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 mb-3 text-xs text-blue-800">
      <Info size={13} className="shrink-0 mt-0.5 text-blue-500" />
      <span className="leading-relaxed">{h.purpose}</span>
    </div>
  );
}

/* ─── 数値入力フィールド ─────────────────── */
function NumInput({
  label, value, unit, min, max, onChange,
}: {
  label: string; value: number; unit: string; min?: number; max?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span className="text-gray-600 whitespace-nowrap">{label}:</span>
      <input
        type="number" value={value} min={min} max={max}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (isNaN(v)) return;
          if (min !== undefined && v < min) return;
          if (max !== undefined && v > max) return;
          onChange(v);
        }}
        className="w-16 px-1.5 py-1 border border-gray-300 rounded text-xs font-bold text-center
          focus:ring-1 focus:ring-blue-400 outline-none"
      />
      <span className="text-gray-500">{unit}</span>
    </div>
  );
}

/* ─── ページごとのパラメータパネル ─────── */
function PageParamPanel({
  localParams, globalParams, onChange, onSyncToGlobal, children,
}: {
  localParams: ExtractParams;
  globalParams: ExtractParams;
  onChange: (p: ExtractParams) => void;
  onSyncToGlobal: (p: ExtractParams) => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const isModified = JSON.stringify(localParams) !== JSON.stringify(globalParams);
  const set = (key: keyof ExtractParams, value: number | string) =>
    onChange({ ...localParams, [key]: value });

  return (
    <div className="border-b border-gray-100 bg-gray-50">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-medium text-gray-600 hover:bg-gray-100 transition">
        <Settings size={13} className="text-gray-400" />
        <span>このページの抽出条件</span>
        {isModified && <span className="text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded">変更中</span>}
        <span className="ml-auto flex items-center gap-2">
          {isModified && (
            <>
              <span onClick={(e) => { e.stopPropagation(); onSyncToGlobal(localParams); }}
                className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
                <RefreshCw size={11} /> ダッシュボードに反映
              </span>
              <span onClick={(e) => { e.stopPropagation(); onChange(globalParams); }}
                className="flex items-center gap-1 text-xs text-gray-500 hover:underline">
                <RotateCcw size={11} /> リセット
              </span>
            </>
          )}
          <span className="text-gray-400">{open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</span>
        </span>
      </button>
      {open && (
        <div className="px-4 pb-3 flex flex-wrap items-center gap-4">
          {children}
        </div>
      )}
    </div>
  );
}

/* ─── メイン ──────────────────────────────── */
export default function HomePage() {
  const [zaikoFile, setZaikoFile] = useState<File | null>(null);
  const [tenshohinFile, setTenshohinFile] = useState<File | null>(null);
  const [pageState, setPageState] = useState<PageState>("upload");
  const [errorMessage, setErrorMessage] = useState("");
  const [inventoryData, setInventoryData] = useState<InventoryItem[]>([]);
  const [params, setParams] = useState<ExtractParams>(DEFAULT_PARAMS);
  const [detailView, setDetailView] = useState<DetailView | null>(null);
  const [fromPriority, setFromPriority] = useState(false);

  const results = useMemo<AllExtractResults | null>(() => {
    if (inventoryData.length === 0) return null;
    return runAllExtractions(inventoryData, params);
  }, [inventoryData, params]);

  const handleAnalyze = async () => {
    if (!zaikoFile || !tenshohinFile) { setErrorMessage("両CSVを選択してください"); return; }
    setErrorMessage(""); setPageState("loading");
    try {
      const zaiko = await parseZaikoCSV(zaikoFile);
      const tenshohin = await parseTenshohinCSV(tenshohinFile);
      const merged = mergeAndNormalize(zaiko, tenshohin);
      if (merged.length === 0) { setErrorMessage("マッチする在庫品目がありません"); setPageState("upload"); return; }
      setInventoryData(merged); setPageState("dashboard");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "不明なエラー"); setPageState("upload");
    }
  };

  const handleReset = useCallback(() => {
    setZaikoFile(null); setTenshohinFile(null);
    setInventoryData([]); setParams(DEFAULT_PARAMS); setPageState("upload");
  }, []);

  if (pageState === "detail" && results && detailView) {
    return (
      <DetailPage view={detailView} results={results} inventoryData={inventoryData}
        globalParams={params} onParamsChange={setParams} fromPriority={fromPriority} onBack={() => setPageState("dashboard")} />
    );
  }
  if (pageState === "dashboard" && results) {
    return (
      <DashboardPage results={results} totalItems={inventoryData.length}
        totalAmount={inventoryData.reduce((s, i) => s + i.在庫金額, 0)}
        params={params} onParamsChange={setParams}
        onDetail={(v, fp) => { setDetailView(v); setFromPriority(fp ?? false); setPageState("detail"); }}
        onReset={handleReset} />
    );
  }

  return (
    <main className="container mx-auto px-4 py-8 max-w-3xl">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">薬局在庫分析システム</h1>
      <p className="text-gray-600 mb-6">在庫照会CSVと品目マスタCSVをアップロードして分析します。</p>
      <section className="bg-white rounded-lg shadow p-6 mb-4">
        <h2 className="text-lg font-semibold mb-4">CSVファイルのアップロード</h2>
        <div className="space-y-4">
          {[
            { label: "① 在庫照会CSV（zaikoSyokai_*.csv）", file: zaikoFile, set: setZaikoFile },
            { label: "② 品目マスタCSV（Tenshohin_*.csv）", file: tenshohinFile, set: setTenshohinFile },
          ].map(({ label, file, set }) => (
            <div key={label} className="border-2 border-dashed border-gray-300 rounded-lg p-4">
              <label className="block">
                <div className="flex items-center gap-2 mb-2"><Upload size={18} className="text-blue-600" /><span className="font-medium text-sm">{label}</span></div>
                <input type="file" accept=".csv" onChange={(e) => set(e.target.files?.[0] || null)}
                  disabled={pageState === "loading"}
                  className="block w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-3 file:rounded file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50" />
                {file && <p className="mt-1 text-sm text-green-700 flex items-center gap-1"><CheckCircle2 size={14} />{file.name}</p>}
              </label>
            </div>
          ))}
        </div>
        {errorMessage && <div className="mt-3 p-3 rounded bg-red-50 border border-red-200 flex items-center gap-2 text-red-800 text-sm"><AlertCircle size={16} />{errorMessage}</div>}
        <button onClick={handleAnalyze} disabled={!zaikoFile || !tenshohinFile || pageState === "loading"}
          className="mt-5 w-full py-3 bg-blue-600 text-white font-semibold rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition flex items-center justify-center gap-2">
          {pageState === "loading" ? <><Loader2 size={18} className="animate-spin" />分析中...</> : "分析を開始"}
        </button>
      </section>
      <footer className="text-center text-xs text-gray-400 mt-4">v0.6.0 | データはブラウザ内で処理されサーバ送信されません</footer>
    </main>
  );
}

/* ─── 優先対応パネル ────────────────────── */
const BADGE_BG: Record<string, string> = {
  red: "bg-red-100 text-red-800 border-red-200",
  orange: "bg-orange-100 text-orange-800 border-orange-200",
  yellow: "bg-yellow-100 text-yellow-800 border-yellow-200",
  blue: "bg-blue-100 text-blue-800 border-blue-200",
  gray: "bg-gray-100 text-gray-700 border-gray-200",
};
const SCORE_BAR: Record<string, string> = {
  red: "bg-red-400", orange: "bg-orange-400",
  yellow: "bg-yellow-400", blue: "bg-blue-400", gray: "bg-gray-300",
};

function PriorityPanel({
  results, totalAmount, onDetail,
}: {
  results: AllExtractResults;
  totalAmount: number;
  onDetail: (v: DetailView, fromPriority?: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const priorities = useMemo(
    () => calcPriorities(results, totalAmount),
    [results, totalAmount]
  );
  const active = priorities.filter((p) => !p.skip);
  const skipped = priorities.filter((p) => p.skip);

  return (
    <div className="bg-white rounded-lg shadow mb-4">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-4 py-3 text-sm font-semibold text-gray-800 hover:bg-gray-50 rounded-lg transition"
      >
        <span className="text-base">📋</span>
        <span>推奨対応順位</span>
        <span className="text-xs font-normal text-gray-500 ml-1">— 今日やるべきことをスコアで自動計算</span>
        <span className="ml-auto flex items-center gap-2">
          {active.length > 0 && (
            <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded font-medium">
              {active.length}件の対応あり
            </span>
          )}
          <span className="text-gray-400">{open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</span>
        </span>
      </button>

      {open && (
        <div className="border-t border-gray-100">
          {/* スコア説明 */}
          <div className="px-4 py-2 bg-gray-50 text-xs text-gray-500 border-b border-gray-100">
            スコア＝ <b>緊急度</b>（締め切り・期限）×40% ＋ <b>金額インパクト</b>×40% ＋ <b>対応可能性</b>×20% で計算
          </div>

          {active.length === 0 ? (
            <div className="px-4 py-6 text-center text-gray-400 text-sm">
              現在、緊急対応が必要な項目はありません。
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {active.map((p, idx) => (
                <button
                  key={p.view}
                  onClick={() => onDetail(p.view as DetailView, true)}
                  className="w-full flex items-start gap-3 px-4 py-3 hover:bg-blue-50 transition text-left"
                >
                  {/* 順位 */}
                  <div className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold mt-0.5
                    bg-gray-100 text-gray-700">
                    {idx + 1}
                  </div>

                  {/* メイン */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-sm text-gray-800">{p.label}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${BADGE_BG[p.badgeColor]}`}>
                        {p.totalCount}件
                        {p.urgentCount > 0 && <span className="ml-1 font-bold">（急ぎ{p.urgentCount}件）</span>}
                      </span>
                      <span className="text-xs text-gray-500 ml-auto">{p.totalAmount > 0 && `¥${p.totalAmount.toLocaleString()}`}</span>
                    </div>
                    <div className="text-xs text-gray-600 mb-1.5">{p.reason}</div>
                    <div className="text-xs text-blue-700 font-medium">▶ {p.action}</div>
                  </div>

                  {/* スコアバー */}
                  <div className="shrink-0 w-16 text-right">
                    <div className="text-lg font-bold text-gray-800">{p.score}</div>
                    <div className="w-16 h-1.5 bg-gray-100 rounded-full mt-1">
                      <div
                        className={`h-1.5 rounded-full ${SCORE_BAR[p.badgeColor]}`}
                        style={{ width: `${p.score}%` }}
                      />
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">点</div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* 対応不要項目 */}
          {skipped.length > 0 && (
            <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 text-xs text-gray-400">
              対象なし: {skipped.map((p) => p.label).join("、")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── ダッシュボード パラメータパネル ─── */
function DashboardParamsPanel({ params, onChange }: { params: ExtractParams; onChange: (p: ExtractParams) => void }) {
  const [open, setOpen] = useState(false);
  const isModified = JSON.stringify(params) !== JSON.stringify(DEFAULT_PARAMS);
  const set = (key: keyof ExtractParams, value: number | string) => onChange({ ...params, [key]: value });

  return (
    <div className="bg-white rounded-lg shadow mb-4">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg transition">
        <Settings size={15} className="text-gray-500" />
        <span>全体の抽出条件</span>
        {isModified && <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded">変更中</span>}
        <span className="ml-auto text-gray-400">{open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-gray-100">
          <div className="grid grid-cols-2 gap-x-8 gap-y-5 mt-4">
            {([
              ["① 返品推奨 入庫経過日数", "返品_経過日数下限", 14, 364, "日"],
              ["② 過剰在庫 在庫月数", "過剰在庫_月数下限", 1, 24, "か月"],
              ["③ 廃棄リスク 有効期限残日数", "廃棄リスク_残日数上限", 30, 730, "日"],
              ["④ 長期不動品 処方経過日数", "長期不動_経過日数下限", 30, 730, "日"],
              ["⑤ 入荷後不動品 入庫後経過日数", "入荷後不動_経過日数下限", 30, 365, "日"],
              ["⑥ 複数メーカー メーカー数", "複数メーカー_社数下限", 2, 5, "社"],
              ["C/D 高額品 単価下限", "高額品_単価下限", 1, 100000, "円"],
              ["C 高額不動 処方経過日数", "高額不動_経過日数下限", 30, 365, "日"],
              ["D 高額アクティブ 処方経過日数", "高額アクティブ_経過日数上限", 30, 180, "日"],
            ] as const).map(([label, key, min, max, unit]) => (
              <DashboardNumRow key={key} label={label} value={params[key] as number} unit={unit}
                min={min} max={max} defaultVal={DEFAULT_PARAMS[key] as number}
                onChange={(v) => set(key, v)} />
            ))}
            <div>
              <div className="text-xs font-medium text-gray-600 mb-1">C/D 高額品 ABCランク下限</div>
              <div className="flex gap-1">
                {(["A","B","C","D","E"] as const).map((r) => (
                  <button key={r} onClick={() => set("高額品_ABCランク下限", r)}
                    className={`px-3 py-1.5 rounded text-sm font-bold border transition
                      ${params.高額品_ABCランク下限 === r ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-300 hover:border-blue-400"}`}>
                    {r}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs font-medium text-gray-600 mb-1">② 在庫月数 算出方法</div>
              <div className="flex gap-2">
                {([["calc","再計算（推奨）"],["csv","CSV値"]] as const).map(([v, l]) => (
                  <button key={v} onClick={() => set("在庫月数_算出方法", v)}
                    className={`px-3 py-1.5 rounded text-sm border transition
                      ${params.在庫月数_算出方法 === v ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-300 hover:border-blue-400"}`}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {isModified && (
            <div className="mt-4 pt-3 border-t border-gray-100 flex justify-end">
              <button onClick={() => onChange(DEFAULT_PARAMS)}
                className="flex items-center gap-1 px-3 py-1.5 text-sm text-orange-600 border border-orange-300 rounded hover:bg-orange-50">
                <RotateCcw size={13} /> デフォルトに戻す
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DashboardNumRow({ label, value, unit, min, max, defaultVal, onChange }: {
  label: string; value: number; unit: string; min: number; max: number; defaultVal: number;
  onChange: (v: number) => void;
}) {
  const isModified = value !== defaultVal;
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-gray-600">{label}</span>
        <span className={`text-xs font-bold ${isModified ? "text-orange-600" : "text-gray-700"}`}>{value}{unit}</span>
      </div>
      <div className="flex items-center gap-2">
        <input type="number" value={value} min={min} max={max}
          onChange={(e) => { const v = Number(e.target.value); if (!isNaN(v) && v >= min && v <= max) onChange(v); }}
          className="w-20 px-2 py-1.5 border border-gray-300 rounded text-sm font-bold text-center focus:ring-1 focus:ring-blue-400 outline-none" />
        <span className="text-xs text-gray-400">{unit}（{min}〜{max}）</span>
        {isModified && <span className="text-xs text-orange-400 ml-auto">デフォルト: {defaultVal}</span>}
      </div>
    </div>
  );
}

/* ─── ダッシュボード ─────────────────────── */
const SECTIONS: { key: DetailView; label: string; color: string; unit?: string }[] = [
  { key: "return",              label: "① 返品推奨",           color: "border-orange-400" },
  { key: "excess",              label: "② 過剰在庫",           color: "border-yellow-400" },
  { key: "expiry",              label: "③ 廃棄リスク",         color: "border-red-400" },
  { key: "longUnmoved",         label: "④ 長期不動品",         color: "border-gray-400" },
  { key: "unmovedAfterArrival", label: "⑤ 入荷後不動品",       color: "border-gray-400" },
  { key: "multiMaker",          label: "⑥ 複数メーカー",       color: "border-blue-400", unit: "組合せ" },
  { key: "discontinued",        label: "A 製造中止/経過措置",   color: "border-red-400" },
  { key: "highValueInactive",   label: "C 高額不動品(D/E)",    color: "border-purple-400" },
  { key: "highValueActive",     label: "D 高額アクティブ(D/E)", color: "border-teal-400" },
  { key: "deadStock",           label: "B デッドストックTOP30", color: "border-gray-800" },
];

function DashboardPage({ results, totalItems, totalAmount, params, onParamsChange, onDetail, onReset }: {
  results: AllExtractResults; totalItems: number; totalAmount: number;
  params: ExtractParams; onParamsChange: (p: ExtractParams) => void;
  onDetail: (v: DetailView, fromPriority?: boolean) => void; onReset: () => void;
}) {
  const gc = (k: DetailView) => k === "multiMaker" ? results.multiMaker.totalCount : (results[k] as { totalCount: number }).totalCount;
  const ga = (k: DetailView): number | null => k === "multiMaker" ? null : (results[k] as { totalAmount: number }).totalAmount;
  return (
    <main className="container mx-auto px-4 py-6 max-w-6xl">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-900">薬局在庫分析システム</h1>
        <button onClick={onReset} className="flex items-center gap-1 px-3 py-2 border border-gray-300 rounded hover:bg-gray-50 text-sm text-gray-600">
          <ArrowLeft size={14} /> 新しいCSV
        </button>
      </div>
      <div className="grid grid-cols-4 gap-3 mb-4">
        <div className="bg-white rounded-lg shadow p-3"><div className="text-xs text-gray-500">在庫品目数</div><div className="text-xl font-bold">{totalItems.toLocaleString()}</div></div>
        <div className="bg-white rounded-lg shadow p-3"><div className="text-xs text-gray-500">総在庫金額</div><div className="text-xl font-bold text-blue-600">{formatYen(totalAmount)}</div></div>
        <div className="bg-white rounded-lg shadow p-3"><div className="text-xs text-gray-500">要対応金額</div><div className="text-xl font-bold text-red-600">{formatYen(results.deadStock.totalAmount)}</div></div>
        <div className="bg-white rounded-lg shadow p-3"><div className="text-xs text-gray-500">高額品在庫</div><div className="text-xl font-bold text-purple-600">{formatYen((ga("highValueInactive")??0)+(ga("highValueActive")??0))}</div></div>
      </div>
      <PriorityPanel results={results} totalAmount={totalAmount} onDetail={onDetail} />
      <DashboardParamsPanel params={params} onChange={onParamsChange} />
      <div className="grid grid-cols-2 gap-3">
        {SECTIONS.map(({ key, label, color, unit }) => {
          const count = gc(key); const amount = ga(key);
          return (
            <button key={key} onClick={() => onDetail(key)}
              className={`bg-white rounded-lg shadow p-4 border-l-4 ${color} text-left hover:bg-gray-50 transition`}>
              <div className="text-sm font-semibold text-gray-700 mb-1">{label}</div>
              <div className="flex items-end justify-between">
                <span className="text-2xl font-bold">{count.toLocaleString()}<span className="text-xs font-normal text-gray-500 ml-1">{unit||"品目"}</span></span>
                {amount !== null && <span className="text-sm font-medium text-gray-600">{formatYen(amount)}</span>}
              </div>
            </button>
          );
        })}
      </div>
    </main>
  );
}

/* ─── 詳細画面（ローカルparams管理） ──── */
function DetailPage({ view, results, inventoryData, globalParams, onParamsChange, fromPriority, onBack }: {
  view: DetailView; results: AllExtractResults; inventoryData: InventoryItem[];
  globalParams: ExtractParams; onParamsChange: (p: ExtractParams) => void;
  fromPriority: boolean; onBack: () => void;
}) {
  const [localParams, setLocalParams] = useState<ExtractParams>(globalParams);
  const [showHelp, setShowHelp] = useState(false);
  const section = SECTIONS.find((s) => s.key === view)!;

  const localResults = useMemo(() => {
    if (view === "multiMaker") return results; // 複数メーカーはglobal結果を使用
    return runAllExtractions(inventoryData, localParams);
  }, [view, inventoryData, localParams, results]);

  const r = localResults[view];
  const totalAmount = view !== "multiMaker" ? (r as { totalAmount: number }).totalAmount : null;

  return (
    <main className="container mx-auto px-4 py-6 max-w-7xl">
      <div className="flex items-center gap-3 mb-3">
        <button onClick={onBack} className="flex items-center gap-1 px-3 py-2 border border-gray-300 rounded hover:bg-gray-50 text-sm text-gray-600">
          <ArrowLeft size={14} /> 戻る
        </button>
        <h1 className="text-xl font-bold text-gray-900">{section.label}</h1>
        <div className="ml-auto flex items-center gap-3 text-sm">
          <span className="bg-white rounded shadow px-3 py-1">件数 <b>{(r as { totalCount: number }).totalCount.toLocaleString()}</b></span>
          {totalAmount !== null && <span className="bg-white rounded shadow px-3 py-1">合計 <b className="text-blue-600">{formatYen(totalAmount)}</b></span>}
          <button onClick={() => setShowHelp(!showHelp)}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded border text-xs font-medium transition
              ${showHelp ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-500 border-gray-300 hover:border-blue-400 hover:text-blue-600"}`}>
            <HelpCircle size={14} /> ヘルプ
          </button>
        </div>
      </div>
      <PageDescription viewKey={view} />
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <DetailContent view={view} results={localResults} inventoryData={inventoryData}
          localParams={localParams} globalParams={globalParams}
          fromPriority={fromPriority}
          onLocalParamsChange={setLocalParams} onSyncToGlobal={onParamsChange} />
      </div>
      {showHelp && <HelpModal viewKey={view} onClose={() => setShowHelp(false)} />}
    </main>
  );
}

function DetailContent({ view, results, inventoryData, localParams, globalParams, fromPriority, onLocalParamsChange, onSyncToGlobal }: {
  view: DetailView; results: AllExtractResults; inventoryData: InventoryItem[];
  localParams: ExtractParams; globalParams: ExtractParams;
  fromPriority: boolean;
  onLocalParamsChange: (p: ExtractParams) => void; onSyncToGlobal: (p: ExtractParams) => void;
}) {
  const props = { inventoryData, localParams, globalParams, fromPriority, onLocalParamsChange, onSyncToGlobal };
  switch (view) {
    case "return":              return <ReturnView              data={results.return.items}              {...props} />;
    case "excess":              return <ExcessView              data={results.excess.items}              {...props} />;
    case "expiry":              return <ExpiryView              data={results.expiry.items}              {...props} />;
    case "longUnmoved":         return <LongUnmovedView         data={results.longUnmoved.items}         {...props} />;
    case "unmovedAfterArrival": return <UnmovedView             data={results.unmovedAfterArrival.items} {...props} />;
    case "multiMaker":          return <MultiMakerView          data={results.multiMaker.groups} />;
    case "discontinued":        return <DiscontinuedView        data={results.discontinued.items}        {...props} />;
    case "highValueInactive":   return <HighValueInactiveView   data={results.highValueInactive.items}   {...props} />;
    case "highValueActive":     return <HighValueActiveView     data={results.highValueActive.items}     {...props} />;
    case "deadStock":           return <DeadStockView           data={results.deadStock.items}           {...props} />;
  }
}

type ViewProps = {
  inventoryData: InventoryItem[];
  localParams: ExtractParams;
  globalParams: ExtractParams;
  fromPriority: boolean;
  onLocalParamsChange: (p: ExtractParams) => void;
  onSyncToGlobal: (p: ExtractParams) => void;
};

/* ─── 急ぎフィルタートグル ─────────────────── */
function UrgentToggle({
  urgentOnly, urgentCount, totalCount, onChange,
}: {
  urgentOnly: boolean; urgentCount: number; totalCount: number;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-red-50 border-b border-red-100">
      <span className="text-xs text-red-700 font-medium flex items-center gap-1">
        🚨 急ぎ対応
        <span className="bg-red-600 text-white text-xs font-bold px-1.5 py-0.5 rounded ml-1">
          {urgentCount}件
        </span>
      </span>
      <span className="text-xs text-gray-500 ml-1">/ 全{totalCount}件</span>
      <div className="ml-auto flex items-center gap-1">
        <button
          onClick={() => onChange(true)}
          className={`px-2.5 py-1 rounded text-xs font-medium border transition
            ${urgentOnly ? "bg-red-600 text-white border-red-600" : "bg-white text-gray-600 border-gray-300 hover:border-red-400"}`}
        >
          急ぎのみ
        </button>
        <button
          onClick={() => onChange(false)}
          className={`px-2.5 py-1 rounded text-xs font-medium border transition
            ${!urgentOnly ? "bg-gray-700 text-white border-gray-700" : "bg-white text-gray-600 border-gray-300 hover:border-gray-500"}`}
        >
          全て表示
        </button>
      </div>
    </div>
  );
}

const searchFn = (item: { 表示名: string; 品名: string; メーカー: string; 一般名: string }) =>
  `${item.表示名} ${item.品名} ${item.メーカー} ${item.一般名}`;

/* ─── ① 返品推奨 ─── */
function ReturnView({ data: _data, inventoryData, localParams, globalParams, fromPriority, onLocalParamsChange, onSyncToGlobal }: { data: AllExtractResults["return"]["items"] } & ViewProps) {
  const [abc, setAbc] = useState(new Set(ALL_ABC));
  const [amtMin, setAmtMin] = useState(0);
  const [amtMax, setAmtMax] = useState(Infinity);
  const [urgentOnly, setUrgentOnly] = useState(fromPriority);
  const set = (k: keyof ExtractParams, v: number) => onLocalParamsChange({ ...localParams, [k]: v });

  const data = useMemo(() => extractReturnCandidates(inventoryData, localParams).items, [inventoryData, localParams]);
  const urgentCount = data.filter((i) => i.返品期限残日数 <= 10).length;

  const cols: Column<(typeof data)[0]>[] = [
    { key: "表示名", label: "薬品", getValue: (i) => i.表示名, render: (i) => <span className="font-medium text-sm">{i.表示名}</span> },
    { key: "ABCランク", label: "ABC", align: "center", getValue: (i) => i.ABCランク, render: (i) => <span className="badge badge-gray">{i.ABCランク}</span> },
    { key: "理論在庫", label: "在庫数", align: "right", getValue: (i) => i.理論在庫 },
    { key: "在庫金額", label: "在庫金額", align: "right", getValue: (i) => i.在庫金額, render: (i) => <b>{formatYen(i.在庫金額)}</b> },
    { key: "経過日数", label: "入庫経過日", align: "right", getValue: (i) => i.経過日数 },
    { key: "返品期限残日数", label: "返品期限残", align: "right", getValue: (i) => i.返品期限残日数, render: (i) => <b className={i.返品期限残日数 <= 10 ? "text-red-600" : ""}>{i.返品期限残日数 <= 0 ? "期限超過" : `${i.返品期限残日数}日`}</b> },
    { key: "最終入庫日", label: "最終入庫日", getValue: (i) => i.最終入庫日 },
    { key: "警告", label: "状態", sortable: false, getValue: (i) => i.警告レベル, render: (i) => <span className={BADGE_COLORS[i.警告レベル]}>{i.警告レベル === "red" ? "急ぎ" : i.警告レベル === "orange" ? "注意" : "余裕"}</span> },
  ];
  return (
    <>
      <PageParamPanel localParams={localParams} globalParams={globalParams} onChange={onLocalParamsChange} onSyncToGlobal={onSyncToGlobal}>
        <NumInput label="入庫経過日数（下限）" value={localParams.返品_経過日数下限} unit="日" min={1} max={89} onChange={(v) => set("返品_経過日数下限", v)} />
      </PageParamPanel>
      {urgentCount > 0 && <UrgentToggle urgentOnly={urgentOnly} urgentCount={urgentCount} totalCount={data.length} onChange={setUrgentOnly} />}
      <DataTable columns={cols} data={data} keyField="商品コード" exportFileName="return_candidates.csv" getSearchText={searchFn}
        extraFilter={(i) => (urgentOnly ? i.返品期限残日数 <= 10 : true) && abc.has(i.ABCランク) && i.在庫金額 >= amtMin && i.在庫金額 <= amtMax}
        filterSlot={<><AbcFilter selected={abc} onChange={setAbc} /><AmountFilter min={amtMin} max={amtMax === Infinity ? 0 : amtMax} onChange={(mn,mx) => { setAmtMin(mn); setAmtMax(mx||Infinity); }} /></>} />
    </>
  );
}

/* ─── ② 過剰在庫 ─── */
function ExcessView({ data: _data, inventoryData, localParams, globalParams, fromPriority, onLocalParamsChange, onSyncToGlobal }: { data: AllExtractResults["excess"]["items"] } & ViewProps) {
  const [abc, setAbc] = useState(new Set(ALL_ABC));
  const [urgentOnly, setUrgentOnly] = useState(fromPriority);
  const [amtMin, setAmtMin] = useState(0); const [amtMax, setAmtMax] = useState(Infinity);
  const set = (k: keyof ExtractParams, v: number | string) => onLocalParamsChange({ ...localParams, [k]: v });
  const data = useMemo(() => extractExcessInventory(inventoryData, localParams).items, [inventoryData, localParams]);
  const cols: Column<(typeof data)[0]>[] = [
    { key: "表示名", label: "薬品", getValue: (i) => i.表示名, render: (i) => <span className="font-medium text-sm">{i.表示名}</span> },
    { key: "ABCランク", label: "ABC", align: "center", getValue: (i) => i.ABCランク, render: (i) => <span className="badge badge-gray">{i.ABCランク}</span> },
    { key: "理論在庫", label: "在庫数", align: "right", getValue: (i) => i.理論在庫 },
    { key: "月使用数", label: "月使用数", align: "right", getValue: (i) => i.月使用数 },
    { key: "在庫月数", label: "在庫月数", align: "right", getValue: (i) => i.在庫月数_表示, render: (i) => <b>{i.在庫月数_表示 >= 999 ? "∞" : formatNumber(i.在庫月数_表示)}M</b> },
    { key: "推奨削減量", label: "削減量", align: "right", getValue: (i) => i.推奨削減量 },
    { key: "推奨削減金額", label: "削減見込額", align: "right", getValue: (i) => i.推奨削減金額, render: (i) => <b className="text-red-600">{formatYen(i.推奨削減金額)}</b> },
    { key: "警告", label: "状態", sortable: false, getValue: (i) => i.警告レベル, render: (i) => <span className={BADGE_COLORS[i.警告レベル]}>{i.在庫月数_表示 >= 12 ? "12M超" : i.在庫月数_表示 >= 6 ? "6M超" : "3M超"}</span> },
  ];
  return (
    <>
      <PageParamPanel localParams={localParams} globalParams={globalParams} onChange={onLocalParamsChange} onSyncToGlobal={onSyncToGlobal}>
        <NumInput label="在庫月数（下限）" value={localParams.過剰在庫_月数下限} unit="か月" min={1} max={24} onChange={(v) => set("過剰在庫_月数下限", v)} />
        <div className="flex items-center gap-2 text-xs">
          <span className="text-gray-600">算出方法:</span>
          {([["calc","再計算"],["csv","CSV値"]] as const).map(([v,l]) => (
            <button key={v} onClick={() => set("在庫月数_算出方法", v)}
              className={`px-2 py-1 rounded border text-xs transition ${localParams.在庫月数_算出方法===v ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-300"}`}>{l}</button>
          ))}
        </div>
      </PageParamPanel>
      {(() => { const uc = data.filter((i) => i.在庫月数_表示 >= 12).length; return uc > 0 ? <UrgentToggle urgentOnly={urgentOnly} urgentCount={uc} totalCount={data.length} onChange={setUrgentOnly} /> : null; })()}
      <DataTable columns={cols} data={data} keyField="商品コード" exportFileName="excess_inventory.csv" getSearchText={searchFn}
        extraFilter={(i) => (urgentOnly ? (i.在庫月数_表示 >= 12) : true) && abc.has(i.ABCランク) && i.在庫金額 >= amtMin && i.在庫金額 <= amtMax}
        filterSlot={<><AbcFilter selected={abc} onChange={setAbc} /><AmountFilter min={amtMin} max={amtMax===Infinity?0:amtMax} onChange={(mn,mx) => { setAmtMin(mn); setAmtMax(mx||Infinity); }} /></>} />
    </>
  );
}

/* ─── ③ 廃棄リスク ─── */
function ExpiryView({ data: _data, inventoryData, localParams, globalParams, fromPriority, onLocalParamsChange, onSyncToGlobal }: { data: AllExtractResults["expiry"]["items"] } & ViewProps) {
  const [abc, setAbc] = useState(new Set(ALL_ABC));
  const [urgentOnly, setUrgentOnly] = useState(fromPriority);
  const [amtMin, setAmtMin] = useState(0); const [amtMax, setAmtMax] = useState(Infinity);
  const set = (k: keyof ExtractParams, v: number) => onLocalParamsChange({ ...localParams, [k]: v });
  const data = useMemo(() => extractExpiryRisk(inventoryData, localParams).items, [inventoryData, localParams]);
  const cols: Column<(typeof data)[0]>[] = [
    { key: "表示名", label: "薬品", getValue: (i) => i.表示名, render: (i) => <span className="font-medium text-sm">{i.表示名}</span> },
    { key: "ABCランク", label: "ABC", align: "center", getValue: (i) => i.ABCランク, render: (i) => <span className="badge badge-gray">{i.ABCランク}</span> },
    { key: "理論在庫", label: "在庫数", align: "right", getValue: (i) => i.理論在庫 },
    { key: "在庫金額", label: "在庫金額", align: "right", getValue: (i) => i.在庫金額, render: (i) => <b>{formatYen(i.在庫金額)}</b> },
    { key: "最終有効期限", label: "有効期限", getValue: (i) => i.最終有効期限 },
    { key: "残日数", label: "残日数", align: "right", getValue: (i) => i.残日数, render: (i) => <b className={i.残日数 <= 30 ? "text-red-600" : ""}>{i.残日数}日</b> },
    { key: "最終ロット番号", label: "ロット", getValue: (i) => i.最終ロット番号||"-" },
    { key: "警告", label: "状態", sortable: false, getValue: (i) => i.警告レベル, render: (i) => <span className={BADGE_COLORS[i.警告レベル]}>{i.残日数<=30?"30日以内":i.残日数<=60?"60日以内":i.残日数<=90?"90日以内":"180日以内"}</span> },
  ];
  return (
    <>
      <PageParamPanel localParams={localParams} globalParams={globalParams} onChange={onLocalParamsChange} onSyncToGlobal={onSyncToGlobal}>
        <NumInput label="有効期限残日数（上限）" value={localParams.廃棄リスク_残日数上限} unit="日" min={30} max={730} onChange={(v) => set("廃棄リスク_残日数上限", v)} />
      </PageParamPanel>
      {(() => { const uc = data.filter((i) => i.残日数 <= 30).length; return uc > 0 ? <UrgentToggle urgentOnly={urgentOnly} urgentCount={uc} totalCount={data.length} onChange={setUrgentOnly} /> : null; })()}
      <DataTable columns={cols} data={data} keyField="商品コード" exportFileName="expiry_risk.csv" getSearchText={searchFn}
        extraFilter={(i) => (urgentOnly ? (i.残日数 <= 30) : true) && abc.has(i.ABCランク) && i.在庫金額 >= amtMin && i.在庫金額 <= amtMax}
        filterSlot={<><AbcFilter selected={abc} onChange={setAbc} /><AmountFilter min={amtMin} max={amtMax===Infinity?0:amtMax} onChange={(mn,mx) => { setAmtMin(mn); setAmtMax(mx||Infinity); }} /></>} />
    </>
  );
}

/* ─── ④ 長期不動品 ─── */
function LongUnmovedView({ data: _data, inventoryData, localParams, globalParams, fromPriority, onLocalParamsChange, onSyncToGlobal }: { data: AllExtractResults["longUnmoved"]["items"] } & ViewProps) {
  const [abc, setAbc] = useState(new Set(ALL_ABC));
  const [urgentOnly, setUrgentOnly] = useState(fromPriority);
  const [amtMin, setAmtMin] = useState(0); const [amtMax, setAmtMax] = useState(Infinity);
  const set = (k: keyof ExtractParams, v: number) => onLocalParamsChange({ ...localParams, [k]: v });
  const data = useMemo(() => extractLongUnmoved(inventoryData, localParams).items, [inventoryData, localParams]);
  const cols: Column<(typeof data)[0]>[] = [
    { key: "表示名", label: "薬品", getValue: (i) => i.表示名, render: (i) => <span className="font-medium text-sm">{i.表示名}</span> },
    { key: "ABCランク", label: "ABC", align: "center", getValue: (i) => i.ABCランク, render: (i) => <span className="badge badge-gray">{i.ABCランク}</span> },
    { key: "理論在庫", label: "在庫数", align: "right", getValue: (i) => i.理論在庫 },
    { key: "在庫金額", label: "在庫金額", align: "right", getValue: (i) => i.在庫金額, render: (i) => <b>{formatYen(i.在庫金額)}</b> },
    { key: "最終処方日", label: "最終処方日", getValue: (i) => i.最終処方日, render: (i) => i.処方履歴なし ? <span className="badge badge-red">履歴なし</span> : <span>{formatDate(i.最終処方日)}</span> },
    { key: "不動日数", label: "不動日数", align: "right", getValue: (i) => i.不動日数, render: (i) => <span>{i.不動日数>=9999?"-":`${i.不動日数}日`}</span> },
    { key: "警告", label: "状態", sortable: false, getValue: (i) => i.警告レベル, render: (i) => <span className={BADGE_COLORS[i.警告レベル]}>{i.警告レベル==="red"?"1年超/履歴なし":i.警告レベル==="orange"?"9M超":"6M超"}</span> },
  ];
  return (
    <>
      <PageParamPanel localParams={localParams} globalParams={globalParams} onChange={onLocalParamsChange} onSyncToGlobal={onSyncToGlobal}>
        <NumInput label="処方経過日数（下限）" value={localParams.長期不動_経過日数下限} unit="日" min={30} max={730} onChange={(v) => set("長期不動_経過日数下限", v)} />
      </PageParamPanel>
      {(() => { const uc = data.filter((i) => i.処方履歴なし || i.不動日数 >= 365).length; return uc > 0 ? <UrgentToggle urgentOnly={urgentOnly} urgentCount={uc} totalCount={data.length} onChange={setUrgentOnly} /> : null; })()}
      <DataTable columns={cols} data={data} keyField="商品コード" exportFileName="long_unmoved.csv" getSearchText={searchFn}
        extraFilter={(i) => (urgentOnly ? (i.処方履歴なし || i.不動日数 >= 365) : true) && abc.has(i.ABCランク) && i.在庫金額 >= amtMin && i.在庫金額 <= amtMax}
        filterSlot={<><AbcFilter selected={abc} onChange={setAbc} /><AmountFilter min={amtMin} max={amtMax===Infinity?0:amtMax} onChange={(mn,mx) => { setAmtMin(mn); setAmtMax(mx||Infinity); }} /></>} />
    </>
  );
}

/* ─── ⑤ 入荷後不動品 ─── */
function UnmovedView({ data: _data, inventoryData, localParams, globalParams, fromPriority, onLocalParamsChange, onSyncToGlobal }: { data: AllExtractResults["unmovedAfterArrival"]["items"] } & ViewProps) {
  const [abc, setAbc] = useState(new Set(ALL_ABC));
  const [urgentOnly, setUrgentOnly] = useState(fromPriority);
  const [amtMin, setAmtMin] = useState(0); const [amtMax, setAmtMax] = useState(Infinity);
  const set = (k: keyof ExtractParams, v: number) => onLocalParamsChange({ ...localParams, [k]: v });
  const data = useMemo(() => extractUnmovedAfterArrival(inventoryData, localParams).items, [inventoryData, localParams]);
  const cols: Column<(typeof data)[0]>[] = [
    { key: "表示名", label: "薬品", getValue: (i) => i.表示名, render: (i) => <span className="font-medium text-sm">{i.表示名}</span> },
    { key: "ABCランク", label: "ABC", align: "center", getValue: (i) => i.ABCランク, render: (i) => <span className="badge badge-gray">{i.ABCランク}</span> },
    { key: "理論在庫", label: "在庫数", align: "right", getValue: (i) => i.理論在庫 },
    { key: "在庫金額", label: "在庫金額", align: "right", getValue: (i) => i.在庫金額, render: (i) => <b>{formatYen(i.在庫金額)}</b> },
    { key: "最終入庫日", label: "最終入庫日", getValue: (i) => i.最終入庫日 },
    { key: "入庫後経過日数", label: "入庫後経過", align: "right", getValue: (i) => i.入庫後経過日数, render: (i) => <b>{i.入庫後経過日数}日</b> },
    { key: "最終処方日", label: "最終処方日", getValue: (i) => i.最終処方日, render: (i) => i.処方履歴なし ? <span className="badge badge-red">履歴なし</span> : <span>{formatDate(i.最終処方日)}</span> },
  ];
  return (
    <>
      <PageParamPanel localParams={localParams} globalParams={globalParams} onChange={onLocalParamsChange} onSyncToGlobal={onSyncToGlobal}>
        <NumInput label="入庫後経過日数（下限）" value={localParams.入荷後不動_経過日数下限} unit="日" min={30} max={365} onChange={(v) => set("入荷後不動_経過日数下限", v)} />
      </PageParamPanel>
      {(() => { const uc = data.filter((i) => i.処方履歴なし).length; return uc > 0 ? <UrgentToggle urgentOnly={urgentOnly} urgentCount={uc} totalCount={data.length} onChange={setUrgentOnly} /> : null; })()}
      <DataTable columns={cols} data={data} keyField="商品コード" exportFileName="unmoved_after_arrival.csv" getSearchText={searchFn}
        extraFilter={(i) => (urgentOnly ? (i.処方履歴なし) : true) && abc.has(i.ABCランク) && i.在庫金額 >= amtMin && i.在庫金額 <= amtMax}
        filterSlot={<><AbcFilter selected={abc} onChange={setAbc} /><AmountFilter min={amtMin} max={amtMax===Infinity?0:amtMax} onChange={(mn,mx) => { setAmtMin(mn); setAmtMax(mx||Infinity); }} /></>} />
    </>
  );
}

/* ─── A 製造中止 ─── */
function DiscontinuedView({ data: _data, inventoryData, localParams, globalParams, fromPriority, onLocalParamsChange, onSyncToGlobal }: { data: AllExtractResults["discontinued"]["items"] } & ViewProps) {
  const [abc, setAbc] = useState(new Set(ALL_ABC));
  const [urgentOnly, setUrgentOnly] = useState(fromPriority);
  const [amtMin, setAmtMin] = useState(0); const [amtMax, setAmtMax] = useState(Infinity);
  const data = useMemo(() => extractDiscontinued(inventoryData, localParams).items, [inventoryData, localParams]);
  const cols: Column<(typeof data)[0]>[] = [
    { key: "表示名", label: "薬品", getValue: (i) => i.表示名, render: (i) => <span className="font-medium text-sm">{i.表示名}</span> },
    { key: "ABCランク", label: "ABC", align: "center", getValue: (i) => i.ABCランク, render: (i) => <span className="badge badge-gray">{i.ABCランク}</span> },
    { key: "理論在庫", label: "在庫数", align: "right", getValue: (i) => i.理論在庫 },
    { key: "在庫金額", label: "在庫金額", align: "right", getValue: (i) => i.在庫金額, render: (i) => <b>{formatYen(i.在庫金額)}</b> },
    { key: "製造中止日", label: "製造中止日", getValue: (i) => i.製造中止日, render: (i) => i.製造中止日 ? <span className="text-red-600 font-medium">{formatDate(i.製造中止日)}</span> : <span>-</span> },
    { key: "経過措置日", label: "経過措置日", getValue: (i) => i.経過措置日 },
    { key: "経過措置残日数", label: "経過措置残", align: "right", getValue: (i) => i.経過措置残日数??9999, render: (i) => <span>{i.経過措置残日数!==null?`${i.経過措置残日数}日`:"-"}</span> },
    { key: "消化見込み月数", label: "消化見込", align: "right", getValue: (i) => i.消化見込み月数??-1, render: (i) => <span>{i.消化見込み月数!==null?`${formatNumber(i.消化見込み月数)}M`:"-"}</span> },
    { key: "警告", label: "状態", sortable: false, getValue: (i) => i.警告レベル, render: (i) => <span className={BADGE_COLORS[i.警告レベル]}>{i.製造中止日?"製造中止":"経過措置中"}</span> },
  ];
  return (
    <>
      <PageParamPanel localParams={localParams} globalParams={globalParams} onChange={onLocalParamsChange} onSyncToGlobal={onSyncToGlobal}>
        <span className="text-xs text-gray-500">（この機能は条件が固定です）</span>
      </PageParamPanel>
      {(() => { const uc = data.filter((i) => i.製造中止日 !== null).length; return uc > 0 ? <UrgentToggle urgentOnly={urgentOnly} urgentCount={uc} totalCount={data.length} onChange={setUrgentOnly} /> : null; })()}
      <DataTable columns={cols} data={data} keyField="商品コード" exportFileName="discontinued.csv" getSearchText={searchFn}
        extraFilter={(i) => (urgentOnly ? (i.製造中止日 !== null) : true) && abc.has(i.ABCランク) && i.在庫金額 >= amtMin && i.在庫金額 <= amtMax}
        filterSlot={<><AbcFilter selected={abc} onChange={setAbc} /><AmountFilter min={amtMin} max={amtMax===Infinity?0:amtMax} onChange={(mn,mx) => { setAmtMin(mn); setAmtMax(mx||Infinity); }} /></>} />
    </>
  );
}

/* ─── C 高額不動品 ─── */
function HighValueInactiveView({ data: _data, inventoryData, localParams, globalParams, fromPriority, onLocalParamsChange, onSyncToGlobal }: { data: AllExtractResults["highValueInactive"]["items"] } & ViewProps) {
  const [abc, setAbc] = useState(new Set(ALL_ABC));
  const [urgentOnly, setUrgentOnly] = useState(fromPriority);
  const [amtMin, setAmtMin] = useState(0); const [amtMax, setAmtMax] = useState(Infinity);
  const set = (k: keyof ExtractParams, v: number | string) => onLocalParamsChange({ ...localParams, [k]: v });
  const data = useMemo(() => extractHighValueInactive(inventoryData, localParams).items, [inventoryData, localParams]);
  const cols: Column<(typeof data)[0]>[] = [
    { key: "表示名", label: "薬品", getValue: (i) => i.表示名, render: (i) => <span className="font-medium text-sm">{i.表示名}</span> },
    { key: "ABCランク", label: "ABC", align: "center", getValue: (i) => i.ABCランク, render: (i) => <span className="badge badge-gray">{i.ABCランク}</span> },
    { key: "現薬価", label: "単価", align: "right", getValue: (i) => i.現薬価||i.旧薬価, render: (i) => <span>{formatYen(i.現薬価||i.旧薬価)}</span> },
    { key: "理論在庫", label: "在庫数", align: "right", getValue: (i) => i.理論在庫 },
    { key: "在庫金額", label: "在庫金額", align: "right", getValue: (i) => i.在庫金額, render: (i) => <b className="text-red-600">{formatYen(i.在庫金額)}</b> },
    { key: "最終処方日", label: "最終処方日", getValue: (i) => i.最終処方日, render: (i) => i.処方履歴なし ? <span className="badge badge-red">履歴なし</span> : <span>{formatDate(i.最終処方日)}</span> },
    { key: "不動日数", label: "不動日数", align: "right", getValue: (i) => i.不動日数, render: (i) => <b>{i.不動日数>=9999?"-":`${i.不動日数}日`}</b> },
    { key: "最終入庫日", label: "最終入庫日", getValue: (i) => i.最終入庫日 },
    { key: "警告", label: "状態", sortable: false, getValue: (i) => i.警告レベル, render: (i) => <span className={BADGE_COLORS[i.警告レベル]}>{i.警告レベル==="red"?"180日超/履歴なし":i.警告レベル==="orange"?"120日超":"90日超"}</span> },
  ];
  return (
    <>
      <PageParamPanel localParams={localParams} globalParams={globalParams} onChange={onLocalParamsChange} onSyncToGlobal={onSyncToGlobal}>
        <NumInput label="単価下限" value={localParams.高額品_単価下限} unit="円" min={1} onChange={(v) => set("高額品_単価下限", v)} />
        <NumInput label="処方経過日数（下限）" value={localParams.高額不動_経過日数下限} unit="日" min={1} onChange={(v) => set("高額不動_経過日数下限", v)} />
        <div className="flex items-center gap-1 text-xs">
          <span className="text-gray-600">ABCランク下限:</span>
          {(["A","B","C","D","E"] as const).map((r) => (
            <button key={r} onClick={() => set("高額品_ABCランク下限", r)}
              className={`w-7 h-6 text-xs font-bold rounded border transition
                ${localParams.高額品_ABCランク下限===r?"bg-blue-600 text-white border-blue-600":"bg-white text-gray-600 border-gray-300 hover:border-blue-400"}`}>{r}</button>
          ))}
        </div>
      </PageParamPanel>
      {(() => { const uc = data.filter((i) => i.警告レベル === "red").length; return uc > 0 ? <UrgentToggle urgentOnly={urgentOnly} urgentCount={uc} totalCount={data.length} onChange={setUrgentOnly} /> : null; })()}
      <DataTable columns={cols} data={data} keyField="商品コード" exportFileName="high_value_inactive.csv" getSearchText={searchFn}
        extraFilter={(i) => (urgentOnly ? (i.警告レベル === "red") : true) && abc.has(i.ABCランク) && i.在庫金額 >= amtMin && i.在庫金額 <= amtMax}
        filterSlot={<><AbcFilter selected={abc} onChange={setAbc} /><AmountFilter min={amtMin} max={amtMax===Infinity?0:amtMax} onChange={(mn,mx) => { setAmtMin(mn); setAmtMax(mx||Infinity); }} /></>} />
    </>
  );
}

/* ─── D 高額アクティブ ─── */
function HighValueActiveView({ data: _data, inventoryData, localParams, globalParams, fromPriority, onLocalParamsChange, onSyncToGlobal }: { data: AllExtractResults["highValueActive"]["items"] } & ViewProps) {
  const [abc, setAbc] = useState(new Set(ALL_ABC));
  const [urgentOnly, setUrgentOnly] = useState(fromPriority);
  const [amtMin, setAmtMin] = useState(0); const [amtMax, setAmtMax] = useState(Infinity);
  const set = (k: keyof ExtractParams, v: number | string) => onLocalParamsChange({ ...localParams, [k]: v });
  const data = useMemo(() => extractHighValueActive(inventoryData, localParams).items, [inventoryData, localParams]);
  const cols: Column<(typeof data)[0]>[] = [
    { key: "表示名", label: "薬品", getValue: (i) => i.表示名, render: (i) => <span className="font-medium text-sm">{i.表示名}</span> },
    { key: "ABCランク", label: "ABC", align: "center", getValue: (i) => i.ABCランク, render: (i) => <span className="badge badge-gray">{i.ABCランク}</span> },
    { key: "現薬価", label: "単価", align: "right", getValue: (i) => i.現薬価||i.旧薬価, render: (i) => <span>{formatYen(i.現薬価||i.旧薬価)}</span> },
    { key: "理論在庫", label: "在庫数", align: "right", getValue: (i) => i.理論在庫 },
    { key: "在庫金額", label: "在庫金額", align: "right", getValue: (i) => i.在庫金額, render: (i) => <b>{formatYen(i.在庫金額)}</b> },
    { key: "月使用数", label: "月使用数", align: "right", getValue: (i) => i.月使用数 },
    { key: "在庫月数", label: "在庫月数", align: "right", getValue: (i) => i.在庫月数_計算値, render: (i) => <span>{i.月使用数>0?`${formatNumber(i.在庫月数_計算値)}M`:"-"}</span> },
    { key: "最終処方日", label: "最終処方日", getValue: (i) => i.最終処方日 },
    { key: "処方経過日数", label: "処方経過", align: "right", getValue: (i) => i.処方経過日数, render: (i) => <span>{i.処方経過日数}日前</span> },
  ];
  return (
    <>
      <PageParamPanel localParams={localParams} globalParams={globalParams} onChange={onLocalParamsChange} onSyncToGlobal={onSyncToGlobal}>
        <NumInput label="単価下限" value={localParams.高額品_単価下限} unit="円" min={1} onChange={(v) => set("高額品_単価下限", v)} />
        <NumInput label="処方経過日数（上限）" value={localParams.高額アクティブ_経過日数上限} unit="日" min={1} onChange={(v) => set("高額アクティブ_経過日数上限", v)} />
        <div className="flex items-center gap-1 text-xs">
          <span className="text-gray-600">ABCランク下限:</span>
          {(["A","B","C","D","E"] as const).map((r) => (
            <button key={r} onClick={() => set("高額品_ABCランク下限", r)}
              className={`w-7 h-6 text-xs font-bold rounded border transition
                ${localParams.高額品_ABCランク下限===r?"bg-blue-600 text-white border-blue-600":"bg-white text-gray-600 border-gray-300 hover:border-blue-400"}`}>{r}</button>
          ))}
        </div>
      </PageParamPanel>
      {(() => { const uc = data.filter((i) => i.月使用数 > 0 && i.在庫月数_計算値 > 3).length; return uc > 0 ? <UrgentToggle urgentOnly={urgentOnly} urgentCount={uc} totalCount={data.length} onChange={setUrgentOnly} /> : null; })()}
      <DataTable columns={cols} data={data} keyField="商品コード" exportFileName="high_value_active.csv" getSearchText={searchFn}
        extraFilter={(i) => (urgentOnly ? (i.月使用数 > 0 && i.在庫月数_計算値 > 3) : true) && abc.has(i.ABCランク) && i.在庫金額 >= amtMin && i.在庫金額 <= amtMax}
        filterSlot={<><AbcFilter selected={abc} onChange={setAbc} /><AmountFilter min={amtMin} max={amtMax===Infinity?0:amtMax} onChange={(mn,mx) => { setAmtMin(mn); setAmtMax(mx||Infinity); }} /></>} />
    </>
  );
}

/* ─── B デッドストック ─── */
function DeadStockView({ data: _data, inventoryData, localParams, globalParams, fromPriority, onLocalParamsChange, onSyncToGlobal }: { data: AllExtractResults["deadStock"]["items"] } & ViewProps) {
  const [abc, setAbc] = useState(new Set(ALL_ABC));
  const [urgentOnly, setUrgentOnly] = useState(fromPriority);
  const [amtMin, setAmtMin] = useState(0); const [amtMax, setAmtMax] = useState(Infinity);
  const data = useMemo(() => extractDeadStockRanking(inventoryData, localParams, 100).items, [inventoryData, localParams]);
  const cols: Column<(typeof data)[0]>[] = [
    { key: "rank", label: "#", align: "right", sortable: false, getValue: (_,i) => (i??0)+1, render: (_,i) => <span className="text-gray-500 font-bold">{(i??0)+1}</span> },
    { key: "表示名", label: "薬品", getValue: (i) => i.表示名, render: (i) => <span className="font-medium text-sm">{i.表示名}</span> },
    { key: "ABCランク", label: "ABC", align: "center", getValue: (i) => i.ABCランク, render: (i) => <span className="badge badge-gray">{i.ABCランク}</span> },
    { key: "理論在庫", label: "在庫数", align: "right", getValue: (i) => i.理論在庫 },
    { key: "在庫金額", label: "在庫金額", align: "right", getValue: (i) => i.在庫金額, render: (i) => <b className="text-red-600">{formatYen(i.在庫金額)}</b> },
    { key: "リスク区分", label: "リスク区分", sortable: false, getValue: (i) => i.リスク区分.length, render: (i) => <div className="flex flex-wrap gap-1">{i.リスク区分.map((b) => <span key={b} className={RISK_BADGE_COLOR[b]}>{b}</span>)}</div> },
    { key: "最終処方日", label: "最終処方日", getValue: (i) => i.最終処方日 },
  ];
  return (
    <>
      <PageParamPanel localParams={localParams} globalParams={globalParams} onChange={onLocalParamsChange} onSyncToGlobal={onSyncToGlobal}>
        <span className="text-xs text-gray-500">（各機能の条件を個別ページで調整すると反映されます）</span>
      </PageParamPanel>
      {(() => { const uc = data.filter((i) => i.リスク区分.length >= 2).length; return uc > 0 ? <UrgentToggle urgentOnly={urgentOnly} urgentCount={uc} totalCount={data.length} onChange={setUrgentOnly} /> : null; })()}
      <DataTable columns={cols} data={data} keyField="商品コード" exportFileName="deadstock_ranking.csv" getSearchText={searchFn}
        extraFilter={(i) => (urgentOnly ? (i.リスク区分.length >= 2) : true) && abc.has(i.ABCランク) && i.在庫金額 >= amtMin && i.在庫金額 <= amtMax}
        filterSlot={<><AbcFilter selected={abc} onChange={setAbc} /><AmountFilter min={amtMin} max={amtMax===Infinity?0:amtMax} onChange={(mn,mx) => { setAmtMin(mn); setAmtMax(mx||Infinity); }} /></>} />
    </>
  );
}

/* ─── ⑥ 複数メーカー ─── */
function MultiMakerView({ data }: { data: AllExtractResults["multiMaker"]["groups"] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const toggle = (k: string) => { const n = new Set(expanded); n.has(k) ? n.delete(k) : n.add(k); setExpanded(n); };
  const filtered = search ? data.filter((g) => g.グループキー.includes(search)||g.一般名.includes(search)) : data;
  return (
    <div>
      <div className="flex items-center gap-3 p-3 border-b border-gray-200 bg-gray-50">
        <input type="text" placeholder="成分名・規格で検索..." value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-3 pr-3 py-1.5 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-blue-400 outline-none min-w-[200px] max-w-[280px]" />
        <span className="text-xs text-gray-500 ml-auto">{filtered.length !== data.length ? `${filtered.length} / ${data.length}組合せ` : `${data.length}組合せ`}</span>
        <span className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded border border-blue-200">後発品・同規格限定</span>
      </div>
      <div className="overflow-x-auto max-h-[65vh] overflow-y-auto">
        <table className="data-table">
          <thead><tr><th>成分名・規格</th><th className="text-right">メーカー数</th><th className="text-right">合計在庫金額</th><th>推奨メーカー（使用数最多）</th><th></th></tr></thead>
          <tbody>
            {filtered.length === 0
              ? <tr><td colSpan={5} className="text-center py-8 text-gray-400">該当する組合せがありません</td></tr>
              : filtered.map((g) => (
                <React.Fragment key={g.グループキー}>
                  <tr className="cursor-pointer" onClick={() => toggle(g.グループキー)}>
                    <td><div className="font-semibold">{g.一般名}</div>{g.規格 && <div className="text-xs text-blue-600 font-medium mt-0.5">{g.規格}</div>}</td>
                    <td className="text-right"><span className="badge badge-orange">{g.メーカー数}社</span></td>
                    <td className="text-right font-semibold">{formatYen(g.合計在庫金額)}</td>
                    <td className="text-sm text-green-700 font-medium">{g.推奨メーカー}</td>
                    <td className="text-gray-400">{expanded.has(g.グループキー) ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</td>
                  </tr>
                  {expanded.has(g.グループキー) && g.品目リスト.map((item) => (
                    <tr key={item.商品コード} className="bg-blue-50 text-sm">
                      <td className="pl-8 text-gray-700">{item.表示名}</td>
                      <td className="text-center"><span className="badge badge-gray">{item.ABCランク}</span></td>
                      <td className="text-right">{formatYen(item.在庫金額)}</td>
                      <td className="text-gray-500">{item.月使用数 > 0 ? <span>月<b>{formatNumber(item.月使用数,0)}</b>使用</span> : <span className="text-gray-400">不動</span>}</td>
                      <td className="text-right text-xs text-gray-400">在庫{item.理論在庫}{item.単位}</td>
                    </tr>
                  ))}
                </React.Fragment>
              ))
            }
          </tbody>
        </table>
      </div>
    </div>
  );
}
