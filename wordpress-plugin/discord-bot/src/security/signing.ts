import { createHmac, timingSafeEqual } from 'node:crypto';

export function signaturePayload(timestamp: string, method: string, path: string, body: string): string {
  return `${timestamp}\n${method.toUpperCase()}\n${path}\n${body}`;
}

export function signRequest(secret: string, timestamp: string, method: string, path: string, body: string): string {
  return createHmac('sha256', secret).update(signaturePayload(timestamp, method, path, body)).digest('hex');
}

export function verifyRequest(secret: string, timestamp: string, signature: string, method: string, path: string, body: string, now = Date.now()): boolean {
  if (!/^\d{10}$/.test(timestamp) || !/^[a-f0-9]{64}$/i.test(signature) || Math.abs(Math.floor(now / 1000) - Number(timestamp)) > 300) return false;
  const expected = Buffer.from(signRequest(secret, timestamp, method, path, body), 'hex');
  const actual = Buffer.from(signature, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
