# 将来実装: Webhook 直接対応

## 背景

現在の実装は **Shopify Flow** を前提としているが、Flow は全プランで利用できない。

| Shopify プラン | Flow 利用可否 |
|---------------|--------------|
| Basic | ❌ 利用不可 |
| Shopify (Standard) | ⭕ 利用可能 |
| Advanced | ⭕ 利用可能 |
| Plus | ⭕ 利用可能 |

Basic プランの店舗は Flow を使えないため、現在のアプリを利用できない。

## 推奨される改善

### Webhook 直接受信方式の追加

Shopify の標準 Webhook を直接受け取り、Flow を経由せずに LINE WORKS に通知を送信する。

**メリット:**
- 全プランで動作（Basic 含む）
- 潜在顧客の拡大
- シンプルな設定（Flow の知識不要）

**デメリット:**
- カスタマイズ性が低い（Flow ほど柔軟でない）
- 対応する Webhook を事前に決める必要がある

## 実装案

### 1. 対応する Webhook イベント

| イベント | トピック | 用途 |
|---------|---------|------|
| 注文作成 | `orders/create` | 新規注文通知 |
| 注文支払い完了 | `orders/paid` | 支払い確認通知 |
| 発送完了 | `fulfillments/create` | 発送通知 |
| 注文キャンセル | `orders/cancelled` | キャンセル通知 |
| 在庫低下 | `inventory_levels/update` | 在庫アラート |

### 2. 設定 UI の追加

アプリ設定画面に以下を追加:

```
□ 注文作成時に通知
□ 支払い完了時に通知
□ 発送完了時に通知
□ キャンセル時に通知
□ 在庫が [__] 以下になったら通知
```

### 3. メッセージテンプレート

各イベントごとにデフォルトのメッセージテンプレートを用意し、ユーザーがカスタマイズ可能にする。

### 4. アーキテクチャ

```
[Shopify Webhook]
    ↓
[/webhooks/orders/create など]
    ↓
[Configuration から設定を取得]
    ↓
[テンプレートにデータを埋め込み]
    ↓
[LINE WORKS API 送信]
```

## 移行戦略

1. **Phase 1 (現在)**: Flow Action のみ対応（MVP）
2. **Phase 2**: Webhook 直接対応を追加（Flow と併存）
3. **Phase 3**: App Store 公開時に両方をサポート

## 参考

- [Shopify Webhooks ドキュメント](https://shopify.dev/docs/apps/webhooks)
- [Shopify Flow 対応プラン](https://help.shopify.com/en/manual/shopify-flow)

## 関連する App Store 対策

App Store 公開時、説明文に以下を明記:

- 「Shopify Flow 対応プラン、または Webhook モードで全プラン対応」
- 「Basic プランの方は Webhook モードをご利用ください」

これにより「Flow 使えません」系の低評価を防ぐ。
