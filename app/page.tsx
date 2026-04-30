"use client";

import { useState } from "react";
import { Upload, AlertCircle, CheckCircle2 } from "lucide-react";

export default function HomePage() {
  const [zaikoFile, setZaikoFile] = useState<File | null>(null);
  const [tenshohinFile, setTenshohinFile] = useState<File | null>(null);
  const [message, setMessage] = useState<string>("");

  const handleAnalyze = () => {
    if (!zaikoFile || !tenshohinFile) {
      setMessage("両方のCSVファイルを選択してください");
      return;
    }
    setMessage("Phase 3で実装予定：CSVパース→分析画面遷移");
  };

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
                className="block w-full text-sm text-gray-600
                  file:mr-4 file:py-2 file:px-4 file:rounded
                  file:border-0 file:text-sm file:font-medium
                  file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
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
                className="block w-full text-sm text-gray-600
                  file:mr-4 file:py-2 file:px-4 file:rounded
                  file:border-0 file:text-sm file:font-medium
                  file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
              {tenshohinFile && (
                <p className="mt-2 text-sm text-green-700 flex items-center gap-1">
                  <CheckCircle2 size={16} /> {tenshohinFile.name}
                </p>
              )}
            </label>
          </div>
        </div>

        {message && (
          <div className="mt-4 p-3 rounded bg-amber-50 border border-amber-200 flex items-center gap-2 text-amber-800">
            <AlertCircle size={18} /> {message}
          </div>
        )}

        <button
          onClick={handleAnalyze}
          className="mt-6 w-full py-3 px-4 bg-blue-600 text-white font-semibold rounded
            hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition"
          disabled={!zaikoFile || !tenshohinFile}
        >
          分析を開始
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
        v0.1.0 (Phase 2: 初期化完了) | データはブラウザ内で処理されサーバ送信されません
      </footer>
    </main>
  );
}
