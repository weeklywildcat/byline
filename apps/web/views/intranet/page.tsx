import type { Metadata } from "@/lib/metadata";
import { getPublicationConfig } from "@/lib/publication";
import { absoluteUrl, buildPageMetadata, getBreadcrumbSchema, serializeJsonLd } from "@/lib/seo";

const publication = getPublicationConfig();

// The Google Sites address without a `?authuser=` hint: that number is the position of an
// account in one person's browser and points at the wrong account for everyone else.
export const INTRANET_URL = "https://sites.google.com/weeklywildcat.com/intranet/home";
export const STAFF_ACCOUNT_DOMAIN = "@weeklywildcat.com";

const title = "Staff Intranet";
const description = `How ${publication.identity.shortName} staff open the intranet: sign in with your ${STAFF_ACCOUNT_DOMAIN} Google Workspace account first.`;

const steps = [
  {
    title: `Sign in with your ${STAFF_ACCOUNT_DOMAIN} account`,
    body: `The intranet only opens for ${STAFF_ACCOUNT_DOMAIN} Google Workspace accounts. A personal Gmail address or a school account will not work.`
  },
  {
    title: "Open the intranet",
    body: "Use the button above. It opens in Google Sites in a new tab."
  },
  {
    title: "Switch accounts if it says you need access",
    body: `Select your profile picture in the top right corner of the Google page and choose your ${STAFF_ACCOUNT_DOMAIN} account. If it is not listed, choose Add another account and sign in.`
  }
];

export const metadata: Metadata = {
  ...buildPageMetadata({ title, description, path: "/intranet/", noIndex: true })
};

export default function IntranetPage() {
  const pageSchema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: title,
    description,
    url: absoluteUrl("/intranet/")
  };
  const breadcrumbSchema = getBreadcrumbSchema([
    { name: "Home", path: "/" },
    { name: title, path: "/intranet/" }
  ]);

  return (
    <main className="static-page-shell intranet-page">
      <script id="intranet-json-ld" type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(pageSchema) }} />
      <script
        id="intranet-breadcrumb-json-ld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbSchema) }}
      />
      <article className="static-page">
        <header className="static-page-header">
          <p>For staff</p>
          <h1>{title}</h1>
          <div className="static-page-deck">
            The {publication.identity.shortName} intranet is where staff find internal resources. It is a private Google Site,
            so you need to be signed in to your {STAFF_ACCOUNT_DOMAIN} Google Workspace account before it will open.
          </div>
          <p className="intranet-actions">
            <a className="intranet-button" href={INTRANET_URL} target="_blank" rel="noopener noreferrer">
              Open the intranet
              <span className="intranet-button-note"> (opens in a new tab)</span>
            </a>
          </p>
        </header>

        <section className="intranet-section" aria-labelledby="intranet-steps-heading">
          <h2 id="intranet-steps-heading">How to get in</h2>
          <ol className="intranet-steps">
            {steps.map((step) => (
              <li key={step.title}>
                <strong>{step.title}</strong>
                <span>{step.body}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="intranet-section" aria-labelledby="intranet-help-heading">
          <h2 id="intranet-help-heading">Can’t get in?</h2>
          <p>
            If you do not have a {STAFF_ACCOUNT_DOMAIN} account yet, or Google keeps saying you need permission with the right
            account selected, ask an editor. You can also <a href="/contact/">contact the newsroom</a>. If you are not on
            staff and want to be, see how to <a href="/join/">join the newsroom</a>.
          </p>
        </section>
      </article>
    </main>
  );
}
