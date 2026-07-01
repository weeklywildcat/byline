import type { Metadata } from "next";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import "./globals.css";
import { getOrganizationSchema, SEO_ROBOTS_PREVIEW, serializeJsonLd, SITE_DESCRIPTION } from "@/lib/seo";
import { getSiteUrl } from "@/lib/wordpress";

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: "Weekly Wildcat",
    template: "%s | Weekly Wildcat"
  },
  description: SITE_DESCRIPTION,
  robots: SEO_ROBOTS_PREVIEW,
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" }
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }]
  }
};

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const organizationSchema = getOrganizationSchema();

  return (
    <html lang="en">
      <head>
        <link rel="stylesheet" href="https://use.typekit.net/zxb8gbj.css" />
      </head>
      <body>
        <script
          id="organization-json-ld"
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(organizationSchema) }}
        />
        <SiteHeader />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
