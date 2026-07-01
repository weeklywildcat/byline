import type { Metadata } from "next";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import "./globals.css";
import { getOrganizationSchema, serializeJsonLd } from "@/lib/seo";
import { getSiteUrl } from "@/lib/wordpress";

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: "Weekly Wildcat",
    template: "%s | Weekly Wildcat"
  },
  description: "Student journalism from the Weekly Wildcat newsroom."
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
