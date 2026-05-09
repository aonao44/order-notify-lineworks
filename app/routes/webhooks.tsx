import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

/**
 * GDPR Compliance Webhook Handler
 *
 * Handles:
 * - customers/data_request: Customer requests their data
 * - customers/redact: Customer requests data deletion
 * - shop/redact: Shop uninstalls app, requests data deletion
 *
 * IMPORTANT: HMAC verification failure must return 401 (not 500)
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const { topic, shop, payload } = await authenticate.webhook(request);

    console.log(`[Compliance Webhook] Received: ${topic} for ${shop}`);

    // Normalize topic format
    const normalizedTopic = topic.toLowerCase().replace(/_/g, "/");

    switch (normalizedTopic) {
      case "customers/data_request":
        // Customer requested their data
        // In this app, we don't store customer PII beyond what Shopify provides
        // Log for audit purposes
        console.log(`[Compliance] Data request from ${shop}:`, {
          customer_id: (payload as { customer?: { id?: string } })?.customer?.id,
        });
        break;

      case "customers/redact":
        // Customer requested data deletion
        // We don't store customer data separately, so nothing to delete
        console.log(`[Compliance] Customer redact request from ${shop}:`, {
          customer_id: (payload as { customer?: { id?: string } })?.customer?.id,
        });
        break;

      case "shop/redact":
        // Shop uninstalled and requested data deletion
        // Note: app/uninstalled webhook already handles cleanup
        console.log(`[Compliance] Shop redact request from ${shop}`);
        break;

      default:
        console.log(`[Compliance] Unknown topic: ${normalizedTopic}`);
    }

    // Always return 200 for successful processing
    return new Response("ok", { status: 200 });

  } catch (error) {
    // HMAC verification failure or other auth errors must return 401
    console.error("[Compliance Webhook] Authentication failed:", error);
    return new Response("Unauthorized", { status: 401 });
  }
};
