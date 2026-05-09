import prisma from "../db.server";
import { sendMessage, LineWorksError } from "./lineworks.server";
import { isRetryableError, calculateNextAttemptTime } from "./retry.server";
import { getDecryptedPrivateKey } from "./encryption.server";

const BATCH_SIZE = 5;
const WORKER_INTERVAL_MS = 30000; // 30秒
const DELAY_BETWEEN_SENDS_MS = 500; // 送信間隔

let isWorkerRunning = false;

/**
 * リトライワーカーを開始する
 */
export function startRetryWorker(): void {
  if (isWorkerRunning) {
    console.log("[RetryWorker] Already running, skipping...");
    return;
  }

  isWorkerRunning = true;
  console.log("[RetryWorker] Starting...");

  setInterval(async () => {
    try {
      await processRetryJobs();
    } catch (error) {
      console.error("[RetryWorker] Error processing jobs:", error);
    }
  }, WORKER_INTERVAL_MS);
}

/**
 * 保留中のリトライジョブを処理する
 */
async function processRetryJobs(): Promise<void> {
  const now = new Date();

  // 処理対象のジョブを取得
  const jobs = await prisma.retryJob.findMany({
    where: {
      status: "pending",
      nextAttemptAt: { lte: now },
    },
    take: BATCH_SIZE,
    orderBy: { nextAttemptAt: "asc" },
  });

  if (jobs.length === 0) {
    return;
  }

  console.log(`[RetryWorker] Processing ${jobs.length} jobs...`);

  for (const job of jobs) {
    // ジョブを processing に更新
    await prisma.retryJob.update({
      where: { id: job.id },
      data: { status: "processing" },
    });

    try {
      // 設定を取得
      const configuration = await prisma.configuration.findUnique({
        where: { shop: job.shop },
      });

      if (!configuration) {
        console.error(`[RetryWorker] Configuration not found for shop: ${job.shop}`);
        await markJobAsDead(job.id, "Configuration not found");
        continue;
      }

      // Private Key を復号
      const decryptedPrivateKey = getDecryptedPrivateKey(configuration.privateKey);

      // メッセージを送信
      await sendMessage(
        {
          clientId: configuration.clientId,
          clientSecret: configuration.clientSecret,
          serviceAccount: configuration.serviceAccount,
          privateKey: decryptedPrivateKey,
        },
        {
          botId: job.botId,
          channelId: job.channelId,
          message: job.message,
          targetType: job.targetType as "user" | "channel",
        }
      );

      // 成功: ジョブを完了にし、成功ログを記録
      await prisma.$transaction([
        prisma.retryJob.update({
          where: { id: job.id },
          data: { status: "completed" },
        }),
        prisma.messageLog.create({
          data: {
            shop: job.shop,
            botId: job.botId,
            channelId: job.channelId,
            message: job.message.slice(0, 200),
            status: "success",
            flowExecutionKey: job.flowExecutionKey,
            source: job.source,
            topic: job.topic,
            webhookEventId: job.webhookEventId,
          },
        }),
      ]);

      // Webhook の場合は WebhookEvent も更新
      if (job.webhookEventId) {
        await prisma.webhookEvent.update({
          where: { id: job.webhookEventId },
          data: { status: "succeeded", processedAt: new Date() },
        });
      }

      console.log(`[RetryWorker] Job ${job.id} succeeded after ${job.attemptCount + 1} attempts`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const newAttemptCount = job.attemptCount + 1;

      console.error(`[RetryWorker] Job ${job.id} failed (attempt ${newAttemptCount}):`, errorMessage);

      // 最大試行回数に達した、またはリトライ不可能なエラー
      if (newAttemptCount >= job.maxAttempts || !isRetryableError(error)) {
        await markJobAsDead(job.id, errorMessage);

        // 失敗ログを記録
        await prisma.messageLog.create({
          data: {
            shop: job.shop,
            botId: job.botId,
            channelId: job.channelId,
            message: job.message.slice(0, 200),
            status: "failed",
            errorMessage: `Failed after ${newAttemptCount} attempts: ${errorMessage}`.slice(0, 500),
            flowExecutionKey: job.flowExecutionKey,
            source: job.source,
            topic: job.topic,
            webhookEventId: job.webhookEventId,
          },
        });

        // Webhook の場合は WebhookEvent も更新
        if (job.webhookEventId) {
          await prisma.webhookEvent.update({
            where: { id: job.webhookEventId },
            data: { status: "failed" },
          });
        }
      } else {
        // 次のリトライをスケジュール
        await prisma.retryJob.update({
          where: { id: job.id },
          data: {
            status: "pending",
            attemptCount: newAttemptCount,
            nextAttemptAt: calculateNextAttemptTime(newAttemptCount),
            lastError: errorMessage.slice(0, 500),
          },
        });
      }
    }

    // 送信間隔を空ける（レート制限対策）
    await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_SENDS_MS));
  }
}

/**
 * ジョブを dead 状態にする
 */
async function markJobAsDead(jobId: string, errorMessage: string): Promise<void> {
  await prisma.retryJob.update({
    where: { id: jobId },
    data: {
      status: "dead",
      lastError: errorMessage.slice(0, 500),
    },
  });
}
