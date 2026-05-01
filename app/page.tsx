"use client";

import React, { useState } from "react";
import { Upload, AlertCircle, CheckCircle2, Loader2, ArrowLeft, ChevronDown, ChevronUp } from "lucide-react";
import type { InventoryItem, ExtractParams } from "@/types";
import { DEFAULT_PARAMS } from "@/types";
import { parseZaikoCSV, parseTenshohinCSV, mergeAndNormalize } from "@/lib/csvParser";
import { runAllExtractions, type AllExtractResults, type RiskBadge } from "@/lib/extractors";
import { formatYen, formatDate, formatNumber } from "@/lib/utils";
import DataTable, { type Column } from "@/components/ui/DataTable";

type PageState = "upload" | "loading" | "dashboard" | "detail";
type DetailView = keyof AllExtractResults;

const BADGE_COLORS: Record<string, string> = {
  red: "badge badge-red", orange: "badge badge-orange",
  yellow: "badge badge-yellow", green: "badge badge-green", gray: "badge badge-gray",
};
const RISK_BADGE_COLOR: Record<RiskBadge, string> = {
  返品: "badge badge-orange", 過剰: "badge badge-yellow", 廃棄: "badge badge-red",
  長期不動: "badge badge-gray", 入荷不動: "badge badge-gray",
  製造中止: "badge badge-red", 高額不動: "badge badge-orange",
};

export default function HomePage() {
  const [zaikoFile, setZaikoFile] = useState<File | null>(null);
  const [tenshohinFile, setTenshohinFile] = useState<File | null>(null);
  const [pageState, setPageState] = useState<PageState>("upload");
  const [errorMessage, setErrorMessage] = useState("");
  const [inventoryData, setInventoryData] = useState<InventoryItem[]>([]);
  const [results, setResults] = useState<AllExtractResults | null>(null);
  const [detailView, setDetailView] = useState<DetailView | null>(null);
  const [params] = useState<ExtractParams>(DEFAULT_PARAMS);

  const handleAnalyze = async () => {
    if (!zaikoFile || !tenshohinFile) { setErrorMessage("両CSVを選択してください"); return; }
    setErrorMessage(""); setPageState("loading");
    try {
      const zaiko = await parseZaikoCSV(zaikoFile);
      const tenshohin = await parseTenshohinCSV(tenshohinFile);
      const merged = mergeAndNormalize(zaiko, tenshohin);
      if (merged.length === 0) { setErrorMessage("マッチする在庫品目がありません"); setPageState("upload"); return; }
      setInventoryData(merged);
      setResults(runAllExtractions(merged, params));
      setPageState("dashboard");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "不明なエラー");
      setPageState("upload");
    }
  };

  if (pageState === "detail" && results && detailView) {
    return <DetailPage view={detailView} results={results} onBack={() => setPageState("dashboard")} />;
  }
  if (pageState === "dashboard" && results) {
    return <DashboardPage results={results} totalItems={inventoryData.length}
      totalAmount={inventoryData.reduce((s, i) => s + i.在庫金額, 0)}
      onDetail={(v) => { setDetailView(v); setPageState("detail"); }}
      onReset={() => { setZaikoFile(null); setTenshohinFile(null); setPageState("upload"); }} />;
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
                <input type="file" accept=".csv" onChange={(e) => set(e.target.files?.[0] || null)} disabled={pageState === "loading"}
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
      <footer className="text-center text-xs text-gray-400 mt-4">v0.4.0 | データはブラウザ内で処理されサーバ送信されません</footer>
    </main>
  );
}

/* ─── ダッシュボード ──────────────────────── */
const SECTIONS: { key: DetailView; label: string; color: string; unit?: string }[] = [
  { key: "return", label: "① 返品推奨", color: "border-orange-400" },
  { key: "excess", label: "② 過剰在庫", color: "border-yellow-400" },
  { key: "expiry", label: "③ 廃棄リスク", color: "border-red-400" },
  { key: "longUnmoved", label: "④ 長期不動品", color: "border-gray-400" },
  { key: "unmovedAfterArrival", label: "⑤ 入荷後不動品", color: "border-gray-400" },
  { key: "multiMaker", label: "⑥ 複数メーカー", color: "border-blue-400", unit: "一般名" },
  { key: "discontinued", label: "A 製造中止/経過措置", color: "border-red-400" },
  { key: "highValueInactive", label: "C 高額不動品(D/E)", color: "border-purple-400" },
  { key: "highValueActive", label: "D 高額アクティブ(D/E)", color: "border-teal-400" },
  { key: "deadStock", label: "B デッドストックTOP30", color: "border-gray-800" },
];

function DashboardPage({ results, totalItems, totalAmount, onDetail, onReset }: {
  results: AllExtractResults; totalItems: number; totalAmount: number;
  onDetail: (v: DetailView) => void; onReset: () => void;
}) {
  const gc = (k: DetailView) => k === "multiMaker" ? results.multiMaker.totalCount : (results[k] as { totalCount: number }).totalCount;
  const ga = (k: DetailView): number | null => k === "multiMaker" ? null : (results[k] as { totalAmount: number }).totalAmount;

  return (
    <main className="container mx-auto px-4 py-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">薬局在庫分析システム</h1>
        <button onClick={onReset} className="flex items-center gap-1 px-3 py-2 border border-gray-300 rounded hover:bg-gray-50 text-sm text-gray-600">
          <ArrowLeft size={14} /> 新しいCSV
        </button>
      </div>
      <div className="grid grid-cols-4 gap-3 mb-6">
        <div className="bg-white rounded-lg shadow p-3"><div className="text-xs text-gray-500">在庫品目数</div><div className="text-xl font-bold">{totalItems.toLocaleString()}</div></div>
        <div className="bg-white rounded-lg shadow p-3"><div className="text-xs text-gray-500">総在庫金額</div><div className="text-xl font-bold text-blue-600">{formatYen(totalAmount)}</div></div>
        <div className="bg-white rounded-lg shadow p-3"><div className="text-xs text-gray-500">要対応金額</div><div className="text-xl font-bold text-red-600">{formatYen(results.deadStock.totalAmount)}</div></div>
        <div className="bg-white rounded-lg shadow p-3"><div className="text-xs text-gray-500">高額品在庫</div><div className="text-xl font-bold text-purple-600">{formatYen((ga("highValueInactive") ?? 0) + (ga("highValueActive") ?? 0))}</div></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {SECTIONS.map(({ key, label, color, unit }) => {
          const count = gc(key); const amount = ga(key);
          return (
            <button key={key} onClick={() => onDetail(key)}
              className={`bg-white rounded-lg shadow p-4 border-l-4 ${color} text-left hover:bg-gray-50 transition`}>
              <div className="text-sm font-semibold text-gray-700 mb-1">{label}</div>
              <div className="flex items-end justify-between">
                <span className="text-2xl font-bold">{count.toLocaleString()}<span className="text-xs font-normal text-gray-500 ml-1">{unit || "品目"}</span></span>
                {amount !== null && <span className="text-sm font-medium text-gray-600">{formatYen(amount)}</span>}
              </div>
            </button>
          );
        })}
      </div>
    </main>
  );
}

/* ─── 詳細画面（共通ラッパー） ─────────────── */
function DetailPage({ view, results, onBack }: { view: DetailView; results: AllExtractResults; onBack: () => void }) {
  const section = SECTIONS.find((s) => s.key === view)!;
  const r = results[view];
  const totalAmount = view !== "multiMaker" ? (r as { totalAmount: number }).totalAmount : null;

  return (
    <main className="container mx-auto px-4 py-6 max-w-7xl">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={onBack} className="flex items-center gap-1 px-3 py-2 border border-gray-300 rounded hover:bg-gray-50 text-sm text-gray-600">
          <ArrowLeft size={14} /> 戻る
        </button>
        <h1 className="text-xl font-bold text-gray-900">{section.label}</h1>
        <div className="ml-auto flex items-center gap-3 text-sm">
          <span className="bg-white rounded shadow px-3 py-1">件数 <b>{(r as { totalCount: number }).totalCount.toLocaleString()}</b></span>
          {totalAmount !== null && <span className="bg-white rounded shadow px-3 py-1">合計 <b className="text-blue-600">{formatYen(totalAmount)}</b></span>}
        </div>
      </div>
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <DetailContent view={view} results={results} />
      </div>
    </main>
  );
}

/* ─── 各テーブル定義 ─────────────────────── */
function DetailContent({ view, results }: { view: DetailView; results: AllExtractResults }) {
  switch (view) {
    case "return": return <ReturnView data={results.return.items} />;
    case "excess": return <ExcessView data={results.excess.items} />;
    case "expiry": return <ExpiryView data={results.expiry.items} />;
    case "longUnmoved": return <LongUnmovedView data={results.longUnmoved.items} />;
    case "unmovedAfterArrival": return <UnmovedView data={results.unmovedAfterArrival.items} />;
    case "multiMaker": return <MultiMakerView data={results.multiMaker.groups} />;
    case "discontinued": return <DiscontinuedView data={results.discontinued.items} />;
    case "highValueInactive": return <HighValueInactiveView data={results.highValueInactive.items} />;
    case "highValueActive": return <HighValueActiveView data={results.highValueActive.items} />;
    case "deadStock": return <DeadStockView data={results.deadStock.items} />;
  }
}

const searchFn = (item: { 表示名: string; 品名: string; メーカー: string; 一般名: string }) => `${item.表示名} ${item.品名} ${item.メーカー} ${item.一般名}`;

function ReturnView({ data }: { data: AllExtractResults["return"]["items"] }) {
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
  return <DataTable columns={cols} data={data} keyField="商品コード" exportFileName="return_candidates.csv" getSearchText={searchFn} />;
}

function ExcessView({ data }: { data: AllExtractResults["excess"]["items"] }) {
  const cols: Column<(typeof data)[0]>[] = [
    { key: "表示名", label: "薬品", getValue: (i) => i.表示名, render: (i) => <span className="font-medium text-sm">{i.表示名}</span> },
    { key: "ABCランク", label: "ABC", align: "center", getValue: (i) => i.ABCランク, render: (i) => <span className="badge badge-gray">{i.ABCランク}</span> },
    { key: "理論在庫", label: "在庫数", align: "right", getValue: (i) => i.理論在庫 },
    { key: "月使用数", label: "月使用数", align: "right", getValue: (i) => i.月使用数 },
    { key: "在庫月数", label: "在庫月数", align: "right", getValue: (i) => i.在庫月数_表示, render: (i) => <b>{i.在庫月数_表示 >= 999 ? "∞" : formatNumber(i.在庫月数_表示)}M</b> },
    { key: "推奨削減量", label: "削減量", align: "right", getValue: (i) => i.推奨削減量, render: (i) => <span>{formatNumber(i.推奨削減量, 0)}</span> },
    { key: "推奨削減金額", label: "削減見込額", align: "right", getValue: (i) => i.推奨削減金額, render: (i) => <b className="text-red-600">{formatYen(i.推奨削減金額)}</b> },
    { key: "警告", label: "状態", sortable: false, getValue: (i) => i.警告レベル, render: (i) => <span className={BADGE_COLORS[i.警告レベル]}>{i.在庫月数_表示 >= 12 ? "12M超" : i.在庫月数_表示 >= 6 ? "6M超" : "3M超"}</span> },
  ];
  return <DataTable columns={cols} data={data} keyField="商品コード" exportFileName="excess_inventory.csv" getSearchText={searchFn} />;
}

function ExpiryView({ data }: { data: AllExtractResults["expiry"]["items"] }) {
  const cols: Column<(typeof data)[0]>[] = [
    { key: "表示名", label: "薬品", getValue: (i) => i.表示名, render: (i) => <span className="font-medium text-sm">{i.表示名}</span> },
    { key: "ABCランク", label: "ABC", align: "center", getValue: (i) => i.ABCランク, render: (i) => <span className="badge badge-gray">{i.ABCランク}</span> },
    { key: "理論在庫", label: "在庫数", align: "right", getValue: (i) => i.理論在庫 },
    { key: "在庫金額", label: "在庫金額", align: "right", getValue: (i) => i.在庫金額, render: (i) => <b>{formatYen(i.在庫金額)}</b> },
    { key: "最終有効期限", label: "有効期限", getValue: (i) => i.最終有効期限 },
    { key: "残日数", label: "残日数", align: "right", getValue: (i) => i.残日数, render: (i) => <b className={i.残日数 <= 30 ? "text-red-600" : ""}>{i.残日数}日</b> },
    { key: "最終ロット番号", label: "ロット", getValue: (i) => i.最終ロット番号 || "-" },
    { key: "警告", label: "状態", sortable: false, getValue: (i) => i.警告レベル, render: (i) => <span className={BADGE_COLORS[i.警告レベル]}>{i.残日数 <= 30 ? "30日以内" : i.残日数 <= 60 ? "60日以内" : i.残日数 <= 90 ? "90日以内" : "180日以内"}</span> },
  ];
  return <DataTable columns={cols} data={data} keyField="商品コード" exportFileName="expiry_risk.csv" getSearchText={searchFn} />;
}

function LongUnmovedView({ data }: { data: AllExtractResults["longUnmoved"]["items"] }) {
  const cols: Column<(typeof data)[0]>[] = [
    { key: "表示名", label: "薬品", getValue: (i) => i.表示名, render: (i) => <span className="font-medium text-sm">{i.表示名}</span> },
    { key: "ABCランク", label: "ABC", align: "center", getValue: (i) => i.ABCランク, render: (i) => <span className="badge badge-gray">{i.ABCランク}</span> },
    { key: "理論在庫", label: "在庫数", align: "right", getValue: (i) => i.理論在庫 },
    { key: "在庫金額", label: "在庫金額", align: "right", getValue: (i) => i.在庫金額, render: (i) => <b>{formatYen(i.在庫金額)}</b> },
    { key: "最終処方日", label: "最終処方日", getValue: (i) => i.最終処方日, render: (i) => i.処方履歴なし ? <span className="badge badge-red">履歴なし</span> : <span>{formatDate(i.最終処方日)}</span> },
    { key: "不動日数", label: "不動日数", align: "right", getValue: (i) => i.不動日数, render: (i) => <span>{i.不動日数 >= 9999 ? "-" : `${i.不動日数}日`}</span> },
    { key: "警告", label: "状態", sortable: false, getValue: (i) => i.警告レベル, render: (i) => <span className={BADGE_COLORS[i.警告レベル]}>{i.警告レベル === "red" ? "1年超/履歴なし" : i.警告レベル === "orange" ? "9M超" : "6M超"}</span> },
  ];
  return <DataTable columns={cols} data={data} keyField="商品コード" exportFileName="long_unmoved.csv" getSearchText={searchFn} />;
}

function UnmovedView({ data }: { data: AllExtractResults["unmovedAfterArrival"]["items"] }) {
  const cols: Column<(typeof data)[0]>[] = [
    { key: "表示名", label: "薬品", getValue: (i) => i.表示名, render: (i) => <span className="font-medium text-sm">{i.表示名}</span> },
    { key: "ABCランク", label: "ABC", align: "center", getValue: (i) => i.ABCランク, render: (i) => <span className="badge badge-gray">{i.ABCランク}</span> },
    { key: "理論在庫", label: "在庫数", align: "right", getValue: (i) => i.理論在庫 },
    { key: "在庫金額", label: "在庫金額", align: "right", getValue: (i) => i.在庫金額, render: (i) => <b>{formatYen(i.在庫金額)}</b> },
    { key: "最終入庫日", label: "最終入庫日", getValue: (i) => i.最終入庫日 },
    { key: "入庫後経過日数", label: "入庫後経過", align: "right", getValue: (i) => i.入庫後経過日数, render: (i) => <b>{i.入庫後経過日数}日</b> },
    { key: "最終処方日", label: "最終処方日", getValue: (i) => i.最終処方日, render: (i) => i.処方履歴なし ? <span className="badge badge-red">履歴なし</span> : <span>{formatDate(i.最終処方日)}</span> },
  ];
  return <DataTable columns={cols} data={data} keyField="商品コード" exportFileName="unmoved_after_arrival.csv" getSearchText={searchFn} />;
}

function DiscontinuedView({ data }: { data: AllExtractResults["discontinued"]["items"] }) {
  const cols: Column<(typeof data)[0]>[] = [
    { key: "表示名", label: "薬品", getValue: (i) => i.表示名, render: (i) => <span className="font-medium text-sm">{i.表示名}</span> },
    { key: "ABCランク", label: "ABC", align: "center", getValue: (i) => i.ABCランク, render: (i) => <span className="badge badge-gray">{i.ABCランク}</span> },
    { key: "理論在庫", label: "在庫数", align: "right", getValue: (i) => i.理論在庫 },
    { key: "在庫金額", label: "在庫金額", align: "right", getValue: (i) => i.在庫金額, render: (i) => <b>{formatYen(i.在庫金額)}</b> },
    { key: "製造中止日", label: "製造中止日", getValue: (i) => i.製造中止日, render: (i) => i.製造中止日 ? <span className="text-red-600 font-medium">{formatDate(i.製造中止日)}</span> : <span>-</span> },
    { key: "経過措置日", label: "経過措置日", getValue: (i) => i.経過措置日 },
    { key: "経過措置残日数", label: "経過措置残", align: "right", getValue: (i) => i.経過措置残日数 ?? 9999, render: (i) => <span>{i.経過措置残日数 !== null ? `${i.経過措置残日数}日` : "-"}</span> },
    { key: "消化見込み月数", label: "消化見込", align: "right", getValue: (i) => i.消化見込み月数 ?? -1, render: (i) => <span>{i.消化見込み月数 !== null ? `${formatNumber(i.消化見込み月数)}M` : "-"}</span> },
    { key: "警告", label: "状態", sortable: false, getValue: (i) => i.警告レベル, render: (i) => <span className={BADGE_COLORS[i.警告レベル]}>{i.製造中止日 ? "製造中止" : "経過措置中"}</span> },
  ];
  return <DataTable columns={cols} data={data} keyField="商品コード" exportFileName="discontinued.csv" getSearchText={searchFn} />;
}

function HighValueInactiveView({ data }: { data: AllExtractResults["highValueInactive"]["items"] }) {
  const cols: Column<(typeof data)[0]>[] = [
    { key: "表示名", label: "薬品", getValue: (i) => i.表示名, render: (i) => <span className="font-medium text-sm">{i.表示名}</span> },
    { key: "ABCランク", label: "ABC", align: "center", getValue: (i) => i.ABCランク, render: (i) => <span className="badge badge-gray">{i.ABCランク}</span> },
    { key: "現薬価", label: "単価", align: "right", getValue: (i) => i.現薬価 || i.旧薬価, render: (i) => <span>{formatYen(i.現薬価 || i.旧薬価)}</span> },
    { key: "理論在庫", label: "在庫数", align: "right", getValue: (i) => i.理論在庫 },
    { key: "在庫金額", label: "在庫金額", align: "right", getValue: (i) => i.在庫金額, render: (i) => <b className="text-red-600">{formatYen(i.在庫金額)}</b> },
    { key: "最終処方日", label: "最終処方日", getValue: (i) => i.最終処方日, render: (i) => i.処方履歴なし ? <span className="badge badge-red">履歴なし</span> : <span>{formatDate(i.最終処方日)}</span> },
    { key: "不動日数", label: "不動日数", align: "right", getValue: (i) => i.不動日数, render: (i) => <b>{i.不動日数 >= 9999 ? "-" : `${i.不動日数}日`}</b> },
    { key: "最終入庫日", label: "最終入庫日", getValue: (i) => i.最終入庫日 },
    { key: "警告", label: "状態", sortable: false, getValue: (i) => i.警告レベル, render: (i) => <span className={BADGE_COLORS[i.警告レベル]}>{i.警告レベル === "red" ? "180日超/履歴なし" : i.警告レベル === "orange" ? "120日超" : "90日超"}</span> },
  ];
  return <DataTable columns={cols} data={data} keyField="商品コード" exportFileName="high_value_inactive.csv" getSearchText={searchFn} />;
}

function HighValueActiveView({ data }: { data: AllExtractResults["highValueActive"]["items"] }) {
  const cols: Column<(typeof data)[0]>[] = [
    { key: "表示名", label: "薬品", getValue: (i) => i.表示名, render: (i) => <span className="font-medium text-sm">{i.表示名}</span> },
    { key: "ABCランク", label: "ABC", align: "center", getValue: (i) => i.ABCランク, render: (i) => <span className="badge badge-gray">{i.ABCランク}</span> },
    { key: "現薬価", label: "単価", align: "right", getValue: (i) => i.現薬価 || i.旧薬価, render: (i) => <span>{formatYen(i.現薬価 || i.旧薬価)}</span> },
    { key: "理論在庫", label: "在庫数", align: "right", getValue: (i) => i.理論在庫 },
    { key: "在庫金額", label: "在庫金額", align: "right", getValue: (i) => i.在庫金額, render: (i) => <b>{formatYen(i.在庫金額)}</b> },
    { key: "月使用数", label: "月使用数", align: "right", getValue: (i) => i.月使用数 },
    { key: "在庫月数", label: "在庫月数", align: "right", getValue: (i) => i.在庫月数_計算値, render: (i) => <span>{i.月使用数 > 0 ? `${formatNumber(i.在庫月数_計算値)}M` : "-"}</span> },
    { key: "最終処方日", label: "最終処方日", getValue: (i) => i.最終処方日 },
    { key: "処方経過日数", label: "処方経過", align: "right", getValue: (i) => i.処方経過日数, render: (i) => <span>{i.処方経過日数}日前</span> },
  ];
  return <DataTable columns={cols} data={data} keyField="商品コード" exportFileName="high_value_active.csv" getSearchText={searchFn} />;
}

function DeadStockView({ data }: { data: AllExtractResults["deadStock"]["items"] }) {
  const cols: Column<(typeof data)[0]>[] = [
    { key: "rank", label: "#", align: "right", sortable: false, getValue: (_, idx) => (idx ?? 0) + 1, render: (_, idx) => <span className="text-gray-500 font-bold">{(idx ?? 0) + 1}</span> },
    { key: "表示名", label: "薬品", getValue: (i) => i.表示名, render: (i) => <span className="font-medium text-sm">{i.表示名}</span> },
    { key: "ABCランク", label: "ABC", align: "center", getValue: (i) => i.ABCランク, render: (i) => <span className="badge badge-gray">{i.ABCランク}</span> },
    { key: "理論在庫", label: "在庫数", align: "right", getValue: (i) => i.理論在庫 },
    { key: "在庫金額", label: "在庫金額", align: "right", getValue: (i) => i.在庫金額, render: (i) => <b className="text-red-600">{formatYen(i.在庫金額)}</b> },
    { key: "リスク区分", label: "リスク区分", sortable: false, getValue: (i) => i.リスク区分.length, render: (i) => <div className="flex flex-wrap gap-1">{i.リスク区分.map((b) => <span key={b} className={RISK_BADGE_COLOR[b]}>{b}</span>)}</div> },
    { key: "最終処方日", label: "最終処方日", getValue: (i) => i.最終処方日 },
  ];
  return <DataTable columns={cols} data={data} keyField="商品コード" exportFileName="deadstock_ranking.csv" getSearchText={searchFn} />;
}

function MultiMakerView({ data }: { data: AllExtractResults["multiMaker"]["groups"] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const toggle = (k: string) => { const n = new Set(expanded); n.has(k) ? n.delete(k) : n.add(k); setExpanded(n); };

  const filtered = search
    ? data.filter((g) => g.グループキー.includes(search) || g.一般名.includes(search))
    : data;

  return (
    <div>
      {/* ツールバー */}
      <div className="flex items-center gap-3 p-3 border-b border-gray-200 bg-gray-50">
        <div className="relative flex-1 min-w-[200px] max-w-[300px]">
          <input type="text" placeholder="成分名・規格で検索..." value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-3 pr-3 py-2 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-blue-400 outline-none" />
        </div>
        <span className="text-xs text-gray-500 ml-auto">
          {filtered.length !== data.length ? `${filtered.length} / ${data.length}組合せ` : `${data.length}組合せ`}
        </span>
        <span className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded border border-blue-200">
          後発品・同規格限定
        </span>
      </div>

      <div className="overflow-x-auto max-h-[65vh] overflow-y-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>成分名・規格</th>
              <th className="text-right">メーカー数</th>
              <th className="text-right">合計在庫金額</th>
              <th>推奨メーカー（使用数最多）</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-8 text-gray-400">該当する組合せがありません</td></tr>
            ) : filtered.map((g) => (
              <React.Fragment key={g.グループキー}>
                <tr className="cursor-pointer" onClick={() => toggle(g.グループキー)}>
                  <td>
                    <div className="font-semibold">{g.一般名}</div>
                    {g.規格 && <div className="text-xs text-blue-600 font-medium mt-0.5">{g.規格}</div>}
                  </td>
                  <td className="text-right"><span className="badge badge-orange">{g.メーカー数}社</span></td>
                  <td className="text-right font-semibold">{formatYen(g.合計在庫金額)}</td>
                  <td className="text-sm text-green-700 font-medium">{g.推奨メーカー}</td>
                  <td className="text-gray-400">{expanded.has(g.グループキー) ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</td>
                </tr>
                {expanded.has(g.グループキー) && g.品目リスト.map((item) => (
                  <tr key={item.商品コード} className="bg-blue-50 text-sm">
                    <td className="pl-8 text-gray-700">{item.表示名}</td>
                    <td className="text-center"><span className="badge badge-gray">{item.ABCランク}</span></td>
                    <td className="text-right">{formatYen(item.在庫金額)}</td>
                    <td className="text-gray-500">
                      {item.月使用数 > 0
                        ? <span>月<b>{formatNumber(item.月使用数, 0)}</b>使用</span>
                        : <span className="text-gray-400">不動</span>}
                    </td>
                    <td className="text-right text-xs text-gray-400">在庫{item.理論在庫}{item.単位}</td>
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
