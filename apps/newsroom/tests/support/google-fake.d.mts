export const ACCESS: string;
export const KID: string;
export type FakeRow = { dims: string[]; metrics: number[]; range?: string };
export type GoogleFakeState = {
  clientId: string; refreshToken: string; email: string; subject: string; grantedScope: string;
  revoked: boolean; rotate: string | null; revokeStatus: number; missingProperty: boolean; noStreams: boolean;
  timeZone: string; siteHtml: string; siteHost: string; realtimeDelay: number;
  fail: Set<string>; calls: string[]; fixtures: Record<string, FakeRow[]>;
};
export function createGoogleFake(): {
  state: GoogleFakeState;
  /** The fake's answer, or undefined for a request that isn't Google's. */
  handle(input: RequestInfo | URL, init?: RequestInit): Promise<Response | undefined>;
  fake(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  install(target?: { fetch: typeof fetch }): void;
  idToken(options?: { nonce?: string; aud?: string; email?: string; sub?: string; expiresIn?: number; emailVerified?: boolean }): string;
  publicPem: string;
};
