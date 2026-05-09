export const WEBHOOK_TOPICS = {
  ORDERS_CREATE: "orders/create",
  ORDERS_PAID: "orders/paid",
  FULFILLMENTS_CREATE: "fulfillments/create",
  ORDERS_CANCELLED: "orders/cancelled",
} as const;

export type WebhookTopic = (typeof WEBHOOK_TOPICS)[keyof typeof WEBHOOK_TOPICS];

export const WEBHOOK_TOPIC_LIST: WebhookTopic[] = [
  WEBHOOK_TOPICS.ORDERS_CREATE,
  WEBHOOK_TOPICS.ORDERS_PAID,
  WEBHOOK_TOPICS.FULFILLMENTS_CREATE,
  WEBHOOK_TOPICS.ORDERS_CANCELLED,
];

export const WEBHOOK_TOPIC_LABELS: Record<WebhookTopic, string> = {
  "orders/create": "注文作成",
  "orders/paid": "支払い完了",
  "fulfillments/create": "発送完了",
  "orders/cancelled": "注文キャンセル",
};

export const DEFAULT_TEMPLATES: Record<WebhookTopic, string> = {
  "orders/create": `🛒 新規注文
注文番号: {{orderName}}
商品: {{lineItems}}
金額: {{totalPrice}}
顧客: {{customerName}}`,
  "orders/paid": `💰 支払い完了
注文番号: {{orderName}}
商品: {{lineItems}}
金額: {{totalPrice}}`,
  "fulfillments/create": `📦 発送しました
注文番号: {{orderName}}
商品: {{lineItems}}
追跡番号: {{trackingNumber}}`,
  "orders/cancelled": `❌ 注文キャンセル
注文番号: {{orderName}}
商品: {{lineItems}}
理由: {{cancelReason}}`,
};

// テンプレートで使用可能な変数の説明
export const TEMPLATE_VARIABLES: Record<string, string> = {
  orderName: "注文番号（例: #1001）",
  lineItems: "商品一覧（例: Tシャツ x 2, パンツ）",
  totalPrice: "合計金額",
  customerName: "顧客名",
  trackingNumber: "追跡番号（発送時のみ）",
  cancelReason: "キャンセル理由（キャンセル時のみ）",
};
