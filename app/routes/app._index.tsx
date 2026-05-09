import { useState, useCallback, useRef } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useActionData, useSubmit, useNavigation } from "@remix-run/react";
import {
  Page,
  Layout,
  Text,
  Card,
  Button,
  BlockStack,
  TextField,
  Banner,
  Collapsible,
  Link,
  List,
  Divider,
  InlineStack,
  Box,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate, BILLING_PLAN } from "../shopify.server";
import prisma from "../db.server";
import { sendTestMessage, LineWorksError } from "../services/lineworks.server";
import {
  encryptPrivateKey,
  getDecryptedPrivateKey,
  isEncrypted,
  isEncryptionEnabled,
} from "../services/encryption.server";

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

  const configuration = await prisma.configuration.findUnique({
    where: { shop },
  });

  // Private Key は暗号化されている場合、フォームには表示しない
  // 代わりに設定済みフラグを返す
  const hasPrivateKey = configuration?.privateKey ? true : false;

  return json({
    configuration: configuration
      ? {
          clientId: configuration.clientId,
          clientSecret: configuration.clientSecret,
          serviceAccount: configuration.serviceAccount,
          // 暗号化済みの場合はプレースホルダーを返す
          privateKey: hasPrivateKey && isEncrypted(configuration.privateKey)
            ? ""
            : configuration.privateKey,
          hasPrivateKey,
          testBotId: configuration.testBotId || "",
          testChannelId: configuration.testChannelId || "",
        }
      : null,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request, {
    billing: {
      plans: [BILLING_PLAN],
      onFailure: async () => {
        throw new Response("課金が必要です", { status: 402 });
      },
    },
  });
  const shop = session.shop;

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "save") {
    const clientId = formData.get("clientId") as string;
    const clientSecret = formData.get("clientSecret") as string;
    const serviceAccount = formData.get("serviceAccount") as string;
    let privateKey = formData.get("privateKey") as string;
    const testBotId = formData.get("testBotId") as string;
    const testChannelId = formData.get("testChannelId") as string;

    // Private Key の改行を正規化
    if (privateKey) {
      privateKey = privateKey.replace(/\\n/g, "\n").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
    }

    // 新しい Private Key が入力された場合のみ検証
    if (privateKey && (!privateKey.includes("-----BEGIN") || !privateKey.includes("-----END"))) {
      return json({
        success: false,
        message: "Private Key は PEM 形式（-----BEGIN PRIVATE KEY----- で始まる）である必要があります",
      });
    }

    // Private Key を暗号化（設定が有効な場合）
    let privateKeyToSave = privateKey;
    if (privateKey && isEncryptionEnabled()) {
      privateKeyToSave = encryptPrivateKey(privateKey);
    }

    // Private Key が空の場合、既存の値を保持
    if (!privateKey) {
      const existing = await prisma.configuration.findUnique({
        where: { shop },
        select: { privateKey: true },
      });
      if (existing?.privateKey) {
        privateKeyToSave = existing.privateKey;
      } else {
        return json({
          success: false,
          message: "Private Key が必要です",
        });
      }
    }

    await prisma.configuration.upsert({
      where: { shop },
      update: {
        clientId,
        clientSecret,
        serviceAccount,
        privateKey: privateKeyToSave,
        testBotId: testBotId || null,
        testChannelId: testChannelId || null,
      },
      create: {
        shop,
        clientId,
        clientSecret,
        serviceAccount,
        privateKey: privateKeyToSave,
        testBotId: testBotId || null,
        testChannelId: testChannelId || null,
      },
    });

    return json({ success: true, message: "設定を保存しました" });
  }

  if (intent === "test") {
    const clientId = formData.get("clientId") as string;
    const clientSecret = formData.get("clientSecret") as string;
    const serviceAccount = formData.get("serviceAccount") as string;
    let privateKey = formData.get("privateKey") as string;
    const testBotId = formData.get("testBotId") as string;
    const testChannelId = formData.get("testChannelId") as string;

    // Private Key の改行を正規化
    if (privateKey) {
      privateKey = privateKey.replace(/\\n/g, "\n").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
    }

    // Private Key が空の場合、DB から復号して取得
    if (!privateKey) {
      const existing = await prisma.configuration.findUnique({
        where: { shop },
        select: { privateKey: true },
      });
      if (existing?.privateKey) {
        privateKey = getDecryptedPrivateKey(existing.privateKey);
      } else {
        return json({
          success: false,
          message: "Private Key が設定されていません",
        });
      }
    }

    if (!testBotId || !testChannelId) {
      return json({
        success: false,
        message: "テスト送信には Bot ID と Channel ID が必要です",
      });
    }

    try {
      await sendTestMessage(
        { clientId, clientSecret, serviceAccount, privateKey },
        testBotId,
        testChannelId
      );
      return json({ success: true, message: "テストメッセージを送信しました" });
    } catch (error) {
      if (error instanceof LineWorksError) {
        return json({
          success: false,
          message: `LINE WORKS API エラー: ${error.message}`,
          details: error.responseBody,
        });
      }
      // Private Key のフォーマットエラーをわかりやすく
      const errorMessage = error instanceof Error ? error.message : "不明なエラー";
      if (errorMessage.includes("asymmetric key") || errorMessage.includes("PEM")) {
        return json({
          success: false,
          message: "Private Key の形式が正しくありません。PEM 形式（-----BEGIN PRIVATE KEY----- で始まる）でコピー＆ペーストしてください。",
        });
      }
      return json({
        success: false,
        message: `エラーが発生しました: ${errorMessage}`,
      });
    }
  }

  return json({ success: false, message: "不明な操作です" });
};

export default function Index() {
  const { configuration } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigation = useNavigation();

  const [clientId, setClientId] = useState(configuration?.clientId || "");
  const [clientSecret, setClientSecret] = useState(configuration?.clientSecret || "");
  const [serviceAccount, setServiceAccount] = useState(configuration?.serviceAccount || "");
  const [privateKey, setPrivateKey] = useState(configuration?.privateKey || "");
  const [hasExistingKey] = useState(configuration?.hasPrivateKey || false);
  const [testBotId, setTestBotId] = useState(configuration?.testBotId || "");
  const [testChannelId, setTestChannelId] = useState(configuration?.testChannelId || "");
  const [guideOpen, setGuideOpen] = useState(false);
  const [flowGuideOpen, setFlowGuideOpen] = useState(false);
  const [copiedTemplate, setCopiedTemplate] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // メッセージテンプレートをクリップボードにコピー
  const copyTemplate = useCallback((template: string, name: string) => {
    navigator.clipboard.writeText(template);
    setCopiedTemplate(name);
    setTimeout(() => setCopiedTemplate(null), 2000);
  }, []);

  const isSubmitting = navigation.state === "submitting";

  // .key ファイルを読み込む
  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (content) {
        // 改行を正規化してセット
        const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
        setPrivateKey(normalized);
      }
    };
    reader.readAsText(file);

    // 同じファイルを再選択できるようにリセット
    event.target.value = "";
  }, []);

  const handleSave = useCallback(() => {
    const formData = new FormData();
    formData.append("intent", "save");
    formData.append("clientId", clientId);
    formData.append("clientSecret", clientSecret);
    formData.append("serviceAccount", serviceAccount);
    formData.append("privateKey", privateKey);
    formData.append("testBotId", testBotId);
    formData.append("testChannelId", testChannelId);
    submit(formData, { method: "post" });
  }, [clientId, clientSecret, serviceAccount, privateKey, testBotId, testChannelId, submit]);

  const handleTest = useCallback(() => {
    const formData = new FormData();
    formData.append("intent", "test");
    formData.append("clientId", clientId);
    formData.append("clientSecret", clientSecret);
    formData.append("serviceAccount", serviceAccount);
    formData.append("privateKey", privateKey);
    formData.append("testBotId", testBotId);
    formData.append("testChannelId", testChannelId);
    submit(formData, { method: "post" });
  }, [clientId, clientSecret, serviceAccount, privateKey, testBotId, testChannelId, submit]);

  // Private Key は新規入力または既存キーがあれば OK
  const hasPrivateKey = privateKey || hasExistingKey;
  const canSave = clientId && clientSecret && serviceAccount && hasPrivateKey;
  const canTest = canSave && testBotId && testChannelId;

  return (
    <Page title="LINE WORKS 連携設定">
      <TitleBar title="LINE WORKS 連携設定" />
      <BlockStack gap="500">
        {actionData && (
          <Banner
            tone={actionData.success ? "success" : "critical"}
            onDismiss={() => {}}
          >
            <p>{actionData.message}</p>
            {"details" in actionData && actionData.details ? (
              <Box paddingBlockStart="200">
                <Text as="p" variant="bodySm" tone="subdued">
                  {`詳細: ${JSON.stringify(actionData.details)}`}
                </Text>
              </Box>
            ) : null}
          </Banner>
        )}

        <Layout>
          <Layout.Section>
            <BlockStack gap="500">
              {/* API 認証設定カード */}
              <Card>
                <BlockStack gap="400">
                  <BlockStack gap="200">
                    <Text as="h2" variant="headingMd">
                      Step 1: ClientApp 設定
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Console → API → ClientApp から取得
                    </Text>
                  </BlockStack>

                  <TextField
                    label="Client ID"
                    value={clientId}
                    onChange={setClientId}
                    autoComplete="off"
                    helpText="ClientApp → アプリ選択 → OAuth"
                  />

                  <TextField
                    label="Client Secret"
                    type="password"
                    value={clientSecret}
                    onChange={setClientSecret}
                    autoComplete="off"
                    helpText="ClientApp → アプリ選択 → OAuth"
                  />

                  <TextField
                    label="Service Account ID"
                    value={serviceAccount}
                    onChange={setServiceAccount}
                    autoComplete="off"
                    placeholder="xxxxx.serviceaccount@example.com"
                    helpText="ClientApp → アプリ選択 → Service Account"
                  />

                  <BlockStack gap="200">
                    <InlineStack align="space-between" blockAlign="center">
                      <Text as="span" variant="bodyMd">Private Key</Text>
                      <Button
                        size="slim"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        .key ファイルを選択
                      </Button>
                    </InlineStack>
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileUpload}
                      accept=".key,.pem"
                      style={{ display: "none" }}
                    />
                    {privateKey && privateKey.includes("-----BEGIN") ? (
                      <Banner tone="success">
                        <Text as="p" variant="bodySm">
                          ✓ Private Key 設定済み（新しいキー）
                        </Text>
                      </Banner>
                    ) : hasExistingKey && !privateKey ? (
                      <Banner tone="success">
                        <Text as="p" variant="bodySm">
                          ✓ Private Key 設定済み（暗号化保存）
                        </Text>
                        <Text as="p" variant="bodySm" tone="subdued">
                          変更する場合は上のボタンから新しいキーを選択してください
                        </Text>
                      </Banner>
                    ) : (
                      <TextField
                        label=""
                        labelHidden
                        value={privateKey}
                        onChange={setPrivateKey}
                        multiline={4}
                        autoComplete="off"
                        placeholder="-----BEGIN PRIVATE KEY-----&#10;...&#10;-----END PRIVATE KEY-----"
                        helpText="Service Account 作成時にダウンロードした .key ファイル"
                      />
                    )}
                  </BlockStack>

                </BlockStack>
              </Card>

              {/* Bot 送信設定カード */}
              <Card>
                <BlockStack gap="400">
                  <BlockStack gap="200">
                    <Text as="h2" variant="headingMd">
                      Step 2: Bot 設定
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Console → Bot から取得
                    </Text>
                  </BlockStack>

                  <TextField
                    label="Bot ID"
                    value={testBotId}
                    onChange={setTestBotId}
                    autoComplete="off"
                    helpText="Bot → Bot選択 → Bot ID"
                  />

                  <TextField
                    label="送信先"
                    value={testChannelId}
                    onChange={setTestChannelId}
                    autoComplete="off"
                    placeholder="user@example.com または channel-id"
                    helpText="1:1: メールアドレス / グループ: Channel ID"
                  />

                  {/* メッセージプレビュー */}
                  {canTest && (
                    <BlockStack gap="200">
                      <Text as="span" variant="bodyMd">メッセージプレビュー</Text>
                      <Box background="bg-surface-secondary" padding="300" borderRadius="200">
                        <Text as="p" variant="bodySm">
                          {`[テスト送信]
Order Notify for LINE WORKS からのテストメッセージです。
送信日時: ${new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}`}
                        </Text>
                      </Box>
                      <Text as="p" variant="bodySm" tone="subdued">
                        送信先: {testChannelId.includes("@") ? "1:1 メッセージ" : "トークルーム"}
                      </Text>
                    </BlockStack>
                  )}

                  <Button
                    onClick={handleTest}
                    loading={isSubmitting}
                    disabled={!canTest}
                    fullWidth
                  >
                    テストメッセージを送信
                  </Button>
                </BlockStack>
              </Card>

              {/* 保存ボタン */}
              <Card>
                <Button
                  variant="primary"
                  onClick={handleSave}
                  loading={isSubmitting}
                  disabled={!canSave}
                  fullWidth
                  size="large"
                >
                  すべての設定を保存
                </Button>
              </Card>
            </BlockStack>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <BlockStack gap="400">
              {/* クイックアクション */}
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">
                    クイックアクション
                  </Text>
                  <Link url="/app/logs">
                    <Button fullWidth>送信履歴を確認</Button>
                  </Link>
                  <Link url="/app/webhooks">
                    <Button fullWidth>Webhook 設定</Button>
                  </Link>
                </BlockStack>
              </Card>

              {/* 注意事項 */}
              <Card>
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    通知方法の選択
                  </Text>
                  <Text as="p" variant="bodySm">
                    <strong>Webhook 通知</strong>: Flow を使わずに直接通知。Basic プランでも利用可能。
                  </Text>
                  <Text as="p" variant="bodySm">
                    <strong>Shopify Flow</strong>: 条件分岐や複雑なワークフローに対応。
                  </Text>
                  <Box paddingBlockStart="100">
                    <Banner tone="warning">
                      <Text as="p" variant="bodySm">
                        同じイベントに両方を設定すると通知が2回届きます。どちらか一方をご利用ください。
                      </Text>
                    </Banner>
                  </Box>
                </BlockStack>
              </Card>

              {/* ヘルプ */}
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">
                    ヘルプ
                  </Text>

                  <Button
                    variant="plain"
                    onClick={() => setFlowGuideOpen(!flowGuideOpen)}
                    ariaExpanded={flowGuideOpen}
                    ariaControls="flow-guide"
                    textAlign="left"
                  >
                    {flowGuideOpen ? "▼ Shopify Flow テンプレート" : "▶ Shopify Flow テンプレート"}
                  </Button>
                  <Collapsible
                    open={flowGuideOpen}
                    id="flow-guide"
                    transition={{ duration: "200ms", timingFunction: "ease-in-out" }}
                  >
                    <BlockStack gap="300">
                      <Text as="h3" variant="headingSm">
                        注文通知テンプレート
                      </Text>
                      <Box background="bg-surface-secondary" padding="300" borderRadius="200">
                        <Text as="p" variant="bodySm">
                          {`🛒 新規注文がありました！
注文番号: {{ order.name }}
金額: {{ order.totalPrice }}
顧客: {{ order.customer.firstName }} {{ order.customer.lastName }}`}
                        </Text>
                      </Box>
                      <Button
                        size="slim"
                        onClick={() => copyTemplate(
                          `🛒 新規注文がありました！\n注文番号: {{ order.name }}\n金額: {{ order.totalPrice }}\n顧客: {{ order.customer.firstName }} {{ order.customer.lastName }}`,
                          "order"
                        )}
                      >
                        {copiedTemplate === "order" ? "✓ コピーしました" : "コピー"}
                      </Button>

                      <Divider />
                      <Text as="h3" variant="headingSm">
                        発送通知テンプレート
                      </Text>
                      <Box background="bg-surface-secondary" padding="300" borderRadius="200">
                        <Text as="p" variant="bodySm">
                          {`📦 発送しました
注文番号: {{ order.name }}
追跡番号: {{ fulfillment.trackingNumber }}`}
                        </Text>
                      </Box>
                      <Button
                        size="slim"
                        onClick={() => copyTemplate(
                          `📦 発送しました\n注文番号: {{ order.name }}\n追跡番号: {{ fulfillment.trackingNumber }}`,
                          "fulfillment"
                        )}
                      >
                        {copiedTemplate === "fulfillment" ? "✓ コピーしました" : "コピー"}
                      </Button>

                      <Divider />
                      <Text as="h3" variant="headingSm">
                        在庫アラートテンプレート
                      </Text>
                      <Box background="bg-surface-secondary" padding="300" borderRadius="200">
                        <Text as="p" variant="bodySm">
                          {`⚠️ 在庫が少なくなっています
商品: {{ product.title }}
在庫数: {{ inventoryLevel.available }}`}
                        </Text>
                      </Box>
                      <Button
                        size="slim"
                        onClick={() => copyTemplate(
                          `⚠️ 在庫が少なくなっています\n商品: {{ product.title }}\n在庫数: {{ inventoryLevel.available }}`,
                          "inventory"
                        )}
                      >
                        {copiedTemplate === "inventory" ? "✓ コピーしました" : "コピー"}
                      </Button>
                    </BlockStack>
                  </Collapsible>

                  <Divider />

                  <Button
                    variant="plain"
                    onClick={() => setGuideOpen(!guideOpen)}
                    ariaExpanded={guideOpen}
                    ariaControls="setup-guide"
                    textAlign="left"
                  >
                    {guideOpen ? "▼ LINE WORKS 設定ガイド" : "▶ LINE WORKS 設定ガイド"}
                  </Button>
                  <Collapsible
                    open={guideOpen}
                    id="setup-guide"
                    transition={{ duration: "200ms", timingFunction: "ease-in-out" }}
                  >
                    <BlockStack gap="400">

                      <Text as="h2" variant="headingMd">
                        API 認証情報の取得
                      </Text>

                      <Text as="h3" variant="headingSm">
                        1. Developer Console でアプリを作成
                      </Text>
                      <List>
                        <List.Item>
                          <Link
                            url="https://developers.worksmobile.com/console"
                            target="_blank"
                          >
                            LINE WORKS Developer Console
                          </Link>
                          {" "}にアクセス
                        </List.Item>
                        <List.Item>「API」→「ClientApp」→「アプリを追加」</List.Item>
                        <List.Item>作成後、「OAuth」から Client ID と Client Secret を取得</List.Item>
                      </List>

                      <Text as="h3" variant="headingSm">
                        2. Service Account を作成
                      </Text>
                      <List>
                        <List.Item>アプリ設定 →「Service Account」→「追加」</List.Item>
                        <List.Item>作成後、Private Key（.key ファイル）をダウンロード</List.Item>
                        <List.Item>Service Account ID をコピー</List.Item>
                      </List>

                      <Text as="h3" variant="headingSm">
                        3. Bot を作成
                      </Text>
                      <List>
                        <List.Item>「Bot」→「登録」で新しい Bot を作成</List.Item>
                        <List.Item>Bot ID（数字）をメモ</List.Item>
                        <List.Item>Bot を使用するメンバーを設定</List.Item>
                      </List>

                      <Divider />

                      <Text as="h2" variant="headingMd">
                        グループチャットへの通知設定
                      </Text>

                      <Text as="h3" variant="headingSm">
                        4. グループチャット（トークルーム）を作成
                      </Text>
                      <List>
                        <List.Item>LINE WORKS アプリ → トーク → ＋ → グループ作成</List.Item>
                        <List.Item>通知を受け取るメンバーを追加</List.Item>
                        <List.Item>例：「EC運営通知」「倉庫通知」など用途別に作成</List.Item>
                      </List>

                      <Text as="h3" variant="headingSm">
                        5. Bot をグループに追加
                      </Text>
                      <List>
                        <List.Item>グループチャット → 設定（歯車アイコン）</List.Item>
                        <List.Item>「Bot を追加」から作成した Bot を選択</List.Item>
                        <List.Item>※ Bot を追加しないとメッセージが届きません</List.Item>
                      </List>

                      <Text as="h3" variant="headingSm">
                        6. Channel ID を取得
                      </Text>
                      <List>
                        <List.Item>グループチャット → 設定 → 「Channel ID をコピー」</List.Item>
                        <List.Item>形式: UUID（例: 00000000-0000-0000-0000-000000000000）</List.Item>
                        <List.Item>この ID を「送信先」に入力</List.Item>
                      </List>

                      <Divider />

                      <Text as="h2" variant="headingMd">
                        通知の振り分け
                      </Text>
                      <Text as="p" variant="bodySm">
                        Webhook 設定で、イベントごとに異なるグループに通知できます：
                      </Text>
                      <List>
                        <List.Item>注文作成 → EC運営チーム（新規注文確認）</List.Item>
                        <List.Item>支払い完了 → 倉庫チーム（発送準備開始）</List.Item>
                        <List.Item>キャンセル → EC運営チーム（対応が必要）</List.Item>
                      </List>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Bot ID は共通で、Channel ID をイベントごとに変更するだけで振り分けられます。
                      </Text>

                      <Divider />

                      <Text as="h2" variant="headingMd">
                        個人への 1:1 メッセージ
                      </Text>
                      <Text as="p" variant="bodySm">
                        グループではなく個人に送る場合は、「送信先」にメールアドレスを入力してください。
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        例: user@example.com
                      </Text>

                    </BlockStack>
                  </Collapsible>
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
