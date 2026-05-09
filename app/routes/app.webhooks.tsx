import { useState, useCallback, useEffect } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useActionData, useSubmit } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  TextField,
  Checkbox,
  Button,
  Banner,
  Box,
  Divider,
  InlineStack,
  Badge,
  Collapsible,
  Link,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate, BILLING_PLAN } from "../shopify.server";
import prisma from "../db.server";
import { syncWebhookSubscription } from "../services/shopifyWebhook.server";
import {
  WEBHOOK_TOPIC_LIST,
  WEBHOOK_TOPIC_LABELS,
  DEFAULT_TEMPLATES,
  TEMPLATE_VARIABLES,
  type WebhookTopic,
} from "../constants/webhookTopics";

interface WebhookSettingData {
  topic: WebhookTopic;
  enabled: boolean;
  botId: string;
  channelId: string;
  template: string;
}

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

  // LINE WORKS 設定があるか確認
  const configuration = await prisma.configuration.findUnique({
    where: { shop },
  });

  // Webhook 設定を取得
  const settings = await prisma.webhookSetting.findMany({
    where: { shop },
  });

  // 全トピックのデータを生成（未設定のものはデフォルト値）
  const webhookSettings: WebhookSettingData[] = WEBHOOK_TOPIC_LIST.map((topic) => {
    const existing = settings.find((s) => s.topic === topic);
    return {
      topic,
      enabled: existing?.enabled ?? false,
      botId: existing?.botId ?? "",
      channelId: existing?.channelId ?? "",
      template: existing?.template ?? DEFAULT_TEMPLATES[topic],
    };
  });

  return json({
    webhookSettings,
    hasConfiguration: !!configuration,
    defaultBotId: configuration?.testBotId ?? "",
    defaultChannelId: configuration?.testChannelId ?? "",
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request, {
    billing: {
      plans: [BILLING_PLAN],
      onFailure: async () => {
        throw new Response("課金が必要です", { status: 402 });
      },
    },
  });
  const shop = session.shop;

  const formData = await request.formData();
  const topic = formData.get("topic") as string;
  const enabled = formData.get("enabled") === "true";
  const botId = (formData.get("botId") as string) || "";
  const channelId = (formData.get("channelId") as string) || "";
  const template = (formData.get("template") as string) || "";

  // LINE WORKS 設定がないと有効化できない
  const configuration = await prisma.configuration.findUnique({
    where: { shop },
  });

  if (enabled && !configuration) {
    return json({
      success: false,
      message: "先に LINE WORKS の設定を完了してください",
    });
  }

  // 有効化時は botId, channelId 必須
  if (enabled && (!botId || !channelId)) {
    return json({
      success: false,
      message: "Bot ID と送信先は必須です",
    });
  }

  // 設定を保存
  await prisma.webhookSetting.upsert({
    where: { shop_topic: { shop, topic } },
    update: { enabled, botId: botId || null, channelId: channelId || null, template },
    create: { shop, topic, enabled, botId: botId || null, channelId: channelId || null, template },
  });

  // Shopify に Webhook を登録/解除
  try {
    await syncWebhookSubscription(session, topic, enabled, admin);
  } catch (error) {
    console.error("[Webhook] Sync failed:", error);
    return json({
      success: false,
      message: `Webhook の${enabled ? "登録" : "解除"}に失敗しました`,
    });
  }

  const topicLabel = WEBHOOK_TOPIC_LABELS[topic as WebhookTopic] || topic;
  return json({
    success: true,
    message: enabled
      ? `「${topicLabel}」の通知を有効にしました`
      : `「${topicLabel}」の通知を無効にしました`,
  });
};

export default function WebhooksPage() {
  const { webhookSettings, hasConfiguration, defaultBotId, defaultChannelId } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();

  // どのトピックが送信中かを追跡
  const [submittingTopic, setSubmittingTopic] = useState<string | null>(null);

  // actionData が更新されたら送信完了
  useEffect(() => {
    if (actionData) {
      setSubmittingTopic(null);
    }
  }, [actionData]);

  // 各トピックの状態を管理（デフォルト値を適用）
  const [settings, setSettings] = useState<WebhookSettingData[]>(() =>
    webhookSettings.map((s) => ({
      ...s,
      botId: s.botId || defaultBotId,
      channelId: s.channelId || defaultChannelId,
    }))
  );

  const updateSetting = useCallback(
    (topic: WebhookTopic, field: keyof WebhookSettingData, value: string | boolean) => {
      setSettings((prev) =>
        prev.map((s) => (s.topic === topic ? { ...s, [field]: value } : s))
      );
    },
    []
  );

  const handleSave = useCallback(
    (topic: WebhookTopic) => {
      const setting = settings.find((s) => s.topic === topic);
      if (!setting) return;

      setSubmittingTopic(topic);

      const formData = new FormData();
      formData.append("topic", topic);
      formData.append("enabled", String(setting.enabled));
      formData.append("botId", setting.botId);
      formData.append("channelId", setting.channelId);
      formData.append("template", setting.template);
      submit(formData, { method: "post" });
    },
    [settings, submit]
  );

  return (
    <Page
      backAction={{ content: "設定", url: "/app" }}
      title="Webhook 通知設定"
    >
      <TitleBar title="Webhook 通知設定" />
      <BlockStack gap="500">
        {actionData && (
          <Banner
            tone={actionData.success ? "success" : "critical"}
            onDismiss={() => {}}
          >
            <p>{actionData.message}</p>
          </Banner>
        )}

        {!hasConfiguration && (
          <Banner tone="warning">
            <p>
              Webhook 通知を使用するには、先に LINE WORKS の設定を完了してください。
            </p>
          </Banner>
        )}

        <Layout>
          <Layout.Section>
            <BlockStack gap="500">
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">
                    Webhook 通知について
                  </Text>
                  <Text as="p" variant="bodyMd">
                    Shopify Flow を使わずに、直接通知を受け取ることができます。
                    Basic プランを含む全ての Shopify プランで利用可能です。
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    ※ Flow Action と Webhook の両方を使用する場合、同じイベントで2回通知が届く可能性があります。
                  </Text>
                </BlockStack>
              </Card>

              {settings.map((setting) => (
                <WebhookSettingCard
                  key={setting.topic}
                  setting={setting}
                  hasConfiguration={hasConfiguration}
                  isSubmitting={submittingTopic === setting.topic}
                  onUpdate={(field, value) => updateSetting(setting.topic, field, value)}
                  onSave={() => handleSave(setting.topic)}
                />
              ))}
            </BlockStack>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <BlockStack gap="400">
              {/* クイックアクション */}
              <Card>
                <BlockStack gap="300">
                  <Link url="/app">
                    <Button fullWidth>メイン設定に戻る</Button>
                  </Link>
                </BlockStack>
              </Card>

              {/* 注意事項 */}
              <Card>
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    通知方法について
                  </Text>
                  <Text as="p" variant="bodySm">
                    <strong>Webhook 通知</strong>: Shopify からのイベントを直接受信。Basic プランでも利用可能。
                  </Text>
                  <Text as="p" variant="bodySm">
                    <strong>Shopify Flow</strong>: 高度な条件分岐やワークフローに対応。
                  </Text>
                  <Box paddingBlockStart="100">
                    <Banner tone="info">
                      <Text as="p" variant="bodySm">
                        無効にするには、各イベントのチェックボックスを外して保存してください。
                      </Text>
                    </Banner>
                  </Box>
                </BlockStack>
              </Card>

              {/* ヘルプ */}
              <TemplateVariablesCard />
            </BlockStack>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}

interface WebhookSettingCardProps {
  setting: WebhookSettingData;
  hasConfiguration: boolean;
  isSubmitting: boolean;
  onUpdate: (field: keyof WebhookSettingData, value: string | boolean) => void;
  onSave: () => void;
}

function WebhookSettingCard({
  setting,
  hasConfiguration,
  isSubmitting,
  onUpdate,
  onSave,
}: Omit<WebhookSettingCardProps, "defaultBotId" | "defaultChannelId">) {
  const label = WEBHOOK_TOPIC_LABELS[setting.topic];

  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between" blockAlign="center">
          <InlineStack gap="200" blockAlign="center">
            <Text as="h3" variant="headingMd">
              {label}
            </Text>
            {setting.enabled && <Badge tone="success">有効</Badge>}
          </InlineStack>
          <Checkbox
            label="有効"
            labelHidden
            checked={setting.enabled}
            onChange={(checked) => onUpdate("enabled", checked)}
            disabled={!hasConfiguration}
          />
        </InlineStack>

        {setting.enabled && (
          <>
            <Divider />
            <TextField
              label="Bot ID"
              value={setting.botId}
              onChange={(value) => onUpdate("botId", value)}
              autoComplete="off"
              helpText="LINE WORKS の Bot ID"
            />
            <TextField
              label="送信先"
              value={setting.channelId}
              onChange={(value) => onUpdate("channelId", value)}
              autoComplete="off"
              placeholder="user@example.com または channel-id"
              helpText="1:1: メールアドレス / グループ: Channel ID"
            />
            <TextField
              label="メッセージテンプレート"
              value={setting.template}
              onChange={(value) => onUpdate("template", value)}
              multiline={4}
              autoComplete="off"
              helpText="{{変数名}} で動的な値を挿入できます"
            />
          </>
        )}

        <Button onClick={onSave} loading={isSubmitting} disabled={!hasConfiguration}>
          この設定を保存
        </Button>
      </BlockStack>
    </Card>
  );
}

function TemplateVariablesCard() {
  const [open, setOpen] = useState(false);

  return (
    <Card>
      <BlockStack gap="300">
        <Text as="h2" variant="headingMd">
          ヘルプ
        </Text>

        <Button
          variant="plain"
          onClick={() => setOpen(!open)}
          ariaExpanded={open}
          ariaControls="template-variables"
          textAlign="left"
        >
          {open ? "▼ テンプレート変数一覧" : "▶ テンプレート変数一覧"}
        </Button>
        <Collapsible
          open={open}
          id="template-variables"
          transition={{ duration: "200ms", timingFunction: "ease-in-out" }}
        >
          <BlockStack gap="200">
            <Text as="p" variant="bodySm" tone="subdued">
              メッセージ内で使用できる変数:
            </Text>
            {Object.entries(TEMPLATE_VARIABLES).map(([key, desc]) => (
              <Box key={key}>
                <InlineStack gap="200" align="start">
                  <Badge>{`{{${key}}}`}</Badge>
                  <Text as="span" variant="bodySm">
                    {desc}
                  </Text>
                </InlineStack>
              </Box>
            ))}
          </BlockStack>
        </Collapsible>
      </BlockStack>
    </Card>
  );
}
