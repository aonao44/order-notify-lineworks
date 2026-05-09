import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { sendMessage, LineWorksError } from "../services/lineworks.server";
import { isRetryableError, calculateNextAttemptTime } from "../services/retry.server";
import { getDecryptedPrivateKey } from "../services/encryption.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  // Flow Action は HMAC 認証を使用
  const { payload } = await authenticate.flow(request);
  const shop = payload.shopify_domain;

  // Flow 実行 ID（冪等性のために使用）
  const flowExecutionKey = payload.action_run_id || `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  try {
    const { bot_id, channel_id, message } = payload.properties as {
      bot_id: string;
      channel_id: string;
      message: string;
    };

    // 必須パラメータの検証
    if (!bot_id || !channel_id || !message) {
      console.error("Missing required parameters:", { bot_id, channel_id, message: !!message });
      return json(
        { error: "Missing required parameters: bot_id, channel_id, or message" },
        { status: 400 }
      );
    }

    // channel_id がメールアドレス形式なら user、それ以外は channel
    const targetType = channel_id.includes("@") ? "user" : "channel";

    // 既にこの Flow 実行が処理済みか確認（冪等性チェック）
    const existingLog = await prisma.messageLog.findFirst({
      where: { shop, flowExecutionKey },
    });
    if (existingLog) {
      console.log(`[FlowAction] Duplicate execution detected: ${flowExecutionKey}`);
      return json({ success: true, duplicate: true });
    }

    // リトライジョブが既に存在するか確認
    const existingJob = await prisma.retryJob.findUnique({
      where: { shop_flowExecutionKey: { shop, flowExecutionKey } },
    });
    if (existingJob) {
      console.log(`[FlowAction] Retry job already exists: ${flowExecutionKey}`);
      return json({ success: true, queued: true });
    }

    // 設定を取得
    const configuration = await prisma.configuration.findUnique({
      where: { shop },
    });

    if (!configuration) {
      console.error("Configuration not found for shop:", shop);
      return json(
        { error: "LINE WORKS configuration not found. Please configure the app first." },
        { status: 400 }
      );
    }

    // Private Key を復号
    const decryptedPrivateKey = getDecryptedPrivateKey(configuration.privateKey);

    // LINE WORKS にメッセージを送信
    await sendMessage(
      {
        clientId: configuration.clientId,
        clientSecret: configuration.clientSecret,
        serviceAccount: configuration.serviceAccount,
        privateKey: decryptedPrivateKey,
      },
      {
        botId: bot_id,
        channelId: channel_id,
        message,
        targetType,
      }
    );

    // 成功ログを記録（メッセージは200文字まで）
    await prisma.messageLog.create({
      data: {
        shop,
        botId: bot_id,
        channelId: channel_id,
        message: message.slice(0, 200),
        status: "success",
        flowExecutionKey,
      },
    });

    return json({ success: true });
  } catch (error) {
    // エラー情報を取得
    let errorMsg = "Unknown error";
    let statusCode = 500;

    if (error instanceof LineWorksError) {
      errorMsg = error.message;
      statusCode = error.statusCode || 500;
      console.error("LINE WORKS API error:", {
        message: error.message,
        statusCode: error.statusCode,
      });
    } else {
      errorMsg = error instanceof Error ? error.message : String(error);
      console.error("Unexpected error in flow action:", errorMsg);
    }

    const { bot_id, channel_id, message } = payload.properties as {
      bot_id?: string;
      channel_id?: string;
      message?: string;
    };

    // リトライ可能なエラーかどうか判定
    if (bot_id && channel_id && message && isRetryableError(error)) {
      // channel_id がメールアドレス形式なら user、それ以外は channel
      const targetType = channel_id.includes("@") ? "user" : "channel";

      // リトライジョブを作成
      try {
        await prisma.retryJob.create({
          data: {
            shop,
            botId: bot_id,
            channelId: channel_id,
            message,
            targetType,
            status: "pending",
            attemptCount: 1, // 今回の失敗で1回目
            nextAttemptAt: calculateNextAttemptTime(1),
            lastError: errorMsg.slice(0, 500),
            flowExecutionKey,
          },
        });
        console.log(`[FlowAction] Retry job created for: ${flowExecutionKey}`);
        return json({ success: false, queued: true, message: "Message queued for retry" });
      } catch (createError) {
        // 重複キーエラーの場合は既にキューに入っている
        console.log(`[FlowAction] Retry job may already exist: ${flowExecutionKey}`);
        return json({ success: false, queued: true, message: "Message already queued" });
      }
    }

    // リトライ不可能なエラーは即座に失敗ログを記録
    if (bot_id && channel_id) {
      await prisma.messageLog.create({
        data: {
          shop,
          botId: bot_id,
          channelId: channel_id,
          message: (message || "").slice(0, 200),
          status: "failed",
          errorMessage: errorMsg.slice(0, 500),
          flowExecutionKey,
        },
      });
    }

    // Private Key のフォーマットエラー
    if (errorMsg.includes("asymmetric key") || errorMsg.includes("PEM")) {
      return json(
        { error: "Private Key format is invalid. Please reconfigure the app with a valid PEM format key." },
        { status: 400 }
      );
    }

    if (error instanceof LineWorksError) {
      return json(
        { error: `LINE WORKS API error: ${errorMsg}` },
        { status: statusCode }
      );
    }

    return json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
};

// GET リクエストは許可しない
export const loader = () => {
  return json({ error: "Method not allowed" }, { status: 405 });
};
