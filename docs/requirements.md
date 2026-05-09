AI（Claude Code）にそのまま渡して開発をスタートできる、**「LINE WORKS 連携アプリ（堅牢 MVP 版）」**の要件定義書を作成しました。

この設計のポイントは、**「ロジックを Shopify Flow 側に丸投げする」**ことです。
アプリ側で「注文が来たら…」「在庫が減ったら…」という判定ロジックを持つとバグの温床になります。アプリは**「Flow から命令が来たら、LINE WORKS に投げるだけの土管」**に徹することで、開発工数とサポート負荷を極限まで下げます。

以下のテキストをコピーして、Claude に渡してください。

---

# 📑 要件定義書：Order Notify for LINE WORKS (MVP)

> **目的**: Shopify Flow のアクションとして動作し、Shopify のイベント（注文、在庫、顧客登録など）を **LINE WORKS のトークルームに通知** するアプリを開発する。
> **最優先事項**: 「Shopify Basic プラン」でも動作すること（Flow の HTTP Request 制限の回避策としての価値）。

## 1. アプリ概要

- **アプリ名**: Order Notify for LINE WORKS
- **種別**: Shopify Embedded App (Admin + Flow Action Extension)
- **ターゲット**: 倉庫担当者や店舗スタッフなど、PC を持たずスマホ（LINE WORKS）で業務を行う層。
- **コア機能**:

1. LINE WORKS API の認証情報設定（Admin 画面）
2. メッセージ送信アクション（Flow Action）

## 2. 技術スタック

- **Framework**: Remix (Shopify App Template standard)
- **Language**: TypeScript
- **Database**: Prisma (SQLite for MVP / PostgreSQL for Prod)
- ※ 認証情報（Client Secret / Private Key）を保存するため必須。

- **Extension**: Shopify Flow Action
- **External API**: LINE WORKS API 2.0 (OAuth 2.0 Service Account)

## 3. データフロー (Architecture)

1. **Trigger**: Shopify Flow でイベント発生（例：Order Created）
2. **Logic**: マーチャントが Flow 上で条件分岐（例：合計金額が 1 万円以上なら）
3. **Action**: 本アプリの Flow Action を呼び出し

- Input: `Bot ID`, `Channel ID`, `Message Body`

4. **App Backend**:

- DB から認証情報を取得
- JWT を生成し、LINE WORKS Access Token を取得（またはキャッシュ利用）
- LINE WORKS API (`POST /v2/bots/{botId}/channels/{channelId}/messages`) を叩く

5. **Output**: 現場スタッフのスマホに通知が届く

## 4. 機能要件 (Functional Requirements)

### 4.1. 管理画面 (Admin UI)

**目的**: API 連携に必要な認証情報を保存し、接続テストを行う。

1. **設定フォーム (Settings Form)**

- 以下のフィールドを入力・保存できること（DB には暗号化して保存推奨だが、MVP では平文でも可とする）。
- `Client ID`
- `Client Secret`
- `Service Account` (Email address style)
- `Private Key` (テキストエリア / `.key` ファイルの中身を貼り付け)
- `Domain ID` (不要な場合もあるが、API 2.0 の仕様に合わせて確認)

2. **接続テストボタン (Test Connection)**

- ユーザーがフォーム入力後、「テスト送信」ボタンを押せる。
- 成功時：「テストメッセージを送信しました」とトースト表示。
- 失敗時：API のエラーレスポンス（例：認証エラー、Bot 不在など）をそのまま表示する（サポート対策）。

3. **Bot ID / Channel ID の確認ガイド**

- LINE WORKS Developer Console のどこを見れば値があるか、スクリーンショットかテキストで案内を表示。

### 4.2. Shopify Flow Action (Extension)

**目的**: ワークフロー内で呼び出せるアクションを提供する。

1. **Action 定義 (`shopify.extension.toml`)**

- **Handle**: `send_lineworks_message`
- **Title**: `Send LINE WORKS Message`
- **Description**: `Send a notification to a specific LINE WORKS channel.`

2. **入力フィールド (Inputs)**

- **Bot ID** (`bot_id`): Required / String
- 送信担当の Bot ID。

- **Channel ID** (`channel_id`): Required / String
- 送信先のトークルーム ID。

- **Message** (`message`): Required / String / Multi-line
- 通知本文。Liquid 変数が使用可能であること（Shopify Flow 標準機能）。

3. **実行ロジック (Execute)**

- 入力された値を元に、バックエンドの API Route を叩く、または Extension 内で処理する。
- 認証トークン（Access Token）は、呼び出しのたびに生成（または有効期限内で再利用）する。
- API リクエスト制限（Rate Limit）のエラーハンドリングを行う（簡易的で OK）。

## 5. データベース設計 (Schema)

認証情報をストアごとに管理する。

```prisma
model Configuration {
  id          String   @id @default(uuid())
  shop        String   @unique // ストアドメイン (myshopify.com)
  clientId    String
  clientSecret String
  serviceAccount String
  privateKey  String   // 長い文字列になるため注意
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

```

## 6. 開発ステップ (AI への指示順序)

1. **プロジェクト作成**: `npm init @shopify/app@latest` (Remix)
2. **Prisma 設定**: 上記スキーマを追加し、`npx prisma migrate dev`。
3. **管理画面実装**: Polaris を使い、認証情報を保存するフォームを作成。

- ActionLoader で DB への保存処理を実装。

4. **LINE WORKS 連携ロジック実装**:

- `jsonwebtoken` ライブラリ等を使い、Service Account 認証の JWT 生成ロジックを書く。
- `access_token` を取得する関数を作成。
- メッセージ送信関数を作成。

5. **Flow Action 追加**: `npm run shopify app generate extension` -> `Flow Action` 選択。
6. **Action 接続**: Extension の実行時に、4 の送信関数を呼び出す処理を実装。

## 7. 注意点・制約事項 (Constraints)

- **Basic プラン対応**: Shopify Flow の「HTTP Request」アクションは Basic プランでは使えないが、**「アプリの Flow Action」は Basic プランでも使用可能**。これを最大の強みとする。
- **エラー通知**: LINE WORKS API が失敗した場合（例：Channel ID 間違い）、Flow の実行ログに `status: 500` 等を返却し、ユーザーが Flow 管理画面でエラーに気付けるようにする。
- **セキュリティ**: Private Key は極めて機密性が高いため、ログ出力時に中身を表示しないこと。
