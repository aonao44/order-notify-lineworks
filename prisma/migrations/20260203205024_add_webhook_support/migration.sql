-- CreateTable
CREATE TABLE "WebhookSetting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "botId" TEXT,
    "channelId" TEXT,
    "template" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ShopifyWebhookSubscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "callbackUrl" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "payloadHash" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" DATETIME
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_MessageLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,
    "flowExecutionKey" TEXT,
    "source" TEXT NOT NULL DEFAULT 'flow',
    "topic" TEXT,
    "webhookEventId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_MessageLog" ("botId", "channelId", "createdAt", "errorMessage", "flowExecutionKey", "id", "message", "shop", "status") SELECT "botId", "channelId", "createdAt", "errorMessage", "flowExecutionKey", "id", "message", "shop", "status" FROM "MessageLog";
DROP TABLE "MessageLog";
ALTER TABLE "new_MessageLog" RENAME TO "MessageLog";
CREATE INDEX "MessageLog_shop_createdAt_idx" ON "MessageLog"("shop", "createdAt");
CREATE INDEX "MessageLog_shop_flowExecutionKey_idx" ON "MessageLog"("shop", "flowExecutionKey");
CREATE INDEX "MessageLog_shop_source_idx" ON "MessageLog"("shop", "source");
CREATE TABLE "new_RetryJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "nextAttemptAt" DATETIME NOT NULL,
    "lastError" TEXT,
    "flowExecutionKey" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'flow',
    "topic" TEXT,
    "webhookEventId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_RetryJob" ("attemptCount", "botId", "channelId", "createdAt", "flowExecutionKey", "id", "lastError", "maxAttempts", "message", "nextAttemptAt", "shop", "status", "targetType", "updatedAt") SELECT "attemptCount", "botId", "channelId", "createdAt", "flowExecutionKey", "id", "lastError", "maxAttempts", "message", "nextAttemptAt", "shop", "status", "targetType", "updatedAt" FROM "RetryJob";
DROP TABLE "RetryJob";
ALTER TABLE "new_RetryJob" RENAME TO "RetryJob";
CREATE INDEX "RetryJob_status_nextAttemptAt_idx" ON "RetryJob"("status", "nextAttemptAt");
CREATE UNIQUE INDEX "RetryJob_shop_flowExecutionKey_key" ON "RetryJob"("shop", "flowExecutionKey");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "WebhookSetting_shop_idx" ON "WebhookSetting"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookSetting_shop_topic_key" ON "WebhookSetting"("shop", "topic");

-- CreateIndex
CREATE UNIQUE INDEX "ShopifyWebhookSubscription_shop_topic_key" ON "ShopifyWebhookSubscription"("shop", "topic");

-- CreateIndex
CREATE INDEX "WebhookEvent_shop_topic_idx" ON "WebhookEvent"("shop", "topic");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_shop_webhookId_key" ON "WebhookEvent"("shop", "webhookId");
