import { LineWorksError } from "./lineworks.server";

/**
 * エラーがリトライ可能かどうかを判定する
 */
export function isRetryableError(error: unknown): boolean {
  // ネットワークエラー（fetch 失敗）
  if (error instanceof TypeError && error.message.includes("fetch")) {
    return true;
  }

  if (error instanceof LineWorksError) {
    const status = error.statusCode;

    // リトライ可能なステータスコード
    // 429: レート制限
    // 500, 502, 503, 504: サーバーエラー
    if (status && [429, 500, 502, 503, 504].includes(status)) {
      return true;
    }

    // レスポンスボディに一時的エラーを示す文字列が含まれる場合
    const body = String(error.responseBody || "").toLowerCase();
    if (
      body.includes("temporarily unavailable") ||
      body.includes("try again") ||
      body.includes("rate limit") ||
      body.includes("timeout")
    ) {
      return true;
    }

    // 4xx エラーはリトライしない（クライアント側の問題）
    if (status && status >= 400 && status < 500) {
      return false;
    }
  }

  // Private Key のフォーマットエラーはリトライしない
  const errorMessage = error instanceof Error ? error.message : String(error);
  if (
    errorMessage.includes("asymmetric key") ||
    errorMessage.includes("PEM") ||
    errorMessage.includes("Private Key")
  ) {
    return false;
  }

  // その他の未知のエラーはリトライしない（安全側に倒す）
  return false;
}

/**
 * 次のリトライ時刻を計算する（指数バックオフ + ジッター）
 * @param attemptCount 現在の試行回数（1から開始）
 * @param baseDelayMs 基本遅延（ミリ秒）
 */
export function calculateNextAttemptTime(
  attemptCount: number,
  baseDelayMs: number = 60000 // 1分
): Date {
  // 指数バックオフ: 1分 → 2分 → 4分 → 8分 → 16分
  const delay = baseDelayMs * Math.pow(2, attemptCount - 1);

  // ジッター: ±10%
  const jitter = delay * 0.1 * (Math.random() * 2 - 1);

  return new Date(Date.now() + delay + jitter);
}
