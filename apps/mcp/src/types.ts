import type { ConnectionVault } from "./vault";
export interface Env {
  OAUTH_KV: KVNamespace;
  CONNECTIONS: DurableObjectNamespace<ConnectionVault>;
  PUBLIC_URL: string;
  WORDPRESS_URL: string;
  APPLICATION_ID: string;
  CREDENTIAL_KEYS: string; // JSON { key-id: base64 AES-256 key }; secret binding
  ACTIVE_KEY_ID: string;
  ALLOWED_ORIGINS: string; // comma-separated exact HTTPS origins
}
export type AuthProps = { connectionId: string };
export type Credential = {
  username: string;
  password: string;
  userId: number;
  uuid: string;
};
export type Sealed = { keyId: string; iv: string; ciphertext: string };
export type Connection = {
  sealed: Sealed;
  userId: number;
  createdAt: number;
  grantId?: string;
  revoked?: boolean;
};
export type Access = {
  user: { id: number; name: string };
  timezone: string;
  version: string;
  capabilities: Record<string, boolean>;
};
