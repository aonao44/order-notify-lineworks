import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { sendMessage } from "../services/lineworks.server";
import { getDecryptedPrivateKey } from "../services/encryption.server";
import { isRetryableError, calculateNextAttemptTime } from "../services/retry.server";
import { renderTemplate } from "../services/template.server";
import { buildTemplateContext } from "../services/webhookPayload.server";
import { DEFAULT_TEMPLATES, type WebhookTopic } from "../constants/webhookTopics";

export const action = async ({ request }: ActionFunctionArgs) => {
  // HMAC 検証は authenticate.webhook が自動で行う
  const { topic, shop, payload } = await authenticate.webhook(request);
  const webhookId = request.headers.get("X-Shopify-Webhook-Id") || `unknown-${Date.now()}`;
  // Shopify は "ORDERS_CREATE" 形式で送信するため "orders/create" に変換
  const normalizedTopic = topic.toLowerCase().replace(/_/g, "/") as WebhookTopic;

  console.log(`[Webhook] Received: ${normalizedTopic} for ${shop} (ID: ${webhookId})`);

  // ペイロードから注文IDを抽出（重複チェック用）
  const payloadData = payload as { id?: number; order_id?: number };
  const orderId = payloadData.id || payloadData.order_id;

  // 0. 時間窓ベースの重複チェック（同じ注文・トピックが10秒以内に来たらスキップ）
  if (orderId) {
    const recentEvent = await prisma.webhookEvent.findFirst({
      where: {
        shop,
        topic: normalizedTopic,
        orderId: String(orderId),
        createdAt: { gte: new Date(Date.now() - 10000) }, // 10秒以内
        status: { in: ["processing", "succeeded"] },
      },
    });
    if (recentEvent) {
      console.log(`[Webhook] Duplicate detected (time window): ${normalizedTopic} order ${orderId}`);
      return new Response("duplicate", { status: 200 });
    }
  }

  // 1. 設定を確認
  const setting = await prisma.webhookSetting.findUnique({
    where: { shop_topic: { shop, topic: normalizedTopic } },
  });

  if (!setting?.enabled) {
    // 無効な topic は記録してスキップ
    console.log(`[Webhook] Skipped (not enabled): ${normalizedTopic} for ${shop}`);
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
      data: { shop, topic: normalizedTopic, webhookId, orderId: orderId ? String(orderId) : null, status: "processing" },
    });
  } catch (error: unknown) {
    const prismaError = error as { code?: string };
    if (prismaError.code === "P2002") {
      // Unique constraint violation = 重複
      console.log(`[Webhook] Duplicate detected: ${webhookId}`);
      return new Response("duplicate", { status: 200 });
    }
    throw error;
  }

  // 3. 認証情報を取得
  const configuration = await prisma.configuration.findUnique({
    where: { shop },
  });

  if (!configuration) {
    console.error(`[Webhook] No configuration found for ${shop}`);
    await prisma.webhookEvent.update({
      where: { id: eventRecord.id },
      data: { status: "failed" },
    });
    return new Response("no configuration", { status: 200 });
  }

  // 4. メッセージ生成
  const context = buildTemplateContext(normalizedTopic, payload);
  const template = setting.template || DEFAULT_TEMPLATES[normalizedTopic] || "";
  const message = renderTemplate(template, context);

  // 5. 送信
  const botId = setting.botId!;
  const channelId = setting.channelId!;
  const targetType = channelId.includes("@") ? "user" : "channel";

  try {
    const decryptedPrivateKey = getDecryptedPrivateKey(configuration.privateKey);

    await sendMessage(
      {
        clientId: configuration.clientId,
        clientSecret: configuration.clientSecret,
        serviceAccount: configuration.serviceAccount,
        privateKey: decryptedPrivateKey,
      },
      {
        botId,
        channelId,
        message,
        targetType,
      }
    );

    // 成功
    console.log(`[Webhook] Sent successfully: ${normalizedTopic} for ${shop}`);
    await prisma.$transaction([
      prisma.webhookEvent.update({
        where: { id: eventRecord.id },
        data: { status: "succeeded", processedAt: new Date() },
      }),
      prisma.messageLog.create({
        data: {
          shop,
          botId,
          channelId,
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
    console.error(`[Webhook] Send failed: ${normalizedTopic} for ${shop}:`, errorMsg);

    if (isRetryableError(error)) {
      // リトライキューに追加
      console.log(`[Webhook] Queued for retry: ${normalizedTopic} for ${shop}`);
      await prisma.retryJob.create({
        data: {
          shop,
          botId,
          channelId,
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

      await prisma.webhookEvent.update({
        where: { id: eventRecord.id },
        data: { status: "failed" },
      });
    } else {
      // リトライ不可は即失敗
      await prisma.$transaction([
        prisma.webhookEvent.update({
          where: { id: eventRecord.id },
          data: { status: "failed" },
        }),
        prisma.messageLog.create({
          data: {
            shop,
            botId,
            channelId,
            message: message.slice(0, 200),
            status: "failed",
            errorMessage: errorMsg.slice(0, 500),
            source: "webhook",
            topic: normalizedTopic,
            webhookEventId: eventRecord.id,
          },
        }),
      ]);
    }

    // Shopify には 200 を返す（5xx だと Shopify がリトライしてしまう）
    return new Response("error logged", { status: 200 });
  }
};
