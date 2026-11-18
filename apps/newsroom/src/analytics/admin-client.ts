import { googleJson, propertyResource, type RequestOptions } from "./google-client";
import { AnalyticsError } from "./errors";

const ADMIN = "https://analyticsadmin.googleapis.com/v1beta";

export type AnalyticsPropertyOption = { property: string; propertyId: string; displayName: string };
export type AnalyticsAccountOption = { account: string; displayName: string; properties: AnalyticsPropertyOption[] };
export type AnalyticsStreamOption = { stream: string; displayName: string; defaultUri: string; hostname: string; measurementId: string };

const str = (value: unknown) => (typeof value === "string" ? value : "");

/** Every account and property the Google user can read (accountSummaries.list), paged to completion. */
export async function listAccountSummaries(token: string, options: RequestOptions = {}): Promise<AnalyticsAccountOption[]> {
  const accounts: AnalyticsAccountOption[] = [];
  let pageToken = "";
  for (let page = 0; page < 20; page++) {
    const query = new URLSearchParams({ pageSize: "200", ...(pageToken ? { pageToken } : {}) });
    const body = await googleJson<{ accountSummaries?: unknown[]; nextPageToken?: string }>(`${ADMIN}/accountSummaries?${query}`, token, options);
    for (const entry of body.accountSummaries ?? []) {
      const summary = entry as { account?: unknown; displayName?: unknown; propertySummaries?: unknown[] };
      const properties = (summary.propertySummaries ?? []).flatMap((item): AnalyticsPropertyOption[] => {
        const property = item as { property?: unknown; displayName?: unknown };
        const resource = str(property.property);
        return /^properties\/\d+$/.test(resource) ? [{ property: resource, propertyId: resource.slice("properties/".length), displayName: str(property.displayName) || resource }] : [];
      });
      if (properties.length) accounts.push({ account: str(summary.account), displayName: str(summary.displayName) || str(summary.account), properties });
    }
    if (!body.nextPageToken) break;
    pageToken = body.nextPageToken;
  }
  return accounts;
}

export type PropertyDetails = { property: string; displayName: string; timeZone: string };

export async function getProperty(token: string, property: string, options: RequestOptions = {}): Promise<PropertyDetails> {
  const resource = propertyResource(property);
  const body = await googleJson<{ displayName?: unknown; timeZone?: unknown }>(`${ADMIN}/${resource}`, token, options);
  const timeZone = str(body.timeZone);
  try { new Intl.DateTimeFormat("en", { timeZone }); } catch { throw new AnalyticsError("unavailable"); }
  return { property: resource, displayName: str(body.displayName) || resource, timeZone };
}

/** Web data streams only (`WEB_DATA_STREAM`), with the facts Byline needs. */
export async function listWebStreams(token: string, property: string, options: RequestOptions = {}): Promise<AnalyticsStreamOption[]> {
  const resource = propertyResource(property);
  const streams: AnalyticsStreamOption[] = [];
  let pageToken = "";
  for (let page = 0; page < 10; page++) {
    const query = new URLSearchParams({ pageSize: "200", ...(pageToken ? { pageToken } : {}) });
    const body = await googleJson<{ dataStreams?: unknown[]; nextPageToken?: string }>(`${ADMIN}/${resource}/dataStreams?${query}`, token, options);
    for (const entry of body.dataStreams ?? []) {
      const stream = entry as { name?: unknown; type?: unknown; displayName?: unknown; webStreamData?: { measurementId?: unknown; defaultUri?: unknown } };
      if (stream.type !== "WEB_DATA_STREAM") continue;
      const measurementId = str(stream.webStreamData?.measurementId);
      const defaultUri = str(stream.webStreamData?.defaultUri);
      if (!/^properties\/\d+\/dataStreams\/\d+$/.test(str(stream.name)) || !/^G-[A-Z0-9]{4,20}$/.test(measurementId)) continue;
      streams.push({ stream: str(stream.name), displayName: str(stream.displayName) || defaultUri || measurementId, defaultUri, hostname: hostnameOf(defaultUri), measurementId });
    }
    if (!body.nextPageToken) break;
    pageToken = body.nextPageToken;
  }
  return streams;
}

export async function getStream(token: string, stream: string, options: RequestOptions = {}): Promise<AnalyticsStreamOption | null> {
  if (!/^properties\/\d+\/dataStreams\/\d+$/.test(stream)) return null;
  const property = stream.split("/dataStreams/")[0]!;
  return (await listWebStreams(token, property, options)).find((item) => item.stream === stream) ?? null;
}

export function hostnameOf(value: string): string {
  try {
    return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

/**
 * Marks the single stream whose hostname is the publication's public site. Only a unique match
 * is recommended; two streams on the same host leave the choice to the administrator.
 */
export function recommendStream<T extends { hostname: string }>(streams: readonly T[], publicSite: string): T | null {
  const host = hostnameOf(publicSite);
  if (!host) return null;
  const matches = streams.filter((stream) => stream.hostname === host);
  return matches.length === 1 ? matches[0]! : null;
}

/** A non-blocking warning when the property reports in a different timezone from the publication. */
export function timeZoneWarning(propertyTimeZone: string | null, publicationTimeZone: string): string | null {
  if (!propertyTimeZone || propertyTimeZone === publicationTimeZone) return null;
  return `Analytics uses ${propertyTimeZone} while Byline uses ${publicationTimeZone}. Daily Analytics reports follow the Analytics property's timezone.`;
}
