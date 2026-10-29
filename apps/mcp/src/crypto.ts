import type { Env, Sealed } from "./types";
const encoder = new TextEncoder();
function encode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}
function decode(s: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}
async function key(
  env: Pick<Env, "CREDENTIAL_KEYS">,
  id: string,
): Promise<CryptoKey> {
  const keys = JSON.parse(env.CREDENTIAL_KEYS) as Record<string, string>;
  if (!keys[id]) throw new Error("Credential key unavailable");
  const bytes = decode(keys[id]);
  if (bytes.length !== 32) throw new Error("Invalid credential key");
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}
export async function seal(
  env: Pick<Env, "CREDENTIAL_KEYS" | "ACTIVE_KEY_ID">,
  connectionId: string,
  value: unknown,
): Promise<Sealed> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: encoder.encode(`byline-mcp:${connectionId}`),
    },
    await key(env, env.ACTIVE_KEY_ID),
    encoder.encode(JSON.stringify(value)),
  );
  return {
    keyId: env.ACTIVE_KEY_ID,
    iv: encode(iv),
    ciphertext: encode(new Uint8Array(ciphertext)),
  };
}
export async function unseal<T>(
  env: Pick<Env, "CREDENTIAL_KEYS">,
  connectionId: string,
  sealed: Sealed,
): Promise<T> {
  const clear = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: decode(sealed.iv),
      additionalData: encoder.encode(`byline-mcp:${connectionId}`),
    },
    await key(env, sealed.keyId),
    decode(sealed.ciphertext),
  );
  return JSON.parse(new TextDecoder().decode(clear)) as T;
}
export async function digest(value: string): Promise<string> {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", encoder.encode(value)),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
