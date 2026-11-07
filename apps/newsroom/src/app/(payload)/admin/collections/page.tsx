import config from "@payload-config";
import { generatePageMetadata, RootPage } from "@payloadcms/next/views";
import type { Metadata } from "next";
import { COLLECTIONS_VIEW_PATH } from "../../../../domain/navigation";
import { importMap } from "../importMap.js";

/**
 * Byline Collections at exactly `/admin/collections`.
 *
 * Payload 3.92 reserves the `collections` segment for its raw collection
 * screens: a custom root view there escapes the redirect to the dashboard
 * but is then refused (`notFound()`, because there is no collection slug).
 * This page is static, so Next prefers it over the admin catch-all for this
 * one address only; it renders the Byline Collections view through Payload's
 * own RootPage (its template, auth and shell) under the view's internal
 * path. Every `/admin/collections/<slug>` address still reaches the
 * catch-all and Payload's raw screens, untouched.
 */
type Args = { searchParams: Promise<{ [key: string]: string | string[] }> };

const params = Promise.resolve({ segments: COLLECTIONS_VIEW_PATH.split("/").filter(Boolean) });

export const generateMetadata = ({ searchParams }: Args): Promise<Metadata> => generatePageMetadata({ config, params, searchParams });

export default function Page({ searchParams }: Args) {
  return RootPage({ config, params, searchParams, importMap });
}
