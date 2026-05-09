import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // GCM recommended IV length
const TAG_LENGTH = 16;
const PBKDF2_ITERATIONS = 310000;
const KEY_LENGTH = 32; // 256 bits
const APP_SALT = "order-notify-lineworks-v1"; // アプリケーション固有のソルト

let derivedKey: Buffer | null = null;

/**
 * 環境変数から暗号化キーを派生させる
 */
function getDerivedKey(): Buffer {
  if (derivedKey) {
    return derivedKey;
  }

  const secret = process.env.PRIVATE_KEY_ENC_SECRET;
  if (!secret) {
    throw new Error(
      "PRIVATE_KEY_ENC_SECRET environment variable is not set. " +
      "Please add a random 64+ character string to your .env file."
    );
  }

  if (secret.length < 32) {
    throw new Error(
      "PRIVATE_KEY_ENC_SECRET must be at least 32 characters long."
    );
  }

  derivedKey = crypto.pbkdf2Sync(
    secret,
    APP_SALT,
    PBKDF2_ITERATIONS,
    KEY_LENGTH,
    "sha256"
  );

  return derivedKey;
}

/**
 * Private Key を暗号化する
 * @returns iv:ciphertext:tag 形式の Base64 文字列
 */
export function encryptPrivateKey(plaintext: string): string {
  const key = getDerivedKey();
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  const tag = cipher.getAuthTag();

  // iv:ciphertext:tag 形式で結合
  const combined = Buffer.concat([iv, encrypted, tag]);

  return combined.toString("base64");
}

/**
 * 暗号化された Private Key を復号する
 * @param encrypted iv:ciphertext:tag 形式の Base64 文字列
 */
export function decryptPrivateKey(encrypted: string): string {
  const key = getDerivedKey();
  const combined = Buffer.from(encrypted, "base64");

  // iv:ciphertext:tag を分解
  const iv = combined.subarray(0, IV_LENGTH);
  const tag = combined.subarray(combined.length - TAG_LENGTH);
  const ciphertext = combined.subarray(IV_LENGTH, combined.length - TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

/**
 * 文字列が暗号化済みかどうかを判定
 * PEM 形式のヘッダーがなければ暗号化済みとみなす
 */
export function isEncrypted(value: string): boolean {
  return !value.includes("-----BEGIN");
}

/**
 * Private Key を安全に取得する（暗号化されていれば復号）
 */
export function getDecryptedPrivateKey(storedValue: string): string {
  if (isEncrypted(storedValue)) {
    return decryptPrivateKey(storedValue);
  }
  // 平文の場合はそのまま返す（移行前のデータ）
  return storedValue;
}

/**
 * 暗号化キーが設定されているかチェック
 */
export function isEncryptionEnabled(): boolean {
  return !!process.env.PRIVATE_KEY_ENC_SECRET;
}
