import jwt from "jsonwebtoken";

const LINE_WORKS_AUTH_URL = "https://auth.worksmobile.com/oauth2/v2.0/token";
const LINE_WORKS_API_BASE = "https://www.worksapis.com/v1.0";

/**
 * Private Key を正規化する（PEM 形式を保証）
 * - リテラルな "\n" 文字列を実際の改行に変換
 * - Windows の \r\n を \n に変換
 * - 余分な空白を除去
 */
function normalizePrivateKey(key: string): string {
  if (!key) return key;

  // リテラルな \n 文字列を実際の改行に変換
  let normalized = key.replace(/\\n/g, "\n");

  // Windows の改行コードを変換
  normalized = normalized.replace(/\r\n/g, "\n");
  normalized = normalized.replace(/\r/g, "\n");

  // 前後の空白を除去
  normalized = normalized.trim();

  // PEM 形式のヘッダー/フッターを確認
  if (!normalized.includes("-----BEGIN") || !normalized.includes("-----END")) {
    throw new Error("Private Key は PEM 形式（-----BEGIN PRIVATE KEY----- で始まる）である必要があります");
  }

  return normalized;
}

interface LineWorksCredentials {
  clientId: string;
  clientSecret: string;
  serviceAccount: string;
  privateKey: string;
}

interface AccessTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface SendMessageParams {
  botId: string;
  channelId: string;
  message: string;
  targetType?: "channel" | "user"; // channel: トークルーム, user: 1:1メッセージ
}

export class LineWorksError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public responseBody?: unknown
  ) {
    super(message);
    this.name = "LineWorksError";
  }
}

/**
 * JWT を生成する（Service Account 認証用）
 */
export function generateJwt(credentials: LineWorksCredentials): string {
  const now = Math.floor(Date.now() / 1000);

  const payload = {
    iss: credentials.clientId,
    sub: credentials.serviceAccount,
    iat: now,
    exp: now + 3600, // 1時間後
  };

  // Private Key を正規化（改行コードの問題を修正）
  const normalizedKey = normalizePrivateKey(credentials.privateKey);

  return jwt.sign(payload, normalizedKey, { algorithm: "RS256" });
}

/**
 * Access Token を取得する
 */
export async function getAccessToken(
  credentials: LineWorksCredentials
): Promise<string> {
  const assertion = generateJwt(credentials);

  const params = new URLSearchParams({
    assertion,
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
    scope: "bot",
  });

  const response = await fetch(LINE_WORKS_AUTH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new LineWorksError(
      `Failed to get access token: ${response.status}`,
      response.status,
      errorBody
    );
  }

  const data = (await response.json()) as AccessTokenResponse;
  return data.access_token;
}

/**
 * トークルームまたはユーザーにメッセージを送信する
 * targetType: "channel" = トークルーム, "user" = 1:1メッセージ
 */
export async function sendMessage(
  credentials: LineWorksCredentials,
  params: SendMessageParams
): Promise<void> {
  const accessToken = await getAccessToken(credentials);

  // targetType に応じてエンドポイントを切り替え
  const targetType = params.targetType || "channel";
  let url: string;

  if (targetType === "user") {
    // 1:1 メッセージ: /bots/{botId}/users/{userId}/messages
    // userId はメールアドレス形式の場合 URL エンコードが必要
    const encodedUserId = encodeURIComponent(params.channelId);
    url = `${LINE_WORKS_API_BASE}/bots/${params.botId}/users/${encodedUserId}/messages`;
  } else {
    // トークルーム: /bots/{botId}/channels/{channelId}/messages
    url = `${LINE_WORKS_API_BASE}/bots/${params.botId}/channels/${params.channelId}/messages`;
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      content: {
        type: "text",
        text: params.message,
      },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new LineWorksError(
      `Failed to send message: ${response.status}`,
      response.status,
      errorBody
    );
  }
}

/**
 * テストメッセージを送信する
 * channelId にユーザー ID（メールアドレス形式）を指定すると 1:1 メッセージとして送信
 */
export async function sendTestMessage(
  credentials: LineWorksCredentials,
  botId: string,
  channelId: string,
  targetType: "channel" | "user" = "user" // デフォルトは 1:1 メッセージ
): Promise<void> {
  const testMessage = `[テスト送信]\nOrder Notify for LINE WORKS からのテストメッセージです。\n送信日時: ${new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}`;

  await sendMessage(credentials, {
    botId,
    channelId,
    message: testMessage,
    targetType,
  });
}

interface Channel {
  channelId: string;
  channelName?: string;
}

interface ChannelsResponse {
  channels: Channel[];
}

/**
 * Bot が参加しているチャンネル一覧を取得する
 */
export async function getBotChannels(
  credentials: LineWorksCredentials,
  botId: string
): Promise<Channel[]> {
  const accessToken = await getAccessToken(credentials);

  const url = `${LINE_WORKS_API_BASE}/bots/${botId}/channels`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new LineWorksError(
      `Failed to get channels: ${response.status}`,
      response.status,
      errorBody
    );
  }

  const data = (await response.json()) as ChannelsResponse;
  return data.channels || [];
}
