# Order Notify for LINE WORKS セットアップガイド

このガイドでは、Shopify ストアに Order Notify for LINE WORKS をインストールし、LINE WORKS への通知を設定する手順を説明します。

---

## 目次

1. [事前準備](#1-事前準備)
2. [LINE WORKS Developer Console でアプリを作成](#2-line-works-developer-console-でアプリを作成)
3. [Service Account を作成](#3-service-account-を作成)
4. [Bot を作成](#4-bot-を作成)
5. [Shopify アプリに認証情報を設定](#5-shopify-アプリに認証情報を設定)
6. [テスト送信で動作確認](#6-テスト送信で動作確認)
7. [Shopify Flow でアクションを設定](#7-shopify-flow-でアクションを設定)
8. [トラブルシューティング](#8-トラブルシューティング)

---

## 1. 事前準備

### 必要なもの

| 項目 | 説明 |
|------|------|
| LINE WORKS アカウント | 管理者権限が必要 |
| Shopify ストア | Basic プラン以上（Flow が使えるプラン） |

### LINE WORKS の権限について

LINE WORKS の設定を行うには**管理者権限**が必要です。管理者でない場合は、会社の LINE WORKS 管理者に依頼してください。

---

## 2. LINE WORKS Developer Console でアプリを作成

### 2.1 Developer Console にアクセス

1. ブラウザで以下の URL にアクセス：

   **https://developers.worksmobile.com/console**

2. LINE WORKS アカウントでログイン

### 2.2 アプリを作成

1. 左メニューの「**API**」をクリック

2. 「**アプリの新規追加**」をクリック

3. アプリ情報を入力：

   | 項目 | 入力例 |
   |------|--------|
   | アプリ名 | `Shopify 注文通知` |
   | 説明 | `Shopify の注文を LINE WORKS に通知` |

4. 「**同意して利用する**」にチェックを入れて「**保存**」

### 2.3 Client ID と Client Secret を取得

アプリ作成後、詳細画面が表示されます。

1. **Client ID** をコピーしてメモ帳などに保存

2. **Client Secret** の「**発行**」ボタンをクリック
   - 「**再発行**」ボタンが表示されている場合はそれをクリック

3. 表示された **Client Secret** をコピーして保存

> **重要**: Client Secret は一度しか表示されません。必ずコピーして安全な場所に保存してください。

### 2.4 OAuth Scopes を設定

1. 同じ画面で「**OAuth Scopes**」セクションを探す

2. 「**管理**」または「**編集**」をクリック

3. 以下のスコープにチェックを入れる：
   - `bot` - Bot の操作
   - `bot.message` - メッセージ送信（表示される場合）

4. 「**保存**」をクリック

---

## 3. Service Account を作成

Service Account は、アプリが LINE WORKS API にアクセスするための認証に使用します。

### 3.1 Service Account を追加

1. 左メニューの「**Service Account**」をクリック
   - または、アプリ詳細画面の「Service Account」タブ

2. 「**追加**」をクリック

3. Service Account が作成され、以下の形式の ID が表示されます：
   ```
   xxxxx.serviceaccount@example
   ```
   この **Service Account ID** をコピーして保存

### 3.2 Private Key をダウンロード

1. 作成した Service Account の行で「**発行**」をクリック

2. Private Key（秘密鍵）ファイルがダウンロードされます
   - ファイル名例: `private_xxxxxxxx.key`

3. このファイルをテキストエディタで開くと、以下のような内容が表示されます：
   ```
   -----BEGIN PRIVATE KEY-----
   MIIEvgIBADANBgkqhkiG9w0BAQEFAASC...
   （長い文字列）
   ...
   -----END PRIVATE KEY-----
   ```

4. この内容を**全てコピー**して保存
   - `-----BEGIN PRIVATE KEY-----` から `-----END PRIVATE KEY-----` まで全て必要

> **重要**: Private Key は絶対に他人に共有しないでください。漏洩した場合は即座に再発行してください。

---

## 4. Bot を作成

Bot は、LINE WORKS のトークルームにメッセージを送信するために必要です。

### 4.1 Bot を追加

1. 左メニューの「**Bot**」をクリック

2. 「**登録**」または「**Bot を追加**」をクリック

3. Bot 情報を入力：

   | 項目 | 入力例 | 説明 |
   |------|--------|------|
   | Bot 名 | `注文通知Bot` | トークルームに表示される名前 |
   | 説明 | `Shopify の注文情報を通知します` | Bot の説明 |
   | Bot ポリシー | `複数人のトークルームでも使用可能` にチェック | グループに送信する場合は必須 |

4. 「**保存**」をクリック

### 4.2 Bot ID を確認

1. 作成した Bot の詳細画面を開く

2. **Bot ID** が表示されます（数字の ID）
   ```
   例: 12345678
   ```

3. この **Bot ID** をコピーして保存

### 4.3 Bot をトークルームに招待（グループ通知の場合）

グループのトークルームに通知を送りたい場合：

1. LINE WORKS アプリを開く

2. 通知を送りたいトークルームを開く

3. 右上の「**︙**」メニュー → 「**Bot を招待**」

4. 作成した Bot を選択して招待

> **注意**: Bot を招待しないと、そのトークルームには通知を送れません。

---

## 5. Shopify アプリに認証情報を設定

### 5.1 アプリの設定画面を開く

1. Shopify 管理画面にログイン

2. 左メニューの「**アプリ**」をクリック

3. 「**Order Notify for LINE WORKS**」をクリック

### 5.2 認証情報を入力

以下の情報を入力します：

| フィールド | 入力する値 | 取得場所 |
|------------|-----------|----------|
| Client ID | `xxxxxxxxxxxxxxxx` | [2.3](#23-client-id-と-client-secret-を取得) で取得 |
| Client Secret | `xxxxxxxxxxxxxxxx` | [2.3](#23-client-id-と-client-secret-を取得) で取得 |
| Service Account | `xxxxx.serviceaccount@example` | [3.1](#31-service-account-を追加) で取得 |
| Private Key | `-----BEGIN PRIVATE KEY-----...` | [3.2](#32-private-key-をダウンロード) でダウンロード |
| Bot ID（テスト用） | `12345678` | [4.2](#42-bot-id-を確認) で取得 |
| Channel ID（テスト用） | 後述 | 下記参照 |

### 5.3 Channel ID（送信先）について

#### 個人宛に送信する場合（1:1 メッセージ）

Channel ID には **LINE WORKS のユーザー ID**（メールアドレス形式）を入力します：

```
例: yamada@example
例: admin@shopify-notify
```

これは LINE WORKS 管理画面の「メンバー管理」で確認できます。

#### グループのトークルームに送信する場合

トークルームの Channel ID を取得する方法：

1. Bot をトークルームに招待済みであることを確認
2. Bot が受信したメッセージの Webhook から Channel ID を取得
   - 現時点では API での一覧取得は不可

**推奨**: まずは個人宛（1:1 メッセージ）でテストすることをお勧めします。

---

## 6. テスト送信で動作確認

### 6.1 設定を保存

1. 全ての認証情報を入力したら「**設定を保存**」をクリック

2. 「設定を保存しました」と表示されれば成功

### 6.2 テストメッセージを送信

1. Bot ID と Channel ID（ユーザー ID）が入力されていることを確認

2. 「**テスト送信**」ボタンをクリック

3. 結果を確認：

   | 結果 | 意味 |
   |------|------|
   | 「テストメッセージを送信しました」 | 成功！LINE WORKS を確認してください |
   | エラーメッセージ | [トラブルシューティング](#8-トラブルシューティング) を参照 |

### 6.3 LINE WORKS でメッセージを確認

1. LINE WORKS アプリを開く

2. Bot からのメッセージが届いているか確認：
   ```
   [テスト送信]
   Order Notify for LINE WORKS からのテストメッセージです。
   送信日時: 2026/02/01 10:30:00
   ```

---

## 7. Shopify Flow でアクションを設定

テスト送信が成功したら、Shopify Flow で自動通知を設定します。

### 7.1 Shopify Flow を開く

1. Shopify 管理画面 → 「**アプリ**」→「**Flow**」

2. 「**ワークフローを作成**」をクリック

### 7.2 トリガーを選択

例：注文が作成されたときに通知

1. 「**トリガーを選択**」をクリック

2. 「**Order created**」（注文作成）を選択

### 7.3 アクションを追加

1. 「**+**」をクリックしてアクションを追加

2. 「**Send LINE WORKS Message**」を選択

3. アクションの設定：

   | フィールド | 入力例 |
   |------------|--------|
   | Bot ID | `12345678` |
   | Channel ID | `yamada@example` または トークルームの Channel ID |
   | Message | 下記参照 |

### 7.4 メッセージの設定

Liquid 変数を使って動的なメッセージを作成できます：

```
【新規注文】
注文番号: {{ order.name }}
お客様: {{ order.customer.displayName }}
合計金額: {{ order.totalPriceSet.shopMoney.amount }} {{ order.totalPriceSet.shopMoney.currencyCode }}
```

### 7.5 ワークフローを有効化

1. 「**ワークフローをオンにする**」をクリック

2. テスト注文を作成して動作確認

---

## 8. トラブルシューティング

### エラー別対処法

#### 「Failed to get access token: 401」

**原因**: 認証情報が間違っている

**対処**:
- Client ID が正しいか確認
- Client Secret が正しいか確認（再発行した場合は最新のものを使用）
- Service Account ID の形式を確認（`xxxxx.serviceaccount@example` 形式）
- Private Key が完全にコピーされているか確認

#### 「channelId is invalid」

**原因**: Channel ID（送信先）の形式が間違っている

**対処**:
- 個人宛の場合: ユーザー ID（メールアドレス形式）を使用
  - 例: `yamada@example`
- トークルームの場合: 正しい Channel ID を使用

#### 「channel does not exist」

**原因**: 指定した Channel ID のトークルームが存在しない、または Bot が参加していない

**対処**:
- Bot がトークルームに招待されているか確認
- Channel ID が正しいか確認

#### 「bot not found」

**原因**: Bot ID が間違っている

**対処**:
- Developer Console で Bot ID を再確認
- Bot が正しく作成されているか確認

#### 「Api not exists」

**原因**: 存在しない API エンドポイントにアクセスしている

**対処**:
- 最新版のアプリを使用しているか確認

### それでも解決しない場合

1. 全ての認証情報を再確認
2. Developer Console で Service Account と Bot が正しく紐づいているか確認
3. LINE WORKS 管理者に権限を確認

---

## 取得した情報のまとめ

設定に必要な情報を以下の表にまとめておくと便利です：

| 項目 | 値 | 取得場所 |
|------|-----|----------|
| Client ID | | Developer Console → アプリ詳細 |
| Client Secret | | Developer Console → アプリ詳細（発行） |
| Service Account | | Developer Console → Service Account |
| Private Key | （ファイル保存） | Service Account → 発行 |
| Bot ID | | Developer Console → Bot 詳細 |
| 送信先 User ID | | LINE WORKS メンバー情報 |

---

## 参考リンク

| リソース | URL |
|----------|-----|
| LINE WORKS Developer Console | https://developers.worksmobile.com/console |
| LINE WORKS 管理者コンソール | https://admin.worksmobile.com |
| LINE WORKS API ドキュメント | https://developers.worksmobile.com/jp/docs |
| Shopify Flow ヘルプ | https://help.shopify.com/ja/manual/shopify-flow |
