import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/**
 * Authenticated encryption for integration credentials (docs/google-analytics.md).
 *
 * AES-256-GCM with a key derived (HKDF-SHA256) from `BYLINE_INTEGRATIONS_SECRET`: a
 * dedicated secret, never `PAYLOAD_SECRET`. The stored envelope holds only what
 * decryption needs; the key never leaves the process.
 */
export type EncryptedEnvelope = { version: 1; iv: string; ciphertext: string; authTag: string };

const SALT = "byline-integrations/v1";
const INFO = "aes-256-gcm credential envelope";

export class IntegrationCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IntegrationCryptoError";
  }
}

/** Anything shorter is a guessable key, not a secret. */
export const MIN_INTEGRATIONS_SECRET_LENGTH = 32;

function deriveKey(secret: string): Buffer {
  if (typeof secret !== "string" || secret.length < MIN_INTEGRATIONS_SECRET_LENGTH) {
    throw new IntegrationCryptoError(`BYLINE_INTEGRATIONS_SECRET must be at least ${MIN_INTEGRATIONS_SECRET_LENGTH} characters.`);
  }
  return Buffer.from(hkdfSync("sha256", secret, SALT, INFO, 32));
}

export function encryptSecret(plaintext: string, secret: string): EncryptedEnvelope {
  const key = deriveKey(secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    version: 1,
    iv: iv.toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
    authTag: cipher.getAuthTag().toString("base64url")
  };
}

export function isEncryptedEnvelope(value: unknown): value is EncryptedEnvelope {
  const envelope = value as Partial<EncryptedEnvelope> | null;
  return Boolean(envelope && typeof envelope === "object" && envelope.version === 1 &&
    typeof envelope.iv === "string" && typeof envelope.ciphertext === "string" && typeof envelope.authTag === "string");
}

export function decryptSecret(envelope: unknown, secret: string): string {
  if (!envelope || typeof envelope !== "object" || (envelope as { version?: unknown }).version !== 1) {
    throw new IntegrationCryptoError("Unsupported credential envelope version.");
  }
  if (!isEncryptedEnvelope(envelope)) throw new IntegrationCryptoError("Malformed credential envelope.");
  try {
    const decipher = createDecipheriv("aes-256-gcm", deriveKey(secret), Buffer.from(envelope.iv, "base64url"));
    decipher.setAuthTag(Buffer.from(envelope.authTag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, "base64url")), decipher.final()]).toString("utf8");
  } catch (error) {
    if (error instanceof IntegrationCryptoError) throw error;
    // Never include the provider's message: a wrong key and a tampered envelope look the same on purpose.
    throw new IntegrationCryptoError("The stored credential could not be decrypted.");
  }
}
