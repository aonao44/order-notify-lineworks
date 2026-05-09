import type { WebhookTopic } from "../constants/webhookTopics";

interface ShopifyCustomer {
  first_name?: string;
  last_name?: string;
  email?: string;
}

interface ShopifyLineItem {
  title?: string;
  quantity?: number;
}

interface ShopifyOrder {
  name?: string;
  total_price?: string;
  customer?: ShopifyCustomer;
  cancel_reason?: string;
  line_items?: ShopifyLineItem[];
}

interface ShopifyFulfillment {
  tracking_number?: string;
  order?: ShopifyOrder;
}

type WebhookPayload = ShopifyOrder | ShopifyFulfillment;

/**
 * Shopify Webhook のペイロードからテンプレート用のコンテキストを生成
 */
export function buildTemplateContext(
  topic: WebhookTopic,
  payload: unknown
): Record<string, string> {
  const p = payload as Record<string, unknown>;

  // 注文系の共通データ
  const orderData = (p.order as ShopifyOrder | undefined) || (p as ShopifyOrder);
  const customer = orderData?.customer;

  const base: Record<string, string> = {
    orderName: String(orderData?.name ?? ""),
    totalPrice: formatPrice(orderData?.total_price),
    customerName: formatCustomerName(customer),
    lineItems: formatLineItems(orderData?.line_items),
  };

  switch (topic) {
    case "fulfillments/create": {
      const fulfillment = p as ShopifyFulfillment;
      return {
        ...base,
        orderName: String(fulfillment.order?.name ?? base.orderName),
        trackingNumber: String(fulfillment.tracking_number ?? "なし"),
      };
    }
    case "orders/cancelled": {
      const order = p as ShopifyOrder;
      return {
        ...base,
        cancelReason: formatCancelReason(order.cancel_reason),
      };
    }
    default:
      return base;
  }
}

function formatPrice(price: string | undefined): string {
  if (!price) return "";
  // 数値の場合はカンマ区切りにする
  const num = parseFloat(price);
  if (isNaN(num)) return price;
  return `¥${num.toLocaleString("ja-JP")}`;
}

function formatCustomerName(customer: ShopifyCustomer | undefined): string {
  if (!customer) return "ゲスト";
  const name = [customer.last_name, customer.first_name]
    .filter(Boolean)
    .join(" ");
  return name || "ゲスト";
}

function formatCancelReason(reason: string | undefined): string {
  if (!reason) return "指定なし";

  // Shopify のキャンセル理由を日本語に変換
  const reasons: Record<string, string> = {
    customer: "お客様都合",
    fraud: "不正注文",
    inventory: "在庫切れ",
    declined: "支払い拒否",
    other: "その他",
  };

  return reasons[reason] ?? reason;
}

function formatLineItems(lineItems: ShopifyLineItem[] | undefined): string {
  if (!lineItems || lineItems.length === 0) return "";

  return lineItems
    .map((item) => {
      const title = item.title ?? "不明な商品";
      const qty = item.quantity ?? 1;
      return qty > 1 ? `${title} x ${qty}` : title;
    })
    .join(", ");
}
