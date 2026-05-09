# Order Notify for LINE WORKS

Shopify の注文やイベントを LINE WORKS に通知する Shopify Embedded App です。
Shopify Flow のアクションとして動作し、様々なトリガーに対応した柔軟な通知設定が可能です。

---

## 機能

- **LINE WORKS 連携**: Service Account 認証で LINE WORKS API と連携
- **Shopify Flow アクション**: 「Send LINE WORKS Message」アクションを提供
- **柔軟な送信先**: トークルーム（グループ）または個人（1:1）に送信可能
- **Liquid 変数対応**: Flow のデータを動的にメッセージに埋め込み

---

## クイックスタート

### 1. LINE WORKS の準備

1. [LINE WORKS Developer Console](https://developers.worksmobile.com/console) でアプリを作成
2. Service Account を作成し Private Key をダウンロード
3. Bot を作成

### 2. Shopify アプリの設定

1. アプリをインストール後、設定画面を開く
2. 以下の認証情報を入力：
   - Client ID
   - Client Secret
   - Service Account ID
   - Private Key
   - Bot ID
   - Channel ID（送信先）

3. 「テスト送信」で動作確認

### 3. Shopify Flow で使用

1. Shopify Flow でワークフローを作成
2. トリガーを選択（例: Order created）
3. アクションで「Send LINE WORKS Message」を選択
4. Bot ID、Channel ID、メッセージを設定

---

## 詳細なセットアップガイド

**[docs/setup-guide.md](./docs/setup-guide.md)** に詳細な手順を記載しています。

- LINE WORKS Developer Console の設定手順
- Service Account / Bot の作成方法
- 認証情報の取得場所
- トラブルシューティング

---

## 開発

### 前提条件

- Node.js 20.19 以上
- Shopify CLI
- Shopify Partner アカウント

### ローカル開発

```bash
# 依存関係のインストール
npm install

# データベースのセットアップ
npx prisma generate
npx prisma migrate dev

# 開発サーバー起動
npm run dev
```

### ビルド

```bash
npm run build
```

### デプロイ

```bash
npm run deploy
```

---

## プロジェクト構成

```
order_notify_lineworks/
├── app/
│   ├── routes/
│   │   ├── app._index.tsx      # 管理画面（認証情報設定）
│   │   └── api.flow-action.tsx # Flow Action エンドポイント
│   └── services/
│       └── lineworks.server.ts # LINE WORKS API 連携
├── extensions/
│   └── flow-action/
│       └── shopify.extension.toml
├── prisma/
│   └── schema.prisma           # データベーススキーマ
└── docs/
    ├── setup-guide.md          # セットアップガイド
    └── requirements.md         # 要件定義
```

---

## 技術スタック

| 技術 | 用途 |
|------|------|
| [Remix](https://remix.run/) | Web フレームワーク |
| [Prisma](https://www.prisma.io/) | ORM / データベース |
| [Polaris](https://polaris.shopify.com/) | UI コンポーネント |
| [Shopify App Remix](https://shopify.dev/docs/api/shopify-app-remix) | Shopify 認証・API |
| [LINE WORKS API](https://developers.worksmobile.com/) | メッセージ送信 |

---

## トラブルシューティング

### よくあるエラー

| エラー | 原因 | 対処 |
|--------|------|------|
| `Failed to get access token: 401` | 認証情報が間違っている | Client ID / Secret / Private Key を確認 |
| `channelId is invalid` | 送信先エンドポイントが違う | 個人宛は User ID（メールアドレス形式）を使用 |
| `channel does not exist` | Channel ID が存在しない | Bot がトークルームに招待されているか確認 |

詳細は [docs/setup-guide.md](./docs/setup-guide.md) の「トラブルシューティング」を参照してください。

---

## ライセンス

Private - All rights reserved

---

## 参考リンク

- [LINE WORKS Developer Console](https://developers.worksmobile.com/console)
- [LINE WORKS API ドキュメント](https://developers.worksmobile.com/jp/docs)
- [Shopify Flow ヘルプ](https://help.shopify.com/ja/manual/shopify-flow)
- [Shopify App Remix](https://shopify.dev/docs/api/shopify-app-remix)
