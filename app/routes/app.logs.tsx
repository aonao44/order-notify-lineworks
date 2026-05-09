import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  DataTable,
  Text,
  Badge,
  BlockStack,
  EmptyState,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate, BILLING_PLAN } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request, {
    billing: {
      plans: [BILLING_PLAN],
      onFailure: async () => {
        throw new Response("課金が必要です", { status: 402 });
      },
    },
  });
  const shop = session.shop;

  // 最新50件のログを取得
  const logs = await prisma.messageLog.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return json({ logs });
};

export default function LogsPage() {
  const { logs } = useLoaderData<typeof loader>();

  // トピック名を日本語に変換
  const topicLabels: Record<string, string> = {
    "orders/create": "注文作成",
    "orders/paid": "支払い完了",
    "fulfillments/create": "発送完了",
    "orders/cancelled": "キャンセル",
  };

  // DataTable 用に行データを変換
  const rows = logs.map((log) => [
    new Date(log.createdAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }),
    log.source === "webhook" ? (
      <Badge tone="info">Webhook</Badge>
    ) : (
      <Badge>Flow</Badge>
    ),
    log.topic ? topicLabels[log.topic] || log.topic : "-",
    log.status === "success" ? (
      <Badge tone="success">成功</Badge>
    ) : (
      <Badge tone="critical">失敗</Badge>
    ),
    log.botId,
    log.channelId.length > 20 ? `${log.channelId.slice(0, 20)}...` : log.channelId,
    log.message.length > 30 ? `${log.message.slice(0, 30)}...` : log.message,
    log.errorMessage || "-",
  ]);

  return (
    <Page
      backAction={{ content: "設定", url: "/app" }}
      title="送信履歴"
    >
      <TitleBar title="送信履歴" />
      <Layout>
        <Layout.Section>
          {logs.length === 0 ? (
            <Card>
              <EmptyState
                heading="送信履歴がありません"
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <Text as="p" variant="bodyMd">
                  Flow または Webhook からメッセージを送信すると、ここに履歴が表示されます。
                </Text>
              </EmptyState>
            </Card>
          ) : (
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  最新50件の送信履歴
                </Text>
                <DataTable
                  columnContentTypes={["text", "text", "text", "text", "text", "text", "text", "text"]}
                  headings={["日時", "ソース", "トピック", "ステータス", "Bot ID", "送信先", "メッセージ", "エラー"]}
                  rows={rows}
                />
              </BlockStack>
            </Card>
          )}
        </Layout.Section>
      </Layout>
    </Page>
  );
}
