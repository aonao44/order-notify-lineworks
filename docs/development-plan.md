# Order Notify for LINE WORKS 開発計画

## 概要
Shopify Flow のアクションとして動作し、LINE WORKS のトークルームに通知を送信する Embedded App を開発する。

## 確認済み仕様
- **プロジェクト状態**: 新規開発（ゼロから開始）
- **LINE WORKS 環境**: 未準備（開発と並行して設定）
- **セキュリティ**: MVP は平文保存で可
- **インフラ**: ローカル開発のみ（SQLite）
- **テスト送信**: 設定フォームに Bot ID / Channel ID 欄を追加
- **エラーハンドリング**: リトライなし
- **UI 言語**: 日本語のみ
- **トークンキャッシュ**: なし（毎回取得）
- **Shopify 認証**: カスタムアプリ（複数ストア対応）

---

## 開発ステップ

### Step 1: プロジェクト初期化
**ファイル**: プロジェクトルート全体

1. Shopify CLI でプロジェクト作成
   ```bash
   npm init @shopify/app@latest -- --template remix
   ```

2. 必要な依存関係の追加
   - `jsonwebtoken`: JWT 生成用
   - 既存の Prisma / Polaris は Remix テンプレートに含まれる

### Step 2: データベース設計
**ファイル**: `prisma/schema.prisma`

```prisma
model Configuration {
  id             String   @id @default(uuid())
  shop           String   @unique
  clientId       String
  clientSecret   String
  serviceAccount String
  privateKey     String   @db.Text
  testBotId      String?  // テスト送信用
  testChannelId  String?  // テスト送信用
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}
```

### Step 3: LINE WORKS 連携ロジック実装
**ファイル**: `app/services/lineworks.server.ts`

1. JWT 生成関数
   - Service Account 認証に必要な JWT を作成
   - `iss`: Client ID
   - `sub`: Service Account
   - `iat`: 現在時刻
   - `exp`: 有効期限（1時間）

2. Access Token 取得関数
   - LINE WORKS OAuth エンドポイントに JWT を送信
   - `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer`

3. メッセージ送信関数
   - `POST /v2/bots/{botId}/channels/{channelId}/messages`
   - Content-Type: `application/json`

### Step 4: 管理画面実装
**ファイル**: `app/routes/app._index.tsx`

1. 設定フォーム（Polaris 使用）
   - Client ID（テキスト入力）
   - Client Secret（パスワード入力）
   - Service Account（テキスト入力）
   - Private Key（テキストエリア）
   - テスト用 Bot ID（テキスト入力）
   - テスト用 Channel ID（テキスト入力）

2. 保存ボタン
   - Remix の action で DB に保存

3. テスト送信ボタン
   - フォームの値を使って LINE WORKS にテストメッセージ送信
   - 成功/失敗をトースト表示

4. LINE WORKS 設定ガイド
   - Bot ID / Channel ID の確認方法を説明するセクション

### Step 5: Flow Action Extension 追加
**ファイル**: `extensions/flow-action/`

1. Extension 生成
   ```bash
   npm run shopify app generate extension -- --type flow_action
   ```

2. `shopify.extension.toml` 設定
   ```toml
   [[extensions]]
   type = "flow_action"
   name = "Send LINE WORKS Message"
   handle = "send-lineworks-message"

   [[extensions.settings.fields]]
   key = "bot_id"
   name = "Bot ID"
   type = "single_line_text_field"
   required = true

   [[extensions.settings.fields]]
   key = "channel_id"
   name = "Channel ID"
   type = "single_line_text_field"
   required = true

   [[extensions.settings.fields]]
   key = "message"
   name = "Message"
   type = "multi_line_text_field"
   required = true
   ```

3. Action 実行エンドポイント
   **ファイル**: `app/routes/api.flow-action.tsx`
   - Flow からの webhook を受け取る
   - shop 情報から Configuration を取得
   - LINE WORKS API を呼び出し
   - 成功/失敗を HTTP ステータスで返却

---

## ファイル構成（予定）

```
order_notify_lineworks/
├── app/
│   ├── routes/
│   │   ├── app._index.tsx      # 管理画面
│   │   └── api.flow-action.tsx # Flow Action エンドポイント
│   ├── services/
│   │   └── lineworks.server.ts # LINE WORKS API 連携
│   └── ...（Remix テンプレートの既存ファイル）
├── extensions/
│   └── flow-action/
│       └── shopify.extension.toml
├── prisma/
│   └── schema.prisma
└── docs/
    └── requirements.md
```

---

## 検証方法

### ローカル開発での検証
1. `npm run dev` でアプリ起動
2. Shopify Partner ダッシュボードで開発ストアにインストール
3. 管理画面で LINE WORKS 認証情報を入力・保存
4. テスト送信ボタンで動作確認
5. Shopify Flow でアクションを追加してテスト実行

### 機能テスト項目
- [ ] 認証情報の保存・読み込み
- [ ] LINE WORKS API 認証（JWT → Access Token）
- [ ] テストメッセージ送信
- [ ] Flow Action からのメッセージ送信
- [ ] エラー時の適切なレスポンス

---

## 注意事項
- Private Key はログに出力しないこと
- LINE WORKS 側の Bot/トークルーム設定は別途必要
- Basic プラン対応は Shopify Flow アクションの仕様上、自動的に満たされる

---

## 開発アプローチ
**一括実装**: Step 1〜5 を順次実装し、全体を完成させる。
