# セットアップガイド（GitHub Web UI 手順）

このドキュメントは、ZIPに含まれる本プロジェクトを GitHub に登録し、Vercel にデプロイするまでの手順を詳しく解説しています。CLI不要、すべてブラウザで完結します。

---

## STEP 1: GitHubリポジトリを作成

1. https://github.com/Ega-masa にアクセス
2. 右上の「+」→「New repository」
3. 以下を入力：
   - Repository name: `pharmacy-inventory`
   - Description: `薬局在庫分析システム`
   - **Private** を選択（経営データを扱うため）
   - 「Add a README file」は **チェックしない**
   - 「Add .gitignore」は **None**
   - 「Choose a license」は **None**
4. 「Create repository」をクリック

---

## STEP 2: ファイルを一括アップロード

1. 作成したリポジトリの画面で「uploading an existing file」リンクをクリック
   （またはURL末尾に `/upload/main` を追加）
2. ZIPを解凍した中身（`pharmacy-inventory/` フォルダの**中身**）をすべてドラッグ＆ドロップ
   - ⚠️ `pharmacy-inventory/` フォルダごとではなく、**中身（package.json, app/, lib/ 等）** をアップロード
3. 隠しファイル（`.gitignore`, `.env.example`）も忘れずアップロード
   - macOSの場合: Finderで `Cmd+Shift+.` で表示
   - Windowsの場合: エクスプローラーの「表示」→「隠しファイル」にチェック
4. ページ最下部の「Commit changes」セクションで：
   - Commit message: `Initial commit (Phase 2: project bootstrap)`
   - 「Commit changes」をクリック

---

## STEP 3: Vercelでデプロイ

1. https://vercel.com にログイン（GitHubアカウントでサインイン推奨）
2. ダッシュボードで「Add New...」→「Project」
3. 「Import Git Repository」のリストから `Ega-masa/pharmacy-inventory` の右側「Import」をクリック
   - 表示されない場合：「Adjust GitHub App Permissions」からこのリポジトリに権限付与
4. Configure Project画面：
   - Project Name: `pharmacy-inventory`（自動入力）
   - Framework Preset: **Next.js**（自動検出）
   - Root Directory: `./`（変更不要）
   - Build Command: `next build`（自動）
   - Output Directory: `.next`（自動）
   - Install Command: `npm install`（自動）
   - Environment Variables: **Phase 2では設定不要**
5. 「Deploy」をクリック
6. 1〜2分待つと完了。`https://pharmacy-inventory.vercel.app` のような URL が発行されます

---

## STEP 4: 動作確認

ブラウザで Vercel URL にアクセス：

- [ ] トップページが表示される（「薬局在庫分析システム」のタイトル）
- [ ] CSVファイル選択フィールドが2つ表示される
- [ ] ファイルを2つ選択すると「分析を開始」ボタンが青くなる
- [ ] ボタンを押すと「Phase 3で実装予定」と表示される（これが正常動作）

ここまでで Phase 2 完了です。

---

## トラブルシューティング

### Vercelビルドが失敗する場合

「Deployments」タブからエラーログを確認。よくあるパターン：

| エラー | 原因 | 対処 |
|---|---|---|
| `Module not found: Can't resolve '@/types'` | tsconfig.json のパス設定ミス | tsconfig.json をアップロード忘れ |
| `Cannot find module 'next'` | package.json アップロード漏れ | リポジトリ直下に package.json があるか確認 |
| `Tailwind classes not applied` | postcss/tailwind config漏れ | `tailwind.config.ts`, `postcss.config.mjs` を確認 |

### GitHub Web UIで .env.example がアップロードできない

ドット始まりファイルは隠しファイル扱い。OS設定で表示してから再ドラッグ。

---

## 次のフェーズに進む前のチェックリスト

- [ ] GitHubリポジトリにファイルが揃っている（README.mdがリポジトリトップに表示される）
- [ ] Vercelにデプロイ済みでURLにアクセス可能
- [ ] トップページのCSVアップロード画面が表示される
- [ ] ブラウザのDevTools Console にエラーが出ていない

すべてOKなら、次のチャットで **Phase 3（CSV取込実装）** に進みます。
