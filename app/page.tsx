"use client";

import { useState } from "react";
import { Upload, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import type { InventoryItem } from "@/types";
import {
  parseZaikoCSV,
  parseTenshohinCSV,
  mergeAndNormalize,
} from "@/lib/csvParser";
import { formatYen, formatDate } from "@/lib/utils";

type PageState = "upload" | "loading" | "preview";

export default function HomePage() {
  const [zaikoFile, setZaikoFile] = useState<File | null>(null);
  const [tenshohinFile, setTenshohinFile] = useState<File | null>(null);
  const [pageState, setPageState] = useState<PageState>("upload");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [inventoryData, setInventoryData] = useState<InventoryItem[]>([]);

  const handleAnalyze = async () => {
    if (!zaikoFile || !tenshohinFile) {
      setErrorMessage("両方のCSVファイルを選択してください");
      return;
    }

    setErrorMessage("");
    setPageState("loading");

    try {
      // 両CSVをパース
      const zaiko = await parseZaikoCSV(zaikoFile);
      const tenshohin = await parseTenshohinCSV(tenshohinFile);

      // 結合・正規化
      const merged = mergeAndNormalize(zaiko, tenshohin);

      if (merged.length === 0) {
        setErrorMessage("マッチする在庫品目がありません");
        setPageState("upload");
        return;
      }

      setInventoryData(merged);
      setPageState("preview");
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "不明なエラーが発生しました"
      );
      setPageState("upload");
    }
  };

  if (pageState === "preview") {
    return (
      <PreviewPage
        data={inventoryData}
        onReset={() => {
          setZaikoFile(null);
          setTenshohinFile(null);
          setPageState("upload");
          setErrorMessage("");
        }}
      />
    );
  }

  return (
    <main className="container mx-auto px-4 py-8 max-w-4xl">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          薬局在庫分析システム
        </h1>
        <p className="text-gray-600">
          在庫照会CSVと品目マスタCSVをアップロードして、返品候補・過剰在庫・廃棄リスク等を分析します。
        </p>
      </header>

      <section className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">CSVファイルのアップロード</h2>

        <div className="space-y-4">
          {/* 在庫照会CSV */}
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
            <label className="block">
              <div className="flex items-center gap-2 mb-2">
                <Upload size={20} className="text-blue-600" />
                <span className="font-medium">
                  ① 在庫照会CSV（zaikoSyokai_*.csv）
                </span>
              </div>
              <input
                type="file"
                accept=".csv"
                onChange={(e) => setZaikoFile(e.target.files?.[0] || null)}
                disabled={pageState === "loading"}
                className="block w-full text-sm text-gray-600
                  file:mr-4 file:py-2 file:px-4 file:rounded
                  file:border-0 file:text-sm file:font-medium
                  file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100
                  disabled:opacity-50"
              />
              {zaikoFile && (
                <p className="mt-2 text-sm text-green-700 flex items-center gap-1">
                  <CheckCircle2 size={16} /> {zaikoFile.name}
                </p>
              )}
            </label>
          </div>

          {/* 品目マスタCSV */}
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
            <label className="block">
              <div className="flex items-center gap-2 mb-2">
                <Upload size={20} className="text-blue-600" />
                <span className="font-medium">
                  ② 品目マスタCSV（Tenshohin_*.csv）
                </span>
              </div>
              <input
                type="file"
                accept=".csv"
                onChange={(e) => setTenshohinFile(e.target.files?.[0] || null)}
                disabled={pageState === "loading"}
                className="block w-full text-sm text-gray-600
                  file:mr-4 file:py-2 file:px-4 file:rounded
                  file:border-0 file:text-sm file:font-medium
                  file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100
                  disabled:opacity-50"
              />
              {tenshohinFile && (
                <p className="mt-2 text-sm text-green-700 flex items-center gap-1">
                  <CheckCircle2 size={16} /> {tenshohinFile.name}
                </p>
              )}
            </label>
          </div>
        </div>

        {errorMessage && (
          <div className="mt-4 p-3 rounded bg-red-50 border border-red-200 flex items-center gap-2 text-red-800">
            <AlertCircle size={18} /> {errorMessage}
          </div>
        )}

        <button
          onClick={handleAnalyze}
          disabled={!zaikoFile || !tenshohinFile || pageState === "loading"}
          className="mt-6 w-full py-3 px-4 bg-blue-600 text-white font-semibold rounded
            hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition
            flex items-center justify-center gap-2"
        >
          {pageState === "loading" ? (
            <>
              <Loader2 size={20} className="animate-spin" />
              分析中...
            </>
          ) : (
            "分析を開始"
          )}
        </button>
      </section>

      <section className="bg-blue-50 rounded-lg p-4 text-sm text-gray-700">
        <h3 className="font-semibold mb-2">📋 分析項目（実装予定）</h3>
        <ul className="grid grid-cols-2 gap-1 ml-4 list-disc">
          <li>返品推奨（入庫60日以内）</li>
          <li>過剰在庫（在庫月数3か月以上）</li>
          <li>廃棄リスク（期限180日以内）</li>
          <li>長期不動品（処方なし180日以上）</li>
          <li>入荷後不動品（入庫90日以上）</li>
          <li>複数メーカー保有</li>
          <li>製造中止・経過措置アラート</li>
          <li>デッドストック金額ランキング</li>
        </ul>
      </section>

      <footer className="mt-8 text-center text-xs text-gray-500">
        v0.2.0 (Phase 3: CSV取込実装) | データはブラウザ内で処理されサーバ送信されません
      </footer>
    </main>
  );
}

/**
 * プレビューページ：CSV取込結果の確認画面
 */
function PreviewPage({
  data,
  onReset,
}: {
  data: InventoryItem[];
  onReset: () => void;
}) {
  const totalAmount = data.reduce((sum, item) => sum + item.在庫金額, 0);
  const totalCount = data.length;
  const avgAmount = totalAmount / (totalCount || 1);

  return (
    <main className="container mx-auto px-4 py-8">
      <header className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-3xl font-bold text-gray-900">
            CSV取込完了 - プレビュー
          </h1>
          <button
            onClick={onReset}
            className="px-4 py-2 border border-gray-300 rounded
              hover:bg-gray-50 text-gray-700 text-sm font-medium"
          >
            ← 戻る
          </button>
        </div>
        <p className="text-gray-600">
          Phase 4で各分析機能が実装予定。現在はマージ結果の確認画面です。
        </p>
      </header>

      {/* サマリカード */}
      <section className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-gray-600 text-sm font-medium">対象品目数</div>
          <div className="text-3xl font-bold text-gray-900">{totalCount}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-gray-600 text-sm font-medium">合計金額</div>
          <div className="text-2xl font-bold text-blue-600">
            {formatYen(totalAmount)}
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-gray-600 text-sm font-medium">平均金額</div>
          <div className="text-2xl font-bold text-gray-900">
            {formatYen(avgAmount)}
          </div>
        </div>
      </section>

      {/* データテーブル */}
      <section className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>薬品表示</th>
                <th className="text-right">在庫数</th>
                <th className="text-right">薬価</th>
                <th className="text-right">在庫金額</th>
                <th>最終入庫</th>
                <th>最終処方</th>
              </tr>
            </thead>
            <tbody>
              {data.slice(0, 50).map((item) => (
                <tr key={item.商品コード}>
                  <td className="font-medium text-blue-600 max-w-xs truncate">
                    {item.表示名}
                  </td>
                  <td className="text-right">{item.理論在庫}</td>
                  <td className="text-right">
                    {formatYen(item.現薬価 || item.旧薬価 || 0)}
                  </td>
                  <td className="text-right font-semibold">
                    {formatYen(item.在庫金額)}
                  </td>
                  <td className="text-sm text-gray-600">
                    {formatDate(item.最終入庫日)}
                  </td>
                  <td className="text-sm text-gray-600">
                    {formatDate(item.最終処方日)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalCount > 50 && (
          <div className="px-6 py-3 text-center text-sm text-gray-500 bg-gray-50">
            他 {totalCount - 50} 件（最初の50件のみ表示）
          </div>
        )}
      </section>

      {/* 注記 */}
      <footer className="mt-8 text-center text-xs text-gray-500">
        次のステップ：Phase 4で各抽出機能を実装します
      </footer>
    </main>
  );
}
