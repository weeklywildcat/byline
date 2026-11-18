import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, IntegrationCryptoError } from "../../src/analytics/crypto";

const SECRET = "integration-secret-with-at-least-32-characters";

describe("integration credential encryption", () => {
  it("round-trips a refresh token", () => {
    const envelope = encryptSecret("1//refresh-token-value", SECRET);
    expect(envelope.version).toBe(1);
    expect(JSON.stringify(envelope)).not.toContain("refresh-token-value");
    expect(decryptSecret(envelope, SECRET)).toBe("1//refresh-token-value");
  });

  it("uses a fresh IV, so the same plaintext never encrypts the same way twice", () => {
    const a = encryptSecret("same", SECRET);
    const b = encryptSecret("same", SECRET);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("fails closed on a tampered envelope, a wrong key and an unsupported version", () => {
    const envelope = encryptSecret("token", SECRET);
    const flipped = Buffer.from(envelope.ciphertext, "base64url");
    flipped[0] = flipped[0]! ^ 1;
    expect(() => decryptSecret({ ...envelope, ciphertext: flipped.toString("base64url") }, SECRET)).toThrow(IntegrationCryptoError);
    expect(() => decryptSecret({ ...envelope, authTag: encryptSecret("x", SECRET).authTag }, SECRET)).toThrow(IntegrationCryptoError);
    expect(() => decryptSecret(envelope, "another-secret-with-at-least-32-characters!")).toThrow(IntegrationCryptoError);
    expect(() => decryptSecret({ ...envelope, version: 2 }, SECRET)).toThrow(/Unsupported credential envelope version/);
    expect(() => decryptSecret(null, SECRET)).toThrow(IntegrationCryptoError);
  });

  it("refuses a short secret and never echoes provider details", () => {
    expect(() => encryptSecret("token", "short")).toThrow(/at least 32/);
    try { decryptSecret(encryptSecret("t", SECRET), "wrong-wrong-wrong-wrong-wrong-wrong-wrong"); } catch (error) { expect(String(error)).not.toContain(SECRET); }
  });
});
