import type { Metadata } from "next";
import "@byline/theme-weekly-wildcat/styles.css";
import "@byline/ui/page-blocks.css";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import "./globals.css";
import { getOrganizationSchema, SEO_ROBOTS_PREVIEW, serializeJsonLd, SITE_DESCRIPTION } from "@/lib/seo";
import { getSiteUrl } from "@/lib/wordpress";
import Script from "next/script";
import { getPublicationConfig } from "@/lib/publication";
import { getActiveTheme, getThemeCssVariables } from "@/lib/theme";

const publication = getPublicationConfig();
const activeTheme = getActiveTheme();

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: publication.seo.defaultTitle,
    template: `%s | ${publication.identity.shortName}`
  },
  description: SITE_DESCRIPTION,
  robots: SEO_ROBOTS_PREVIEW,
  icons: {
    icon: publication.branding.icons.filter((icon) => icon.width !== 180).map((icon) => ({
      url: icon.url,
      sizes: icon.width && icon.height ? `${icon.width}x${icon.height}` : undefined,
      type: icon.url.endsWith(".png") ? "image/png" : undefined
    })),
    apple: publication.branding.icons.filter((icon) => icon.width === 180).map((icon) => ({
      url: icon.url,
      sizes: icon.width && icon.height ? `${icon.width}x${icon.height}` : undefined,
      type: icon.url.endsWith(".png") ? "image/png" : undefined
    }))
  }
};

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const organizationSchema = getOrganizationSchema();

  return (
    <html
      lang={publication.locale}
      data-byline-theme={activeTheme.id}
      data-byline-density={activeTheme.tokens.density}
      style={getThemeCssVariables(activeTheme.tokens)}
    >
      <head>
        {activeTheme.stylesheets?.map((href) => <link key={href} rel="stylesheet" href={href} />)}
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

        {activeTheme.id === "weekly-wildcat" ? (
          <Script id="microsoft-clarity" strategy="afterInteractive">
            {`
              (function(c,l,a,r,i,t,y){
                  c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
                  t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i+"?ref=bwt";
                  y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
              })(window, document, "clarity", "script", "xi1qesbixb");
            `}
          </Script>
        ) : null}
      </body>
    </html>
  );
}
