import type { GlobalConfig } from "payload";
import { nobody } from "../access/user";

/**
 * The Google Analytics connection (docs/google-analytics.md): private operational state, never
 * public publication configuration. Nothing here can be read or written through Payload's REST
 * API or the raw admin; trusted server helpers (`src/analytics/connection.ts`) use
 * `overrideAccess` after the Byline endpoints have checked the account's role.
 *
 * The refresh token is only ever stored as an AES-256-GCM envelope (`src/analytics/crypto.ts`).
 * What reaches the public site is the Measurement ID and tag behavior, published through the
 * Publication Global's `analytics` group, not from here.
 */
export const ANALYTICS_INTEGRATION_GLOBAL = "analytics-integration";

export const ANALYTICS_STATUSES = ["disconnected", "pending-selection", "connected", "needs-reconnect"] as const;
export type AnalyticsStatus = (typeof ANALYTICS_STATUSES)[number];

const text = (name: string) => ({ name, type: "text" as const });

export const AnalyticsIntegration: GlobalConfig = {
  slug: ANALYTICS_INTEGRATION_GLOBAL,
  label: "Analytics connection",
  admin: { hidden: true, group: "System" },
  access: { read: nobody, update: nobody, readVersions: nobody },
  graphQL: false,
  fields: [
    { name: "status", type: "select", required: true, defaultValue: "disconnected", options: ANALYTICS_STATUSES.map((value) => ({ value, label: value })) },
    text("googleAccountEmail"),
    text("googleSubject"),
    text("accountResource"),
    text("accountDisplayName"),
    text("propertyResource"),
    text("propertyDisplayName"),
    text("propertyTimeZone"),
    text("streamResource"),
    text("streamDisplayName"),
    text("streamDefaultUri"),
    text("measurementId"),
    { name: "trackingMode", type: "select", required: true, defaultValue: "external", options: [{ value: "external", label: "External" }, { value: "byline", label: "Byline" }] },
    { name: "consentMode", type: "select", required: true, defaultValue: "external", options: [{ value: "external", label: "External" }, { value: "always", label: "Always" }, { value: "ask", label: "Ask" }] },
    // { version, iv, ciphertext, authTag }: AES-256-GCM under BYLINE_INTEGRATIONS_SECRET. Never plaintext.
    { name: "encryptedRefreshToken", type: "json" },
    { name: "grantedScopes", type: "json" },
    { name: "connectedAt", type: "date" },
    { name: "connectedBy", type: "relationship", relationTo: "users" },
    { name: "lastVerifiedAt", type: "date" },
    { name: "lastSuccessfulRequestAt", type: "date" },
    text("lastErrorCode")
  ]
};
