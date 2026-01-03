# AGI Task Manager

AGI時代のタスク管理システム

## 特徴

- **3つのビュー**: INBOX（期日未設定）、NOW（今日）、UPCOMING（明日以降）
- **Markdown同期**: CursorなどのエディタでMarkdownファイルとして編集可能
- **期日変更の追跡**: edit（通常変更）とdefer（棚上げ）を区別して記録
- **Supabase対応**: 本番環境ではSupabaseをデータベースとして使用

## ディレクトリ構成

```
agi-task-manager/
├── src/
│   ├── server.js         # メインサーバー
│   ├── colors.js         # カラーパレット設定
│   ├── db.js             # Supabaseクライアント
│   └── markdown-sync.js  # Markdown同期ユーティリティ
├── supabase/
│   └── schema.sql        # データベーススキーマ
├── tasks-template/       # Markdownテンプレート
│   ├── INBOX.md
│   ├── NOW.md
│   ├── UPCOMING.md
│   └── task.md.template
├── tests/
├── docs/
├── .env.example
├── .gitignore
├── Dockerfile            # Cloud Run用
├── firebase.json         # Firebase Hosting設定
└── package.json
```

## ローカル開発

```bash
# 依存パッケージをインストール
npm install

# 開発サーバーを起動
npm run dev

# http://localhost:3000 を開く
```

## 環境変数

`.env.example` をコピーして `.env` を作成し、必要な値を設定してください。

```bash
cp .env.example .env
```

## デプロイ

### Cloud Run

```bash
# Dockerイメージをビルド
docker build -t agi-task-manager .

# Cloud Runにデプロイ
gcloud run deploy agi-task-manager \
  --image gcr.io/YOUR_PROJECT/agi-task-manager \
  --region asia-northeast1 \
  --allow-unauthenticated
```

### Firebase Hosting

```bash
firebase deploy --only hosting
```

## Supabaseセットアップ

1. Supabaseプロジェクトを作成
2. `supabase/schema.sql` を実行してテーブルを作成
3. 環境変数 `SUPABASE_URL` と `SUPABASE_ANON_KEY` を設定

## Markdown同期（Cursor連携）

Settings画面の「Sync Now」ボタンで、タスクデータをMarkdownファイルとして出力できます。

出力先: `./tasks/`
- `INBOX.md` - 期日未設定のタスク
- `NOW.md` - 今日のタスク
- `UPCOMING.md` - 明日以降のタスク
- `items/*.md` - 個別タスクファイル

## ステータス

| Status | 意味 |
|--------|------|
| ToDo | やる予定 |
| In Progress | 作業中 |
| Waiting | ボールが自分にない |
| Done | 完了 |
| Won't Do | やらない |

## カラーパレット

### Night Mode
- Background: `#150D0D`
- Text Primary: `#CECDC2`
- Text Secondary: `#787771`

### Basic Mode
- Background: `#FFFFFF`
- Text Primary: `#4C4C4C`
- Text Secondary: `#C1BFBF`

## フォント

- Sans-serif: Roboto
- Serif: Playfair Display
- Script: Parisienne

## ライセンス

MIT
