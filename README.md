# Order Notify for LINE WORKS

> Shopify の注文・配送イベントを LINE WORKS のグループ/ユーザーに通知する Shopify アプリ + Flow Action

## 何を解決するか

日本企業が業務連絡で広く使う LINE WORKS への通知連携は、Shopify 標準では用意されていません。本アプリは Shopify Flow の Action として動作し、任意のトリガー（注文作成・支払い・出荷など）に対して LINE WORKS Bot 経由で柔軟にメッセージを組み立てて配信できます。Webhook 経由の通知にも対応し、Flow を使えないストアでもストア管理画面から有効化できます。

## 主要機能

- **Shopify Flow Action**: `Send LINE WORKS Message` を任意のワークフローにドロップして使用可能。Bot ID / Channel ID / メッセージを Action 設定として渡せる
- **トークルーム / 1:1 メッセージ両対応**: `channel_id` がメールアドレス形式なら `users/{userId}` API、それ以外は `channels/{channelId}` API へ自動振り分け
- **Webhook 通知（Flow を使わないルート）**: `orders/create` `orders/paid` `orders/cancelled` `fulfillments/create` を購読し、トピックごとに送信先・テンプレートを管理画面から設定
- **メッセージテンプレート**: Shopify Flow の Liquid 変数、または Webhook ルートでは独自の `{{変数名}}` プレースホルダで動的な文面を生成
- **冪等性 & リトライキュー**: `flowExecutionKey` / `webhookId` で重複配信を排除し、リトライ可能なエラーは指数バックオフで最大 5 回まで再送（`RetryJob` テーブル + 30 秒間隔のワーカー）
- **Private Key の暗号化保管**: PBKDF2 + AES-256-GCM でアプリ側 Secret から派生した鍵で Service Account の Private Key を暗号化して DB 保存
- **送信履歴の可視化**: 成功/失敗・送信元（Flow / Webhook）・トピック・エラー内容を `MessageLog` に記録し、管理画面から閲覧
- **テスト送信**: 認証情報入力後、ワンクリックで疎通確認用メッセージを送信

## 技術スタック

- **Remix v2** (Vite) / **TypeScript**
- **Shopify App Remix Template** + **Flow Extension**（`@shopify/shopify-app-remix`, `@shopify/app-bridge-react`）
- **Shopify Polaris**（管理画面 UI）
- **Prisma 6** + **SQLite**（セッション・設定・ログ・リトライキュー・Webhook 状態を保管）
- **LINE WORKS API**（Service Account 認証 / JWT(RS256) 署名 → Access Token → Bot Message API）
- **jsonwebtoken**（RS256 署名）/ **Node crypto**（AES-256-GCM 暗号化）
- **Fly.io** + **Litestream**（SQLite を S3 互換ストレージへレプリケーション、`Dockerfile` でコンテナ化）

## 動作環境

- Node.js 20.19+ （`package.json` の `engines` に準拠）
- Shopify Partner アカウント / 開発ストア（Flow が使えるプラン）
- LINE WORKS Developer Console アカウント（Bot 作成権限のある管理者）

## セットアップ

詳細手順は [docs/setup-guide.md](./docs/setup-guide.md) にスクリーンショット相当の粒度で記載しています。最短ルートは以下の 5 ステップです。

1. **LINE WORKS 側を準備**: Developer Console でアプリを作成し、Client ID / Client Secret / Service Account / Private Key（PEM）を取得。Bot を作成してトークルームに招待
2. **環境変数を設定**: `.env` に Shopify 各種キーと `PRIVATE_KEY_ENC_SECRET`（32 文字以上のランダム文字列）を設定
3. **依存関係と DB を準備**: `npm install` → `npx prisma migrate deploy`（または開発時 `npx prisma migrate dev`）
4. **ローカル起動**: `npm run dev` で Shopify CLI 経由のトンネルとアプリを起動し、開発ストアにインストール
5. **アプリ管理画面で認証情報を保存** → テスト送信で疎通確認 → Shopify Flow に `Send LINE WORKS Message` Action を追加、または Webhook 通知設定画面でトピックを有効化

本番デプロイは Fly.io を想定（`fly.toml` / `Dockerfile` / `litestream.yml` 同梱）。`fly deploy` でコンテナ化されたアプリをデプロイし、永続ボリューム上の SQLite を Litestream でレプリケートします。

## アーキテクチャ

```
app/
├── routes/
│   ├── app._index.tsx            # 認証情報の登録 / テスト送信 UI
│   ├── app.webhooks.tsx          # Webhook トピックごとの送信先・テンプレ設定
│   ├── app.logs.tsx              # 送信履歴ビュー
│   ├── api.flow-action.tsx       # Flow Action のランタイム（HMAC 認証 → 送信 → ログ）
│   ├── webhooks.shopify.tsx      # 注文系 Webhook の受信エンドポイント
│   └── webhooks.app.*.tsx        # app/uninstalled, app/scopes_update など
├── services/
│   ├── lineworks.server.ts       # JWT 生成 → Access Token → メッセージ送信
│   ├── encryption.server.ts      # Private Key の AES-256-GCM 暗号化/復号
│   ├── template.server.ts        # `{{変数}}` プレースホルダ展開
│   ├── retry.server.ts           # リトライ可否判定 / 指数バックオフ計算
│   ├── retryWorker.server.ts     # 30 秒間隔のリトライワーカー
│   └── shopifyWebhook.server.ts  # 宣言的 Webhook の購読状態同期
└── shopify.server.ts             # Shopify App Remix の初期化
extensions/flow-action/           # Shopify Flow Action 拡張定義
prisma/schema.prisma              # Session / Configuration / MessageLog / RetryJob / WebhookSetting / WebhookEvent
```

機密情報の取り扱い、Webhook の冪等性、リトライ戦略、暗号化方式の根拠は `docs/` 配下にまとめています。

## ライセンス

MIT

## 作者

[aonao44](https://github.com/aonao44)
