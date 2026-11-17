import type { Metadata } from "@/lib/metadata";
import { absoluteUrl, buildPageMetadata, getBreadcrumbSchema, serializeJsonLd } from "@/lib/seo";
import { getPublicationConfig } from "@/lib/publication";

const publication = getPublicationConfig();
const title = "Donate";
const description = "Donations to " + publication.identity.shortName + " are not open yet. Join the email waitlist and we'll let you know when they are.";

export const metadata: Metadata = {
  ...buildPageMetadata({ title, description, path: "/donate/" })
};

export default function DonatePage() {
  const endpoint = publication.urls.cms.replace(/\/$/, "") + "/api/public/donation-waitlist";
  const pageSchema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "Donate to " + publication.identity.shortName,
    description,
    url: absoluteUrl("/donate/")
  };
  const breadcrumbSchema = getBreadcrumbSchema([
    { name: "Home", path: "/" },
    { name: "Donate", path: "/donate/" }
  ]);

  return (
    <main className="donate-page">
      <script id="donate-json-ld" type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(pageSchema) }} />
      <script id="donate-breadcrumb-json-ld" type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbSchema) }} />

      <section className="donate-hero" aria-labelledby="donate-heading">
        <p className="donate-kicker">Support student journalism</p>
        <h1 id="donate-heading">Donations are coming soon.</h1>
        <p className="donate-lede">
          We're setting up a way for readers to support the {publication.identity.shortName}. Leave your email and we'll let you know when donations open.
        </p>

        <form className="donate-waitlist" action={endpoint} method="post" data-donation-waitlist>
          <label htmlFor="donation-email">Email address</label>
          <div className="donate-waitlist-row">
            <input
              id="donation-email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              maxLength={320}
              placeholder="you@example.com"
            />
            <button type="submit">Join the waitlist</button>
          </div>
          <label className="donate-honeypot" aria-hidden="true">
            Website
            <input name="website" type="text" tabIndex={-1} autoComplete="off" />
          </label>
          <p className="donate-privacy">We'll only use this address to contact you about donations.</p>
          <p className="donate-status" role="status" aria-live="polite" data-donation-status />
        </form>
      </section>
    </main>
  );
}
