-- AlterTable
ALTER TABLE "MessageLog" ADD COLUMN "flowExecutionKey" TEXT;

-- CreateTable
CREATE TABLE "RetryJob" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "RetryJob_status_nextAttemptAt_idx" ON "RetryJob"("status", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "RetryJob_shop_flowExecutionKey_key" ON "RetryJob"("shop", "flowExecutionKey");

-- CreateIndex
CREATE INDEX "MessageLog_shop_flowExecutionKey_idx" ON "MessageLog"("shop", "flowExecutionKey");
