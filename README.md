# 薬局在庫分析システム (pharmacy-inventory)

薬局の在庫データ（在庫照会CSV + 品目マスタCSV）を分析し、返品候補・過剰在庫・廃棄リスク・長期不動品等を可視化するWebアプリケーション。

## 機能（実装予定含む）

### 必須機能
- ✅ 返品推奨（卸入庫から60日以内の在庫品目）
- ✅ 過剰在庫（在庫月数3か月以上）
- ✅ 廃棄リスク（有効期限180日以内）
- ✅ 長期不動品（処方なし180日以上）
- ✅ 入荷後不動品（入庫90日以上 かつ 入庫後処方なし）
- ✅ 複数メーカー保有検証

### 追加機能
- ✅ A. 製造中止・経過措置アラート
- ✅ B. デッドストック金額ランキング
- ✅ H. CSV取込履歴・差分管理（IndexedDB）

## 技術スタック

| 区分 | 採用技術 |
|---|---|
| Frontend | Next.js 15 (App Router) + React 19 + TypeScript |
| Styling | Tailwind CSS |
| CSV解析 | Papa Parse (CP932→UTF-8) |
| 日付処理 | dayjs |
| グラフ | Recharts |
| ローカルDB | Dexie (IndexedDB) |
| 認証 | Supabase Auth (Phase 2) |
| デプロイ | Vercel |

## セットアップ（GitHub Web UI 想定）

### 1. リポジトリ作成
GitHub上で `Ega-masa/pharmacy-inventory` リポジトリを新規作成（Privateを推奨）。

### 2. ファイルのアップロード
本ZIPに含まれる全ファイル/ディレクトリをGitHub Web UIから一括アップロード。

### 3. Vercelデプロイ
1. https://vercel.com にログイン → New Project
2. `Ega-masa/pharmacy-inventory` をImport
3. Framework: **Next.js**（自動検出）
4. 環境変数：MVPは認証無効のため設定不要
5. Deploy

### 4. （任意）Supabase接続：Phase 2以降
`.env.example` を `.env.local` にコピーし、Supabaseプロジェクトの値を設定。

## 開発フェーズ

| Phase | 内容 | 状態 |
|---|---|---|
| 1 | 要件定義・パラメータ確定 | ✅ 完了 |
| 2 | プロジェクト初期化（このZIP） | ✅ 完了 |
| 3 | CSV取込・パース実装 | 🔜 次回 |
| 4 | 6機能 + A/B 抽出ロジック実装 | 🔜 |
| 5 | 各機能の画面実装 | 🔜 |
| 6 | ダッシュボード・履歴画面 | 🔜 |
| 7 | テスト・デプロイ | 🔜 |

## データセキュリティ

- CSVデータは**ブラウザ内で完結処理**、外部送信なし
- 履歴はブラウザのIndexedDBに保存（同一PC・同一ブラウザのみ）
- 多店舗・履歴共有が必要な場合は案B（Supabase連携）へ拡張予定

## ディレクトリ構成

```
pharmacy-inventory/
├── app/
│   ├── layout.tsx          # ルートレイアウト
│   ├── page.tsx            # トップページ（CSVアップロード）
│   └── globals.css         # グローバルCSS
├── components/
│   ├── ui/                 # 共通UI（Phase 5で実装）
│   └── features/           # 機能別コンポーネント（Phase 5で実装）
├── lib/
│   ├── utils.ts            # 汎用ユーティリティ
│   ├── csvParser.ts        # CSV取込（Phase 3で実装）
│   ├── extractors.ts       # 抽出ロジック（Phase 4で実装）
│   └── db.ts               # IndexedDB履歴管理
├── types/
│   └── index.ts            # 型定義
├── public/                 # 静的ファイル
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.mjs
├── postcss.config.mjs
├── .gitignore
└── .env.example
```

## ライセンス

Private project. 商用利用・再配布は許可されていません。
