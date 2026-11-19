/**
 * The one look every Byline email shares: the publication's masthead, a
 * headline, the facts that matter, one clear next step, and why the person got
 * it. Pure; callers describe the content and get back matching HTML and plain
 * text, so the two can never drift.
 *
 * The HTML is deliberately conservative: tables, inline styles, Mona Sans only
 * (loaded as a web font where the client allows it; never a serif), and a PNG logo because Gmail and Outlook do not show SVG. Clients
 * that honor `prefers-color-scheme` get a dark version; the light logo sits on
 * opaque white so a client that forces dark mode still shows it.
 */

export type EmailBrand = {
  /** The publication's name, e.g. "Weekly Wildcat". */
  name: string;
  /** Where the masthead links: the newsroom's admin root. */
  homeUrl: string | null;
  /** Absolute URLs of the email logo (light and dark), or null for a text masthead. */
  logo: { light: string; dark: string; width: number; height: number } | null;
  /** The public site, linked in the footer. */
  siteUrl: string | null;
  /** The organization behind the publication, e.g. a school. */
  organization: string | null;
  /** Absolute URL of the Mona Sans woff2, for clients that load web fonts. */
  fontUrl?: string | null;
};

export const DEFAULT_EMAIL_BRAND: EmailBrand = { name: "Weekly Wildcat", homeUrl: null, logo: null, siteUrl: null, organization: null };

/** The logo files in `public/email`, rendered from the wide masthead at 3x. */
export const EMAIL_LOGO = { light: "/email/wordmark.png", dark: "/email/wordmark-dark.png", width: 240, height: 28 } as const;

export type EmailLink = { label: string; href: string };
export type EmailDetail = { label: string; value: string; href?: string | null };
export type EmailItem = { title: string; meta: string; href?: string | null };
export type EmailSection = { heading: string; items: readonly EmailItem[]; tone?: "alert" };

export type EmailContent = {
  brand: EmailBrand;
  /** The inbox preview line. Says something the subject does not. */
  preheader: string;
  kicker: string;
  /** "alert" marks something that went wrong and needs a person. */
  tone?: "default" | "alert";
  title: string;
  /** One or two sentences: what this means and what to do. */
  lead?: string | null;
  details?: readonly EmailDetail[];
  sections?: readonly EmailSection[];
  /** A reader's own words, shown as a quotation with line breaks kept. */
  quote?: string | null;
  action?: EmailLink | null;
  secondary?: readonly EmailLink[];
  /** Small print under the button, e.g. when a link expires. */
  note?: string | null;
  /** Why the person received this email. */
  reason: string;
  manage?: EmailLink | null;
  /** A dateline for the masthead, already formatted. */
  dateline?: string | null;
};

const INK = "#121212";
const MUTED = "#545454";
const SOFT = "#737373";
const ACCENT = "#73192a";
const RULE = "#e2e2e2";
const PAGE = "#f3f3f3";
// Mona Sans only. Clients that cannot load it (Gmail, Outlook for Windows) use
// their own sans-serif; the generic keyword stops them falling back to a serif.
const SANS = "'Mona Sans',sans-serif";

export const escapeHtml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** Only web and mail links become `href`s; anything else is dropped. */
export function safeHref(value: string | null | undefined): string | null {
  const href = (value ?? "").trim();
  return /^(https?:\/\/|mailto:)/i.test(href) ? href : null;
}

const link = (href: string | null | undefined, inner: string, style: string) => {
  const safe = safeHref(href);
  return safe ? `<a href="${escapeHtml(safe)}" style="${style}">${inner}</a>` : inner;
};

const DARK_CSS = `
:root { color-scheme: light dark; supported-color-schemes: light dark; }
@media (max-width: 620px) {
  .bl-pad { padding-left: 22px !important; padding-right: 22px !important; }
  .bl-title { font-size: 24px !important; }
  .bl-label { display: block !important; width: auto !important; padding-bottom: 0 !important; }
  .bl-value { display: block !important; padding-top: 2px !important; }
}
@media (prefers-color-scheme: dark) {
  .bl-page { background: #0c0c0c !important; }
  .bl-card { background: #171717 !important; border-color: #2c2c2c !important; }
  .bl-ink, .bl-ink a { color: #f2f2f2 !important; }
  .bl-muted, .bl-muted a { color: #a8a8a8 !important; }
  .bl-accent, .bl-accent a { color: #eb9aa9 !important; }
  .bl-rule { border-color: #2c2c2c !important; }
  .bl-rule-strong { border-color: #f2f2f2 !important; }
  .bl-quote { border-color: #eb9aa9 !important; }
  .bl-button { background: #f2f2f2 !important; }
  .bl-button a { color: #121212 !important; }
  .bl-logo-light { display: none !important; }
  .bl-logo-dark { display: block !important; max-height: none !important; overflow: visible !important; }
}`;

function masthead(brand: EmailBrand, dateline: string | null | undefined) {
  const logo = brand.logo
    ? `<img class="bl-logo-light" src="${escapeHtml(brand.logo.light)}" width="${brand.logo.width}" height="${brand.logo.height}" alt="${escapeHtml(brand.name)}" style="display:block;margin:0 auto;border:0;outline:none;width:${brand.logo.width}px;max-width:100%;height:auto;">`
      + `<div class="bl-logo-dark" style="display:none;max-height:0;overflow:hidden;mso-hide:all;"><img src="${escapeHtml(brand.logo.dark)}" width="${brand.logo.width}" height="${brand.logo.height}" alt="${escapeHtml(brand.name)}" style="display:block;margin:0 auto;border:0;outline:none;width:${brand.logo.width}px;max-width:100%;height:auto;"></div>`
    : `<span class="bl-ink" style="font-family:${SANS};font-size:26px;line-height:1;font-weight:700;letter-spacing:.02em;text-transform:uppercase;color:${INK};">${escapeHtml(brand.name)}</span>`;
  const home = safeHref(brand.homeUrl);
  return `<tr><td class="bl-pad" align="center" style="padding:30px 36px 0;">
      ${home ? `<a href="${escapeHtml(home)}" style="text-decoration:none;display:inline-block;">${logo}</a>` : logo}
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:18px;border-collapse:collapse;">
        <tr>
          <td class="bl-muted" style="padding:0 0 8px;font-family:${SANS};font-size:11px;line-height:1.3;font-weight:500;letter-spacing:.1em;text-transform:uppercase;color:${SOFT};">Newsroom</td>
          <td class="bl-muted" align="right" style="padding:0 0 8px;font-family:${SANS};font-size:11px;line-height:1.3;font-weight:500;letter-spacing:.1em;text-transform:uppercase;color:${SOFT};">${escapeHtml(dateline ?? "Byline")}</td>
        </tr>
      </table>
      <div class="bl-rule-strong" style="height:2px;line-height:2px;font-size:0;border-top:3px solid ${INK};border-bottom:1px solid ${INK};">&nbsp;</div>
    </td></tr>`;
}

function detailsTable(details: readonly EmailDetail[]) {
  const rows = details.map((detail, index) => {
    const value = escapeHtml(detail.value);
    return `<tr>
        <td class="bl-label bl-muted bl-rule" valign="top" width="118" style="width:118px;padding:11px 12px 11px 0;${index ? `border-top:1px solid ${RULE};` : ""}font-family:${SANS};font-size:11px;line-height:1.6;font-weight:500;letter-spacing:.08em;text-transform:uppercase;color:${SOFT};">${escapeHtml(detail.label)}</td>
        <td class="bl-value bl-ink bl-rule" valign="top" style="padding:10px 0;${index ? `border-top:1px solid ${RULE};` : ""}font-family:${SANS};font-size:15px;line-height:1.45;color:${INK};">${link(detail.href, value, `color:${INK};text-decoration:underline;`)}</td>
      </tr>`;
  });
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" class="bl-rule" style="margin:24px 0 0;border-collapse:collapse;border-top:1px solid ${RULE};border-bottom:1px solid ${RULE};">${rows.join("")}</table>`;
}

function sectionBlock(section: EmailSection) {
  const color = section.tone === "alert" ? ACCENT : INK;
  const items = section.items.map((item) => `<tr><td class="bl-rule" style="padding:12px 0;border-top:1px solid ${RULE};">
        <div class="bl-ink" style="font-family:${SANS};font-size:16px;line-height:1.35;font-weight:600;color:${INK};">${link(item.href, escapeHtml(item.title), `color:${INK};text-decoration:none;`)}</div>
        <div class="bl-muted" style="margin-top:3px;font-family:${SANS};font-size:13px;line-height:1.4;color:${MUTED};">${escapeHtml(item.meta)}</div>
      </td></tr>`);
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:28px 0 0;border-collapse:collapse;">
      <tr><td class="${section.tone === "alert" ? "bl-accent" : "bl-ink"}" style="padding:0 0 8px;font-family:${SANS};font-size:12px;line-height:1.3;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:${color};">${escapeHtml(section.heading)} <span class="bl-muted" style="font-weight:400;color:${SOFT};">${section.items.length}</span></td></tr>
      ${items.join("")}
    </table>`;
}

function quoteBlock(quote: string) {
  const body = quote.split(/\n{2,}/).map((paragraph) => `<p style="margin:0 0 12px;">${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`).join("");
  return `<div class="bl-quote bl-ink" style="margin:24px 0 0;padding:2px 0 2px 18px;border-left:3px solid ${ACCENT};font-family:${SANS};font-size:16px;line-height:1.6;color:${INK};">${body}</div>`;
}

function button(action: EmailLink) {
  const href = safeHref(action.href);
  if (!href) return "";
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:28px 0 0;border-collapse:separate;">
      <tr><td class="bl-button" bgcolor="${INK}" style="background:${INK};">
        <a href="${escapeHtml(href)}" style="display:inline-block;padding:14px 22px;font-family:${SANS};font-size:15px;line-height:1.2;font-weight:600;color:#ffffff;text-decoration:none;">${escapeHtml(action.label)}&nbsp;&rarr;</a>
      </td></tr>
    </table>`;
}

/** Renders an email as HTML and as plain text from the same content. */
export function renderEmail(content: EmailContent): { html: string; text: string } {
  return { html: renderHtml(content), text: renderText(content) };
}

function renderHtml(content: EmailContent): string {
  const { brand } = content;
  const alert = content.tone === "alert";
  const secondary = (content.secondary ?? []).filter((item) => safeHref(item.href));
  const site = safeHref(brand.siteUrl);
  const manage = content.manage && safeHref(content.manage.href) ? content.manage : null;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<meta name="x-apple-disable-message-reformatting">
<title>${escapeHtml(content.title)}</title>
<style>${content.brand.fontUrl && safeHref(content.brand.fontUrl) ? `@font-face { font-family: "Mona Sans"; font-style: normal; font-weight: 400 900; src: url("${escapeHtml(content.brand.fontUrl)}") format("woff2"); }` : ""}${DARK_CSS}</style>
</head>
<body class="bl-page" style="margin:0;padding:0;background:${PAGE};color:${INK};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">${escapeHtml(content.preheader)}${"&#8199;&#65279;&#847; ".repeat(40)}</div>
<table role="presentation" class="bl-page" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:${PAGE};border-collapse:collapse;">
  <tr><td align="center" style="padding:28px 12px 32px;">
    <table role="presentation" class="bl-card" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid ${RULE};border-collapse:collapse;">
      ${masthead(brand, content.dateline)}
      <tr><td class="bl-pad" style="padding:30px 36px 34px;">
        <div class="bl-accent" style="font-family:${SANS};font-size:12px;line-height:1.3;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:${ACCENT};">${alert ? "&#9679;&nbsp;" : ""}${escapeHtml(content.kicker)}</div>
        <h1 class="bl-title bl-ink" style="margin:10px 0 0;font-family:${SANS};font-size:27px;line-height:1.2;font-weight:600;letter-spacing:-.015em;color:${INK};">${escapeHtml(content.title)}</h1>
        ${content.lead ? `<p class="bl-muted" style="margin:12px 0 0;font-family:${SANS};font-size:17px;line-height:1.5;color:${MUTED};">${escapeHtml(content.lead)}</p>` : ""}
        ${content.details?.length ? detailsTable(content.details) : ""}
        ${content.quote ? quoteBlock(content.quote) : ""}
        ${(content.sections ?? []).filter((section) => section.items.length).map(sectionBlock).join("")}
        ${content.action ? button(content.action) : ""}
        ${secondary.length ? `<p class="bl-accent" style="margin:16px 0 0;font-family:${SANS};font-size:14px;line-height:1.6;color:${ACCENT};">${secondary.map((item) => link(item.href, escapeHtml(item.label), `color:${ACCENT};text-decoration:underline;`)).join(`<span class="bl-muted" style="color:${SOFT};">&nbsp;&nbsp;&middot;&nbsp;&nbsp;</span>`)}</p>` : ""}
        ${content.note ? `<p class="bl-muted" style="margin:14px 0 0;font-family:${SANS};font-size:13px;line-height:1.5;color:${SOFT};">${escapeHtml(content.note)}</p>` : ""}
      </td></tr>
      <tr><td class="bl-pad" style="padding:0 36px 28px;">
        <p class="bl-muted bl-rule" style="margin:0;padding-top:18px;border-top:1px solid ${RULE};font-family:${SANS};font-size:12px;line-height:1.6;color:${SOFT};">${escapeHtml(content.reason)}${manage ? ` ${link(manage.href, escapeHtml(manage.label), `color:${SOFT};text-decoration:underline;`)}` : ""}</p>
      </td></tr>
    </table>
    <p class="bl-muted" style="margin:16px 0 0;font-family:${SANS};font-size:11px;line-height:1.6;color:${SOFT};">Sent by Byline for the ${escapeHtml(brand.name)} newsroom${brand.organization ? ` &middot; ${escapeHtml(brand.organization)}` : ""}${site ? ` &middot; ${link(site, escapeHtml(site.replace(/^https?:\/\//, "").replace(/\/$/, "")), `color:${SOFT};text-decoration:underline;`)}` : ""}</p>
  </td></tr>
</table>
</body>
</html>`;
}

function renderText(content: EmailContent): string {
  const lines: string[] = [content.kicker.toUpperCase(), content.title];
  if (content.lead) lines.push("", content.lead);
  if (content.details?.length) {
    lines.push("");
    for (const detail of content.details) lines.push(`${detail.label}: ${detail.value}`);
  }
  if (content.quote) lines.push("", ...content.quote.split("\n").map((line) => `> ${line}`));
  for (const section of content.sections ?? []) {
    if (!section.items.length) continue;
    lines.push("", `${section.heading.toUpperCase()} (${section.items.length})`);
    for (const item of section.items) {
      lines.push(`- ${item.title} — ${item.meta}`);
      const href = safeHref(item.href);
      if (href) lines.push(`  ${href}`);
    }
  }
  const action = content.action && safeHref(content.action.href) ? content.action : null;
  if (action) lines.push("", `${action.label}: ${action.href}`);
  for (const item of content.secondary ?? []) if (safeHref(item.href)) lines.push(`${item.label}: ${item.href}`);
  if (content.note) lines.push("", content.note);
  lines.push("", "—", content.reason);
  if (content.manage && safeHref(content.manage.href)) lines.push(`${content.manage.label}: ${content.manage.href}`);
  lines.push(`Sent by Byline for the ${content.brand.name} newsroom.`);
  return lines.join("\n");
}
