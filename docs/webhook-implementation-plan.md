# Webhook 実装計画

## 概要

Shopify Flow に依存しない直接 Webhook 対応を追加し、Basic プランを含む全プランで動作可能にする。

## 対応イベント

| イベント | トピック | 用途 |
|---------|---------|------|
| 注文作成 | `orders/create` | 新規注文通知 |
| 支払い完了 | `orders/paid` | 支払い確認通知 |
| 発送完了 | `fulfillments/create` | 発送通知 |
| 注文キャンセル | `orders/cancelled` | キャンセル通知 |

## 工数見積

| ステップ | 時間 |
|---------|------|
| 1. Prisma スキーマ | 1-2h |
| 2. トピック定義・テンプレート | 1-2h |
| 3. Webhook 登録サービス | 1-2h |
| 4. 設定 Loader/Action | 2-4h |
| 5. Polaris UI | 2-4h |
| 6. Webhook 受信ルート | 2-4h |
| 7. リトライ拡張 | 1-2h |
| 8. ログ画面更新 | 1h |
| 9. テスト | 1-2h |
| **合計** | **12-23h** |

---

## Step 1: Prisma スキーマ変更

**対象ファイル:** `prisma/schema.prisma`

### 追加するモデル

```prisma
// Webhook 設定（shop ごと、topic ごと）
model WebhookSetting {
  id        String   @id @default(uuid())
  shop      String
  topic     String   // orders/create, orders/paid, etc.
  enabled   Boolean  @default(false)
  botId     String?
  channelId String?
  template  String   @default("")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([shop, topic])
  @@index([shop])
}

// Shopify 側の Webhook 登録状態
model ShopifyWebhookSubscription {
  id             String   @id @default(uuid())
  shop           String
  topic          String
  subscriptionId String   // Shopify REST API の webhook ID
  callbackUrl    String
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@unique([shop, topic])
}

// 冪等性チェック用（重複配信防止）
model WebhookEvent {
  id          String    @id @default(uuid())
  shop        String
  topic       String
  webhookId   String    // X-Shopify-Webhook-Id ヘッダー
  status      String    @default("processing") // processing | succeeded | failed | skipped
  payloadHash String?
  createdAt   DateTime  @default(now())
  processedAt DateTime?

  @@unique([shop, webhookId])
  @@index([shop, topic])
}
```

### 既存モデルへの追加

```prisma
// MessageLog に追加
model MessageLog {
  // ... 既存フィールド
  source         String   @default("flow")  // "flow" | "webhook"
  topic          String?                     // webhook の場合のみ
  webhookEventId String?                     // WebhookEvent.id への参照
}

// RetryJob に追加
model RetryJob {
  // ... 既存フィールド
  source         String   @default("flow")
  topic          String?
  webhookEventId String?
}
```

### Gotchas
- 既存データには `source = "flow"` がデフォルトで入る
- `flowExecutionKey` は Webhook でも必須（`webhook:{webhookEventId}` 形式で入れる）

### マイグレーション
```bash
npx prisma migrate dev --name add_webhook_support
```

---

## Step 2: トピック定義・テンプレートヘルパー

**対象ファイル:**
- `app/constants/webhookTopics.ts`（新規）
- `app/services/template.server.ts`（新規）
- `app/services/webhookPayload.server.ts`（新規）

### webhookTopics.ts

```typescript
export const WEBHOOK_TOPICS = {
  ORDERS_CREATE: "orders/create",
  ORDERS_PAID: "orders/paid",
  FULFILLMENTS_CREATE: "fulfillments/create",
  ORDERS_CANCELLED: "orders/cancelled",
} as const;

export type WebhookTopic = typeof WEBHOOK_TOPICS[keyof typeof WEBHOOK_TOPICS];

export const WEBHOOK_TOPIC_LABELS: Record<WebhookTopic, string> = {
  "orders/create": "注文作成",
  "orders/paid": "支払い完了",
  "fulfillments/create": "発送完了",
  "orders/cancelled": "注文キャンセル",
};

export const DEFAULT_TEMPLATES: Record<WebhookTopic, string> = {
  "orders/create": `🛒 新規注文
注文番号: {{orderName}}
金額: {{totalPrice}}
顧客: {{customerName}}`,
  "orders/paid": `💰 支払い完了
注文番号: {{orderName}}
金額: {{totalPrice}}`,
  "fulfillments/create": `📦 発送しました
注文番号: {{orderName}}
追跡番号: {{trackingNumber}}`,
  "orders/cancelled": `❌ 注文キャンセル
注文番号: {{orderName}}
理由: {{cancelReason}}`,
};
```

### template.server.ts

```typescript
export function renderTemplate(
  template: string,
  context: Record<string, string>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    return context[key] ?? "";
  });
}
```

### webhookPayload.server.ts

```typescript
import type { WebhookTopic } from "../constants/webhookTopics";

export function buildTemplateContext(
  topic: WebhookTopic,
  payload: unknown
): Record<string, string> {
  const p = payload as Record<string, unknown>;

  const base = {
    orderName: String(p.name ?? p.order?.name ?? ""),
    totalPrice: String(p.total_price ?? p.order?.total_price ?? ""),
    customerName: [
      p.customer?.first_name,
      p.customer?.last_name,
    ].filter(Boolean).join(" ") || "ゲスト",
  };

  switch (topic) {
    case "fulfillments/create":
      return {
        ...base,
        orderName: String(p.order?.name ?? ""),
        trackingNumber: String(p.tracking_number ?? "なし"),
      };
    case "orders/cancelled":
      return {
        ...base,
        cancelReason: String(p.cancel_reason ?? "不明"),
      };
    default:
      return base;
  }
}
```

### Gotchas
- Shopify payload はネストが深い（`billing_address.city` など）
- `undefined` は空文字に変換
- LINE WORKS は絵文字を受け付ける

---

## Step 3: Webhook 登録/解除サービス

**対象ファイル:** `app/services/shopifyWebhook.server.ts`（新規）

```typescript
import type { Session } from "@shopify/shopify-api";
import shopify from "../shopify.server";
import prisma from "../db.server";

export async function syncWebhookSubscription(
  session: Session,
  topic: string,
  enabled: boolean
): Promise<void> {
  const shop = session.shop;
  const callbackUrl = `${process.env.SHOPIFY_APP_URL}/webhooks/shopify`;

  const client = new shopify.api.clients.Rest({ session });

  const existing = await prisma.shopifyWebhookSubscription.findUnique({
    where: { shop_topic: { shop, topic } },
  });

  if (enabled) {
    if (existing) return; // 既に登録済み

    try {
      const response = await client.post({
        path: "webhooks",
        data: {
          webhook: {
            topic,
            format: "json",
            address: callbackUrl,
          },
        },
      });

      const webhookId = (response.body as any).webhook.id;

      await prisma.shopifyWebhookSubscription.create({
        data: {
          shop,
          topic,
          subscriptionId: String(webhookId),
          callbackUrl,
        },
      });
    } catch (error: any) {
      // 422 = 既に存在する場合
      if (error.response?.code !== 422) {
        throw error;
      }
    }
  } else {
    // 無効化: 登録があれば削除
    if (existing) {
      try {
        await client.delete({
          path: `webhooks/${existing.subscriptionId}`,
        });
      } catch {
        // 削除失敗は無視（既に消えている可能性）
      }
      await prisma.shopifyWebhookSubscription.delete({
        where: { id: existing.id },
      });
    }
  }
}
```

### Gotchas
- Basic プランは HTTP webhook のみ（Event Bridge 不可）
- callback URL は公開 HTTPS 必須
- session の offline token が切れていると 401 エラー
- 422 は「既に存在」なので握りつぶす

---

## Step 4: 設定の Loader/Action

**対象ファイル:** `app/routes/app._index.tsx`（または新規 `app/routes/app.webhooks.tsx`）

### Loader に追加

```typescript
// 既存の configuration 取得に加えて
const webhookSettings = await prisma.webhookSetting.findMany({
  where: { shop },
});

return json({
  configuration: ...,
  webhookSettings,
});
```

### Action に intent 追加

```typescript
if (intent === "updateWebhook") {
  const topic = formData.get("topic") as string;
  const enabled = formData.get("enabled") === "true";
  const botId = formData.get("botId") as string;
  const channelId = formData.get("channelId") as string;
  const template = formData.get("template") as string;

  // バリデーション: 有効化時は botId, channelId 必須
  if (enabled && (!botId || !channelId)) {
    return json({
      success: false,
      message: "Bot ID と送信先は必須です",
    });
  }

  // 設定を保存
  await prisma.webhookSetting.upsert({
    where: { shop_topic: { shop, topic } },
    update: { enabled, botId, channelId, template },
    create: { shop, topic, enabled, botId, channelId, template },
  });

  // Shopify に登録/解除
  const { session } = await authenticate.admin(request);
  await syncWebhookSubscription(session, topic, enabled);

  return json({
    success: true,
    message: enabled ? "Webhook を有効にしました" : "Webhook を無効にしました",
  });
}
```

### Gotchas
- LINE WORKS 認証情報（Configuration）がないと送信できない → チェック追加
- botId/channelId 未入力で有効化しようとしたらエラー
- 既存の Flow 設定保存と干渉しないよう `intent` で分岐

---

## Step 5: Polaris UI

**対象ファイル:** `app/routes/app._index.tsx`（または `app/components/WebhookSettingsSection.tsx`）

### UI 構成

```
[Webhook 設定]
├── [注文作成] ☑ 有効
│   ├── Bot ID: [________]
│   ├── 送信先: [________]
│   └── テンプレート: [テキストエリア]
├── [支払い完了] ☐ 無効
│   └── (無効時はフィールド非表示 or disabled)
├── [発送完了] ...
└── [注文キャンセル] ...
```

### 利用可能な変数の説明

```
{{orderName}} - 注文番号
{{totalPrice}} - 合計金額
{{customerName}} - 顧客名
{{trackingNumber}} - 追跡番号（発送時のみ）
{{cancelReason}} - キャンセル理由（キャンセル時のみ）
```

### Gotchas
- Checkbox + TextField の組み合わせ
- テンプレートは `multiline` で複数行対応
- 保存成功時のトースト表示

---

## Step 6: Webhook 受信ルート

**対象ファイル:** `app/routes/webhooks.shopify.tsx`（新規）

```typescript
import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { sendMessage } from "../services/lineworks.server";
import { getDecryptedPrivateKey } from "../services/encryption.server";
import { isRetryableError, calculateNextAttemptTime } from "../services/retry.server";
import { renderTemplate } from "../services/template.server";
import { buildTemplateContext } from "../services/webhookPayload.server";
import { DEFAULT_TEMPLATES } from "../constants/webhookTopics";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);
  const webhookId = request.headers.get("X-Shopify-Webhook-Id") || "";
  const normalizedTopic = topic.toLowerCase();

  // 1. 設定を確認
  const setting = await prisma.webhookSetting.findUnique({
    where: { shop_topic: { shop, topic: normalizedTopic } },
  });

  if (!setting?.enabled) {
    // 無効な topic は記録してスキップ
    await prisma.webhookEvent.upsert({
      where: { shop_webhookId: { shop, webhookId } },
      update: { status: "skipped" },
      create: { shop, topic: normalizedTopic, webhookId, status: "skipped" },
    });
    return new Response("skipped", { status: 200 });
  }

  // 2. 冪等性チェック（重複配信防止）
  let eventRecord;
  try {
    eventRecord = await prisma.webhookEvent.create({
      data: { shop, topic: normalizedTopic, webhookId, status: "processing" },
    });
  } catch (error: any) {
    if (error.code === "P2002") {
      // Unique constraint = 重複
      return new Response("duplicate", { status: 200 });
    }
    throw error;
  }

  // 3. 認証情報を取得
  const configuration = await prisma.configuration.findUnique({
    where: { shop },
  });

  if (!configuration) {
    await prisma.webhookEvent.update({
      where: { id: eventRecord.id },
      data: { status: "failed" },
    });
    return new Response("no configuration", { status: 200 });
  }

  // 4. メッセージ生成
  const context = buildTemplateContext(normalizedTopic as any, payload);
  const template = setting.template || DEFAULT_TEMPLATES[normalizedTopic as keyof typeof DEFAULT_TEMPLATES] || "";
  const message = renderTemplate(template, context);

  // 5. 送信
  const targetType = setting.channelId!.includes("@") ? "user" : "channel";
  const decryptedPrivateKey = getDecryptedPrivateKey(configuration.privateKey);

  try {
    await sendMessage(
      {
        clientId: configuration.clientId,
        clientSecret: configuration.clientSecret,
        serviceAccount: configuration.serviceAccount,
        privateKey: decryptedPrivateKey,
      },
      {
        botId: setting.botId!,
        channelId: setting.channelId!,
        message,
        targetType,
      }
    );

    // 成功
    await prisma.$transaction([
      prisma.webhookEvent.update({
        where: { id: eventRecord.id },
        data: { status: "succeeded", processedAt: new Date() },
      }),
      prisma.messageLog.create({
        data: {
          shop,
          botId: setting.botId!,
          channelId: setting.channelId!,
          message: message.slice(0, 200),
          status: "success",
          source: "webhook",
          topic: normalizedTopic,
          webhookEventId: eventRecord.id,
        },
      }),
    ]);

    return new Response("ok", { status: 200 });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    if (isRetryableError(error)) {
      // リトライキューに追加
      await prisma.retryJob.create({
        data: {
          shop,
          botId: setting.botId!,
          channelId: setting.channelId!,
          message,
          targetType,
          status: "pending",
          attemptCount: 1,
          nextAttemptAt: calculateNextAttemptTime(1),
          lastError: errorMsg.slice(0, 500),
          flowExecutionKey: `webhook:${eventRecord.id}`,
          source: "webhook",
          topic: normalizedTopic,
          webhookEventId: eventRecord.id,
        },
      });
    } else {
      // リトライ不可は即失敗
      await prisma.messageLog.create({
        data: {
          shop,
          botId: setting.botId!,
          channelId: setting.channelId!,
          message: message.slice(0, 200),
          status: "failed",
          errorMessage: errorMsg.slice(0, 500),
          source: "webhook",
          topic: normalizedTopic,
          webhookEventId: eventRecord.id,
        },
      });
    }

    await prisma.webhookEvent.update({
      where: { id: eventRecord.id },
      data: { status: "failed" },
    });

    // Shopify には 200 を返す（リトライさせない）
    return new Response("error logged", { status: 200 });
  }
};
```

### Gotchas
- `authenticate.webhook` で HMAC 検証は自動
- Shopify には常に 200 を返す（5xx だと Shopify がリトライしてしまう）
- topic は小文字で正規化
- 冪等性は `X-Shopify-Webhook-Id` で判定

---

## Step 7: リトライワーカー拡張

**対象ファイル:** `app/services/retryWorker.server.ts`

### 変更点

成功/失敗時に `webhookEventId` があれば `WebhookEvent` も更新:

```typescript
// 成功時
await prisma.$transaction([
  prisma.retryJob.update({ ... }),
  prisma.messageLog.create({
    data: {
      // ... 既存フィールド
      source: job.source,
      topic: job.topic,
      webhookEventId: job.webhookEventId,
    },
  }),
  // Webhook の場合は WebhookEvent も更新
  ...(job.webhookEventId
    ? [
        prisma.webhookEvent.update({
          where: { id: job.webhookEventId },
          data: { status: "succeeded", processedAt: new Date() },
        }),
      ]
    : []),
]);
```

### Gotchas
- 既存ジョブ（`source` なし）がある状態でデプロイすると問題 → マイグレーションでデフォルト値設定

---

## Step 8: ログ画面更新

**対象ファイル:** `app/routes/app.logs.tsx`

### 追加する列

| 列 | 内容 |
|----|------|
| Source | Flow / Webhook |
| Topic | orders/create など（Webhook のみ） |

### フィルタ追加

```
[すべて] [Flow のみ] [Webhook のみ]
```

---

## Step 9: テスト

### 手動テスト項目

1. **設定保存テスト**
   - [ ] Webhook を有効化 → Shopify に登録される
   - [ ] Webhook を無効化 → Shopify から削除される
   - [ ] botId/channelId 未入力で有効化 → エラー

2. **通知テスト**
   - [ ] Shopify Admin → Settings → Notifications → "Send test notification" で各 topic をテスト
   - [ ] LINE WORKS にメッセージが届く
   - [ ] テンプレートの変数が正しく展開される

3. **冪等性テスト**
   - [ ] 同じ webhookId を2回送る → 2回目は "duplicate" でスキップ

4. **リトライテスト**
   - [ ] 一時的に LINE WORKS 認証情報を壊す → RetryJob に入る
   - [ ] 認証情報を戻す → リトライで成功

5. **Flow との共存テスト**
   - [ ] Flow Action が引き続き動作する
   - [ ] Flow と Webhook 両方有効でも問題ない

---

## 実装順序まとめ

```
Step 1 (Prisma)
    ↓
Step 2 (定数・ヘルパー)
    ↓
Step 3 (登録サービス)
    ↓
Step 4 (Loader/Action)
    ↓
Step 5 (UI) ←→ Step 6 (受信ルート) [並行可]
    ↓
Step 7 (リトライ拡張)
    ↓
Step 8 (ログ画面)
    ↓
Step 9 (テスト)
```

---

## 注意事項

1. **デプロイ順序**: マイグレーション → コードデプロイ → ワーカー再起動
2. **既存データ**: `source` カラムは `"flow"` がデフォルト
3. **Shopify への応答**: 常に 200 を返す（5xx だと Shopify がリトライする）
4. **認証情報チェック**: Webhook 有効化前に LINE WORKS 設定が完了しているか確認
