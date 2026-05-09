import type { Session } from "@shopify/shopify-api";
import prisma from "../db.server";
import { WEBHOOK_TOPIC_LIST } from "../constants/webhookTopics";

// Admin GraphQL client type
type AdminGraphQL = {
  graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>;
};

// 宣言的に登録された Webhook トピック（shopify.app.toml で管理）
const DECLARATIVE_TOPICS = new Set(WEBHOOK_TOPIC_LIST);

/**
 * Shopify Webhook の登録/解除を管理する
 * enabled が true なら登録、false なら解除
 *
 * 宣言的 Webhook（TOML で定義）: API 呼び出し不要、DB のみ更新
 * 動的 Webhook: GraphQL API で登録/解除
 */
export async function syncWebhookSubscription(
  session: Session,
  topic: string,
  enabled: boolean,
  admin?: AdminGraphQL
): Promise<void> {
  const shop = session.shop;
  const callbackUrl = `${process.env.SHOPIFY_APP_URL}/webhooks/shopify`;

  // 宣言的 Webhook は API 呼び出し不要（TOML で自動登録される）
  if (DECLARATIVE_TOPICS.has(topic as typeof WEBHOOK_TOPIC_LIST[number])) {
    console.log(`[Webhook] Declarative webhook (managed by TOML): ${topic} for ${shop}`);
    // DB に登録状態を記録（実際の Webhook は Shopify が管理）
    if (enabled) {
      await prisma.shopifyWebhookSubscription.upsert({
        where: { shop_topic: { shop, topic } },
        update: { subscriptionId: "declarative", callbackUrl },
        create: { shop, topic, subscriptionId: "declarative", callbackUrl },
      });
    } else {
      await prisma.shopifyWebhookSubscription.deleteMany({
        where: { shop, topic },
      });
    }
    return;
  }

  // 以下は動的 Webhook の処理（将来の拡張用）
  const existing = await prisma.shopifyWebhookSubscription.findUnique({
    where: { shop_topic: { shop, topic } },
  });

  if (enabled) {
    // 有効化: 登録されていなければ登録
    if (existing) {
      console.log(`[Webhook] Already registered: ${topic} for ${shop}`);
      return;
    }

    if (!admin) {
      console.log(`[Webhook] Admin API not available, skipping Shopify registration`);
      // DB には記録しておく
      await prisma.shopifyWebhookSubscription.create({
        data: {
          shop,
          topic,
          subscriptionId: "pending",
          callbackUrl,
        },
      });
      return;
    }

    // GraphQL で Webhook を登録
    const response = await admin.graphql(
      `#graphql
      mutation webhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
        webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
          webhookSubscription {
            id
          }
          userErrors {
            field
            message
          }
        }
      }`,
      {
        variables: {
          topic: topic.toUpperCase().replace("/", "_"),
          webhookSubscription: {
            callbackUrl,
            format: "JSON",
          },
        },
      }
    );

    const data = await response.json();
    const result = data.data?.webhookSubscriptionCreate;

    if (result?.userErrors?.length > 0) {
      const errorMsg = result.userErrors.map((e: { message: string }) => e.message).join(", ");
      // "already exists" 系のエラーは成功として扱う
      if (errorMsg.toLowerCase().includes("already")) {
        console.log(`[Webhook] Already exists in Shopify: ${topic} for ${shop}`);
        // 既存の Webhook ID を取得して保存
        const existingId = await findExistingWebhookId(admin, topic, callbackUrl);
        await prisma.shopifyWebhookSubscription.upsert({
          where: { shop_topic: { shop, topic } },
          update: { subscriptionId: existingId, callbackUrl },
          create: { shop, topic, subscriptionId: existingId, callbackUrl },
        });
        return;
      }
      console.error(`[Webhook] GraphQL error: ${errorMsg}`);
      throw new Error(`Webhook 登録エラー: ${errorMsg}`);
    }

    const subscriptionId = result?.webhookSubscription?.id || "unknown";

    await prisma.shopifyWebhookSubscription.upsert({
      where: { shop_topic: { shop, topic } },
      update: { subscriptionId, callbackUrl },
      create: { shop, topic, subscriptionId, callbackUrl },
    });

    console.log(`[Webhook] Registered: ${topic} for ${shop} (ID: ${subscriptionId})`);
  } else {
    // 無効化: 登録があれば削除
    if (!existing) {
      console.log(`[Webhook] Not registered, nothing to delete: ${topic} for ${shop}`);
      return;
    }

    if (admin) {
      let subscriptionIdToDelete = existing.subscriptionId;

      // subscriptionId が不明な場合は検索して取得
      if (["unknown", "pending", "error", "existing-unknown"].includes(existing.subscriptionId)) {
        subscriptionIdToDelete = await findExistingWebhookId(admin, topic, existing.callbackUrl);
      }

      // 有効な ID があれば削除
      if (subscriptionIdToDelete && !["unknown", "pending", "error", "existing-unknown"].includes(subscriptionIdToDelete)) {
        try {
          await admin.graphql(
            `#graphql
            mutation webhookSubscriptionDelete($id: ID!) {
              webhookSubscriptionDelete(id: $id) {
                deletedWebhookSubscriptionId
                userErrors {
                  field
                  message
                }
              }
            }`,
            {
              variables: {
                id: subscriptionIdToDelete,
              },
            }
          );
          console.log(`[Webhook] Deleted from Shopify: ${topic} for ${shop}`);
        } catch (error) {
          console.warn(`[Webhook] Failed to delete from Shopify, may already be gone: ${topic}`);
        }
      }
    }

    await prisma.shopifyWebhookSubscription.delete({
      where: { id: existing.id },
    });
    console.log(`[Webhook] Removed from DB: ${topic} for ${shop}`);
  }
}

/**
 * 既存の Webhook ID を検索する
 */
async function findExistingWebhookId(
  admin: AdminGraphQL,
  topic: string,
  callbackUrl: string
): Promise<string> {
  try {
    const response = await admin.graphql(
      `#graphql
      query webhookSubscriptions($topic: WebhookSubscriptionTopic!) {
        webhookSubscriptions(first: 10, topics: [$topic]) {
          edges {
            node {
              id
              callbackUrl
            }
          }
        }
      }`,
      {
        variables: {
          topic: topic.toUpperCase().replace("/", "_"),
        },
      }
    );

    const data = await response.json();
    const edges = data.data?.webhookSubscriptions?.edges || [];

    for (const edge of edges) {
      if (edge.node.callbackUrl === callbackUrl) {
        return edge.node.id;
      }
    }
  } catch (error) {
    console.warn(`[Webhook] Failed to find existing webhook ID:`, error);
  }

  return "existing-unknown";
}

/**
 * 全ての Webhook 登録状態を同期する
 */
export async function syncAllWebhooks(session: Session, admin?: AdminGraphQL): Promise<void> {
  const shop = session.shop;

  const settings = await prisma.webhookSetting.findMany({
    where: { shop },
  });

  for (const setting of settings) {
    try {
      await syncWebhookSubscription(session, setting.topic, setting.enabled, admin);
    } catch (error) {
      console.error(`[Webhook] Failed to sync ${setting.topic}:`, error);
    }
  }
}
