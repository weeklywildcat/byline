import { orderedStoryIds, type Newsletter, type NewsletterStory } from "./models";

export type NewsletterBranding = {
  publicationName: string;
  accentColor?: string;
  logoUrl?: string | null;
};

const ALLOWED_RICH_TEXT_TAGS = new Set([
  "a",
  "b",
  "blockquote",
  "br",
  "em",
  "h2",
  "h3",
  "i",
  "li",
  "ol",
  "p",
  "strong",
  "u",
  "ul"
]);
const TAG_PATTERN = /<\/?([a-z0-9-]+)(?:\s[^>]*)?>/gi;
const HREF_PATTERN = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i;

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function safeNewsletterUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^(?:https?:\/\/|mailto:|#|\/(?!\/))/i.test(trimmed)) return trimmed;
  return null;
}

function tagAttribute(rawTag: string, name: string): string | null {
  if (name !== "href") return null;
  const match = rawTag.match(HREF_PATTERN);
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
}

/**
 * Keeps a deliberately small, deterministic allow-list for editor-entered
 * fragments.  Attributes are discarded except for sanitized links, which
 * prevents newsletter content from introducing scripts, event handlers, or
 * tracking markup into the email preview/snapshot.
 */
export function sanitizeRichText(value: string | null | undefined): string {
  if (!value) return "";

  const input = String(value)
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(?:script|style|iframe|object|embed|svg|math)[^>]*>[\s\S]*?<\/(?:script|style|iframe|object|embed|svg|math)>/gi, "")
    .replace(/<\/?(?:script|style|iframe|object|embed|svg|math)[^>]*>/gi, "");

  let output = "";
  let cursor = 0;
  let match: RegExpExecArray | null;
  TAG_PATTERN.lastIndex = 0;

  while ((match = TAG_PATTERN.exec(input)) !== null) {
    output += escapeHtml(input.slice(cursor, match.index));

    const rawTag = match[0];
    const tagName = match[1].toLowerCase();
    const closing = /^<\//.test(rawTag);

    if (ALLOWED_RICH_TEXT_TAGS.has(tagName)) {
      if (tagName === "br") {
        if (!closing) output += "<br />";
      } else if (tagName === "a") {
        if (closing) {
          output += "</a>";
        } else {
          const href = safeNewsletterUrl(tagAttribute(rawTag, "href"));
          if (href) output += `<a href="${escapeHtml(href)}" rel="noreferrer noopener">`;
        }
      } else {
        output += closing ? `</${tagName}>` : `<${tagName}>`;
      }
    }

    cursor = TAG_PATTERN.lastIndex;
  }

  output += escapeHtml(input.slice(cursor));
  return output.trim();
}

function decodeCommonEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&#x27;/gi, "'");
}

export function richTextToPlaintext(value: string | null | undefined): string {
  const sanitized = sanitizeRichText(value);
  return decodeCommonEntities(
    sanitized
      .replace(/<br\s*\/>/gi, "\n")
      .replace(/<\/(?:p|li|h2|h3|blockquote)>/gi, "\n")
      .replace(/<[^>]+>/g, "")
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function safeBrandColor(value: string | undefined): string {
  if (value && /^(?:#[0-9a-f]{3,8}|rgb\([^)]{1,32}\)|hsl\([^)]{1,32}\))$/i.test(value.trim())) return value.trim();
  return "#1d2327";
}

function storyTitle(story: NewsletterStory): string {
  return story.title.trim() || "Untitled story";
}

function renderStory(story: NewsletterStory, lead: boolean): string {
  const title = escapeHtml(storyTitle(story));
  const excerpt = richTextToPlaintext(story.excerpt);
  const url = safeNewsletterUrl(story.url);
  const imageUrl = safeNewsletterUrl(story.imageUrl);
  const image = imageUrl
    ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(story.imageAlt || "")}" width="640" style="display:block;width:100%;height:auto;border:0;" />`
    : "";
  const linkedTitle = url ? `<a href="${escapeHtml(url)}" style="color:inherit;text-decoration:none;">${title}</a>` : title;

  return `<article class="byline-newsletter-story${lead ? " byline-newsletter-lead" : ""}">${image ? `<div class="byline-newsletter-story-image">${image}</div>` : ""}<h2>${linkedTitle}</h2>${excerpt ? `<p>${escapeHtml(excerpt)}</p>` : ""}${url ? `<p class="byline-newsletter-read-more"><a href="${escapeHtml(url)}">Read the story</a></p>` : ""}</article>`;
}

export function renderNewsletterHtml(
  newsletter: Newsletter,
  stories: NewsletterStory[],
  branding: NewsletterBranding
): string {
  const storyById = new Map(stories.map((story) => [story.id, story]));
  const orderedStories = orderedStoryIds(newsletter)
    .map((id) => storyById.get(id))
    .filter((story): story is NewsletterStory => Boolean(story));
  const leadId = newsletter.leadStoryId;
  const additionalStories = orderedStories.filter((story) => story.id !== leadId);
  const headings = newsletter.sectionHeadings.map((heading) => heading.trim()).filter(Boolean);
  const storyMarkup = orderedStories.length
    ? orderedStories.map((story, index) => {
      const heading = index > 0 && headings[index - 1] ? `<h2 class="byline-newsletter-section-heading">${escapeHtml(headings[index - 1])}</h2>` : "";
      return `${heading}${renderStory(story, story.id === leadId)}`;
    }).join("")
    : `<p class="byline-newsletter-empty">No stories have been selected for this issue.</p>`;
  const intro = sanitizeRichText(newsletter.intro);
  const outro = sanitizeRichText(newsletter.outro);
  const publicationName = escapeHtml(branding.publicationName.trim() || "Publication");
  const accentColor = safeBrandColor(branding.accentColor);
  const logoUrl = safeNewsletterUrl(branding.logoUrl);
  const logo = logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="${publicationName}" width="160" style="display:block;max-width:160px;height:auto;border:0;" />` : `<span>${publicationName}</span>`;

  // Keep this document stable: no current timestamps, random IDs, or remote
  // lookups are introduced while an editor previews or snapshots an issue.
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(newsletter.subject || newsletter.title || publicationName)}</title></head><body style="margin:0;background:#f0f0f1;color:#1d2327;font-family:Arial,Helvetica,sans-serif;"><div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(newsletter.preheader)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f0f0f1;"><tbody><tr><td align="center" style="padding:24px 12px;"><table role="presentation" width="640" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:640px;background:#ffffff;"><tbody><tr><td style="padding:24px;border-bottom:4px solid ${escapeHtml(accentColor)};font-size:22px;font-weight:700;">${logo}</td></tr><tr><td style="padding:28px 24px 12px;"><h1 style="margin:0;font-size:30px;line-height:1.15;">${escapeHtml(newsletter.subject || newsletter.title || "Newsletter")}</h1>${intro ? `<div style="margin-top:16px;font-size:16px;line-height:1.5;">${intro}</div>` : ""}</td></tr><tr><td style="padding:0 24px 28px;">${storyMarkup}${outro ? `<div class="byline-newsletter-outro" style="margin-top:24px;font-size:16px;line-height:1.5;">${outro}</div>` : ""}</td></tr><tr><td style="padding:20px 24px;background:#f6f7f7;color:#50575e;font-size:12px;line-height:1.5;">${publicationName}</td></tr></tbody></table></td></tr></tbody></table></body></html>`;
}

export function renderNewsletterPlaintext(newsletter: Newsletter, stories: NewsletterStory[], branding: NewsletterBranding): string {
  const storyById = new Map(stories.map((story) => [story.id, story]));
  const orderedStories = orderedStoryIds(newsletter)
    .map((id) => storyById.get(id))
    .filter((story): story is NewsletterStory => Boolean(story));
  const lines: string[] = [];
  const title = newsletter.subject.trim() || newsletter.title.trim() || "Newsletter";
  lines.push(title);
  if (newsletter.preheader.trim()) lines.push(newsletter.preheader.trim());
  lines.push("");

  const intro = richTextToPlaintext(newsletter.intro);
  if (intro) lines.push(intro, "");

  orderedStories.forEach((story, index) => {
    const heading = index > 0 ? newsletter.sectionHeadings[index - 1]?.trim() : "";
    if (heading) lines.push(heading, "");
    lines.push(storyTitle(story));
    const excerpt = richTextToPlaintext(story.excerpt);
    if (excerpt) lines.push(excerpt);
    const url = safeNewsletterUrl(story.url);
    if (url) lines.push(url);
    lines.push("");
  });

  const outro = richTextToPlaintext(newsletter.outro);
  if (outro) lines.push(outro, "");
  lines.push(branding.publicationName.trim() || "Publication");

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function createNewsletterSnapshot(
  newsletter: Newsletter,
  stories: NewsletterStory[],
  branding: NewsletterBranding
): { html: string; plaintext: string } {
  return {
    html: renderNewsletterHtml(newsletter, stories, branding),
    plaintext: renderNewsletterPlaintext(newsletter, stories, branding)
  };
}
